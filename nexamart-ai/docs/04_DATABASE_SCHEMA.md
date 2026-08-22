# NexaMart AI — Database Schema Specification

**Version:** 2.0
**Status:** Approved — matches `supabase/migrations/0001_base_schema.sql`
**Last Updated:** August 2026
**Provenance:** Reconstructed from a verified live introspection of Supabase project `jsdynslcjnfdulzgvamj` (2026-08-08) and re-stated to mirror the canonical base migration `0001_base_schema.sql`. This document describes **only elements present in that migration** — no additional or aspirational schema elements are documented.

---

## Table of Contents

1. Introduction & Storage Philosophy
2. Custom Enumerated Types (Enums)
3. Data Dictionary & Detailed Table Specifications
4. Entity Relationship Mapping
5. Indexes
6. Triggers & Application Functions (RPCs)
7. Row Level Security (RLS) & Grants

---

## 1. Introduction & Storage Philosophy

NexaMart AI is a multi-vendor marketplace focused on **physical products**, hosted on **PostgreSQL** via **Supabase Cloud**. Persistent storage is normalized, all entity identifiers use `UUID` (generated with `uuid_generate_v4()` from the `uuid-ossp` extension), and all timestamps use `TIMESTAMPTZ`.

The schema is defined once in `supabase/migrations/0001_base_schema.sql`. It is the single source of truth; it supersedes the earlier, ad-hoc migration files (`variants.sql`, `checkout_features.sql`, `critical_fixes.sql`), whose column additions are already incorporated in the base migration. The base migration can be replayed from an empty project without the older migrations.

Key modelling decisions:

- **`profiles.id`** doubles as the `auth.users.id` value (there is no default; the value comes from Supabase Auth). All other tables default their primary key with `uuid_generate_v4()`.
- **`orders`** are per-vendor records: each order row carries both a customer `user_id` and a `vendor_id`.
- **Product images** are stored as a `text[]` array on `products.images` (no separate image table).
- **Wishlists and carts** are flat per-user line tables (`wishlist_items`, `cart_items`) keyed by `(user_id)`; no container tables.
- **Variant support** is embedded as JSON (`products.variants`) plus by-value fields on `cart_items`/`order_items` (`variant_id`, `variant_attributes`, `variant_price`).

---

## 2. Custom Enumerated Types (Enums)

Declared in `0001_base_schema.sql` (ordered exactly as in `pg_enum`):

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- supplies uuid_generate_v4()

