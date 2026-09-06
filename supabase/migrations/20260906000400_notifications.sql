-- =============================================================================
-- 027: 通知と配信結果
--   設計書 4.8 に対応
--
-- 「何を誰に通知するか」と「どの手段で送るか」を分ける。
-- いまの手段はメールだけだが、あとで LINE を足したときに、
-- 連携していない保護者へメールへ落とす判断をここで書けるようにしておく。
--
-- ★ 送信結果を必ず残す。
--   メールは「送ったのに届いていない」が一番困る。成否と理由を行に残して
--   おかないと、運営が保護者に何と答えればよいか分からなくなる。
--
-- ★ 同じ請求について二度送らない。
--   deliveries に (invoice_id, channel) の部分一意索引を張る。取り消した
--   ものは対象から外すので、失敗した通知は送り直せる。
-- =============================================================================

-- guardians には (id, organization_id) の一意制約が無かったので足す。
-- 複合外部キーで、テナントを跨いだ参照そのものを不可能にするため（設計書 3章）
alter table public.guardians
  add constraint guardians_id_organization_id_key unique (id, organization_id);


create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- invoice_issued 請求のお知らせ / 将来: lesson_canceled など
  kind            text not null check (kind in ('invoice_issued')),

  -- 何に対する通知か。請求のお知らせなら対象月
  target_month    date,

  subject         text not null,
  created_at      timestamptz not null default now(),

  unique (id, organization_id)
);

comment on table public.notifications is
  '通知のまとまり（設計書 4.8）。1回の送信操作につき1行。';


create table public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  notification_id uuid not null,

  -- 誰に送ったか。保護者が未登録の生徒もありうるので null を許す
  guardian_id     uuid,
  -- 請求のお知らせは請求1件につき1通
  invoice_id      uuid,

  channel         text not null default 'email' check (channel in ('email', 'line', 'in_app')),
  -- 送信時点の宛先。あとで保護者のアドレスが変わっても、
  -- 「どこに送ったか」は変わらない
  to_address      text,

  status          text not null default 'queued'
                    check (status in ('queued', 'sent', 'failed', 'skipped')),
  -- 送信サービス側の識別子。届いたか戻ったかを問い合わせるのに使う
  provider_id     text,
  error           text,
  sent_at         timestamptz,

  created_at      timestamptz not null default now(),

  foreign key (notification_id, organization_id)
    references public.notifications (id, organization_id) on delete cascade,
  foreign key (guardian_id, organization_id)
    references public.guardians (id, organization_id) on delete set null,
  foreign key (invoice_id, organization_id)
    references public.invoices (id, organization_id) on delete cascade
);

comment on table public.deliveries is
  '1通ごとの配信結果（設計書 4.8）。成否と理由を必ず残す。';

create index deliveries_notification_idx on public.deliveries (notification_id);
create index deliveries_invoice_idx on public.deliveries (invoice_id);

-- 送れた通知は同じ請求に二度作らない。失敗したものは送り直せる
create unique index deliveries_sent_once_per_invoice
  on public.deliveries (invoice_id, channel)
  where invoice_id is not null and status = 'sent';


-- -----------------------------------------------------------------------------
-- RLS（設計書 3章）
-- 送信は Edge Function が service_role で行う。画面からは参照だけ。
-- -----------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.deliveries    enable row level security;

create policy "所属テナントの通知を参照できる"
  on public.notifications for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "所属テナントの配信結果を参照できる"
  on public.deliveries for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

grant select on table public.notifications to authenticated;
grant select on table public.deliveries    to authenticated;
grant all    on table public.notifications to service_role;
grant all    on table public.deliveries    to service_role;
