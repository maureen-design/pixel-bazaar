# NexaMart AI — Database Schema Specification
**Version:** 1.1  
**Status:** Approved / Schema Baseline  
**Last Updated:** July 2026  

---

## Table of Contents
1. Introduction & Storage Philosophy
2. Custom Enumerated Types (Enums)
3. Data Dictionary & Detailed Table Specifications
4. Entity Relationship Mapping (Textual Topology)
5. Referential Integrity & Cascade Operations
6. Indexing Optimization Strategy
7. Database Security & Supabase Integration Model

---

## 1. Introduction & Storage Philosophy

This document details the logical and physical database architecture for **NexaMart AI**. The platform utilizes **PostgreSQL** hosted on **Supabase Cloud**. 

NexaMart AI is explicitly architected as a multi-vendor marketplace focusing on **physical products**. The schema natively supports real-time physical inventory ledgers, multi-merchant order fulfillment tracking, shipping logistics metadata, and localized payment processing loops while remaining highly extensible for future platform upgrades.

To maximize structural throughput and enforce strict data consistency under concurrent transaction streams, the database is normalized to the **Third Normal Form (3NF)**. All internal system identification blocks utilize universally unique identifiers (`UUIDv4`) to mitigate enumeration vulnerabilities and streamline asynchronous edge networking operations.

---

## 2. Custom Enumerated Types (Enums)

To enforce compile-time verification across business logic states, the schema declares the following native PostgreSQL enumerated types:

```sql
CREATE TYPE user_role AS ENUM ('customer', 'vendor', 'admin');
CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE product_status AS ENUM ('draft', 'active', 'out_of_stock', 'archived');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE payment_status AS ENUM ('unpaid', 'processing', 'paid', 'failed', 'refunded');
CREATE TYPE stock_movement_type AS ENUM ('restock', 'sale', 'return', 'adjustment', 'damages');
```

---

## 3. Data Dictionary & Detailed Table Specifications

### 3.1 Table: profiles

**Purpose:** Extends the core Supabase authentication framework (auth.users) with custom user metadata.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| profile_id | UUID | PRIMARY KEY, FK → auth.users(id) | Bridges system metadata directly to the auth user. |
| full_name | VARCHAR(255) | NOT NULL | User's full structural name. |
| phone_number | VARCHAR(20) | UNIQUE, NOT NULL | Mobile number used for M-Pesa STK push actions. |
| role | user_role | NOT NULL, DEFAULT 'customer' | System access permissions tier. |
| avatar_url | TEXT | NULLABLE | Public URI pointing to user profile bucket photo. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Initial creation timestamp log. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last modification event record. |

---

### 3.2 Table: vendor_applications

**Purpose:** Manages prospective seller onboarding verification logs.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| application_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique application entry token. |
| user_id | UUID | FK → profiles(profile_id), ON DELETE CASCADE | Target user seeking vendor authorization. |
| business_name | VARCHAR(255) | NOT NULL | Proposed corporate operational moniker. |
| business_description | TEXT | NOT NULL | Overview of retail niche and inventory. |
| business_logo_url | TEXT | NULLABLE | Object storage path for branding imagery. |
| status | application_status | NOT NULL, DEFAULT 'pending' | Current review checkpoint phase. |
| reviewed_by | UUID | FK → profiles(profile_id), NULLABLE | Admin identity token handling review. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Submission creation timestamp. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last state modification update. |

---

### 3.3 Table: vendors

**Purpose:** Holds production credentials and metadata configurations for verified market merchants.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| vendor_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Core identification token for store entities. |
| user_id | UUID | UNIQUE, FK → profiles(profile_id), ON DELETE CASCADE | Associated owner user record hook. |
| business_name | VARCHAR(255) | NOT NULL | Publicly displayed store name. |
| description | TEXT | NULLABLE | Deep-dive merchant biography page. |
| logo_url | TEXT | NULLABLE | Public store banner asset link. |
| is_verified | BOOLEAN | NOT NULL, DEFAULT TRUE | Verification compliance status toggle. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Store activation log date. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Store parameter adjustment log date. |
| deleted_at | TIMESTAMPTZ | NULLABLE | Soft delete column for preserving historic transactions. |

