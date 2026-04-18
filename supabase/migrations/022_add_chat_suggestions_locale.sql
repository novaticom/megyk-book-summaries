-- Add locale column to chat_suggestions for i18n support
ALTER TABLE chat_suggestions
ADD COLUMN locale VARCHAR(5) NOT NULL DEFAULT 'en';

-- Set existing suggestions to English
UPDATE chat_suggestions SET locale = 'en' WHERE locale IS NULL;

-- Add index for faster locale-based queries
CREATE INDEX idx_chat_suggestions_book_locale ON chat_suggestions(book_id, locale);

-- Optional: Add a comment for documentation
COMMENT ON COLUMN chat_suggestions.locale IS 'ISO locale code (e.g., en, de)';
