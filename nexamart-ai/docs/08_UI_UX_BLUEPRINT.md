# NexaMart AI — UI/UX Blueprint Layout Specs
**Version:** 1.0  
**Status:** Approved / Frontend Blueprint  
**Last Updated:** July 2026  

---

## Table of Contents
1. Executive Interface Summary
2. Core Interface Navigation Layouts
3. Marketplace View Wireframe Layouts
4. Dashboard Terminal Layouts (Vendor & Admin)
5. Component Interface Specifications
6. Responsive Layout Breakpoints
7. Form Layout & Action Triggers
8. Conclusion

---

## 1. Executive Interface Summary

### 1.1 Purpose
This document provides the definitive architectural blueprint for the user interface layout and experience pathways of **NexaMart AI**. It maps out the exact placement of layout blocks, sidebar components, and action triggers across public storefronts, customer workspaces, merchant consoles, and administrative dashboards.

---

## 2. Core Interface Navigation Layouts

### 2.1 Public Front-Facing Top Navbar

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛍️ NexaMart AI  │ 🔍 Search products, categories, brands... │ 🛒 [2] │ ❤️ [5] │ 👤 Login │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ☰ All Categories   ⚡ New Arrivals   🏬 Featured Vendors   🔥 Deals   📢 Swahilipot Hub │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Customer Core Bottom Navigation (Mobile Viewports)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│    🏠 Home     │    🔍 Search    │    🛒 Cart (2)    │    ❤️ Wishlist   │    👤 Profile   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Marketplace View Wireframe Layouts

### 3.1 Product Details Page Layout Spec

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Breadcrumbs: Home > Electronics > Smart Devices                                         │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│                                           │                                            │
│  ┌─────────────────────────────────────┐  │  ⭐⭐⭐⭐⭐ (4.8 / 24 Reviews)              │
│  │                                     │  │  ## NexaPro AI Assistant Speaker           │
│  │                                     │  │  🏢 Vendor: SwahiliTech Solutions          │
│  │        [ HERO PRODUCT ASSET ]       │  ├────────────────────────────────────────────┤
│  │                                     │  │  🏷️ KSh 12,500                             │
│  │                                     │  │  📦 In Stock (14 units left)               │
│  │  └─────────────────────────────────────┘  ├────────────────────────────────────────────┤
│  │ ┌───┐ ┌───┐ ┌───┐ ┌───┐                 │  │ ➕ [ 1 ] ➖   [ 🛒 Add to Shopping Cart ]  │
│  │ │📷 │ │📷 │ │📷 │ │📷 │                 │  │                                            │
│  │ └───┘ └───┘ └───┘ └───┘                 │  │ ✨ [ ❤️ Save to Wishlist ]                 │
├───────────────────────────────────────────┴────────────────────────────────────────────┤
│ ### Product Specifications & Description                                               │
│ This item features an integrated edge AI model for localized voice controls...         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Simplified Checkout Sequence Layout Spec

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [✓] 1. Basket  ───►  [●] 2. Shipping  ───►  [ ] 3. M-Pesa Payment  ───►  [ ] 4. Success   │
├───────────────────────────────────────────────────────┬────────────────────────────────┤
│ ### Shipping & Delivery Destination                   │ ### Order Summary              │
│ ┌──────────────────────────────────────────────────┐  │ ─────────────────              │
│ │ Full Name: Maureen ...                           │  │ Subtotal:     KSh 12,500       │
│ ├──────────────────────────────────────────────────┤  │ Shipping:     KSh    350       │
│ │ Shipping Address (e.g., Mombasa, Swahilipot Hub) │  │                                │
│ ├──────────────────────────────────────────────────┤  │ Total Amount: KSh 12,850       │
│ │ Phone Number (For M-Pesa STK Push): +254...      │  ├────────────────────────────────┤
│ └──────────────────────────────────────────────────┘  │ [ Go to Secure Payment ]       │
└───────────────────────────────────────────────────────┴────────────────────────────────┘
```

---

## 4. Dashboard Terminal Layouts

### 4.1 Vendor Management Console Panel

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏬 Merchant Console  │  Store Status: Active [✓]  │  👤 SwahiliTech Solutions          │
├──────────────────────┬─────────────────────────────────────────────────────────────────┤
│ 📊 Overview          │ ## Store Performance Metrics                                    │
│ 📦 Product Manager   │ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐        │
│ 🧾 Order Fullfillment│ │ Today's Revenue│ │ Pending Orders │ │ Low Stock Warn │        │
│ 📈 Sales Analytics   │ │ KSh 24,100     │ │ 4 Shipments    │ │ 2 Items Left   │        │
│ 💬 Review Board      │ └────────────────┘ └────────────────┘ └────────────────┘        │
│ ⚙️ Store Settings     ├─────────────────────────────────────────────────────────────────┤
│                      │ ### Incoming Orders Ready for Processing                         │
│                      │ 📦 Order #1042 • 2x Smart Speaker • KSh 25,000 • [ Process ]    │
│                      │ 📦 Order #1039 • 1x USB-C Hub     • KSh  3,200  • [ Process ]    │
└──────────────────────┴─────────────────────────────────────────────────────────────────┘
```