---

### 3.4 Table: categories

**Purpose:** Organizes products into high-level functional groups.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| category_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Structural identity key. |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Category label (e.g., 'Electronics'). |
| slug | VARCHAR(120) | UNIQUE, NOT NULL | URL friendly string resource routing token. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Category setup recording date. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Category modification date. |
| deleted_at | TIMESTAMPTZ | NULLABLE | Soft delete window flag. |

---

### 3.5 Table: products

**Purpose:** Contains catalog parameters and real-time physical inventory states for items listed by vendors.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| product_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique product inventory token. |
| vendor_id | UUID | FK → vendors(vendor_id), ON DELETE CASCADE | Merchant managing this listing. |
| category_id | UUID | FK → categories(category_id), ON DELETE RESTRICT | System classification branch link. |
| name | VARCHAR(255) | NOT NULL | Searchable listing title string. |
| description | TEXT | NOT NULL | Public deep marketing catalog breakdown. |
| price | NUMERIC(12, 2) | NOT NULL, CHECK (price >= 0) | Base currency unit listing price (Ksh value format). |
| stock_quantity | INTEGER | NOT NULL, CHECK (stock_quantity >= 0) | Real-time cache of available warehouse storage units. |
| sku | VARCHAR(100) | UNIQUE, NOT NULL | Unique Stock Keeping Unit string asset key. |
| status | product_status | NOT NULL, DEFAULT 'draft' | Public visibility control flag settings. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Listing creation record date. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Product detail change record tracker. |
| deleted_at | TIMESTAMPTZ | NULLABLE | Soft delete token avoiding relational orphans. |

---

### 3.6 Table: product_images

**Purpose:** Tracks multiple product image URLs in a 1-to-many configuration.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| image_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Asset unique database row key. |
| product_id | UUID | FK → products(product_id), ON DELETE CASCADE | Parent catalog item target block hook. |
| image_url | TEXT | NOT NULL | CDN endpoint image location pointer. |
| is_primary | BOOLEAN | NOT NULL, DEFAULT FALSE | Flags default primary display thumbnail image. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | File entry indexing timestamp log. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Asset modification tracking column. |

---

### 3.7 Table: inventory_movements

**Purpose:** Provides a complete, unalterable historical audit trail for every stock change.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| movement_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique entry record tracking token. |
| product_id | UUID | FK → products(product_id), ON DELETE CASCADE | Target stock item undergoing adjustments. |
| quantity | INTEGER | NOT NULL | Delta number of items moved (Positive = Add, Negative = Sub). |
| type | stock_movement_type | NOT NULL | Structural categorical flag defining action source. |
| reference_id | UUID | NULLABLE | Dynamic target linking reference (e.g., links to an order_id). |
| notes | TEXT | NULLABLE | Explanatory context string written by admin/vendor. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Log occurrence timestamp. |

---

### 3.8 Table: shopping_carts

**Purpose:** Manages active customer shopping baskets.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| cart_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Cart structural index tracker. |
| customer_id | UUID | UNIQUE, FK → profiles(profile_id), ON DELETE CASCADE | Owner identity of the target cart bucket. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Initial session bucket record data. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Basket state shift monitoring tracker. |

---

### 3.9 Table: cart_items

**Purpose:** Stores line items inside active shopping carts.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| cart_item_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Line entry instance identification key. |
| cart_id | UUID | FK → shopping_carts(cart_id), ON DELETE CASCADE | Associated cart bucket parent structure. |
| product_id | UUID | FK → products(product_id), ON DELETE CASCADE | Selected product item targeting link. |
| quantity | INTEGER | NOT NULL, DEFAULT 1, CHECK (quantity > 0) | Quantity selected by the user. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Timestamp marking exactly when an item was added. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Track modifications to quantity sizes. |

---

### 3.10 Table: orders

