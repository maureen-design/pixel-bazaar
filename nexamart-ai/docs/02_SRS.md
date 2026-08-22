# NexaMart AI — Software Requirements Specification (SRS)
**Version:** 1.0  
**Status:** Approved / Specification Baseline  
**Last Updated:** July 2026  

---

## Table of Contents
1. Introduction & Project Scope
2. Overall System Description & User Classes
3. Core System Architecture & Modules
4. Detailed Functional Requirements
5. Non-Functional Performance & Reliability Standards
6. External Interface Requirements
7. System Security Specifications
8. Engineering Assumptions & Constraints

---

## 1. Introduction & Project Scope

### 1.1 Purpose
This Software Requirements Specification (SRS) establishes the definitive functional, non-functional, and interface requirements for **NexaMart AI**. It serves as the primary technical baseline and engineering contract for development, quality assurance testing, code evaluation, and final-year academic project review.

### 1.2 Project Scope
NexaMart AI is a cloud-native, responsive, multi-vendor e-commerce marketplace that enables businesses and individual vendors to sell physical products through a centralized online platform. The platform handles a diverse array of physical consumer sectors, specifically supporting categories such as:
*   Electronics & Gadgets
*   Fashion & Apparel
*   Beauty & Personal Care
*   Groceries & Consumables
*   Agricultural Produce
*   Handmade Crafts
*   Home & Living Products

The platform creates a unified ecosystem where independent merchants securely list physical products and manage stock, while consumers browse items, maintain local carts, and process secure checkouts using localized mobile money payment frameworks.

### 1.3 Intended Audience
*   **Lead Project Developer:** Maureen Mudasia (System Architect & Engineer)
*   **Academic Supervision & Evaluation Faculty / Examiners**
*   **System Integration & QA Testers**

---

## 2. Overall System Description & User Classes

### 2.1 Product Perspective
NexaMart AI operates as an autonomous web application engineered with a modern, decoupled architecture. The frontend layer handles client-side routing, responsive layouts, and interactive UI states, while interfacing directly with a Backend-as-a-Service (BaaS) platform handling data persistence, serverless functions, authentication, and cloud asset storage.

