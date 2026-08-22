# NexaMart AI — Entity Relationship Diagram (ERD) Documentation
**Version:** 1.0  
**Status:** Approved / ERD Baseline  
**Last Updated:** July 2026  

---

## Table of Contents
1. Introduction
2. Purpose of the ERD
3. Database Design Principles
4. Entity Summary
5. Detailed Entity Specifications
6. Detailed Entity Relationships (Crow's Foot Notation)
7. Cardinality & Participation Matrix
8. Primary Keys & Foreign Keys Mapping
9. Referential Integrity & Cascade Rules
10. Business Rules Enforced at Database Level
11. Database Normalization Analysis
12. Future Expansion Mapping
13. Conclusion

---

## 1. Introduction

### 1.1 Purpose
This document provides the structural blueprint of the Entity Relationship Diagram (ERD) for **NexaMart AI**. It serves as the primary relational model mapping the data relationships between users, active vendors, product catalogs, shopping workflows, transaction records, and inventory ledgers. 

This model ensures the PostgreSQL database running on Supabase is implemented with zero redundancy, absolute consistency, and rigid compliance constraints.

---

## 2. Purpose of the ERD
The NexaMart AI logical ERD is designed to:
* **Map Schema Layouts:** Visualize how entities interact to support a multi-vendor physical marketplace.
* **Guarantee Referential Integrity:** Establish strict relational rules to prevent orphan records.
* **Reduce Redundancy:** Leverage formal database normalization to optimize query execution and minimize disk space.
* **Secure Data Flows:** Direct the implementation of Row-Level Security (RLS) policies by mapping data ownership clearly back to user profiles.

---

## 3. Database Design Principles
The architecture of this entity model rests upon the following core data engineering principles:
* **Third Normal Form (3NF) compliance** across all operational tables.
* **Type Safety Enforcement** via custom PostgreSQL enumerated types (`enums`).
* **Identity Security** by using cryptographically secure `UUIDv4` identifiers for all primary keys instead of predictable incremental integers.
* **Audit Trail Coverage** via automated trigger functions updating `created_at` and `updated_at` zones globally.
* **Safe State Control** using soft deletion structures (`deleted_at` timestamps) on core tables (`products`, `vendors`, `categories`) to protect transactional integrity.

---

## 4. Entity Summary

| Entity | Relational Table Name | Description |
| :--- | :--- | :--- |
| **Profiles** | `profiles` | Extends authentication tables with user identities. |
| **Vendor Applications** | `vendor_applications` | Tracks onboarding requests from prospective sellers. |
| **Vendors** | `vendors` | Represents approved store profiles selling on the platform. |
| **Categories** | `categories` | Categorizes physical products in a functional tree. |
| **Products** | `products` | Holds listed inventory configurations and price points. |
| **Product Images** | `product_images` | Stores multiple display photo assets per listing. |
| **Inventory Movements** | `inventory_movements` | Real-time immutable ledger tracking stock changes. |
| **Shopping Carts** | `shopping_carts` | Maintains transient baskets assigned to customer profiles. |
| **Cart Items** | `cart_items` | Links specific products and quantities inside shopping carts. |
| **Orders** | `orders` | Records completed transactional checkout records. |
| **Order Items** | `order_items` | Line items capturing historical unit prices during sales. |
| **Reviews** | `reviews` | Holds customer-written evaluations of purchased products. |
| **Wishlists** | `wishlists` | Stores user-saved items for future purchases. |
| **Wishlist Items** | `wishlist_items` | Links products to customer watchlists. |
| **Notifications** | `notifications` | System communication logs for transactional events. |
| **Audit Logs** | `audit_logs` | Trace records tracking administrative and security operations. |

---

## 5. Detailed Entity Specifications

### 5.1 Profiles
* **Primary Key:** `profile_id` (UUID, bridges directly to Supabase `auth.users(id)`)
* **Core Attributes:** `full_name`, `phone_number`, `role` (enum), `avatar_url`, timestamps.
* **Relational Rules:**
  * Has zero or one `vendors` entry (1:1).
  * Has exactly one `shopping_carts` container (1:1).
  * Has exactly one `wishlists` container (1:1).
  * Directs zero-to-many (`0:M`) records in `orders`, `vendor_applications`, `reviews`, `notifications`, and `audit_logs`.

### 5.2 Vendor Applications
* **Primary Key:** `application_id` (UUID)
* **Foreign Keys:** `user_id` (FK -> `profiles`), `reviewed_by` (FK -> `profiles`, nullable)
* **Core Attributes:** `business_name`, `business_description`, `business_logo_url`, `status` (enum), timestamps.

### 5.3 Vendors
* **Primary Key:** `vendor_id` (UUID)
* **Foreign Key:** `user_id` (FK -> `profiles`, unique)
* **Core Attributes:** `business_name`, `description`, `logo_url`, `is_verified`, `deleted_at` (soft delete timestamp).
* **Relational Rules:** Maps to many (`1:M`) `products` and `order_items`.

### 5.4 Categories
* **Primary Key:** `category_id` (UUID)
* **Core Attributes:** `name` (unique), `slug` (unique), `deleted_at`.
* **Relational Rules:** Categorizes many (`1:M`) `products`.

### 5.5 Products
* **Primary Key:** `product_id` (UUID)
* **Foreign Keys:** `vendor_id` (FK -> `vendors`), `category_id` (FK -> `categories`)
* **Core Attributes:** `name`, `description`, `price`, `stock_quantity`, `sku` (unique), `status` (enum), `deleted_at`.
* **Relational Rules:** Parent to many (`1:M`) `product_images`, `inventory_movements`, `cart_items`, `wishlist_items`, `order_items`, and `reviews`.

### 5.6 Product Images
* **Primary Key:** `image_id` (UUID)
* **Foreign Key:** `product_id` (FK -> `products`)
* **Core Attributes:** `image_url`, `is_primary` (boolean).

### 5.7 Inventory Movements
* **Primary Key:** `movement_id` (UUID)
* **Foreign Key:** `product_id` (FK -> `products`)
* **Core Attributes:** `quantity` (delta change), `type` (enum: sale, restock, return), `reference_id` (generic UUID context anchor), `notes`.

### 5.8 Shopping Carts & Cart Items
* **Shopping Carts PK:** `cart_id` (UUID) | **FK:** `customer_id` (FK -> `profiles`, unique)
* **Cart Items PK:** `cart_item_id` (UUID) | **FKs:** `cart_id` (FK -> `shopping_carts`), `product_id` (FK -> `products`)
* **Core Attributes (Cart Items):** `quantity`.

### 5.9 Orders & Order Items
* **Orders PK:** `order_id` (UUID) | **FK:** `customer_id` (FK -> `profiles`)
* **Orders Core Attributes:** `order_number` (unique), `total_amount`, `shipping_address`, `order_status` (enum), `payment_status` (enum), `mpesa_checkout_id` (unique), `mpesa_receipt_number` (unique).
* **Order Items PK:** `order_item_id` (UUID) | **FKs:** `order_id` (FK -> `orders`), `product_id` (FK -> `products`), `vendor_id` (FK -> `vendors`)
* **Order Items Core Attributes:** `quantity`, `unit_price` (captures price at checkout timestamp).

### 5.10 Reviews
* **Primary Key:** `review_id` (UUID)
* **Foreign Keys:** `product_id` (FK -> `products`), `customer_id` (FK -> `profiles`)
* **Core Attributes:** `rating` (integer, bounded 1–5), `comment` (text), timestamps.

### 5.11 Wishlists & Wishlist Items
* **Wishlists PK:** `wishlist_id` (UUID) | **FK:** `customer_id` (FK -> `profiles`, unique)
* **Wishlist Items PK:** `wishlist_item_id` (UUID) | **FKs:** `wishlist_id` (FK -> `wishlists`), `product_id` (FK -> `products`)

---

## 6. Detailed Entity Relationships

Below is the conceptual ERD layout of NexaMart AI. It uses text-based **Crow's Foot Notation** to show exact cardinality constraints across tables:

```
              ┌──────────────┐
              │ auth.users   │
              └──────┬───────┘
                     │ 1:1 (Automated Trigger Sync)
                     ▼
              ┌──────────────┐
              │   profiles   │
              └─┬──┬──┬──┬─┬─┘
                │  │  │  │ │ 1:M
                │  │  │  │ ├───────────────────────┐
     ┌──────────┘  │  │  │ │                       │
     │ 1:1         │  │  │ └─────────┐             │
     ▼             │  │  │ 1:M       ▼             ▼
   ┌──────────┐    │  │  │     ┌──────────┐  ┌───────────┐
   │ vendors  │    │  │  │     │  orders  │  │audit_logs │
   └────┬─────┘    │  │  │     └────┬─────┘  └───────────┘
        │          │  │  │          │ 1:M
        │ 1:M      │  │  │          ▼
        ▼          │  │  │     ┌──────────┐
   ┌──────────┐    │  │  │     │order_item│
   │ products │◄───┼──┼──┼────►│    s     │
   └────┬─────┘    │  │  │     └──────────┘
        │          │  │  │
        ├─(1:M)────┼──┼──┼──┐
        │          │  │  │  │
        ├─(1:M)────┼──┼──┼──┼──┐ 1:1
        │          │  │  │  │  ▼
        ├─(1:M)──┐ │  │  │  │┌──────────┐
        │        │ │  └──┼──┼─┤wishlists │
        │        ▼ ▼     │  │ └────┬─────┘
        │   ┌────────┐   │  │      │ 1:M
        │   │shopping│   │  │      ▼
        │   │_carts  │   │  │  ┌──────────┐
        │   └────┬───┘   │  │  │wishlist_ │
        │        │ 1:M   │  │  │  items   │
        │        ▼       │  │  └──────────┘
        │   ┌────────┐   │  │
        └──►│cart_   │   │  └──►┌────────┐
            │items   │   │     │reviews │
            └────────┘   │     └────────┘
                         │
         ┌───────────────┘
         │ 1:M
         ▼
    ┌─────────────┐
    │  product_   │
    │   images    │
    └─────────────┘
```

---

## 7. Cardinality & Participation Matrix

The following table details relational bounds, structural cardinality ratios, and system participation requirements:

| Entity Left | Relationship | Entity Right | Cardinality | Left Participation | Right Participation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **profiles** | has | **vendors** | 1:1 | Optional (0) | Mandatory (1) |
| **profiles** | has | **shopping_carts** | 1:1 | Mandatory (1) | Mandatory (1) |
| **profiles** | has | **wishlists** | 1:1 | Mandatory (1) | Mandatory (1) |
| **profiles** | places | **orders** | 1:M | Optional (0) | Mandatory (1) |
| **vendors** | owns | **products** | 1:M | Optional (0) | Mandatory (1) |
| **categories** | classifies | **products** | 1:M | Optional (0) | Mandatory (1) |
| **products** | logs | **inventory_movements** | 1:M | Mandatory (1) | Mandatory (1) |
| **products** | includes | **product_images** | 1:M | Mandatory (1) | Mandatory (1) |
| **shopping_carts** | contains | **cart_items** | 1:M | Optional (0) | Mandatory (1) |
| **wishlists** | contains | **wishlist_items** | 1:M | Optional (0) | Mandatory (1) |
| **orders** | contains | **order_items** | 1:M | Mandatory (1) | Mandatory (1) |
| **products** | receives | **reviews** | 1:M | Optional (0) | Mandatory (1) |

---

## 8. Primary Keys & Foreign Keys Mapping

This index defines exactly which database columns manage relational links across our table structures:

* **`profiles.profile_id`** is the Primary Key. It has a Foreign Key constraint targeting Supabase's internal identity table: `auth.users(id)`.
* **`vendors.user_id`** is a Foreign Key referencing `profiles.profile_id` with a `UNIQUE` constraint, which strictly enforces the 1:1 owner limitation.
* **`products.vendor_id`** is a Foreign Key referencing `vendors.vendor_id`, establishing which merchant owns the listing.
* **`products.category_id`** is a Foreign Key referencing `categories.category_id`, placing the product within our taxonomy.
* **`inventory_movements.product_id`** is a Foreign Key referencing `products.product_id`, tracing every ledger update back to its product.
* **`cart_items.cart_id`** is a Foreign Key referencing `shopping_carts.cart_id`, linking items to a specific customer's basket.
* **`order_items.order_id`** is a Foreign Key referencing `orders.order_id`, grouping transactions under an overall order ledger.
* **`order_items.vendor_id`** is a Foreign Key referencing `vendors.vendor_id`, enabling split payout computations for multi-vendor checkouts.

---

## 9. Referential Integrity & Cascade Rules

To prevent data corruption, orphan rows, or accounting discrepancies, the database enforces strict integrity constraints on delete actions:

```sql
-- Core Referential Constraint Logic
ALTER TABLE products ADD CONSTRAINT fk_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE;
ALTER TABLE order_items ADD CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT;
```

### 9.1 Deletion Policy Behaviors

- **`ON DELETE CASCADE`:** Applied to transient user selections (`cart_items`, `wishlist_items`) and product media assets (`product_images`). If a product is purged or a shopping cart is emptied, its related line items are cleaned up automatically.
- **`ON DELETE RESTRICT`:** Applied to historical transaction files. You cannot delete a category if it contains live products, and you cannot delete a product if it is linked to a completed order history log. This ensures checkout data remains completely audit-compliant.
- **`ON DELETE SET NULL`:** Applied to system logs (`audit_logs`). If a staff member deletes their profile, their operational logs remain in the system for security auditing with the actor ID set to `NULL`.

---

## 10. Business Rules Enforced at Database Level
To protect data integrity directly within the engine, our schema enforces these critical business rules:

1. **Uniqueness Constraints:** Email addresses, product SKUs, order numbers, and payment reference tokens (`mpesa_checkout_id`, `mpesa_receipt_number`) must be completely unique across the system.
2. **Value Boundaries:** Column constraints prevent negative prices (`price >= 0`) or negative stock quantities (`stock_quantity >= 0`).
3. **Review Isolation:** Reviews require an active purchase history check. Only customer accounts that have completed an order for a specific product can write a review.
4. **Soft Deletion Safetynet:** Deleting a product sets its `deleted_at` timestamp rather than purging the row. This keeps related order records valid while instantly hiding the product from active storefront searches (`WHERE deleted_at IS NULL`).

---

## 11. Database Normalization Analysis
To prove the structural integrity of the NexaMart AI database, the relational schema is evaluated against the three classical normalization steps:

### 11.1 First Normal Form (1NF)

- All attributes store only single, atomic values.
- There are no repeating groups or comma-separated lists (e.g., product images are stored as separate rows in a dedicated `product_images` table rather than an array text field).
- Every row has a unique identifier (UUID).

### 11.2 Second Normal Form (2NF)

- The schema complies fully with 1NF.
- All non-key attributes depend on the entire primary key of the table.
- Tables that represent relationships use single UUID primary keys (`cart_item_id`, `order_item_id`) rather than composite keys, eliminating partial dependency issues.

### 11.3 Third Normal Form (3NF)

- The schema complies fully with 2NF.
- There are no transitive dependencies. Non-key attributes depend on nothing but the primary key.
- For example, calculated fields like the total amount in `orders` are computed dynamically at checkout or stored directly as an immutable total snapshot. They are never derived on the fly from un-normalized profiles.

---

## 12. Future Expansion Mapping
The ERD is designed with expansion in mind, making it easy to support advanced features without rewriting the existing schema:

```
[products] ◄─── (1:M) ───► [product_variations] (Supports attributes like Color, Size)
[orders]   ◄─── (1:1) ───► [delivery_tracking]  (Supports real-time courier status mapping)
[profiles] ◄─── (1:M) ───► [loyalty_points]     (Supports customer reward systems)
```

- **Product Variations:** Easily supported by creating a `product_variations` table that links directly to `product_id` with a foreign key.
- **Returns & Refunds:** Handled by extending the `stock_movement_type` enum (to track `return`) and adding a `refunds` table linked to `order_item_id`.
- **Discount Code Engine:** Can be introduced by creating a `coupons` table and adding a nullable `coupon_id` foreign key directly to the `orders` table.

---

## 13. Conclusion
The NexaMart AI logical ERD design provides a type-safe relational foundation engineered for optimal performance and strict operational security. By combining strict 3NF normalization, optimized indexes, soft-deletion handling, and automated profile triggers with Supabase, the database layer ensures total consistency and prepares the system for rapid implementation.
