-- =============================================================================
-- 041: メールの件名・本文をスタジオごとに編集できるようにする
--   設計書 11章
--
-- これまで文面は Edge Function の中に直書きだった。言い回しはスタジオごとに
-- 違うので、件名も本文も管理画面から直せるようにする。
--
-- ★ 差し込みと描画のきまりは DB に置く。
--   文面を編集する画面（Next.js）と、実際に送る側（Edge Function）の両方が
--   同じ結果を出す必要がある。両方に実装を持つと必ずずれる。DB の関数を
--   1つにして、どちらもそれを呼ぶ。
--
-- ★ 未設定なら既定の文面を使う。
--   テーブルに行が無くても送信は止まらない。スタジオが触っていないメールは
--   これまでどおり届く。
--
-- ★ ログインの確認コードは編集させない。
--   認証そのもので、文面を壊すと誰もログインできなくなる。フィッシングに
--   見える文面に書き換えられる余地も作らない。
--
-- ★ 差し込みが全部空の行は、行ごと出さない。
--   「会場　　{{会場}}」の会場が未入力のとき、ラベルだけが残ると不格好で、
--   保護者には何のことか分からない。行を落とす。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 差し込みの実行
--
-- {{名前}} を置き換える。キーに使えるのは } を含まない文字列。
-- 置換は replace() で行い、正規表現の置換文字列（\1 など）を解釈させない。
-- 値に記号が入っても壊れないようにするため。
-- -----------------------------------------------------------------------------
create or replace function app.render_template(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_out        text[] := '{}';
  v_line       text;
  v_keys       text[];
  v_key        text;
  v_val        text;
  v_rendered   text;
  v_any_filled boolean;
begin
  if p_text is null then
    return null;
  end if;

  foreach v_line in array
    string_to_array(replace(p_text, chr(13) || chr(10), chr(10)), chr(10))
  loop
    v_keys := array(
      select (regexp_matches(v_line, '\{\{([^}]+)\}\}', 'g'))[1]
    );

    v_rendered   := v_line;
    v_any_filled := false;

    foreach v_key in array coalesce(v_keys, '{}'::text[])
    loop
      v_val := coalesce(p_vars ->> btrim(v_key), '');
      if v_val <> '' then
        v_any_filled := true;
      end if;
      v_rendered := replace(v_rendered, '{{' || v_key || '}}', v_val);
    end loop;

    -- 差し込みがあるのに全部空なら、その行は出さない
    if array_length(v_keys, 1) is not null and not v_any_filled then
      continue;
    end if;

    v_out := v_out || v_rendered;
  end loop;

  return array_to_string(v_out, chr(10));
end;
$fn$;

comment on function app.render_template(text, jsonb) is
  'メール文面の差し込み（設計書 11章）。差し込みが全部空の行は出さない。';


-- -----------------------------------------------------------------------------
-- 既定の文面
--
-- スタジオが編集していないときに使う。製品としての初期値なので、
-- 変更はマイグレーションで行う（スタジオ側からは書き換えられない）。
-- -----------------------------------------------------------------------------
create table public.email_template_defaults (
  kind         text primary key,
  label        text not null,
  note         text not null,
  subject      text not null,
  body         text not null,
  -- 編集画面に出す差し込みの一覧
  placeholders text[] not null
);

comment on table public.email_template_defaults is
  'メールの既定の文面（設計書 11章）。スタジオが編集していないときに使う。';

grant select on table public.email_template_defaults to authenticated;
grant select on table public.email_template_defaults to service_role;

insert into public.email_template_defaults (kind, label, note, subject, body, placeholders) values
(
  'invoice_issued',
  '月謝のお知らせ',
  '請求を作ったときに、請求先の保護者へ送ります。',
  '{{対象月}}分の月謝のお知らせ',
  '{{保護者名}} 様

{{対象月}}分の月謝のお知らせです。

　お子さま　{{生徒名}}
　ご請求額　{{請求金額}}
　お支払期限　{{支払期限}}

内訳はマイページからご確認いただけます。

{{スクール名}}',
  array['保護者名', '生徒名', '対象月', '請求金額', '支払期限', 'スクール名']
),
(
  'trial_approved',
  '体験・見学の予約確定',
  '体験の申込を承認したときに送ります。',
  '{{種別}}のご予約が確定しました',
  '{{保護者名}} 様

{{種別}}のお申し込みをありがとうございました。下記のとおり確定しました。

　お子さま　{{生徒名}}
　クラス　　{{クラス}}
　日時　　　{{日時}}
　場所　　　{{会場}}
　　　　　　{{住所}}

当日は少し早めにお越しください。ご都合が悪くなった場合は、
このメールへご返信いただくかお電話でお知らせください。

お問い合わせ　{{電話}}

{{スクール名}}',
  array['保護者名', '生徒名', '種別', 'クラス', '日時', '会場', '住所', '電話', 'スクール名']
),
(
  'trial_declined',
  '体験・見学の見送り',
  '体験の申込を見送りにしたときに送ります。',
  '{{種別}}のお申し込みについて',
  '{{保護者名}} 様

{{種別}}のお申し込みをありがとうございました。
たいへん申し訳ございませんが、今回はご希望の回でお受けすることが
できませんでした。

　お申し込みの回　{{日時}}

別の回でしたらご案内できる場合がございます。ご検討いただける
ようでしたら、このメールへご返信いただくかお電話でお知らせください。

お問い合わせ　{{電話}}

{{スクール名}}',
  array['保護者名', '生徒名', '種別', '日時', '電話', 'スクール名']
),
(
  'event_invited',
  '発表会・イベントの出欠のお願い',
  '「保護者に案内する」を押したときに送ります。',
  '【{{種類}}】{{イベント名}} 出欠のお願い',
  '{{保護者名}} 様

{{種類}}のご案内です。ご出席の可否をお知らせください。

　{{種類}}　　{{イベント名}}
　お子さま　{{生徒名}}
　日時　　　{{日時}}
　会場　　　{{会場}}
　参加費　　{{参加費}}
　　　　　　{{参加費の補足}}

お返事の期限　{{回答期限}}

マイページからお答えいただけます。
{{マイページURL}}

{{案内文}}

{{スクール名}}',
  array['保護者名', '生徒名', '種類', 'イベント名', '日時', '会場', '参加費',
        '参加費の補足', '回答期限', 'マイページURL', '案内文', 'スクール名']
);


-- -----------------------------------------------------------------------------
-- スタジオごとの文面
-- -----------------------------------------------------------------------------
create table public.email_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  kind            text not null references public.email_template_defaults (kind),

  subject         text not null,
  body            text not null,

  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null,

  unique (organization_id, kind)
);