**Purpose:** Tracks verified transactional histories, financial outcomes, and full shipping processes.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| order_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Order entity unique record sequence. |
| customer_id | UUID | FK → profiles(profile_id), ON DELETE RESTRICT | Purchasing user identity key. |
| order_number | VARCHAR(50) | UNIQUE, NOT NULL | Human scannable identifier (e.g., NEXA-2026-X). |
| total_amount | NUMERIC(12, 2) | NOT NULL, CHECK (total_amount >= 0) | Comprehensive total aggregate cost. |
| shipping_address | TEXT | NOT NULL | Physical destination for courier parcel delivery. |
| order_status | order_status | NOT NULL, DEFAULT 'pending' | Real-time fulfillment tracking node phase. |
| payment_status | payment_status | NOT NULL, DEFAULT 'unpaid' | Transaction processing validation phase. |
| mpesa_checkout_id | VARCHAR(100) | UNIQUE, NULLABLE | Tracking token returned by Safaricom Daraja STK push. |
| mpesa_receipt_number | VARCHAR(50) | UNIQUE, NULLABLE | Actual financial transaction matching reference code. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Successful checkout processing trigger date. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Tracking status milestone shifting date log. |

---

### 3.11 Table: order_items

**Purpose:** Line item ledger detail records mapping specific physical quantity splits to completed parent order tokens.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| order_item_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Target item block baseline code index. |
| order_id | UUID | FK → orders(order_id), ON DELETE CASCADE | Associated parent order master file anchor. |
| product_id | UUID | FK → products(product_id), ON DELETE RESTRICT | Product item snapshot entity token. |
| vendor_id | UUID | FK → vendors(vendor_id), ON DELETE RESTRICT | Split payout identifier linked to the target vendor. |
| quantity | INTEGER | NOT NULL, CHECK (quantity > 0) | Units purchased at transactional timestamp. |
| unit_price | NUMERIC(12, 2) | NOT NULL, CHECK (unit_price >= 0) | Captures historical unit cost at moment of purchase. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Line item record generation log date. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Order processing variation adjustments log. |

---

### 3.12 Table: reviews

**Purpose:** Product feedback logs written by verified purchase customers.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| review_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique review instance identification index. |
| product_id | UUID | FK → products(product_id), ON DELETE CASCADE | Target listing receiving the review metrics. |
| customer_id | UUID | FK → profiles(profile_id), ON DELETE CASCADE | User identity writing the evaluation. |
| rating | INTEGER | NOT NULL, CHECK (rating BETWEEN 1 AND 5) | Numerical rating scale evaluation score. |
| comment | TEXT | NULLABLE | Written customer feedback text body. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Review submission creation date tracking log. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Flag monitoring modification changes to text review. |

---

### 3.13 Table: wishlists

**Purpose:** Stores structural tracking points connecting customer profiles to saved items.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| wishlist_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Master list container tracking key. |
| customer_id | UUID | UNIQUE, FK → profiles(profile_id), ON DELETE CASCADE | Associated owner user profile asset node. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Initialization marker timestamp indicator. |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Container modification date flag tracking parameter. |

---

### 3.14 Table: wishlist_items

**Purpose:** Intersection table linking products to user wishlists.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| wishlist_item_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Node token map entry index coordinate. |
| wishlist_id | UUID | FK → wishlists(wishlist_id), ON DELETE CASCADE | Target parent container tracking bundle. |
| product_id | UUID | FK → products(product_id), ON DELETE CASCADE | Target item saved by user. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Timestamp indicating when item was watchlisted. |

---

### 3.15 Table: notifications

**Purpose:** System communication and transaction alert logs.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| notification_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Specific message identifier index. |
| user_id | UUID | FK → profiles(profile_id), ON DELETE CASCADE | Recipient target user entity path. |
| title | VARCHAR(150) | NOT NULL | High-level banner notification header title text. |
| message | TEXT | NOT NULL | Explanatory inline text data payload. |
| is_read | BOOLEAN | NOT NULL, DEFAULT FALSE | Status toggle monitoring read states. |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event operational recording time metrics. |

---

### 3.16 Table: audit_logs

