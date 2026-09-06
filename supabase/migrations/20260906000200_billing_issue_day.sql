-- =============================================================================
-- 025: 請求を作る日（issue_day）
--   設計書 5.4 に対応
--
-- これまで請求の生成は「JST の毎月1日」に固定していた。実際には、
-- 月初に作りたいスタジオもあれば、前月末に作って月初に集金したい
-- スタジオもある。組織ごとの設定にする。
--
-- ★ 1〜28 に限る。
--   29〜31 にすると、2月や30日までの月で「その日が来ない」ことになり、
--   請求が作られない月が生まれる。ここを可変にしても得るものが無い。
--
-- pg_cron は UTC で動くので、日付の判定は関数の中で JST に直してから行う
-- （移行 017 と同じ考え方）。
-- =============================================================================

alter table public.billing_settings
  add column if not exists issue_day integer not null default 1
    check (issue_day between 1 and 28);

comment on column public.billing_settings.issue_day is
  '請求を作る日（請求月の何日か）。JST で判定する。1〜28。';


-- 生成バッチを issue_day 対応にする。
-- 設定が無い組織は既定の1日として扱う（billing_settings の行が無い場合）
create or replace function app.run_monthly_invoice_generation()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today  date := (now() at time zone 'Asia/Tokyo')::date;
  v_month  date := date_trunc('month', v_today)::date;
  v_day    integer := extract(day from v_today);
  v_org    record;
  v_total  integer := 0;
begin
  for v_org in
    select o.id, coalesce(bs.issue_day, 1) as issue_day
    from public.organizations o
    left join public.billing_settings bs on bs.organization_id = o.id
    where o.status = 'active'
  loop
    -- その組織の請求日でなければ何もしない
    continue when v_org.issue_day <> v_day;

    -- cron は postgres として動くので auth.uid() が null になり、
    -- public.generate_invoices() の役割検査を通れない。
    -- 検査を持たない内部関数を直接呼ぶ。
    perform app.generate_invoices_internal(v_org.id, v_month);
    v_total := v_total + 1;
  end loop;

  raise notice 'monthly invoice generation done for % organizations (%)', v_total, v_month;
end;
$fn$;

comment on function app.run_monthly_invoice_generation() is
  'JST で各組織の請求日にあたる日だけ、その月の請求を作る（設計書 5.4）。'
  '毎日 UTC 0時（JST 9時）に起動し、日付の判定はこの中で行う。';
