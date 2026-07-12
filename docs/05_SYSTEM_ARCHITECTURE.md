# NexaMart AI — System Architecture Specification
**Version:** 1.0  
**Status:** Approved / Architecture Baseline  
**Last Updated:** July 2026  

---

## Table of Contents
1. Introduction
2. Architectural Overview
3. System Components
4. Frontend Architecture
5. Backend Architecture
6. Database Architecture
7. Authentication Architecture
8. API & Data Flow
9. Storage Architecture
10. Payment Architecture
11. Email & Notification Architecture
12. Security Architecture
13. Deployment Architecture
14. Technology Stack
15. Scalability & Future Enhancements
16. Conclusion

---

## 1. Introduction

### 1.1 Purpose
This document defines the comprehensive system architecture for **NexaMart AI**. It delineates the technical relationships between client-side interfaces, cloud-managed Backend-as-a-Service (BaaS) environments, real-time database persistence, and external transactional payment infrastructures. This manual serves as the primary system architectural reference for code engineering, database table schema implementation, and production DevOps hosting.

---

## 2. Architectural Overview

NexaMart AI adopts a highly decoupled, modern cloud-native architecture built around a Backend-as-a-Service (BaaS) topology. The frontend handles layout compilation, state manipulation, and interactive animations within the client browser sandbox, completely independent of the servers. 

Rather than channeling requests through a traditional monolithic backend server, the client securely interfaces directly with **Supabase Cloud services** via encrypted global web channels.

```
              Users
                │
                ▼
       React Frontend (Vite)
                │
       HTTPS REST API Calls
                │
                ▼
             Supabase
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
Authentication PostgreSQL Storage
    │                     │
    ▼                     ▼
JWT Sessions         Product Images
Profile Photos
Vendor Logos
    │
    ▼
External Services
├── M-Pesa API (Daraja)
├── Nodemailer (SMTP)
└── GitHub
```

---

## 3. System Components

The platform consists of the following major operational components.

### 3.1 Client Layer
Supports three authenticated user groups through distinct application privileges:
* **Customers:** Access the public catalog, manage shopping baskets, process mobile transactions, and monitor delivery workflows.
* **Vendors:** Access dedicated inventory tools, upload items, review revenue metrics, and manage order fulfillments.
* **Administrators:** Access platform moderation panels, review vendor verification documents, inspect global system metrics, and audit system logs.

### 3.2 Frontend Layer
Responsible for:
* Component-driven visual rendering, client-side routing, and persistent interface states.
* Local form verification, input filtering, and reactive theme controls (Dark Mode toggles).
* Establishing communication loops with Supabase services using asynchronous API handlers.

### 3.3 Backend Layer
Implemented entirely using **Supabase** infrastructure, removing manual operating system overhead:
* Handles user access sessions and security verification processes.
* Automatically converts database relations into standard endpoints using the automated PostgREST engine.
* Processes isolated, server-side code modules via serverless Edge Functions.

### 3.4 Database Layer
Implemented using a relational **PostgreSQL** instance to handle persistent storage:
* Stores structural database tables including Users, Vendors, Categories, Products, Images, Invoices, In-App Alerts, and Audit Logs.
* Guarantees absolute transactional consistency through native ACID compliance.

### 3.5 External Services
Integrated services include:
* **Safaricom M-Pesa Daraja API:** Processes mobile checkout flows.
* **SMTP Transport Relay (Nodemailer):** Dispatches automated transactional emails.
* **GitHub Repository Clusters:** Manages software version controls.
* **Figma Workspaces:** Hosts interface design systems and layout assets.

---

## 4. Frontend Architecture

### 4.1 Technologies
* **React (v18+):** Functional UI generation engine driven by localized state lifecycles and custom Hooks.
* **Vite:** Delivers near-instant Hot Module Replacement (HMR) speeds for local development and compiles optimized build bundles.
* **TypeScript:** Establishes rigid parameter and data-type verification rules at compile time to block unexpected runtime UI breaks.
* **Tailwind CSS:** Enables a utility-first styling engine optimized for rapid dark mode variant layout compilation.

### 4.2 Folder Structure
The application codebase organizes architectural logic into modular, distinct development directories:

```
src/
├── assets/             # Static visual media, global icons, and base branding logo files
├── components/         # Atomized, reusable layout blocks (Buttons, Inputs, Badges, Search Bars)
├── context/            # Shared cross-component state contexts (AuthContext, ThemeContext)
├── hooks/              # Isolated operational lifecycles (useCart, useNotificationListener)
├── layouts/            # Persistent system shell skeletons (CustomerShell, AdminDashboardLayout)
├── pages/              # Route-specific parent viewports (ProductCatalog, OrderTracking, Checkout)
├── services/           # Supabase client configurations and external endpoint integration scripts
├── types/              # Unified structural TypeScript interface definitions
├── utils/              # Text formatting utilities, local currency calculators, and date helpers
├── App.tsx             # Parent structural shell wrapping routes and context providers
└── main.tsx            # Application entrance script compiling the virtual DOM tree
```

