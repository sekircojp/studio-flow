-- =============================================================================
-- 030: スタジオ規約
--   設計書 4.1 に対応
--
-- 入会案内・受講規約・キャンセル規定など、保護者に読んでもらう文章を1つ持つ。
-- brand_settings に置くのは、スタジオ単位の設定であって業務データではないため。
--
-- ★ 同意の記録は持たない。
--   対象業種を「スタジオと名のつく業態」に絞っており（設計書 1.1）、
--   特定継続的役務提供の7業種は外してある。契約書面の交付義務が無いので、
--   同意日時を証拠として残す必要が現時点で無い。必要になったら、
--   規約の版と同意記録を別テーブルで足す。
-- =============================================================================

alter table public.brand_settings
  add column if not exists terms text,
  add column if not exists terms_updated_at timestamptz;

comment on column public.brand_settings.terms is
  'スタジオ規約。保護者のマイページに出す。書式なしの文章。';
comment on column public.brand_settings.terms_updated_at is
  '規約を最後に更新した日時。保護者側に「最終更新」として出す。';
