-- Create book_tags table for tag definitions
CREATE TABLE IF NOT EXISTS book_tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_book_tags_slug ON book_tags(slug);
CREATE INDEX IF NOT EXISTS idx_book_tags_display_order ON book_tags(display_order);

-- Create junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS book_tag_mappings (
  id SERIAL PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES book_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(book_id, tag_id)
);

-- Create indexes for fast joins
CREATE INDEX IF NOT EXISTS idx_book_tag_mappings_book_id ON book_tag_mappings(book_id);
CREATE INDEX IF NOT EXISTS idx_book_tag_mappings_tag_id ON book_tag_mappings(tag_id);

-- Enable Row Level Security
ALTER TABLE book_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_tag_mappings ENABLE ROW LEVEL SECURITY;

-- Policies for book_tags (public read, service role manage)
DROP POLICY IF EXISTS "Anyone can read book_tags" ON book_tags;
CREATE POLICY "Anyone can read book_tags"
  ON book_tags
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage book_tags" ON book_tags;
CREATE POLICY "Service role can manage book_tags"
  ON book_tags
  FOR ALL
  USING (auth.role() = 'service_role');

-- Policies for book_tag_mappings (public read, service role manage)
DROP POLICY IF EXISTS "Anyone can read book_tag_mappings" ON book_tag_mappings;
CREATE POLICY "Anyone can read book_tag_mappings"
  ON book_tag_mappings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage book_tag_mappings" ON book_tag_mappings;
CREATE POLICY "Service role can manage book_tag_mappings"
  ON book_tag_mappings
  FOR ALL
  USING (auth.role() = 'service_role');

-- Seed initial tags (10 tags as specified)
INSERT INTO book_tags (name, slug, display_order) VALUES
  ('Productivity', 'productivity', 1),
  ('Psychology', 'psychology', 2),
  ('Business', 'business', 3),
  ('Leadership', 'leadership', 4),
  ('Self-Help', 'self-help', 5),
  ('Habits', 'habits', 6),
  ('Mindset', 'mindset', 7),
  ('Communication', 'communication', 8),
  ('Finance', 'finance', 9),
  ('Entrepreneurship', 'entrepreneurship', 10)
ON CONFLICT (slug) DO NOTHING;

-- Auto-populate tag mappings from existing book_genre_id relationships
-- Map genres to corresponding tags where names match
INSERT INTO book_tag_mappings (book_id, tag_id)
SELECT DISTINCT b.id, bt.id
FROM books b
JOIN book_genres bg ON b.book_genre_id = bg.id
JOIN book_tags bt ON LOWER(bg.name) = LOWER(bt.name)
WHERE b.book_genre_id IS NOT NULL
ON CONFLICT (book_id, tag_id) DO NOTHING;

-- Reset sequence to max id + 1 to avoid conflicts
SELECT setval('book_tags_id_seq', COALESCE((SELECT MAX(id) FROM book_tags), 0) + 1, false);
