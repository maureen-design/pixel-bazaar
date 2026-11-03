-- ============================================================================
-- NexaMart AI - 0044_addresses_table_rls.sql
-- Creates addresses table for customer saved shipping addresses.
--
-- Schema:
--   - Standard address fields for checkout reuse
--   - is_default flag for one default address per user
--   - Partial unique index ensures at most one default per user
--   - Max 5 addresses per user enforced in application layer (not here)
--
-- RLS:
--   - Users can only CRUD their own addresses (user_id = auth.uid())
--   - No admin policies (consistent with profile/address data pattern)
--
-- Leverages existing:
--   - update_updated_at() trigger function (0001_base_schema.sql)
--
-- Does NOT alter:
--   - orders table
--   - historical shipping_address in orders
-- ============================================================================

-- Create addresses table
create table if not exists public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  full_name     text not null,
  phone         text not null,
  address_line  text not null,
  city          text not null,
  county        text not null,
  postal_code   text,
  is_default    boolean not null default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Trigger for updated_at
create trigger update_addresses_updated_at
  before update on public.addresses
  for each row execute function public.update_updated_at();

-- Partial unique index: at most one default address per user
create unique index idx_addresses_user_default
  on public.addresses (user_id)
  where is_default = true;

-- Regular index for user_id lookups
create index idx_addresses_user_id on public.addresses (user_id);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
alter table public.addresses enable row level security;

-- Users can SELECT their own addresses
create policy "addresses_user_select_policy"
  on public.addresses for select
  using (user_id = auth.uid());

-- Users can INSERT their own addresses
create policy "addresses_user_insert_policy"
  on public.addresses for insert
  with check (user_id = auth.uid());

-- Users can UPDATE their own addresses
create policy "addresses_user_update_policy"
  on public.addresses for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can DELETE their own addresses
create policy "addresses_user_delete_policy"
  on public.addresses for delete
  using (user_id = auth.uid());

-- ============================================================================
-- Application-enforced constraint (documented here)
-- ============================================================================
-- Max 5 addresses per user is enforced in the application layer.
-- This allows flexibility for future adjustments without schema changes.
-- ============================================================================

-- ============================================================================
-- End of migration
-- ============================================================================
