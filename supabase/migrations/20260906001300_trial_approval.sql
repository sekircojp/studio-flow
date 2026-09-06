-- =============================================================================
-- 036: 体験・見学の申込を承認制にする
--   設計書 4.6 / 5.2 の変更（2026-09-06）
--
-- 当初は「定員に空きがあれば、その場で確定」としていた。運営判断として
-- 承認制に改める。誰でも投稿できる入口である以上、当日その回に人が来る
-- ことをスタジオが把握してから確定したい。
--
-- ★ 承認待ちの申込も席を1つ押さえる。
--   押さえないと、5席の回に10件の承認待ちが並び、全部承認できてしまう。
--   いたずらで席が埋まるのは、連投の制限（10分に3件）と、見送りで
--   すぐ空けられることで抑える。過剰に受けてしまうよりは軽い。
--
-- ★ 既存の行は booked のまま。
--   承認制にする前に受け付けたものは、確定済みとして扱う。
-- =============================================================================

alter table public.trials drop constraint if exists trials_status_check;

alter table public.trials
  add constraint trials_status_check
  check (status in ('pending', 'booked', 'attended', 'no_show',
                    'enrolled', 'declined', 'canceled'));

alter table public.trials alter column status set default 'pending';

comment on column public.trials.status is
  'pending 承認待ち / booked 予約確定 / attended 参加した / no_show 来なかった'
  ' / enrolled 入会した / declined 見送り / canceled 取り消し';


-- 承認待ちも席を押さえる（設計書 5.2）
create or replace function app.trial_seats_left(p_lesson_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select case
    when c.room_capacity is null then 999
    else greatest(
      c.room_capacity
      - (select count(*) from public.enrollments e
          where e.class_id = l.class_id
            and e.start_date <= l.date
            and (e.end_date is null or e.end_date >= l.date))
      - (select count(*) from public.trials t
          where t.lesson_id = l.id
            and t.status in ('pending', 'booked', 'attended'))
      - (select count(*) from public.transfer_bookings tb
          where tb.lesson_id = l.id and tb.canceled_at is null),
      0)
  end
  from public.lessons l
  join public.classes c on c.id = l.class_id
  where l.id = p_lesson_id;
$fn$;

comment on function app.trial_seats_left(uuid) is
  'その回にあと何人受け入れられるか（設計書 5.2）。承認待ちも席を押さえる。'
  'room_capacity が未設定なら上限なしとして扱う。';
