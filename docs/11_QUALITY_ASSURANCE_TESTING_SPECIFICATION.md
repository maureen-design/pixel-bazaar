# NexaMart AI — Comprehensive Quality Assurance & Testing Specification

**Version:** 1.0  
**Status:** Approved / Core QA Baseline  
**Last Updated:** July 2026

---

## Table of Contents

1. Document Control & Strategy Overview
2. Automated Testing Environment Config
3. Advanced Security & Supabase RLS Validation Scenarios
4. Integration Testing Strategy: M-Pesa STK Push Workflows
5. Production-Grade High-Fidelity Test Case Matrix
6. Performance, Compatibility & Accessibility (WCAG 2.1 AA) Targets
7. Bug Lifecycle & Regression Reporting Protocol
8. Conclusion

---

## 1. Document Control & Strategy Overview

### 1.1 Scope of Quality Assurance

This specification governs all validation operations for NexaMart AI. Testing is executed continuously across a decoupled frontend workspace (Next.js/Vite) and a managed backend infrastructure layer (Supabase/PostgreSQL).

The target exit metric requires a 100% resolution pass rate for all Critical and High-severity vulnerabilities prior to system release.

---

## 2. Automated Testing Environment Config

To achieve reproducible test executions across local development and GitHub Actions CI pipelines, development teams must use the following standard testing commands:

```bash
# Execute isolated unit tests across utilities and components
npm run test:unit

# Run End-to-End (E2E) UI workflow testing suites
npm run test:e2e

# Audit build-ready bundles for strict TypeScript type compliance
npm run build:check
```

---

## 3. Advanced Security & Supabase RLS Validation Scenarios

Security testing must proactively simulate adversarial conditions rather than relying on basic happy-path routing.

### 3.1 Supabase Row Level Security (RLS) Penetration Scenarios

- Cross-tenant prevention: Scripts must deliberately attempt to read or modify database rows in the `orders` or `profiles` tables belonging to alternative user IDs without matching `auth.uid()` JWT payload signatures. The database engine must throw a definitive `403 Access Denied` exception.
- Supervisor account escalation protection: Registration forms must reject injected parameters attempting to pass `role: 'supervisor'` or `role: 'admin'`. Roles must initialize exclusively through automated backend table triggers validated against a whitelist schema.

### 3.2 Automated Malicious Code Injection Audits

- Cross-Site Scripting (XSS): Data forms accepting text entries, such as product descriptions or store summary text, must sanitize and escape HTML such as `<script>window.location.href="..."</script>`.
- SQL injection prevention: Frontend parameter handling must use explicit binding frameworks through the Supabase client API layer, avoiding dynamic query string construction methods.

---

## 4. Integration Testing Strategy: M-Pesa STK Push Workflows

The payment integration workflow requires absolute verification across asynchronous steps:

```text
Client Requests STK Push → Safaricom Sandbox API → User Approves Transaction/PIN → Supabase Webhook Updates Database State
```

1. Simulating disconnected networks: The system must intentionally simulate a connection timeout immediately after a client sends an STK push request, ensuring checkout screens gracefully display a "Checking Status via Safaricom..." polling loop.
2. Asynchronous callback processing: The testing suite must verify that if a user accepts a transaction but closes the browser tab before returning to the storefront, the backend captures the webhook callback, updates the `payments` state to `COMPLETED`, and decrements stock counters automatically.

---

## 5. Production-Grade High-Fidelity Test Case Matrix

| Test ID | Module | Functional Boundary | Scenario | Execution Input Strategy | Expected Outcome |
| --- | --- | --- | --- | --- | --- |
| TC-SEC-001 | Authentication | Supervisor Privilege Escalation Bypass | POST request payload contains `role: "supervisor"` | Inject explicit role field into registration flow | System drops role configuration and defaults the user entry to standard customer permissions |
| TC-PAY-002 | Checkout Engine | M-Pesa Processing Loop Interruption | User triggers STK Push; background network runner drops the connection | Simulate network failure during STK flow | Screen locks duplicate submissions, displays retry loop, and checks status via background webhooks |
| TC-INV-003 | Stock Control | Simultaneous Multi-User Race Condition | Two sessions attempt to checkout the last remaining product unit | Run concurrent checkout requests | First transactional payload commits successfully; second aborts safely with an explicit notification |
| TC-VAL-004 | Form Handling | Special Character SQL Parameter Poisoning | Attempt to input `'; DROP TABLE products; --` in a search field | Submit literal search input | System treats input as a literal string query and safely returns zero matching records |

---

## 6. Performance, Compatibility & Accessibility Targets

### 6.1 Performance Benchmarking Rules

- First Contentful Paint (FCP): Landing screens must populate core text assets within 1.5 seconds over a standard 4G mobile baseline connection.
- Cumulative Layout Shift (CLS): Media elements must declare explicit width and height values or use skeleton containers to guarantee a shift metric below 0.1.

### 6.2 WCAG 2.1 AA Compliance Requirements

- Visual contrast must maintain a ratio greater than or equal to 4.5:1 for regular body text.
- Interactive links and controls must respond reliably to keyboard input via tab order, with visible focus states using `:focus-visible` styling.

---

## 7. Bug Lifecycle & Regression Reporting Protocol

Every discovered defect must be registered as an official tracking issue containing the following details:

> Defect Log Structure Framework Checklist

- **System ID:** Unique identifier such as `BUG-2026-004`
- **Environment:** Context details such as Safari Mobile v19.2 / iOS 19
- **Reproducible Sequence:** Step-by-step actions required to trigger the issue
- **Technical Divergence:** Clear description of expected behavior versus actual output
- **Severity Assignment:** Critical, High, Medium, or Low

---

## 8. Conclusion

This testing specification outlines the official roadmap for certifying the stability, security, and reliability of NexaMart AI. By anchoring validation directly to strict Supabase RLS policies, automated end-to-end integration tracking, and deterministic error fallback logic, the platform ensures a strong customer experience and a maintainable architecture for future enhancements.
