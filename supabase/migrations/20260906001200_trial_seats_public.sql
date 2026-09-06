-- 公開ページから空きを問い合わせるための入口。app スキーマは外から呼べない
create or replace function public.trial_seats_left_public(p_lesson_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select app.trial_seats_left(p_lesson_id);
$fn$;

comment on function public.trial_seats_left_public(uuid) is
  'その回の体験の空き枠（設計書 5.2）。公開ページの表示に使う目安で、'
  '確定の判定は submit_trial_application() の中で行う。';

grant execute on function public.trial_seats_left_public(uuid) to anon, authenticated;