### 2.2 User Class Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                     NexaMart AI System User                     │
└─────────────────────────────────────────────────────────────────┘
│                          │                          │
▼                          ▼                          ▼
┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
│     CUSTOMER      │      │      VENDOR       │      │   ADMINISTRATOR   │
└───────────────────┘      ┌───────────────────┐      └───────────────────┘
► Browse & Search          ► Storefront Setup         ► Vendor Verification
► Cart & Checkout          ► Stock Control            ► Product Moderation
► Review Purchases         ► Order Fulfillment        ► System Audit Logging
► Track Order Status       ► Sales Dashboard          ► Category Engineering
```

*   **Customer:** Registered users interacting with the platform to discover physical products, input shipping/delivery information, manage shopping carts, maintain wishlists, and track order statuses.
*   **Vendor:** Commercial operators or local businesses who configure independent storefront profiles, upload product listings, manage physical inventory counts, analyze revenue charts, and fulfill customer orders.
*   **Administrator:** System operators tasked with merchant verification pipelines, product listing moderation, structural category mapping, and audit trail observation.

---

## 3. Core System Architecture & Modules

The marketplace platform is strictly segmented into three core functional boundaries:

### 3.1 Customer Module
*   Secure onboarding, email verification, and persistent user sessions.
*   Dynamic client-side product catalog, category tree navigation, and real-time textual search.
*   Persistent client-side shopping cart calculations and wishlist arrays.
*   Transactional checkout engine collecting delivery information and interfacing with mobile payment gateways.
*   Post-purchase tracking interface and verified-buyer product reviews.

### 3.2 Vendor Module
*   Independent digital storefront customization and profile maintenance.
*   Full CRUD operations for physical items, image uploads, variant configuration, and active status toggles.
*   Inventory controls featuring stock tracking and automated low-stock visibility updates.
*   Order fulfillment dashboard detailing incoming payments and delivery status logs.
*   Sales analytics dashboards highlighting revenue timelines and customer rating metrics.

### 3.3 Administration Module
*   Centralized management room highlighting platform KPIs (active vendors, registration queues, total items).
*   Merchant onboarding gatekeeping pipeline requiring explicit administrator approval for pending vendor applicants.
*   Content moderation tools for product compliance validation and category engineering.
*   Immutable system audit logs tracking sensitive role modifications and configuration shifts.

---

## 4. Detailed Functional Requirements

### 4.1 Identity Management & Authentication
*   The system must enforce secure, password-hashed user registration and login.
*   The system must validate email addresses using token-based link confirmation.
*   The system must facilitate secure, cryptographically sound password recovery flows.
*   Sessions must persist reliably via JSON Web Tokens (JWT) across browser restarts until explicit logout.

### 4.2 Product Discovery & Cataloging
*   The catalog must render items responsively with multi-tier categorization (Electronics, Fashion, Groceries, etc.).
*   Search engines must process search strings smoothly against product titles, tags, and metadata.
*   Filters must accurately isolate listings by price thresholds, category parameters, and vendor scopes.

### 4.3 Shopping Cart & State Tracking
*   The application must allow users to append, remove, or modify quantities within a session-bound cart.
*   Total aggregates, service handling fees, and taxes must calculate instantly on the client side.

### 4.4 Payment Processing & Checkout Mechanics
*   The system must collect shipping and physical delivery details securely during checkout. Guest checkouts are explicitly unsupported.
*   The payment engine must interface directly with the M-Pesa Daraja API to prompt an instant STK Push PIN dialog on the user's mobile phone.
*   The system must process asynchronous secure payment webhooks to confirm cash transitions before marking an order as paid.

### 4.5 Wishlist & Community Feedback
*   Users must be able to flag items for future procurement without cart contamination.
*   The platform must restrict product review submissions exclusively to verified buyers of that specific product.
*   Vendors must retain explicit reply channels to respond directly to customer reviews on their storefront.

---

## 5. Non-Functional Requirements

### 5.1 Performance Standards
*   Core application viewports should load completely under 2.0 seconds over standard broadband networks.
*   Frontend data fetching operations must utilize asset lazy loading and image optimization layers to minimize layout shifts.

### 5.2 Security Parameters
*   All data in transit must be wrapped inside Transport Layer Security (TLS/HTTPS).
*   Passwords must never store in plaintext; they must rely on secure server-side hashing algorithms.
*   The PostgreSQL engine must enforce strict **Row Level Security (RLS)** policies within Supabase to ensure users and vendors can never view or query unauthorized peer rows.
*   All inputs must undergo rigorous client and server-side validation to eliminate risks of SQL Injection (SQLi) and Cross-Site Scripting (XSS).

### 5.3 Reliability, Availability & Usability
*   The database layer must enforce ACID transaction principles to guarantee complete data integrity during concurrent buy requests.
*   The interface design must conform to modern usability and accessibility standards, maintaining high-contrast color balances, readable fonts, and responsive grid systems down to mobile screen viewports.

---

## 6. External Interface & System Integrations

### 6.1 Hardware & Software Interfaces
*   **Hardware Interfaces:** Desktop computers, laptops, tablets, and smartphones. The design adapts fluidly across all common screen viewports.
*   **Software Interfaces:** Direct communication links with Supabase BaaS, local database structures, external payment gateways, and SMTP servers.

### 6.2 Technology Stack Blueprint

| Layer | Technology | Operational Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React | Component-driven UI rendering for reactive viewports. |
| **Build Tool** | Vite | Blistering fast development server and bundle optimization. |
| **Styling Engine** | Tailwind CSS | Utility-first, highly adaptive styling system optimized for Dark Mode. |
| **Language Layer** | TypeScript | Strong typing, compilation safety, and clean self-documenting code. |
| **Backend-as-a-Service** | Supabase | Modern backend infrastructure handling serverless operations. |
| **Database Engine** | PostgreSQL | Relational storage handling robust indexing, foreign keys, and ACID transactions. |
| **Identity Management** | Supabase Auth + JWT | Built-in secure authentication handling session tokens and security states. |
| **Object Cloud Storage** | Supabase Storage | Persistent media buckets for high-resolution physical product photos. |
| **Email Service** | Nodemailer | Automated confirmation triggers, transaction receipts, and alert pipelines. |
| **Payment Gateway** | M-Pesa API (Daraja) | Localized mobile payment integration for instant STK Push transactions. |
| **Version Control** | Git & GitHub | Code management using explicit feature-branch workflows. |
| **Design / Environment** | Figma & VS Code | Wireframing blueprints and master code engineering environment. |

---

## 7. System Security Specifications
*   Enforcement of secure role-based authorization pipelines (Admin, Vendor, Customer).
*   API endpoint protection ensuring unauthorized requests are dropped at the network edge.
*   Input validation and output sanitization handling on both client fields and database functions.
*   Sensitive system errors are logged securely on the backend while displaying clear, non-technical, friendly error messages to end users.

---

## 8. Engineering Assumptions & Constraints

### 8.1 System Assumptions
*   Operating users possess stable internet connectivity and modern web browsing engines.
*   Customers possess an active, funded M-Pesa account capable of parsing standard STK push requests.

### 8.2 System Constraints
*   **Web Sandbox Only:** The primary version targets client desktop and mobile web browsers exclusively; native desktop or native standalone mobile files (.apk/.ipa) are excluded.
*   **Authentication Mandatory:** Guest checkouts are disabled; profiles are mandatory for physical delivery accuracy.
*   **Feature Omissions:** Native delivery personnel tracking panels, automated vendor withdrawal clearinghouses, and continuous AI video elements are out of scope. AI features are purposefully constrained to product recommendations and text-based customer review summaries if timeline milestones allow.

---

## Conclusion
This Software Requirements Specification establishes the complete functional and technical boundaries for NexaMart AI as a general physical product marketplace. It provides an uncompromised foundation for system architecture, database design, testing, and supervisor validation.
