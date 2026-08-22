# NexaMart AI — Product Design Specification (UI/UX)
**Version:** 1.0  
**Status:** Approved / Design Baseline  
**Last Updated:** July 2026  

---

## Table of Contents
1. Introduction & Purpose
2. Design System Architecture & Color Tokens
3. Layout Schematics
4. Target Users & Navigation Mappings
5. Core Experience Journeys
6. UI Component State Guidelines
7. Forms, Validation & Error Handling
8. Accessibility (WCAG 2.1 AA Compliance)
9. Future Design Enhancements
10. Conclusion

---

## 1. Introduction & Purpose

### 1.1 Purpose
This document establishes the official user interface (UI) and user experience (UX) specifications for **NexaMart AI**. It bridges the gap between our Supabase relational database schema and our React front-end implementation. 

By defining the layout structures, reusable design system component tokens, state variations, and user workflows, this document guarantees an accessible, lightning-fast, and entirely unified multi-vendor platform interface.

---

## 2. Design System Architecture & Color Tokens

NexaMart AI utilizes a modern, deep design system engineered to look exceptional in dark mode while fully supporting a clean light theme toggle. 

### 2.1 Core Tailwind CSS Palette Tokens

| Token Name | Light Mode Value | Dark Mode Value | Functional Application |
| :--- | :--- | :--- | :--- |
| `background-page` | `#F8FAFC` (Slate 50) | `#09090B` (Zinc 950) | App workspace base background. |
| `background-surface` | `#FFFFFF` (White) | `#18181B` (Zinc 900) | Product cards, dialog modals, sidebars. |
| `brand-primary` | `#0284C7` (Sky 600) | `#38BDF8` (Sky 400) | Primary actions, links, focus rings, markers. |
| `brand-success` | `#16A34A` (Green 600) | `#4ADE80` (Green 400) | M-Pesa paid states, stock check confirmations. |
| `brand-error` | `#DC2626` (Red 600) | `#F87171` (Red 400) | Validation errors, failed transactions, deletions. |
| `text-primary` | `#0F172A` (Slate 900) | `#FAFAFA` (Zinc 50) | Main headings, read text, active parameters. |
| `text-secondary` | `#475569` (Slate 600) | `#A1A1AA` (Zinc 400) | Secondary subtitles, timestamps, labels. |
| `border-element` | `#E2E8F0` (Slate 200) | `#27272A` (Zinc 800) | Input borders, list dividers, grid lines. |

---

## 3. Layout Schematics

To ensure absolute visual consistency before writing structural React JSX code, the core user dashboard layouts follow clean text-based blueprints:

### 3.1 Three-Column Master Marketplace Grid (Desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [NexaMart AI]     [ Search physical products... ]    (Cart) (Wish) [Me]  │
├──────────────────────────────────────────────────────────────────────────┤
│ Category Sidebar │ Main Interactive Workspace           │ Active Cart/   │
│ ──────────────   │ ──────────────────────────           │ Recommendations│
│ 🛒 Electronics   │ ┌──────────────────────────────────┐ │ ────────────── │
│ 👕 Apparel       │ │ Banner: AI Recommendations      │ │ 📦 Item 1      │
│ 🏠 Home Goods    │ └──────────────────────────────────┘ │ 📦 Item 2      │
│ 🧼 Beauty        │ ┌─────────┐ ┌─────────┐ ┌─────────┐  │                │
│ ✨ New Vendors   │ │ Product │ │ Product │ │ Product │  │ [ Checkout ]   │
│ ⚙️ Help Center   │ └─────────┘ └─────────┘ └─────────┘  │                │
└──────────────────┴──────────────────────────────────────┴────────────────┘
```

### 3.2 Standard Dashboard Layout (Sellers & Administrators)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ☰ NexaMart Console   [Global Search...]     🔔 Notifications  [Profile]  │
├──────────────────┬───────────────────────────────────────────────────────┤
│ Navigation Links │ Core Analytic Metric Summary Cards                     │
│ ──────────────── │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│ 📊 Dashboard     │ │ Gross Sales  │ │ Active Orders│ │ Stock Alerts │     │
│ 📦 Listings      │ │ KSh 45,200   │ │ 12 Pending   │ │ 3 Items Low  │     │
│ 🧾 Orders        │ └──────────────┘ └──────────────┘ └──────────────┘     │
│ 📈 Performance   │                                                       │
│ 🔑 Controls      │ [ Data Management Grid Views / Interactive Tables ]   │
│ ⚙️ Settings      │                                                       │
└──────────────────┴───────────────────────────────────────────────────────┘
```

