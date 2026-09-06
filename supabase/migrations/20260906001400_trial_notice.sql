-- =============================================================================
-- 037: 体験・見学の承認／見送りを、保護者へメールで自動連絡する
--   設計書 4.6.2 / 11章
--
-- 承認制にした（移行 036）ことで、申し込んだ保護者は「確定したのか」が
-- 分からないまま待つことになった。承認・見送りのどちらでも必ず連絡する。
--
-- ★ 送信の引き金は、状態が pending から変わったときだけ。
--   トリガーの条件に old.status = 'pending' を入れてあるので、承認ボタンを
--   二度押しても二通目は飛ばない。二重送信の防止をアプリ側の注意力に
--   頼らない。
--
-- ★ 送信そのものは Edge Function（send-trial-notice）が行う。
--   DB からは pg_net で呼ぶだけ。Resend の鍵を DB に置かずに済み、
--   結果は関数側が deliveries に書く（移行 027 / 028 と同じ形）。
--
-- ★ 鍵が未設定でも、承認そのものは止めない。
--   連絡が飛ばないのは困るが、承認できない方がもっと困る。
--   送信の呼び出しだけを飛ばし、警告を残す。
-- =============================================================================

-- 複合外部キーで、テナントを跨いだ参照を不可能にする（設計書 3章）
alter table public.trials
  add constraint trials_id_organization_id_key unique (id, organization_id);


-- 通知の種類を増やす
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('invoice_issued', 'trial_approved', 'trial_declined'));


-- 体験の連絡は請求ではないので、宛先の手がかりを別の列で持つ。
-- 体験の申込者はまだ保護者として登録されていないため guardian_id は null。
-- 「誰に送ったか」は to_address（送信時点の宛先）が持つ。
alter table public.deliveries
  add column trial_id uuid,
  add constraint deliveries_trial_id_organization_id_fkey
    foreign key (trial_id, organization_id)
    references public.trials (id, organization_id) on delete cascade;

create index deliveries_trial_idx on public.deliveries (trial_id);

comment on column public.deliveries.trial_id is
  '体験・見学の申込への連絡（設計書 4.6.2）。保護者未登録なので guardian_id は入らない。';


-- -----------------------------------------------------------------------------
-- 承認／見送りの連絡を Edge Function に依頼する
--
-- トリガー関数そのものを security definer にしてある。呼び出し元は
-- ログイン中のオーナー・スタッフで、app スキーマにも net スキーマにも
-- 権限を持たないため。
-- -----------------------------------------------------------------------------
create or replace function app.notify_trial_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_url text := app.secret('project_url');
  v_key text := app.secret('service_role_key');
begin
  if v_url is null or v_key is null then
    raise warning 'trial notice skipped: project_url または service_role_key が Vault にありません';
    return new;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-trial-notice',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('trial_id', new.id),
    timeout_milliseconds := 20000
  );

  return new;
end;
$fn$;

comment on function app.notify_trial_decision() is
  '体験の承認・見送りを保護者へ連絡する（設計書 4.6.2 / 11章）。'
  '呼び出しは非同期。結果は deliveries に残る。';


create trigger trials_notify_decision
  after update on public.trials
  for each row
  when (
    old.status = 'pending'
    and new.status in ('booked', 'declined')
  )
  execute function app.notify_trial_decision();

comment on trigger trials_notify_decision on public.trials is
  '承認待ちから確定・見送りへ変わったときだけ送る。二度押しでは飛ばない。';