**Purpose:** Critical event ledgers tracking security and administrative access records.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| log_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Entry action tracking data row code. |
| user_id | UUID | FK → profiles(profile_id), ON DELETE SET NULL | Performing operator identity token tracking reference. |
| action | VARCHAR(100) | NOT NULL | Broad behavior label (e.g., 'VENDOR_APPROVE'). |
| metadata | JSONB | NULLABLE | Contextual details (e.g., IP addresses, delta records). |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event timestamp log parameter string. |

---

## 4. Entity Relationship Mapping

The following structural chart establishes the relational connections mapped inside the persistent engine constraints:

```
[auth.users] (Supabase Internal Core Engine)
       │ (1:1 Extension Anchor via Triggers)
       ▼
  [profiles] ◄──────────────────────────────┐ (1:M Recipient Route)
       │                                    │
       ├─(1:1)──► [vendors]                 │──► [notifications]
       │             │                      │──► [audit_logs]
       │             └─(1:M)─► [products]   │──► [reviews] (Purchaser Only)
       │                          │         │
       ├─(1:1)──► [shopping_carts]├─(1:M)───┼──► [inventory_movements]
       │             │            │         │
       │             └─(1:M)─► [cart_items] ├─(1:M)──► [vendor_applications]
       │                          ▲         │
       │                          │         ├─(1:M)──► [orders]
       │                    (Line References)             │
       │                          │                       └─(1:M)─► [order_items]
       │                    ┌─────┴─────────┐                           ▲
       └─(1:1)──► [wishlists]               │                           │
                     │                      │                           │
                     └─(1:M)─► [wishlist_items]                         │
                                  │                                     │
                                  └───────────(Line Sync Target)────────┘
```

---

## 5. Referential Integrity & Cascade Operations

**ON DELETE CASCADE:** Applied to transient, dependent sub-entities (cart_items, wishlist_items, product_images, inventory_movements). If a customer purges their profile or a vendor clears a product listing, their sub-items delete automatically, keeping the storage engine clean.

**ON DELETE RESTRICT:** Applied to catalog operational dependencies (categories, products referenced inside active historical transactions). You cannot delete a category if it contains live products, and you cannot delete a product if it is linked to a completed order history log.

**ON DELETE SET NULL:** Applied to safety trackers (audit_logs). If an admin staff account profile is deleted, the corresponding audit logs are retained for forensic integrity, with the actor value safely set to NULL.

---

## 6. Indexing Optimization Strategy

To guarantee sub-second read query times across dense marketplace catalogs, database indices are configured on highly queried columns:

```sql
-- Identity Optimization Indices
CREATE INDEX idx_profiles_role ON profiles(role);

-- Soft Delete System Filtering Accelerators
CREATE INDEX idx_products_active_lookup ON products(product_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_vendors_active_lookup ON vendors(vendor_id) WHERE deleted_at IS NULL;

-- Search Catalog Query Acceleration Indices
CREATE INDEX idx_products_vendor ON products(vendor_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_inventory_products ON inventory_movements(product_id);

-- Transaction Management Lookup Accelerators
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_mpesa_checkout ON orders(mpesa_checkout_id);
CREATE INDEX idx_order_items_vendor ON order_items(vendor_id);

-- Operational Alert Performance Indices
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = FALSE;
```

---

## 7. Database Security & Supabase Integration Model

**Row Level Security (RLS):** All data access routes utilize explicit RLS engine filter configurations. The database rejects bare queries that do not match specific authorization criteria.

**Profile Synchronization Automation:** An automated database function trigger hooks directly into the inner registration stack. This ensures that when a new user successfully authenticates via GoTrue, a matching row initializes instantly inside your app's custom profiles tracking matrix:

```sql
CREATE FUNCTION public.handle_new_user_sync()
RETURNS TRIGGER AS $$ 
BEGIN   
  INSERT INTO public.profiles (profile_id, full_name, phone_number, role)   
  VALUES (     
    NEW.id,     
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'NexaMart User'),     
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),     
    'customer'   
  );   
  RETURN NEW; 
END; 
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_sync();
```

---

## Conclusion

This Database Schema Specification provides the complete foundation for NexaMart AI's persistent data layer. With normalized 3NF design, strict referential integrity enforcement, and comprehensive indexing strategies, the schema ensures data consistency, query performance, and security across the multi-vendor marketplace platform.
