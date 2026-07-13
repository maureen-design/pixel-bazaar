# NexaMart AI

NexaMart AI is a modern AI-assisted multi-vendor e-commerce platform designed to connect customers with vendors through a secure, responsive, and user-friendly marketplace experience.

## 📁 Project Documentation Registry

This repository maintains a comprehensive, production-grade documentation suite tracking the architectural engineering and design lifecycle of NexaMart AI:

### 🖥️ System Architecture & Database Foundations
- [04_DATABASE_SCHEMA.md](./docs/04_DATABASE_SCHEMA.md) — 3NF PostgreSQL schema specifications, relational keys, and data types.
- [05_SYSTEM_ARCHITECTURE.md](./docs/05_SYSTEM_ARCHITECTURE.md) — Multi-vendor microservice boundaries, environment maps, and hosting footprints.
- [06_ERD_DOCUMENTATION.md](./docs/06_ERD_DOCUMENTATION.md) — Logical database relationships modeled using text-based Crow's Foot Notation.

### 🎨 UI/UX Design System Blueprints
- [07_PRODUCT_DESIGN.md](./docs/07_PRODUCT_DESIGN.md) — Brand identity, user experience design philosophies, and core target user journeys.
- [08_UI_UX_BLUEPRINT.md](./docs/08_UI_UX_BLUEPRINT.md) — Responsive desktop/mobile viewport wireframe layouts and interface grids.
- [09_DESIGN_SYSTEM.md](./docs/09_DESIGN_SYSTEM.md) — Tailwind CSS styling tokens, typography scales, and strict 8-point spacing arrays.
- [10_COMPONENT_INVENTORY.md](./docs/10_COMPONENT_INVENTORY.md) — Reusable React/Next.js atomic component property definitions and TypeScript contracts.

### 🛡️ Quality Assurance & System Verification
- [11_QUALITY_ASSURANCE_TESTING_SPECIFICATION.md](./docs/11_QUALITY_ASSURANCE_TESTING_SPECIFICATION.md) — Security penetrations, automated test sequences, Supabase RLS isolation, and M-Pesa STK push integration edge cases.

### 📘 User Operations & Support
- [12_USER_MANUAL.md](./docs/12_USER_MANUAL.md) — Step-by-step instructions for customers, vendors, and administrators covering access, workflows, troubleshooting, and support.

### ⚙️ Environment Setup & Deployment
- [13_TECHNICAL_ENVIRONMENT_INSTALLATION_DEPLOYMENT_GUIDE.md](./docs/13_TECHNICAL_ENVIRONMENT_INSTALLATION_DEPLOYMENT_GUIDE.md) — Local environment requirements, Supabase configuration, deployment steps, and troubleshooting guidance.

### 🎤 Presentation Materials
- [14_PRESENTATION_SCRIPT.md](./docs/14_PRESENTATION_SCRIPT.md) — Full presentation script for showcasing NexaMart AI to academic reviewers and stakeholders.

### 📄 Full-Stack Project Report
- [15_FULL_STACK_PROJECT_REPORT.md](./docs/15_FULL_STACK_PROJECT_REPORT.md) — Comprehensive engineering report covering architecture, database design, security, testing, and project outcomes.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
