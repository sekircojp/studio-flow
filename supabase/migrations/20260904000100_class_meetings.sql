-- =============================================================================
-- 018: クラスと開催枠の分離
--   設計書 4.2 / 5.1 の変更（2026-09-04）
--
-- これまで classes は曜日・時刻・部屋を1組しか持てなかった。そのため
-- 「週2回の初級クラス」を登録すると行が2つでき、クラス数が2と数えられて
-- しまっていた。運営の感覚では、これは1クラスである。
--
--   初級クラス（週2回レッスン）→ 1クラス
--   中級クラス（週1回レッスン）→ 1クラス
--
-- クラス（生徒が在籍する単位）と、開催枠（毎週いつどこでやるか）を分ける。
--
--   classes（クラス）           … 初級クラス
--     └ class_meetings（開催枠） … 毎週火 16:00-17:00 スタジオA
--                                  毎週土 10:00-11:00 スタジオA
--
-- 隔週・月1回のような周期は持たせない。実例が乏しいわりに構造が複雑になる。
-- 例外的な回はレッスンを個別に休講・時間変更して調整する（設計書 5.1）。
--
-- ★ 開催枠に物理削除は用意しない。使わなくなった枠は is_active = false に
--   する。生成済みのレッスンが根拠を失わないようにするため（CLAUDE.md）。
-- =============================================================================

create table public.class_meetings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_id        uuid not null,
  room_id         uuid not null,

  -- 0 = 日曜 … 6 = 土曜。PostgreSQL の extract(dow) と同じ並び
  day_of_week     integer not null check (day_of_week between 0 and 6),
  start_time      time not null,
  end_time        time not null,

  is_active       boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint class_meetings_time_order check (start_time < end_time),

  foreign key (class_id, organization_id)
    references public.classes (id, organization_id) on delete cascade,
  foreign key (room_id, organization_id)
    references public.rooms (id, organization_id) on delete restrict,

  -- 同じクラスで同じ曜日・同じ開始時刻の枠は1つだけ
  unique (class_id, day_of_week, start_time),

  unique (id, organization_id)
);

comment on table public.class_meetings is
  'クラスの開催枠（設計書 4.2）。週に何回やるかはここの件数で表す。';
comment on column public.class_meetings.is_active is
  '使わなくなった枠は false にする。物理削除はしない。';

create index class_meetings_class_idx
  on public.class_meetings (class_id, day_of_week, start_time);

-- 既存のクラスを、そのまま開催枠1件へ移す
insert into public.class_meetings (
  organization_id, class_id, room_id, day_of_week, start_time, end_time
)
select organization_id, id, room_id, day_of_week, start_time, end_time
from public.classes;


-- -----------------------------------------------------------------------------
-- レッスンから、どの開催枠で作られたかを辿れるようにする
-- -----------------------------------------------------------------------------
alter table public.lessons add column class_meeting_id uuid;

update public.lessons l
set class_meeting_id = cm.id
from public.class_meetings cm
where cm.class_id = l.class_id;

alter table public.lessons
  add constraint lessons_class_meeting_fkey
  foreign key (class_meeting_id, organization_id)
    references public.class_meetings (id, organization_id) on delete set null;

comment on column public.lessons.class_meeting_id is
  'どの開催枠から作られた回か。枠を止めても過去の回は残す（on delete set null）。';

-- 週2回のクラスは同じ日に2回開催されうる（同日午前と午後など）。
-- 日付だけの一意制約では入らないので、開始時刻まで含める
alter table public.lessons drop constraint lessons_class_id_date_key;
alter table public.lessons
  add constraint lessons_class_id_date_start_at_key
  unique (class_id, date, start_at);


-- -----------------------------------------------------------------------------
-- classes 側から曜日・時刻・部屋を外す。開催枠が唯一の置き場になる
-- -----------------------------------------------------------------------------
alter table public.classes
  drop column day_of_week,
  drop column start_time,
  drop column end_time,
  drop column room_id;


-- -----------------------------------------------------------------------------
-- RLS（設計書 3章）
-- -----------------------------------------------------------------------------
alter table public.class_meetings enable row level security;

create policy "所属テナントの開催枠を参照できる"
  on public.class_meetings for select to authenticated
  using (organization_id in (select app.current_organization_ids()));

create policy "オーナーとスタッフは開催枠を登録できる"
  on public.class_meetings for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーとスタッフは開催枠を更新できる"
  on public.class_meetings for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']))
  with check (app.has_org_role(organization_id, array['owner', 'staff']));

-- delete は与えない。停止は is_active で表す
grant select, insert, update on table public.class_meetings to authenticated;
grant all on table public.class_meetings to service_role;
