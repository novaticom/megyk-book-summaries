-- Add locale support to summaries system (normalized approach)

-- 1. summaries_v2 (pre-generated system summaries)
ALTER TABLE summaries_v2 ADD COLUMN locale VARCHAR(5) NOT NULL DEFAULT 'en';

-- Update unique constraint to include locale
ALTER TABLE summaries_v2 DROP CONSTRAINT summaries_v2_unique_per_type;
ALTER TABLE summaries_v2 ADD CONSTRAINT summaries_v2_unique_per_type
  UNIQUE (book_id, length, style, locale);

-- Index for locale queries
CREATE INDEX idx_summaries_v2_locale ON summaries_v2(locale);

COMMENT ON COLUMN summaries_v2.locale IS 'ISO locale code (e.g., en, de)';

-- 2. books - add German default summary PDF URL
ALTER TABLE books ADD COLUMN default_summary_pdf_url_de TEXT;

COMMENT ON COLUMN books.default_summary_pdf_url_de IS 'Pre-generated German summary PDF URL';

-- 3. summaries (user-generated summaries)
ALTER TABLE summaries ADD COLUMN locale VARCHAR(5) NOT NULL DEFAULT 'en';

-- Update unique index to include locale
DROP INDEX idx_summaries_user_book_style_length_unique;
CREATE UNIQUE INDEX idx_summaries_user_book_style_length_locale_unique
  ON summaries(user_id, book_id, style, length, locale);

COMMENT ON COLUMN summaries.locale IS 'ISO locale code (e.g., en, de)';
