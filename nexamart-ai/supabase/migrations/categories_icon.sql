-- Add icon support to categories
alter table public.categories
  add column if not exists icon text;