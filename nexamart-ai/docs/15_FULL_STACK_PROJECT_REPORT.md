# NexaMart AI — Comprehensive Full-Stack Software Engineering Project Report

**Version:** 1.0  
**Status:** Approved / Academic Capstone Deliverable  
**Last Updated:** July 2026  
**Author:** Maureen Mudasia  
**Degree Track:** Bachelor of Computer Information Systems

---

## 1. Executive Summary & Project Introduction

**NexaMart AI** is a cloud-native, multi-tenant e-commerce ecosystem engineered to lower technical and financial barriers for independent merchants while providing consumers with a unified, high-performance shopping interface. The platform addresses the fragmentation of traditional online retail spaces by consolidating three distinct user experiences—Customers, Vendors, and Administrators—into a single highly secure marketplace.

The platform architecture utilizes a decoupled client-server blueprint built on **React (TypeScript)** and **Tailwind CSS** for the user interface, anchored by a managed **Supabase cloud instance** running a robust **PostgreSQL relational engine**. Key milestones achieved include strict 3NF schema enforcement, transaction-safe local payment integrations via the **Safaricom M-Pesa Daraja API**, and deep, database-level security isolation through custom **Row Level Security (RLS)** policies. This report details the full engineering lifecycle from initial requirements gathering to final quality assurance verification.

---

## 2. Problem Statement & Strategic Project Objectives

### 2.1 The Technical and Economic Problem

Small and Medium Enterprises (SMEs) face severe entry barriers when moving to digital storefronts, driven by high upfront engineering costs, complex server provisioning, and fragmented local payment integrations. Concurrently, consumers experience severe friction when shopping across isolated vendor websites, resulting in inconsistent user experiences, insecure checkouts, and unreliable payment confirmations.

### 2.2 Defined System Objectives

- Engineering Objective: Architect a performant multi-tenant storefront backend capable of handling atomic stock changes during concurrent checkout waves.
- Security Objective: Eliminate account privilege escalation risks and enforce complete data isolation across competing merchant stores.
- Payment Objective: Build direct, asynchronous payment hooks using the Safaricom Daraja framework to process secure M-Pesa STK push queries.
- UX/UI Objective: Enforce an accessible design language following an 8-point pixel grid with dark-mode compatibility meeting WCAG 2.1 AA benchmarks.

---

## 3. Iterative Software Engineering Methodology

The engineering lifecycle followed a structured, iterative software development approach, ensuring continuous validation at every layer of implementation:

1. Analysis & Specification: Defining user stories, mapping role boundaries, and specifying functional dependencies.
2. Relational Data Modeling: Engineering a third-normal-form database schema layout to eliminate redundancy anomalies.
3. Atomic Frontend Prototyping: Constructing reusable layout views, UI blocks, and token variables with Tailwind CSS.
4. Cloud Hook Sync & Testing: Connecting frontend operations directly to cloud endpoints, verifying webhooks, and validating security protocols under active loads.

---

## 4. Multi-Tenant Architectural Design

The system relies on a clean separation of concerns, separating client-side view presentations from backend transactional processing engines.

The frontend communicates securely with Supabase services for authentication, database operations, storage, and server-side functions.

---

## 5. Relational Database Engineering (3NF & RLS Matrix)

To eliminate write/update anomalies and maintain data integrity under concurrent checkout conditions, the database is normalized into Third Normal Form (3NF).

### 5.1 Relational Tables and Security Rules

Every structural relation implements strict table constraints, cascade rules, and automated Row Level Security (RLS) policies to ensure data isolation:

| Relation Name | Core Identity Constraints | Foreign Key Dependencies | Active Database RLS Policy Rule |
| --- | --- | --- | --- |
| profiles | id uuid PRIMARY KEY | Links to auth.users | auth.uid() = id |
| vendors | id uuid PRIMARY KEY | profile_id references profiles | auth.uid() = profile_id |
| products | id uuid PRIMARY KEY | vendor_id references vendors | Public read access; write updates locked to owning vendor_id |
| orders | id uuid PRIMARY KEY | customer_id, vendor_id | Read access limited to the placing customer and target vendor |
| audit_logs | id bigint PRIMARY KEY | Automated system telemetry | Restricted to platform administrators |

---

## 6. Functional Implementation Highlights

### 6.1 Cryptographic User Access Framework

User management maps profiles directly to granular JSON Web Token (JWT) metadata values. When a user requests a session, the database decodes the token claims, assigning access pathways across Customer, Vendor, or Administrative dashboard views.

### 6.2 Transaction-Safe M-Pesa STK Push Routing

To process checkout transactions reliably, the platform uses an asynchronous state lifecycle managed through Supabase Edge Functions.

---

## 7. Security Architecture & Threat Mitigation Matrix

NexaMart AI enforces robust security baselines natively inside the system core:

- SQL Injection Prevention: Parameterized database statements are used instead of raw query concatenation.
- Cross-Site Scripting (XSS) Controls: Data is escaped and sanitized before rendering in the React interface.
- Malicious Account Privilege Escalation Protection: User role values are constrained at the database layer and cannot be modified through standard user update payloads.

---

## 8. Verification, Quality Assurance & Core Testing

The system underwent exhaustive testing across multiple development blocks:

- Unit & Functional Audits: Validated type consistency and tested cart calculations across edge cases.
- Multi-Tenant Penetration Audits: Executed custom API queries designed to bypass standard authorization parameters.
- Performance Benchmark Targets: Optimized rendering paths to achieve a First Contentful Paint metric beneath 1.5 seconds and a Cumulative Layout Shift below 0.1.

---

## 9. Engineering Challenges, Lessons Learned & Conclusion

### 9.1 Technical Challenges Overcome

1. Asynchronous Payment States: Handling race conditions where users closed storefront windows before the payment callback completed was solved by using transactional serverless edge functions that process webhooks in the background.
2. Dynamic Stock Controls: Eliminating inventory calculation conflicts during simultaneous checkout spikes was resolved by running atomic database operations inside PostgreSQL triggers.

### 9.2 Key Technical Takeaways

This engineering lifecycle reinforces that robust application design requires embedding security directly within the relational database layer from day one, rather than adding it later at the frontend. Adhering to strict 3NF models eliminates duplicate data loops, while modular, presentation-focused UI components speed up frontend iteration cycles.

### 9.3 Final Report Wrap-Up

NexaMart AI successfully delivers a production-ready, highly secure, and exceptionally scalable multi-vendor marketplace platform that meets the needs of customers, vendors, and administrators while leaving room for future enhancement.