### 4.2 Platform Administrator Control Center

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ Admin Supreme System Terminal                                 │  System Health: 99.8%│
├──────────────────────┬─────────────────────────────────────────────────────────────────┤
│ 📊 System Metrics    │ ## Administrative Moderation Queues                             │
│ 👥 User Management   │ ┌─────────────────────────────────────────────────────────────┐  │
│ 🏢 Vendor Approvals  │ │ PENDING MERCHANT APPLICATIONS                               │  │
│ 🔍 Product Audit     │ │ • Mombasa Digital Goods Ltd  [📝 View Details]  [✅ Approve] │  │
│ 📁 Category Tree     │ │ • Coastal Crafts Collective  [📝 View Details]  [❌ Reject]  │  │
│ 🧾 Global Orders     │ └─────────────────────────────────────────────────────────────┘  │
│ 📑 Security Audit    │ ┌─────────────────────────────────────────────────────────────┐  │
│ ⚙️ Core Config       │ │ CRITICAL SYSTEM AUDIT TRAIL LOGS                            │  │
│                      │ │ USER_SUSPENSION: Admin muted User ID: #9240        │  │
│                      │ │ VENDOR_CREATED: Store "SwahiliTech" Approved     │  │
│                      │ └─────────────────────────────────────────────────────────────┘  │
└──────────────────────┴─────────────────────────────────────────────────────────────────┘
```

---

## 5. Component Interface Specifications

To keep our layout atomic and highly reusable inside our React project, every element follows strict layout bounds:

### 5.1 The Product Card Component Grid Item
* **Media Frame:** Fixed `aspect-square` image container with clean corner radiuses (`rounded-lg`), implementing fallback skeleton bars for slow connections.
* **Badges:** Absolute positioning in the top-left corner using high-contrast text chips (e.g., `[ Out of Stock ]` in bright red, or `[ -15% ]` in success green).
* **Action Bounds:** The entire card is clickable to open product details, except for the explicit floating heart button (Wishlist trigger) and the prominent bottom button (`[ Add to Cart ]`).

---

## 6. Responsive Layout Breakpoints

The design uses standard Tailwind CSS breakpoint grids to snap components beautifully into place based on screen widths:

| Viewport Target | Tailwind Tag | Grid Columns | Component Transformations |
| :--- | :--- | :--- | :--- |
| **Mobile Phones** | `Base (<640px)` | 1 to 2 Columns | Sidebar navigation shifts entirely into drop-down sheets or a sticky bottom action bar. |
| **Tablets** | `md: (768px)` | 3 Columns | Product grids expand; analytical summary stats show up as swipeable side-scrolling cards. |
| **Desktop Monitors** | `lg: (1024px)` | 4 Columns | Full sticky sidebars lock into position on both the admin and merchant dashboard pages. |
| **Widescreens** | `xl: (1280px)` | 5 Columns | Product listing structures scale outward to fill extra space, maintaining crisp margins. |

---

## 7. Form Layout & Action Triggers

All user inputs throughout the authentication, checkout, and product creation views follow a strict layout system:
* **Focus States:** Clicking into any input element highlights its borders using our designated primary color (`brand-primary`) alongside a subtle outer glow shadow ring to make keyboard navigation highly visible.
* **Inline Error Triggers:** If field validation fails during typing or when moving to the next field, the border colors instantly turn red, and helpful micro-copy instructions drop down underneath the component.

---

## 8. Conclusion
The NexaMart AI UI/UX Blueprint translates raw business goals into exact frontend layout configurations. By establishing fixed component grids, responsive breakpoint behaviors, and strict interaction patterns, the interface guarantees consistency across all customer, vendor, and administrator views while remaining highly performant and accessible across all modern device types.
