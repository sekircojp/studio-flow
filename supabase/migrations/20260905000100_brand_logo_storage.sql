-- =============================================================================
-- 022: ロゴ画像の保管場所（Supabase Storage）
--   設計書 4.1 / 12章 に対応。MarcheBase の Storage 設計を移植（設計書 10.5）
--
-- バケットは1つ（brand）。ファイルのパスは
--
--   brand/<organization_id>/logo-<乱数>.<拡張子>
--
-- 先頭のフォルダ名をテナントの id にしておくと、Storage の RLS を
-- 「そのフォルダ名が自分のテナントか」だけで書ける。業務テーブルと同じく、
-- テナントを跨げないことを行レベルで担保する（設計書 3章）。
--
-- ★ 読み取りは公開にする。
--   ロゴは保護者向けの画面にも、将来の公開ページにも出る。署名付き URL に
--   すると期限が切れて画像が消えるうえ、キャッシュも効かない。
--   秘密でない画像なので公開で構わない。
--
-- ★ 書き込みはオーナーだけ。
--   基本設定はオーナー限定（設計書 7章）。画面側の requireOwner() だけに
--   頼らず、Storage 側でも同じ条件を持たせる。
--
-- ★ ファイル名に乱数を入れる。
--   同じ名前で上書きすると、CDN と保護者のブラウザに古い画像が残り、
--   「変えたのに戻らない」ことになる。毎回別名で置き、古いほうを消す。
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand',
  'brand',
  true,
  2 * 1024 * 1024,  -- 2MB。ロゴにこれ以上は要らない
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- 先頭フォルダが自テナントの id かどうか。
-- storage.foldername('<uuid>/logo-x.png') は {<uuid>} を返す
create or replace function app.storage_folder_is_own_org(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    case
      when object_name is null then false
      -- uuid にできない文字列が来たら false。例外で落とさない
      when (storage.foldername(object_name))[1] !~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then false
      else app.has_org_role(
             ((storage.foldername(object_name))[1])::uuid,
             array['owner']
           )
    end;
$fn$;

comment on function app.storage_folder_is_own_org(text) is
  'Storage のパス先頭のフォルダ名が、呼び出し元がオーナーであるテナントの id か。';

revoke all on function app.storage_folder_is_own_org(text) from public, anon;
grant execute on function app.storage_folder_is_own_org(text) to authenticated;


-- 読み取りは公開バケットなので anon でも通す
create policy "ロゴは誰でも参照できる"
  on storage.objects for select
  using (bucket_id = 'brand');

create policy "オーナーは自テナントのロゴを置ける"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand'
    and app.storage_folder_is_own_org(name)
  );

create policy "オーナーは自テナントのロゴを差し替えられる"
  on storage.objects for update to authenticated
  using (bucket_id = 'brand' and app.storage_folder_is_own_org(name))
  with check (bucket_id = 'brand' and app.storage_folder_is_own_org(name));

-- 古いロゴは残しても意味が無いので、ここだけは物理削除を許す。
-- 業務データではなく、差し替えで参照されなくなる画像ファイルのため。
create policy "オーナーは自テナントのロゴを消せる"
  on storage.objects for delete to authenticated
  using (bucket_id = 'brand' and app.storage_folder_is_own_org(name));
