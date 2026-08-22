# NexaMart AI — Information Architecture (IA) Specification
**Version:** 1.0  
**Status:** Approved / Architecture Baseline  
**Last Updated:** July 2026  

---

## Table of Contents
1. Introduction & Objectives
2. Comprehensive Structural Site Map
3. Navigation Matrices by User Role
4. Client-Side Page Architecture
5. Transactional User Journeys & Navigation Flows
6. Content Hierarchy & Discovery Mechanics
7. Design & Viewport Adaptability Considerations

---

## 1. Introduction & Objectives

### 1.1 Purpose
This document specifies the architectural blueprint of information layout, navigation groupings, and interactive pathways for **NexaMart AI**. It establishes a clear directory hierarchy for system wireframing, high-fidelity Figma layouts, and conditional frontend client routing.

### 1.2 Architecture Goals
* **Logical Isolation:** Maintain clear separation between the open client ecosystem, authenticated client dashboards, independent merchant control centers, and system moderation rooms.
* **Efficient Discovery:** Organize multi-vendor physical product inventory trees so customers can find items in minimal clicks.
* **Scalability Alignment:** Set up clean structural layouts allowing for effortless expansion of physical product departments without breaking core routing paths.

---

## 2. Comprehensive Structural Site Map

The following multi-tier structural map details every page and layout node engineered into the web application:

```
NexaMart AI App Root (`/`)
│
├── Public Client Ecosystem
│   ├── Home (`/`)
│   ├── Products Marketplace (`/products`)
│   │   ├── Category Catalog View (`/products/category/:id`)
│   │   ├── Detailed Product Sheet (`/products/:id`)
│   │   └── Direct Product Comparison Matrix (`/compare`)
│   └── Shared Shopping Cart Workspace (`/cart`)
│
├── Identity Access Management Layer (`/auth`)
│   ├── Login Node (`/auth/login`)
│   ├── Registration Pipeline (`/auth/register`)
│   ├── Token Link Verification Screen (`/auth/verify`)
│   └── Secure Account Recovery (`/auth/forgot-password`)
│
├── Protected Client Checkout Engine (`/checkout`)
│   ├── Delivery Logistics & Address Entry (`/checkout/shipping`)
│   ├── Localized M-Pesa Integration Terminal (`/checkout/payment`)
│   └── Order Processing Confirmation View (`/checkout/confirmation`)
│
├── Authenticated Customer Workspace (`/customer`)
│   ├── Hub Overview (`/customer/dashboard`)
│   ├── Historic Orders Index (`/customer/orders`)
│   ├── Deep Order Tracking Timeline (`/customer/orders/:id`)
│   ├── Curated Wishlist Cache (`/customer/wishlist`)
│   ├── Notification Feed (`/customer/notifications`)
│   └── Profile Configuration Workspace (`/customer/profile`)
│
├── Isolated Merchant Command Center (`/vendor`)
│   ├── Core KPI Dashboard (`/vendor/dashboard`)
│   ├── Catalog Control Center (`/vendor/products`)
│   │   ├── Item Creation Engine (`/vendor/products/new`)
│   │   └── Item Modification Sheet (`/vendor/products/edit/:id`)
│   ├── Inventory Stock Matrix (`/vendor/inventory`)
│   ├── Order Fullfillment Deck (`/vendor/orders`)
│   ├── Business Intelligence Analytics (`/vendor/analytics`)
│   └── Storefront Profile Editor (`/vendor/profile`)
│
└── System Administration Control Room (`/admin`)
    ├── Platform KPI Hub Overview (`/admin/dashboard`)
    ├── Identity Moderation Center (`/admin/users`)
    ├── Merchant Onboarding Gate (`/admin/vendors/approval`)
    ├── Inventory Moderation Workspace (`/admin/products/moderation`)
    ├── Department & Category Structural Builder (`/admin/categories`)
    ├── Financial & System Audit Logs (`/admin/audit-logs`)
    └── Platform Configuration Control (`/admin/settings`)
```

---

## 3. Navigation Matrices by User Role

### 3.1 Public Guest Navigation Bar
* `Logo` → Redirects to absolute home (`/`)
* `Shop Dropdown` → Lists structural physical categories (Electronics, Groceries, Fashion, etc.)
* `Search Input` → Dynamic global text matching
* `Shopping Cart Icon` → Navigates to `/cart` (displays item badges)
* `Sign In / Register` → Navigates to authentication screen

### 3.2 Authenticated Customer Navigation Header
* *Inherits all Public Guest links, changing user control triggers to:*
* `Wishlist Badge Link` → Navigates directly to personal wishlist save nodes
* `User Dropdown Menu:`
    * `My Profile & Settings` → `/customer/profile`
    * `Track Orders` → `/customer/orders`
    * `Notifications` → `/customer/notifications`
    * `Logout Session Control` → Standard session termination hook

