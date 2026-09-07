-- =============================================================================
-- 042: 件名が空になるのを防ぐ
--   移行 041 の修正
--
-- 「差し込みが全部空の行は、行ごと出さない」規則は本文のためのもの。
-- 件名は1行しかないので、そのまま当てると件名そのものが消える。
--
-- 例: 件名「{{生徒名}} さんの出欠」で生徒名が空 → 件名が空文字になる
--
-- 1行だけの文字列には規則を当てない。
-- =============================================================================

create or replace function app.render_template(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v_lines      text[];
  v_out        text[] := '{}';
  v_line       text;
  v_keys       text[];
  v_key        text;
  v_val        text;
  v_rendered   text;
  v_any_filled boolean;
  v_multiline  boolean;
begin
  if p_text is null then
    return null;
  end if;

  v_lines := string_to_array(replace(p_text, chr(13) || chr(10), chr(10)), chr(10));
  -- 件名のような1行の文字列では、行を落とす規則を当てない
  v_multiline := coalesce(array_length(v_lines, 1), 0) > 1;

  foreach v_line in array v_lines
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

    if v_multiline
       and array_length(v_keys, 1) is not null
       and not v_any_filled then
      continue;
    end if;

    v_out := v_out || v_rendered;
  end loop;

  return array_to_string(v_out, chr(10));
end;
$fn$;

comment on function app.render_template(text, jsonb) is
  'メール文面の差し込み（設計書 11章）。複数行のときだけ、差し込みが'
  '全部空の行を落とす。件名は1行なので落とさない。';
