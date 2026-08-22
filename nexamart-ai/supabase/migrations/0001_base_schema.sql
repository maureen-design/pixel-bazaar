-- ============================================================================
-- NexaMart AI â€” 0001_base_schema.sql
-- Canonical base schema reconstructed from LIVE Supabase introspection
-- Project: jsdynslcjnfdulzgvamj (2026-08-08)
-- NOTE: mirrors the live database, NOT docs/04_DATABASE_SCHEMA.md (obsolete).
-- See SCHEMA_RECONCILIATION_REPORT.md for drift analysis.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";   -- uuid_generate_v4()

-- ----------------------------------------------------------------------------
-- 1. Enums (order matches live pg_enum)
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('customer', 'vendor', 'admin');
create type public.order_status as enum ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.product_status as enum ('active', 'draft', 'out_of_stock');

-- ----------------------------------------------------------------------------
-- 2. updated_at helper
-- ----------------------------------------------------------------------------
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 3. Tables
-- ============================================================================

-- 3.1 profiles ---------------------------------------------------------------
create table public.profiles (
  id           uuid primary key not null,
  email        text not null unique,
  full_name    text,
  phone        text,
  address      text,
  avatar_url   text,
  role         public.user_role default 'customer',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- 3.2 vendors ---------------------------------------------------------------
create table public.vendors (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null unique references public.profiles (id) on delete cascade,
  store_name        text not null unique,
  store_description text,
  store_logo        text,
  store_cover       text,
  is_approved       boolean default false,
  rating            numeric(3,2) default 0.00,
  total_sales       integer default 0,
  is_verified       boolean default false,
  business_name     text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create trigger update_vendors_updated_at
  before update on public.vendors
  for each row execute function public.update_updated_at();

-- 3.3 categories -------------------------------------------------------------
create table public.categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  description text,
  parent_id   uuid references public.categories (id) on delete cascade,
  image_url   text,
  created_at  timestamptz default now()
);

-- 3.4 products ---------------------------------------------------------------
create table public.products (
  id             uuid primary key default uuid_generate_v4(),
  vendor_id      uuid not null references public.vendors (id) on delete cascade,
  category_id    uuid references public.categories (id) on delete set null,
  name           text not null,
  slug           text not null unique,
  description    text,
  price          numeric(10,2) not null,
  compare_price  numeric(10,2),
  stock_quantity integer not null default 0,
  images         text[] default '{}',
  status         public.product_status default 'draft',
  rating         numeric(3,2) default 0.00,
  total_views    integer default 0,
  total_orders   integer default 0,
  variants       jsonb default '{}',
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create trigger update_products_updated_at
  before update on public.products
  for each row execute function public.update_updated_at();

-- 3.5 cart_items ---------------------------------------------------------------
create table public.cart_items (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete cascade,
  quantity          integer not null,
  variant_id        text,
  variant_attributes jsonb,
  variant_price     numeric(10,2),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (user_id, product_id)
);

create trigger update_cart_items_updated_at
  before update on public.cart_items
  for each row execute function public.update_updated_at();

-- 3.6 wishlist_items ---------------------------------------------------------
create table public.wishlist_items (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, product_id)
);

-- 3.7 coupons -----------------------------------------------------------------
create table public.coupons (
  id             uuid primary key default uuid_generate_v4(),
  code           text not null unique,
  description    text,
  discount_type  text not null,
  discount_value numeric(10,2) not null,
  min_spend      numeric(10,2) default 0,
  max_discount   numeric(10,2),
  usage_limit    integer,
  used_count     integer default 0,
  expires_at     timestamptz,
  is_active      boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 3.8 orders ------------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  vendor_id           uuid not null references public.vendors (id) on delete cascade,
  order_number        text not null unique,
  total_amount        numeric(10,2) not null,
  shipping_address    text not null,
  shipping_cost       numeric(10,2) default 0.00,
  tax_amount          numeric(10,2) default 0.00,
  discount_amount     numeric(10,2) default 0.00,
  status              public.order_status default 'pending',
  payment_status      public.payment_status default 'pending',
  payment_method      text,
  payment_id          text,
  notes               text,
  mpesa_checkout_id   text,
  mpesa_transaction_id text,
  paid_at             timestamptz,
  payment_error       text,
  coupon_id           uuid references public.coupons (id) on delete no action,
  coupon_code         text,
  delivery_method     text default 'standard',
  delivery_cost       numeric(10,2) default 0,
  payment_type        text default 'now',
  payment_deadline    timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create trigger update_orders_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at();

create index idx_orders_created_at on public.orders (created_at desc);
create index idx_orders_status on public.orders (status);
create index idx_orders_user_id on public.orders (user_id);
create index idx_orders_vendor_id on public.orders (vendor_id);

-- 3.9 order_items ---------------------------------------------------------------
create table public.order_items (
  id                uuid primary key default uuid_generate_v4(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete cascade,
  product_name      text not null,
  product_price     numeric(10,2) not null,
  quantity          integer not null,
  total_price       numeric(10,2) not null,
  variant_id        text,
  variant_attributes jsonb,
  created_at        timestamptz default now()
);

-- 3.10 reviews -----------------------------------------------------------------
create table public.reviews (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  product_id          uuid not null references public.products (id) on delete cascade,
  order_id            uuid references public.orders (id) on delete set null,
  rating              integer not null,
  comment             text,
  images              text[] default '{}',
  is_verified_purchase boolean default false,
  is_approved         boolean default false,
  is_hidden           boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (user_id, product_id, order_id)
);

create trigger update_reviews_updated_at
  before update on public.reviews
  for each row execute function public.update_updated_at();

-- 3.11 notifications -----------------------------------------------------------
create table public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  message    text not null,
  type       text not null,
  is_read    boolean default false,
  link       text,
  created_at timestamptz default now()
);

create index idx_notifications_is_read on public.notifications (is_read);
create index idx_notifications_user_id on public.notifications (user_id);

-- 3.12 system_settings ---------------------------------------------------------
create table public.system_settings (
  id          uuid primary key default uuid_generate_v4(),
  key         text not null unique,
  value       jsonb not null,
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger update_system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.update_updated_at();

-- 3.13 audit_logs ---------------------------------------------------------------
create table public.audit_logs (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references public.profiles (id) on delete set null,
  action     text not null,
  table_name text,
  record_id  uuid,
  old_data   jsonb,
  new_data   jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index idx_audit_logs_user_id on public.audit_logs (user_id);

-- 3.14 activity_logs -------------------------------------------------------------
create table public.activity_logs (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references public.profiles (id) on delete set null,
  user_email text,
  action     text not null,
  details    jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

-- ============================================================================
-- 4. Additional indexes (live parity)
-- ============================================================================
create index idx_products_category_id on public.products (category_id);
create index idx_products_created_at on public.products (created_at desc);
create index idx_products_status on public.products (status);
create index idx_products_vendor_id on public.products (vendor_id);

create index idx_cart_items_user_id on public.cart_items (user_id);
create index idx_cart_items_variant on public.cart_items (variant_id);

create index idx_wishlist_items_user_id on public.wishlist_items (user_id);

create index idx_reviews_product_id on public.reviews (product_id);
create index idx_reviews_user_id on public.reviews (user_id);

-- ============================================================================
-- 5. App helper functions
-- ============================================================================
create or replace function public.decrement_stock(product_id uuid, quantity int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products
  set stock_quantity = greatest(0, stock_quantity - quantity)
  where id = product_id;
end;
$$;

-- ============================================================================
-- 6. Row Level Security (live parity â€” all policies)
-- ============================================================================
alter table public.profiles       enable row level security;
alter table public.vendors        enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.cart_items     enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.coupons        enable row level security;
alter table public.notifications  enable row level security;
alter table public.order_items    enable row level security;
alter table public.orders         enable row level security;
alter table public.reviews        enable row level security;
alter table public.system_settings enable row level security;
alter table public.audit_logs     enable row level security;
alter table public.activity_logs  enable row level security;

-- profiles --------------------------------------------------------------------
create policy "Allow all inserts on profiles"
  on public.profiles for insert
  with check (true);

create policy "profiles_insert_policy"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_select_policy"
  on public.profiles for select
  using (true);

create policy "profiles_update_policy"
  on public.profiles for update
  using (auth.uid() = id);

-- vendors ---------------------------------------------------------------------
create policy "vendors_select_policy"
  on public.vendors for select
  using (true);

create policy "vendors_insert_policy"
  on public.vendors for insert
  with check (auth.uid() = user_id);

create policy "vendors_update_policy"
  on public.vendors for update
  using (auth.uid() = user_id);

create policy "vendors_delete_policy"
  on public.vendors for delete
  using (auth.uid() = user_id);

-- categories ------------------------------------------------------------------
create policy "categories_select_policy"
  on public.categories for select
  using (true);

create policy "categories_insert_policy"
  on public.categories for insert
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "categories_update_policy"
  on public.categories for update
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "categories_delete_policy"
  on public.categories for delete
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- products --------------------------------------------------------------------
create policy "products_select_policy"
  on public.products for select
  using ((status = 'active') or (auth.uid() in (select vendors.user_id from public.vendors where vendors.id = products.vendor_id)));

create policy "products_insert_policy"
  on public.products for insert
  with check (auth.uid() in (select vendors.user_id from public.vendors where vendors.id = products.vendor_id));

create policy "products_update_policy"
  on public.products for update
  using (auth.uid() in (select vendors.user_id from public.vendors where vendors.id = products.vendor_id));

create policy "products_delete_policy"
  on public.products for delete
  using (auth.uid() in (select vendors.user_id from public.vendors where vendors.id = products.vendor_id));

-- cart_items ------------------------------------------------------------------
create policy "cart_items_select_policy"
  on public.cart_items for select
  using (auth.uid() = user_id);

create policy "cart_items_insert_policy"
  on public.cart_items for insert
  with check (auth.uid() = user_id);

create policy "cart_items_update_policy"
  on public.cart_items for update
  using (auth.uid() = user_id);

create policy "cart_items_delete_policy"
  on public.cart_items for delete
  using (auth.uid() = user_id);

-- wishlist_items ----------------------------------------------------------------
create policy "wishlist_items_select_policy"
  on public.wishlist_items for select
  using (auth.uid() = user_id);

create policy "wishlist_items_insert_policy"
  on public.wishlist_items for insert
  with check (auth.uid() = user_id);

create policy "wishlist_items_delete_policy"
  on public.wishlist_items for delete
  using (auth.uid() = user_id);

create policy "Users can insert own wishlist items"
  on public.wishlist_items for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own wishlist items"
  on public.wishlist_items for delete
  using (auth.uid() = user_id);

-- coupons ---------------------------------------------------------------------
create policy "Anyone can view active coupons"
  on public.coupons for select
  using ((is_active = true) and ((expires_at is null) or (expires_at > now())));

create policy "Admins can manage coupons"
  on public.coupons for all
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- notifications ----------------------------------------------------------------
create policy "notifications_select_policy"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_update_policy"
  on public.notifications for update
  using (auth.uid() = user_id);

-- orders -----------------------------------------------------------------------
create policy "Users can insert orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

create policy "Users can view own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "orders_insert_policy"
  on public.orders for insert
  with check (auth.uid() = user_id);

create policy "orders_select_policy"
  on public.orders for select
  using ((auth.uid() = user_id) or (auth.uid() in (select vendors.user_id from public.vendors where vendors.id = orders.vendor_id)));

create policy "orders_update_policy"
  on public.orders for update
  using ((auth.uid() = user_id) or (auth.uid() in (select vendors.user_id from public.vendors where vendors.id = orders.vendor_id)));

-- order_items -------------------------------------------------------------------
create policy "order_items_select_policy"
  on public.order_items for select
  using (exists (select 1 from public.orders where orders.id = order_items.order_id and (orders.user_id = auth.uid() or auth.uid() in (select vendors.user_id from public.vendors where vendors.id = orders.vendor_id))));

create policy "Users can insert order items"
  on public.order_items for insert
  with check (exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid()));

create policy "Users can view own order items"
  on public.order_items for select
  using (exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid()));

-- reviews -------------------------------------------------------------------------
create policy "reviews_select_policy"
  on public.reviews for select
  using (true);

create policy "reviews_insert_policy"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "reviews_update_policy"
  on public.reviews for update
  using (auth.uid() = user_id);

create policy "reviews_delete_policy"
  on public.reviews for delete
  using (auth.uid() = user_id);

-- audit_logs -----------------------------------------------------------------------
create policy "audit_logs_select_policy"
  on public.audit_logs for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- activity_logs ----------------------------------------------------------------------
create policy "Admins can view activity logs"
  on public.activity_logs for select
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ============================================================================
-- 7. Grants (standard Supabase)
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;