CREATE TYPE public.user_role     AS ENUM ('customer', 'vendor', 'admin');
CREATE TYPE public.order_status  AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE public.product_status AS ENUM ('active', 'draft', 'out_of_stock');
```

> Note: these are the values **verified in the live database**. The `payment_status` enum uses `pending/paid/failed/refunded` (not the aspirational `unpaid/processing/...`), and `product_status` uses `active/draft/out_of_stock`.

---

## 3. Data Dictionary & Detailed Table Specifications

### 3.1 Table: profiles

Extends core Supabase Auth (`auth.users`) with application user metadata.

| Column | Type | Constraints / Default | Notes |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, NOT NULL | Equals `auth.users.id` (set by app/auth flow). |
| email | TEXT | NOT NULL, UNIQUE | |
| full_name | TEXT | NULLABLE | |
| phone | TEXT | NULLABLE | Used for M-Pesa STK push operations. |
| address | TEXT | NULLABLE | |
| avatar_url | TEXT | NULLABLE | |
| role | user_role | DEFAULT `'customer'` | Access tier. |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | Auto-maintained by trigger. |

### 3.2 vendors

| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | NOT NULL, UNIQUE, FK → profiles(id) ON DELETE CASCADE | Owner user. One vendor per user. |
| store_name | TEXT | NOT NULL, UNIQUE | |
| store_description | TEXT | NULLABLE | |
| store_logo | TEXT | NULLABLE | |
| store_cover | TEXT | NULLABLE | |
| is_approved | BOOLEAN | DEFAULT `false` | Legacy approval flag. |
| rating | NUMERIC(3,2) | DEFAULT `0.00` | |
| total_sales | INTEGER | DEFAULT `0` | |
| is_verified | BOOLEAN | DEFAULT `false` | Canonical verification flag (per phase-1 fix). |
| business_name | TEXT | NULLABLE | Written by the vendor apply flow. |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | Auto-maintained. |

### 3.3 categories

| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| name | TEXT | NOT NULL | |
| slug | TEXT | NOT NULL, UNIQUE | URL routing token. |
| description | TEXT | NULLABLE | |
| parent_id | UUID | FK → categories(id) ON DELETE CASCADE | Supports a nested category tree. |
| image_url | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |

> Note: `categories` has no `updated_at` column (matches live).

### 3.4 products

| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| vendor_id | UUID | NOT NULL, FK → vendors(id) ON DELETE CASCADE | Listing merchant. |
| category_id | UUID | FK → categories(id) ON DELETE SET NULL | |
| name | TEXT | NOT NULL | |
| slug | TEXT | NOT NULL, UNIQUE | |
| description | TEXT | NULLABLE | |
| price | NUMERIC(10,2) | NOT NULL | Base listing price. |
| compare_price | NUMERIC(10,2) | NULLABLE | Striked-through price. |
| stock_quantity | INTEGER | NOT NULL, DEFAULT `0` | Real-time stock cache. |
| images | TEXT[] | DEFAULT `'{}'` | Array of image URLs. |
| status | product_status | DEFAULT `draft` | Public visibility. |
| rating | NUMERIC(3,2) | DEFAULT `0.00` | |
| total_views | INTEGER | DEFAULT `0` | |
| total_orders | INTEGER | DEFAULT `0` | |
| variants | JSONB | DEFAULT `{}` | Variant options/combinations (see `variants.sql` content). |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | Auto-maintained. |

> Note: there is **no `sku`** column in the verified schema.

### 3.5 cart_items

| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Cart owner. |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| quantity | INTEGER | NOT NULL | |
| variant_id | TEXT | NULLABLE | |
| variant_attributes | JSONB | NULLABLE | |
| variant_price | NUMERIC(10,2) | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | Auto-maintained. |

UNIQUE constraint: `(user_id, product_id)`.

### 3.6 wishlist_items

| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |

UNIQUE constraint: `(user_id, product_id)`.

### 3.7 coupons

| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| code | TEXT | NOT NULL, UNIQUE | |
| description | TEXT | NULLABLE | |
| discount_type | TEXT | NOT NULL | e.g. `percent` / `fixed` (free text). |
| discount_value | NUMERIC(10,2) | NOT NULL | |
| min_spend | NUMERIC(10,2) | DEFAULT `0` | |
| max_discount | NUMERIC(10,2) | NULLABLE | |
| usage_limit | INTEGER | NULLABLE | |
| used_count | INTEGER | DEFAULT `0` | |
| expires_at | TIMESTAMPTZ | NULLABLE | |
| is_active | BOOLEAN | DEFAULT `true` | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | |

### 3.8 orders

| Column | Type | Constraints / Default | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Customer. |
| vendor_id | UUID | NOT NULL, FK → vendors(id) ON DELETE CASCADE | Fulfilling merchant. |
| order_number | TEXT | NOT NULL, UNIQUE | Human-scannable order ref. |
| total_amount | NUMERIC(10,2) | NOT NULL | |
| shipping_address | TEXT | NOT NULL | Full address blob. |
| shipping_cost | NUMERIC(10,2) | DEFAULT `0.00` | |
| tax_amount | NUMERIC(10,2) | DEFAULT `0.00` | |
| discount_amount | NUMERIC(10,2) | DEFAULT `0.00` | |
| status | order_status | DEFAULT `pending` | Fulfilment state. |
| payment_status | payment_status | DEFAULT `'pending'` | |
| payment_method | TEXT | NULLABLE | |
| payment_id | TEXT | NULLABLE | |
| notes | TEXT | NULLABLE | |
| mpesa_checkout_id | TEXT | NULLABLE | Daraja STK push token. |
| mpesa_transaction_id | TEXT | NULLABLE | Confirmed M-Pesa receipt ref. |
| paid_at | TIMESTAMPTZ | NULLABLE | Written by payment callbacks. |
| payment_error | TEXT | NULLABLE | |
| coupon_id | UUID | FK → coupons(id) ON DELETE NO ACTION | |
| coupon_code | TEXT | NULLABLE | Denormalized at checkout. |
| delivery_method | TEXT | DEFAULT `'standard'` | |
| delivery_cost | NUMERIC(10,2) | DEFAULT `0` | |
| payment_type | TEXT | DEFAULT `'now'` | e.g. now / pay-later. |
| payment_deadline | TIMESTAMPTZ | NULLABLE | Pay-later deadline. |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | Auto-maintained. |

### 3.9 order_items

| Column | Type | Constraints / Default | Notes |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| order_id | UUID | NOT NULL, FK → orders(id) ON DELETE CASCADE | |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| product_name | TEXT | NOT NULL | Denormalized snapshot. |
| product_price | NUMERIC(10,2) | NOT NULL | Historical unit price. |
| quantity | INTEGER | NOT NULL | |
| total_price | NUMERIC(10,2) | NOT NULL | |
| variant_id | TEXT | NULLABLE | |
| variant_attributes | JSONB | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |

### 3.10 reviews

| Column | Type | Constraints / Default | Notes |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | |
| product_id | UUID | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| order_id | UUID | FK → orders(id) ON DELETE SET NULL | |
| rating | INTEGER | NOT NULL | 1–5 scale enforced in app code. |
| comment | TEXT | NULLABLE | |
| images | TEXT[] | DEFAULT `'{}'` | |
| is_verified_purchase | BOOLEAN | DEFAULT `false` | |
| is_approved | BOOLEAN | DEFAULT `false` | Moderation flag. |
| is_hidden | BOOLEAN | DEFAULT `false` | Moderation flag. |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | Auto-maintained. |

UNIQUE constraint: `(user_id, product_id, order_id)` — one review per purchase per product.

### 3.11 notifications

| Column | Type | Constraints / Default | Notes |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Recipient. |
| title | TEXT | NOT NULL | |
| message | TEXT | NOT NULL | |
| type | TEXT | NOT NULL | |
| is_read | BOOLEAN | DEFAULT `false` | |
| link | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |

### 3.12 system_settings

| Column | Type | Constraints / Default | Notes |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| key | TEXT | NOT NULL, UNIQUE | |
| value | JSONB | NOT NULL | Free-form setting payload. |
| description | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |
| updated_at | TIMESTAMPTZ | DEFAULT `now()` | Auto-maintained. |

### 3.13 audit_logs

| Column | Type | Constraints / Default | Notes |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | FK → profiles(id) ON DELETE SET NULL | Preserved for forensics. |
| action | TEXT | NOT NULL | e.g. `VENDOR_APPROVE`. |
| table_name | TEXT | NULLABLE | |
| record_id | UUID | NULLABLE | |
| old_data | JSONB | NULLABLE | |
| new_data | JSONB | NULLABLE | |
| ip_address | TEXT | NULLABLE | |
| user_agent | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |

### 3.14 activity_logs

| Column | Type | Constraints / Default | Notes |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT `uuid_generate_v4()` | |
| user_id | UUID | FK → profiles(id) ON DELETE SET NULL | |
| user_email | TEXT | NULLABLE | |
| action | TEXT | NOT NULL | |
| details | JSONB | NULLABLE | |
| ip_address | TEXT | NULLABLE | |
| user_agent | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT `now()` | |

---

## 4. Entity Relationship Mapping

```
[auth.users] (Supabase Auth)
       │ (id = profiles.id, created by app/auth flow)
       ▼
  [profiles] ───────────────────────────┐
       │                               │
       ├─(1:1)──► [vendors]            ├──► [notifications]   (user_id)
       │            │                  ├──► [audit_logs]      (user_id)
       │            └─(1:M)─►          ├──► [activity_logs]   (user_id)
       │                    [products] ├──► [orders]          (user_id = buyer)
       │                     │         │        │  (vendor_id → vendors)
       │                     └─(1:M)─► [order_items]──────────┐
       ├─(1:M)─► [cart_items] (user_id, product_id)           │
       ├─(1:M)─► [wishlist_items] (user_id, product_id)       │
       └─(1:M)─► [reviews] (user_id, product_id, order_id) ◄──┘
                                 (categories.parent_id → categories.id)
                                 (products.category_id → categories.id)
                                 (orders.coupon_id → coupons.id)
