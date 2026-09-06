-- =============================================================================
-- 028: 請求を作ったら、お知らせメールも自動で送る
--   設計書 5.4 / 11章 に対応。MarcheBase の定期実行と同じ仕組み（設計書 10.5）
--
-- 送信そのものは Edge Function（send-invoice-notice）が行う。DB からは
-- pg_net で呼ぶだけにする。Resend の鍵を DB に置かずに済み、送信結果は
-- 関数側が deliveries に書く。
--
-- ★ 鍵と URL は Vault に置く。
--   マイグレーションのファイルには絶対に書かない（git に残るため）。
--   名前だけを参照し、値は別途 vault に入れる。
--
--     project_url        … https://<ref>.supabase.co
--     service_role_key   … service_role の鍵
--
-- ★ 鍵が入っていなくても請求の生成は止めない。
--   お知らせが送れないのは困るが、請求が作られない方がもっと困る。
--   送信の呼び出しだけを飛ばし、警告を残す。
-- =============================================================================

-- pg_net は net スキーマに入る（Supabase の既定）
create extension if not exists pg_net;


-- Vault から1件読む。未設定なら null を返す
create or replace function app.secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$fn$;

comment on function app.secret(text) is
  'Vault に入れた値を1件読む。マイグレーションに鍵を書かないための入口。';

revoke all on function app.secret(text) from public, anon, authenticated;


-- 1組織ぶんのお知らせ送信を Edge Function に依頼する
create or replace function app.request_invoice_notices(
  p_organization_id uuid,
  p_billing_month   date
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text := app.secret('project_url');
  v_key text := app.secret('service_role_key');
begin
  if v_url is null or v_key is null then
    raise warning 'invoice notice skipped: project_url または service_role_key が Vault にありません';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-invoice-notice',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'organization_id', p_organization_id,
      'billing_month',   to_char(p_billing_month, 'YYYY-MM-DD')
    ),
    timeout_milliseconds := 20000
  );
end;
$fn$;

comment on function app.request_invoice_notices(uuid, date) is
  '請求のお知らせ送信を Edge Function に依頼する（設計書 5.4）。'
  '呼び出しは非同期。結果は deliveries に残る。';


-- 生成バッチから、作った直後に送信を依頼する
create or replace function app.run_monthly_invoice_generation()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today   date := (now() at time zone 'Asia/Tokyo')::date;
  v_this    date := date_trunc('month', v_today)::date;
  v_org     record;
  v_fire_on date;
  v_month   date;
  v_total   integer := 0;
begin
  for v_org in
    select
      o.id,
      coalesce(bs.issue_day, 1)              as issue_day,
      coalesce(bs.issue_on_month_end, false) as issue_on_month_end,
      coalesce(bs.issue_month_offset, 0)     as issue_month_offset
    from public.organizations o
    left join public.billing_settings bs on bs.organization_id = o.id
    where o.status = 'active'
  loop
    v_fire_on := app.month_day(v_this, v_org.issue_day, v_org.issue_on_month_end);
    continue when v_fire_on <> v_today;

    v_month := (v_this - (v_org.issue_month_offset || ' month')::interval)::date;

    -- cron は postgres として動くので auth.uid() が null になり、
    -- public.generate_invoices() の役割検査を通れない。
    -- 検査を持たない内部関数を直接呼ぶ。
    perform app.generate_invoices_internal(v_org.id, v_month);

    -- 作った直後にお知らせを送る。失敗しても生成は巻き戻さない
    perform app.request_invoice_notices(v_org.id, v_month);

    v_total := v_total + 1;
  end loop;

  raise notice 'monthly invoice generation done for % organizations (today %)', v_total, v_today;
end;
$fn$;

comment on function app.run_monthly_invoice_generation() is
  'JST で各組織の請求日にあたる日だけ、対象月の請求を作り、'
  '請求のお知らせを送る（設計書 5.4）。';
