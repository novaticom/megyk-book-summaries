-- Add translations JSONB column to books table
-- Structure: { "de": { "title": "...", "summary": "..." }, "fr": { ... } }
-- English is always the source of truth in the base columns (title, summary)
-- Translated content is stored here; falls back to base columns if key absent

ALTER TABLE books ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}';

-- Index for efficient locale key existence checks
-- e.g. WHERE translations ? 'de'
CREATE INDEX IF NOT EXISTS idx_books_translations ON books USING gin(translations);

COMMENT ON COLUMN books.translations IS
  'Locale-keyed translations for user-facing text fields. Keys are BCP 47 locale codes (e.g. "de", "fr"). '
  'Each value is an object with optional keys: title, summary. '
  'Falls back to base columns when a key or locale is absent.';