```

---

## 5. Indexes

All indexes defined in `0001_base_schema.sql` (outside what the PK/UNIQUE constraints create):

| Table | Index | Definition |
| :--- | :--- | :--- |
| orders | idx_orders_created_at | `(created_at DESC)` |
| orders | idx_orders_status | `(status)` |
| orders | idx_orders_user_id | `(user_id)` |
| orders | idx_orders_vendor_id | `(vendor_id)` |
| products | idx_products_category_id | `(category_id)` |
| products | idx_products_created_at | `(created_at DESC)` |
| products | idx_products_status | `(status)` |
| products | idx_products_vendor_id | `(vendor_id)` |
| cart_items | idx_cart_items_user_id | `(user_id)` |
| cart_items | idx_cart_items_variant | `(variant_id)` |
| wishlist_items | idx_wishlist_items_user_id | `(user_id)` |
| reviews | idx_reviews_product_id | `(product_id)` |
| reviews | idx_reviews_user_id | `(user_id)` |
| notifications | idx_notifications_is_read | `(is_read)` |
| notifications | idx_notifications_user_id | `(user_id)` |
| audit_logs | idx_audit_logs_created_at | `(created_at DESC)` |
| audit_logs | idx_audit_logs_user_id | `(user_id)` |

---

## 6. Triggers

All use the shared `update_updated_at()` trigger function (BEFORE UPDATE → sets `NEW.updated_at = now()`):

| Table | Trigger |
| :--- | :--- |
| profiles | update_profiles_updated_at |
| vendors | update_vendors_updated_at |
| products | update_products_updated_at |
| cart_items | update_cart_items_updated_at |
| orders | update_orders_updated_at |
| reviews | update_reviews_updated_at |
| system_settings | update_system_settings_updated_at |

Tables **without** an updated_at trigger: `categories`, `wishlist_items`, `coupons`, `notifications`, `order_items`, `audit_logs`, `activity_logs`.

### Application RPCs (functions)

| Function | Signature | Returns | Notes |
| :--- | :--- | :--- | :--- |
| decrement_stock | `(product_id uuid, quantity int)` | void | `SECURITY DEFINER`, `search_path=public`. Attenuates `stock_quantity` by `GREATEST(0, stock - quantity)` at order placement. Called from the app. |

Helper (invoked by the triggers above): `update_updated_at()`.

---

## 7. Row Level Security (RLS) & Grants

RLS is enabled on **all 14 tables**. Policies below are exactly as defined in `0001_base_schema.sql` (43 policies total). `auth.uid()` resolves to the JWT `sub` from Supabase Auth.

### profiles
| Policy | Command | Expression |
| :--- | :--- | :--- |
| Allow all inserts on profiles | INSERT | `CHECK (true)` |
| profiles_insert_policy | INSERT | `CHECK (auth.uid() = id)` |
| profiles_select_policy | SELECT | `USING (true)` |
| profiles_update_policy | UPDATE | `USING (auth.uid() = id)` |

### vendors
| Policy | Command | Expression |
| :--- | :--- | :--- |
| vendors_select_policy | SELECT | `USING (true)` |
| vendors_insert_policy | INSERT | `CHECK (auth.uid() = user_id)` |
| vendors_update_policy | UPDATE | `USING (auth.uid() = user_id)` |
| vendors_delete_policy | DELETE | `USING (auth.uid() = user_id)` |

### categories
| Policy | Command | Expression |
| :--- | :--- | :--- |
| categories_select_policy | SELECT | `USING (true)` |
| categories_insert_policy | INSERT | `CHECK (profiles.role = 'admin')` |
| categories_update_policy | UPDATE | `USING (profiles.role = 'admin')` |
| categories_delete_policy | DELETE | `USING (profiles.role = 'admin')` |

Admin = `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`.

### products
| Policy | Command | Expression |
| :--- | :--- | :--- |
| products_select_policy | SELECT | `USING (status = 'active' OR auth.uid() IN (vendor's user))` |
| products_insert_policy | INSERT | `CHECK (auth.uid() = vendor.user_id)` |
| products_update_policy | UPDATE | `USING (auth.uid() = vendor.user_id)` |
| products_delete_policy | DELETE | `USING (auth.uid() = vendor.user_id)` |

Vendor = `auth.uid() IN (SELECT vendors.user_id FROM vendors WHERE vendors.id = products.vendor_id)`.

### cart_items
Ownership: `auth.uid() = user_id` for SELECT / INSERT (CHECK) / UPDATE / DELETE.
- `cart_items_select_policy` SELECT `USING (auth.uid() = user_id)`
- `cart_items_insert_policy` INSERT `CHECK (auth.uid() = user_id)`
- `cart_items_update_policy` UPDATE `USING (auth.uid() = user_id)`
- `cart_items_delete_policy` DELETE `USING (auth.uid() = user_id)`

### wishlist_items
Ownership: `auth.uid() = user_id` for SELECT / INSERT (CHECK) / DELETE.
- `wishlist_items_select_policy` SELECT `USING (auth.uid() = user_id)`
- `wishlist_items_insert_policy` INSERT `CHECK (auth.uid() = user_id)`
- `Users can insert own wishlist items` INSERT `CHECK (auth.uid() = user_id)`
- `wishlist_items_delete_policy` DELETE `USING (auth.uid() = user_id)`
- `Users can delete own wishlist items` DELETE `USING (auth.uid() = user_id)`

### coupons
| Policy | Command | Expression |
| :--- | :--- | :--- |
| Anyone can view active coupons | SELECT | `USING (is_active = true AND (expires_at IS NULL OR expires_at > now()))` |
| Admins can manage coupons | ALL | `USING` + `CHECK` admin |

### notifications
| Policy | Command | Expression |
| :--- | :--- | :--- |
| notifications_select_policy | SELECT | `USING (auth.uid() = user_id)` |
| notifications_update_policy | UPDATE | `USING (auth.uid() = user_id)` |

### orders
| Policy | Command | Expression |
| :--- | :--- | :--- |
| Users can insert orders | INSERT | `CHECK (auth.uid() = user_id)` |
| Users can view own orders | SELECT | `USING (auth.uid() = user_id)` |
| orders_insert_policy | INSERT | `CHECK (auth.uid() = user_id)` |
| orders_select_policy | SELECT | `USING (auth.uid() = user_id OR auth.uid() = vendor.user_id)` |
| orders_update_policy | UPDATE | `USING (auth.uid() = user_id OR auth.uid() = vendor.user_id)` |

Vendor = `auth.uid() IN (SELECT vendors.user_id FROM vendors WHERE vendors.id = orders.vendor_id)`.

### order_items
| Policy | Command | Expression |
| :--- | :--- | :--- |
| order_items_select_policy | SELECT | `USING (parent order owned by user or vendor)` |
| Users can insert order items | INSERT | `CHECK (parent order.user_id = auth.uid())` |
| Users can view own order items | SELECT | `USING (parent order.user_id = auth.uid())` |

### reviews
| Policy | Command | Expression |
| :--- | :--- | :--- |
| reviews_select_policy | SELECT | `USING (true)` |
| reviews_insert_policy | INSERT | `CHECK (auth.uid() = user_id)` |
| reviews_update_policy | UPDATE | `USING (auth.uid() = user_id)` |
| reviews_delete_policy | DELETE | `USING (auth.uid() = user_id)` |

### audit_logs
| Policy | Command | Expression |
| :--- | :--- | :--- |
| audit_logs_select_policy | SELECT | admin only |

### activity_logs
| Policy | Command | Expression |
| :--- | :--- | :--- |
| Admins can view activity logs | SELECT | admin only |

> **Note:** `system_settings` has RLS enabled and **no policies**, so it is fully locked down to non-privileged roles (only `service_role`/owners can access).

### Grants

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
```

Actual row access is constrained by RLS policies above.

---

## Conclusion

This specification mirrors the verified base migration `supabase/migrations/0001_base_schema.sql`. Any future schema change must add a new migration on top of `0001_base_schema.sql` and update this document to match. The earlier ad-hoc migrations (`variants.sql`, `checkout_features.sql`, `critical_fixes.sql`) were folded into the base schema and are no longer required for a fresh install.