comment on table public.email_templates is
  'スタジオごとのメール文面（設計書 11章）。行が無ければ既定の文面を使う。';

create trigger email_templates_set_updated_at
  before update on public.email_templates
  for each row execute function app.set_updated_at();


-- -----------------------------------------------------------------------------
-- 実際に使う文面（スタジオの設定があればそれ、無ければ既定）
-- -----------------------------------------------------------------------------
create or replace function public.effective_email_template(
  p_organization_id uuid,
  p_kind            text
)
returns table (subject text, body text, is_custom boolean)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    coalesce(t.subject, d.subject),
    coalesce(t.body, d.body),
    t.id is not null
  from public.email_template_defaults d
  left join public.email_templates t
    on t.kind = d.kind and t.organization_id = p_organization_id
  where d.kind = p_kind;
$fn$;

comment on function public.effective_email_template(uuid, text) is
  '実際に使う文面を返す（設計書 11章）。設定が無ければ既定の文面。';

grant execute on function public.effective_email_template(uuid, text)
  to authenticated, service_role;


-- 送信側が呼ぶ。文面を引いて差し込みまで済ませる
create or replace function public.render_email(
  p_organization_id uuid,
  p_kind            text,
  p_vars            jsonb
)
returns table (subject text, body text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    app.render_template(t.subject, p_vars),
    app.render_template(t.body, p_vars)
  from public.effective_email_template(p_organization_id, p_kind) t;
$fn$;

comment on function public.render_email(uuid, text, jsonb) is
  '送信する文面を組み立てる（設計書 11章）。Edge Function から呼ぶ。';

revoke all on function public.render_email(uuid, text, jsonb) from public, anon;
grant execute on function public.render_email(uuid, text, jsonb) to service_role;


-- 編集画面の下書きプレビュー。保存前の文面をそのまま渡す
create or replace function public.preview_email(
  p_subject text,
  p_body    text,
  p_vars    jsonb
)
returns table (subject text, body text)
language sql
stable
set search_path = ''
as $fn$
  select app.render_template(p_subject, p_vars), app.render_template(p_body, p_vars);
$fn$;

comment on function public.preview_email(text, text, jsonb) is
  '保存前の文面を差し込んで返す（設計書 11章）。編集画面のプレビュー用。';

revoke all on function public.preview_email(text, text, jsonb) from public, anon;
grant execute on function public.preview_email(text, text, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- RLS（設計書 3章 / 7章）
-- 変更できるのはオーナーだけ。スタッフには読み取りまで。
-- -----------------------------------------------------------------------------
revoke all on table public.email_templates from anon;
grant select, insert, update, delete on table public.email_templates to authenticated;
grant all on table public.email_templates to service_role;

alter table public.email_templates enable row level security;

create policy "運営はメール文面を参照できる"
  on public.email_templates for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'staff']));

create policy "オーナーはメール文面を登録できる"
  on public.email_templates for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner']));

create policy "オーナーはメール文面を更新できる"
  on public.email_templates for update to authenticated
  using (app.has_org_role(organization_id, array['owner']))
  with check (app.has_org_role(organization_id, array['owner']));

-- 既定の文面に戻す操作は、行を消して表す。文面は業務の記録ではなく設定なので、
-- ここは物理削除でよい（CLAUDE.md の「状態変更で表す」は業務データの話）
create policy "オーナーはメール文面を既定に戻せる"
  on public.email_templates for delete to authenticated
  using (app.has_org_role(organization_id, array['owner']));