### 4.3 Layout Structure
Protected user sections are secured by outer layout wrappers:

```
App
├── Public Layout       # Accessible to unauthenticated visitors (Landing page, Auth forms, Catalog)
├── Customer Layout     # Restricts viewport to verified consumer profiles (Order tracking, Wishlist)
├── Vendor Layout       # Gates viewports to approved store merchants (Inventory metrics, SKU inputs)
└── Admin Layout        # Restricts access strictly to authorized administrators (Audit logs, Moderation)
```

---

## 5. Backend Architecture

Supabase provides the necessary backend infrastructure blocks out of the box:

### 5.1 Authentication Engine
Manages identity lifecycles including user registration, secure login, password resets, email verification states, and continuous user session checks.

### 5.2 Database Interface Gateway
Uses an automated routing system that intercepts incoming HTTP requests and converts them directly into secure database queries. This layout eliminates the need to expose open database port connections to the web.

### 5.3 Storage Buckets
Handles multi-tenant unstructured binary asset uploads, using public or private accessibility rules to keep files safe.

### 5.4 Edge Functions
Executes short-lived, isolated serverless functions written in TypeScript on a high-performance **Deno runtime**. Edge functions handle processes that require absolute server-side secrecy (such as validating API credential handshakes with Safaricom payment endpoints).

---

## 6. Database Architecture

* **Database Engine:** PostgreSQL
* **Hosting Platform:** Supabase Cloud
* **Normalization Baseline:** Third Normal Form (3NF)

To safeguard data against security tracking vectors and support seamless replication across data mirrors, the database schema avoids incremental sequence IDs, using random universally unique identifiers (**UUIDv4**) for primary record tracking keys instead.

```sql
-- Major Table Dependencies Hierarchy
[profiles]
   ├── [vendors] ──► [products] ──► [product_images] / [inventory_movements]
   ├── [shopping_carts] ──► [cart_items]
   ├── [wishlists] ──► [wishlist_items]
   └── [orders] ──► [order_items]
```

---

## 7. Authentication Architecture
Identity verification is managed via the **Supabase GoTrue Auth** service.

```
[User Input Credentials] ──► [Supabase GoTrue Engine] ──► [Verify Pass Hashing]
                                                                  │
[Authorized Resource] <── [Verify Client JWT] <── [Issue Encrypted Session Token]
```

### 7.1 Authentication Lifecycle

1. The client enters email and password into the React structural login panel.
2. The parameters pass via secure TLS v1.3 channels to the Supabase GoTrue Auth service.
3. Supabase validates credentials against internal database encryption hashes.
4. On success, the engine issues an encrypted **JSON Web Token (JWT)** session token.
5. The frontend app captures this verification token and saves it securely in `localStorage`.
6. Subsequent requests automatically append this token inside the HTTP Authorization Header to confirm user access privileges.

---

## 8. API & Data Flow

### 8.1 Product Catalog Retrieval Flow

```
Customer ──> Browser Catalog Page ──> Service Query Script ──> PostgREST Interface
                                                                      │
UI Grid Update <── Local React State <── JSON Response Data <── PostgreSQL Core
```

### 8.2 Asynchronous Transaction Checkout Flow

```
Customer ──> Confirm Checkout ──> Deno Edge Function ──> Safaricom Daraja API
                                                                │
Success Page <── Update Order Row <── Parse Webhook <── Asynchronous Callback Payloads
```

---

## 9. Storage Architecture
The **Supabase Storage Engine** isolates files into buckets configured with granular permission policies:

### 9.1 Storage Buckets

- `public-product-assets`: Open access paths, allowing images to load quickly on the product catalog pages.
- `private-merchant-verification`: Strictly locked-down storage area used for vendor registration paperwork; accessible only by authorized administrative staff sessions.

### 9.2 Validation Rules

- **Supported File Types:** `image/jpeg`, `image/png`, `image/webp`.
- **Maximum File Constraints:** Enforced both on the client UI form and via storage bucket policies to protect system capacity limits.

---

## 10. Payment Architecture
The primary payment gateway for processing transactions locally is the **Safaricom M-Pesa Daraja API**.

```
Customer Checkout ──> Supabase Edge Function ──> Daraja API STK Push Request
                                                           │
Update DB to 'Paid' <── Secure Webhook Callback <── Mobile Pin Confirmation
```