---

## 4. Target Users & Navigation Mappings

The interface dynamically adapts its entire navigation framework based on the user's account role retrieved from the Supabase profile session:

* **Customer Path:** Focused on discovery, frictionless search, short checkout sequences, and clear order delivery tracking views.
* **Vendor Portal:** Optimizes table grid spacing for tracking inventory adjustments, adjusting prices, and fulfilling single line items.
* **Admin Center:** Prioritizes systemic security over visual fluff, highlighting incoming merchant applications, processing moderation requests, and reviewing real-time platform system audit trails.

---

## 5. Core Experience Journeys

### 5.1 The Checkout Flow Journey

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────┐      ┌──────────────┐
│ Shopping Cart│ ───► │ Shipping/Address │ ───► │M-Pesa STK   │ ───► │ Order        │
│ Summary View │      │ Entry Validation │      │ Push Trigger│      │ Confirmation │
└──────────────┘      └──────────────────┘      └─────────────┘      └──────────────┘
```

1. **The Basket Summary:** User confirms quantities. The system displays subtotal computations on the fly.
2. **Address Dispatch:** Form displays simple auto-complete entries for drop-off points.
3. **M-Pesa Checkout Initiation:** The front-end triggers a secure payload to our Supabase Edge Function, initializing a direct STK Push prompt to the user's phone.
4. **Receipt Confirmation:** Upon receiving the Supabase webhook update, the interface smoothly transitions to a clean victory screen displaying the M-Pesa receipt confirmation token.

---

## 6. UI Component State Guidelines

### 6.1 Loading Experiences (Asynchronous States)
* **Skeleton Cards:** When fetching product lists from the database, the page must show animated pulse boxes matching the exact height of the cards to reduce perceived loading time.
* **Button Spinners:** Submitting data (e.g., clicking *Add to Cart*) changes the button text into an inline SVG loading circle and disables clicks to prevent duplicate records.

### 6.2 Empty Experiences
* Every view containing zero relational entries (such as an empty shopping cart or no search results found) must render an actionable vector graphic alongside an explicit call to action (e.g., *"Browse Products"*).

---

## 7. Forms, Validation & Error Handling

To maximize form completion speeds and keep user data input pristine, all forms are bound by the following front-end integration rules:

```typescript
// Sample implementation validation constraints
export const ProductFormSchema = {
  name: { required: true, minLength: 3, maxLength: 80 },
  sku: { required: true, pattern: /^[A-Z0-9]{8,12}$/ },
  price: { required: true, min: 0.01 }
};
```

- **Real-time Checks:** Fields validate on blur event handlers. Error banners display immediately underneath the input boxes with clear red accents (`brand-error`).
- **Clean Errors:** Front-end code intercepts messy PostgreSQL exceptions. Instead of displaying generic codes like `PRISMA_ERR_23505`, the UI reads: *"This SKU is already assigned to another product."*

---

## 8. Accessibility (WCAG 2.1 AA Compliance)
NexaMart AI enforces accessibility standards natively inside its component layout library:

- **Color Ratios:** Typography text scales ensure a minimal contrast ratio of `4.5:1` against standard page canvas backdrops.
- **Keyboard Navigation:** Every single interactive card, modal container, and input box supports complete sequential accessibility via native `tabindex` focus loops.
- **Image Accessibility:** Every physical product asset thumbnail requires an active descriptive text string assigned to its `alt=""` HTML attribute during asset upload operations.

---

## 9. Future Design Enhancements
The front-end UI framework has been pre-configured to easily adopt the following advanced interface improvements:

- **Live Vendor Chat Modules:** Modular sidebar slots are reserved for real-time customer-to-merchant customer support interfaces.
- **AI Product Previews:** Media container dimensions match responsive scales perfectly, ensuring smooth upgrades to interactive product carousels down the road.

---

## 10. Conclusion
This Product Design Specification establishes a unified visual and interactive foundation for NexaMart AI. By anchoring color tokens to semantic dark mode specifications, enforcing structured layout grids, and standardizing component behaviors across all views, the frontend application remains optimized for performance, fully accessible, and prepared for high-speed implementation.
