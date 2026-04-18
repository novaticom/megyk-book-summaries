-- Add German cover image URL to books table
alter table books add column if not exists cover_image_url_de text default '';