### 10.1 Transaction Workflow

1. The customer initiates checkout, passing their phone number and order totals to a secure **Supabase Edge Function**.
2. The Edge Function runs server-side security checks and issues a standard **STK Push API Request** to Safaricom.
3. A payment dialog automatically pops up on the customer's phone, prompting them to enter their secure PIN.
4. Once authorized, Safaricom sends an encrypted transaction callback payload back to the app's secure webhook URL.
5. The webhook parses the data packet, verifies the transaction reference code, marks the order status as `Paid`, and triggers stock adjustments.

---

## 11. Email & Notification Architecture
The platform uses a hybrid communication loop to manage real-time and transactional updates:

### 11.1 Communication Delivery Channels

- **In-App Notifications:** Built on PostgreSQL database triggers and WebSockets. This system instantly alerts users inside the app when their inventory runs low, when a new order comes in, or when a delivery status shifts.
- **Transactional Email Alerts:** Powered by a **Nodemailer SMTP relay**. It automatically sends receipts, onboarding approval notifications, and password reset links to ensure communication reaches users outside the app.

---

## 12. Security Architecture
System security is built into every layer of the platform configuration:

### 12.1 Authentication & Authorization

- **JSON Web Tokens (JWT):** Cryptographically signs all client communication to secure application access.
- **Row Level Security (RLS):** Applies data filters directly within the PostgreSQL engine. RLS policies intercept all queries, ensuring vendors can *only* see or modify data matching their unique `vendor_id`.

### 12.2 Application & Database Security

- **Injection Defenses:** The PostgREST gateway converts incoming requests into structured, parameterized values, completely neutralizing SQL Injection (SQLi) risks.
- **XSS Defenses:** Input forms use strict type casting and validation rules to sanitize input data and block malicious cross-site scripting attempts.
- **Audit Trails:** Critical actions (such as vendor onboarding approvals or inventory overrides) write directly to an unalterable audit ledger for long-term tracking.

---

## 13. Deployment Architecture
The platform runs on a fully cloud-managed, zero-maintenance deployment setup:

```
Developer Workspace ──> GitHub Repo ──> Vercel Deployment Engine ──> Global Edge Delivery
                                                                             │
Managed DB Backups ◄── Automated Scaling ◄── Supabase Cloud BaaS Tier ◄──────┘
```

- **Frontend Application:** Deployed via **Vercel Content Distribution Networks (CDNs)**. Pushing code updates to GitHub automatically triggers continuous integration (CI/CD) pipelines that test, build, and optimize static files for fast loading speeds.
- **Core Backend Infrastructure:** Authentication engines, relational tables, asset buckets, and serverless edge routers are hosted and managed inside **Supabase Cloud**.

---

## 14. Technology Stack

| Architecture Layer | Component Technology | Purpose & Implementation |
| :--- | :--- | :--- |
| **Frontend Framework** | React (TypeScript) | Renders functional views and manages application state. |
| **Build Optimization** | Vite | Compiles assets quickly and hot-loads interface changes. |
| **Styling Engine** | Tailwind CSS | Utility-first compilation optimized for Dark Mode tokens. |
| **Infrastructure BaaS** | Supabase Cloud | Managed backend, serverless architecture, and routing keys. |
| **Database Engine** | PostgreSQL | Relational database handling ACID-compliant transaction data. |
| **Access Security** | Supabase Auth (JWT) | Secure user login sessions and permission controls. |
| **Asset Storage** | Supabase Storage | Object buckets for catalog images and vendor files. |
| **Payment Terminal** | M-Pesa Daraja API | Mobile money integration for automated STK pushes. |
| **Email Services** | Nodemailer (SMTP) | Dispatches invoices and system transactional receipts. |
| **Version Control** | Git & GitHub | Code management and automated CI/CD pipelines. |

---

## 15. Scalability & Future Enhancements
The modular, decoupled design of NexaMart AI ensures the platform can expand smoothly without requiring a major structural rewrite:

- **Mobile Ready Architecture:** Because the backend acts as a standard decoupled API hub, you can launch native mobile apps (Flutter or React Native) in the future that connect to the exact same database with zero backend adjustments.
- **AI Compute Integrations:** Deno Edge Functions and structured Postgres tables are built to easily connect with external AI processing systems (like OpenAI or Hugging Face APIs) to create automatic review write-ups or smart user recommendations.

---

## 16. Conclusion
The NexaMart AI System Architecture establishes a secure, scalable, and maintainable foundation for the platform. By pairing a responsive React client with a robust Supabase BaaS framework and PostgreSQL, the system provides high performance, reliable data operations, automated user safety boundaries, and a solid foundation for rapid project implementation.