### 3.3 Authenticated Vendor Sidebar
* `Dashboard Summary` → High-level overview of store performance
* `Product Manager` → Core repository for item creations and listing edits
* `Inventory Monitor` → Stock metrics and low-stock alerts
* `Fulfillment Hub` → Real-time processing for buyer orders
* `Storefront Builder` → Profile and visual customizer for matching customer cards
* `Logout Trigger`

### 3.4 System Administrator Sidebar
* `Platform Statistics Dashboard` → Total volume, active users, and system overview
* `User & Account Moderation` → Manage customer and vendor status logs
* `Merchant Onboarding Verification Queue` → Step-by-step approvals for pending vendor stores
* `Listing Moderation Deck` → Review compliance flags on items
* `Category Tree Engineering Room` → Manage product taxonomy trees
* `Audit Trail Tracking` → View immutable activity history logs
* `Logout Trigger`

---

## 4. Client-Side Page Architecture

### 4.1 Marketplace Home Viewport Layout
* **Hero Section:** Dynamic marketing banners highlighting top-performing stores or product lines.
* **Search Discovery Hub:** Autocomplete input box tied into the Postgres catalog rows.
* **Grid Departments:** Icon-driven matrix for top-tier categories (Electronics, Fashion, Beauty, Groceries, Agriculture, Home & Living).
* **Smart Product Feed Groups:** Divided by `Trending Items`, `Featured Sellers`, and `Personalized Recommendations`.

### 4.2 Product Sheet Deep-Dive Layout (`/products/:id`)
* **Media Gallery Showcase:** Multi-image responsive carousel displaying high-resolution physical asset photos from Supabase Storage.
* **Core Metadata Block:** Complete breakdown of item price, star ratings, and real-time inventory level indicators (e.g., `Only 3 left in stock`).
* **Merchant Identity Card:** Deep-link profile block pointing to the listing Vendor's custom storefront.
* **Verified Buyer Reviews Grid:** Complete listing of customer feedback scores restricted to authenticated buyers of that exact product.

### 4.3 Transactional Checkout Interface Flow
* **Logistics Module (`/checkout/shipping`):** Address verification fields requiring explicit delivery addresses, name parameters, and phone numbers.
* **Payment Gateway Interface (`/checkout/payment`):** Safaricom Daraja M-Pesa input module displaying an automated payment configuration summary and an instant "Trigger STK Push" interactive state button.

---

## 5. Transactional User Journeys & Navigation Flows

### 5.1 End-to-End Consumer Procurement Loop
```
[Home View] ──> [Filter Category Tree] ──> [Product Deep Dive Screen]
│
[Order Track Interface] <── [M-Pesa Webhook PIN] <── [Checkout / Address Form] <── [Cart Checkout Trigger]
```

### 5.2 Independent Vendor Management Lifecycle Loop
```
[Onboarding Request Form] ──> [Admin Approval Clearance Notification]
│
[Process Buyer Shipments] <── [Real-time Stock Monitor Alerts] <── [Launch Product Listing (CRUD)]
```

---

## 6. Content Hierarchy & Discovery Mechanics

The platform organizes layout priority across three distinct tiers to guarantee immediate visual clarity:

```
┌────────────────────────────────────────────────────────┐
│ LEVEL 1: Primary Navigation Headers & KPI Summary Cards │
├────────────────────────────────────────────────────────┤
│ LEVEL 2: Dynamic Filter Controls & Product Content Grid│
├────────────────────────────────────────────────────────┤
│ LEVEL 3: Deep Tab Data Sheets, Reviews & Audit Timelines│
└────────────────────────────────────────────────────────┘
```

### 6.1 Multi-Attribute Search Engine Architecture
* **Live Predictive Suggestions:** Query matches trigger instantly as users type inside the search header.
* **Granular Multi-Tier Filters:** Users can effortlessly isolate products using a sidebar filter menu featuring parameters for Category Trees, Vendor Entities, Price Ranges, and Minimum Review Scores.
* **Specification Comparison Matrix:** Interactive component allowing side-by-side spec row alignment for cross-checking physical details, price points, and review scores.

---

## 7. Design & Viewport Adaptability Considerations
* **Mobile-First Blueprint Setup:** Navigation elements adapt seamlessly from fluid desktop horizontal rows to collapsible bottom-anchored mobile app navigation tabs and sliding menus.
* **Cohesive Interactive Feedback States:** Interactive buttons, hover indicators, and form inputs use a dark-mode optimized color framework with clear visual hover highlights.

---

## Conclusion
This Information Architecture solidifies the user paths and page layouts for NexaMart AI. It establishes a clear, scalable foundation for UI wireframing, interactive prototyping, and front-end component development across all three user roles: Customer, Vendor, and Administrator.
