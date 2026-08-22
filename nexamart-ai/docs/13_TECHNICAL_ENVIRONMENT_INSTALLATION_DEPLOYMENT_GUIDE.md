# NexaMart AI — Technical Environment Installation & Deployment Guide

**Version:** 1.0  
**Status:** Approved / Development Blueprint  
**Last Updated:** July 2026

---

## 1. System Engineering Prerequisites

### 1.1 Local Machine Hardware Baselines

- Processor: Dual-Core x86_64 or ARM64 Architecture (Quad-Core recommended).
- Memory: 8 GB RAM minimum (16 GB highly recommended for handling parallel local servers and compiler watch-modes).
- Storage: 10 GB available SSD space.
- Network: Low-latency internet connection for Supabase cloud sync operations.

### 1.2 Required Software Layers

- Runtime Engine: Node.js (Version 20.x LTS or higher).
- Package Architecture: npm (Version 10.x or higher).
- Version Control: Git.
- Code Editor: Visual Studio Code with Tailwind CSS IntelliSense, ESLint, and Prettier.

---

## 2. Fast-Track Application Bootstrapping

Execute the following sequence in a bash terminal to clone the repository, install dependencies, and prepare the environment file:

```bash
git clone https://github.com/your-username/nexamart-ai.git
cd nexamart-ai
npm install
touch .env
```

---

## 3. Decentralized Cloud Configuration (Supabase & Payments)

### 3.1 Standard Environment Variables Structure

Open the newly created `.env` file in VS Code and configure the following credentials.

> Security Enforcement: Never commit the `.env` file to public repositories. It is protected by the project root `.gitignore` settings.

```env
# Cloud Infrastructure Tokens
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Base Application Metadata
VITE_APP_NAME="NexaMart AI"

# Safaricom Daraja M-Pesa Integration Tokens
VITE_MPESA_CONSUMER_KEY="your_production_consumer_key"
VITE_MPESA_CONSUMER_SECRET="your_production_consumer_secret"
VITE_MPESA_PASSKEY="bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
VITE_CALLBACK_URL="https://your-api-domain.com/hooks/mpesa-callback"

# SMTP Transactional Mailer Profiles
SMTP_HOST="smtp.mailtrap.io"
SMTP_PORT="587"
SMTP_USER="your-sandbox-username"
SMTP_PASSWORD="your-sandbox-password"
```

### 3.2 Cloud Storage Bucket Allocation Map

Before running file transactions, access the Supabase storage dashboard and create the following buckets with the specified security rules:

| Bucket Name | Public Read Access | Intended Storage Payload |
| --- | --- | --- |
| avatars | TRUE | Customer and vendor profile thumbnails |
| product-images | TRUE | High-fidelity product imagery |
| vendor-logos | TRUE | Merchant branding assets |
| documents | FALSE | Confidential vendor compliance documents |

---

## 4. Launching the Local Engine

To start the local Vite development server, run:

```bash
npm run dev
```

The console will output the local URL, typically `http://localhost:5173`. Open this link in the browser to verify the application.

---

## 5. Standard Troubleshooting Protocols

- Build Crash / TypeScript Blockers: Remove local node modules, clear the npm cache, and reinstall dependencies.
- Storage Upload Returns 403 Unauthorized: Verify that Supabase Row Level Security (RLS) is enabled and that the authenticated user has the correct bucket write permissions.

```bash
rm -rf node_modules package-lock.json && npm cache clean --force
npm install
```

---

## 6. Conclusion

This environment installation specification provides a reproducible engineering baseline. By following the setup steps, environment variables, and storage mappings in this guide, teams can maintain a standardized workspace across local development, testing, and production deployment.
