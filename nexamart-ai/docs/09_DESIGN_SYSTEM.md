# NexaMart AI — Design System Specification Guide
**Version:** 1.0  
**Status:** Approved / Design System Reference  
**Last Updated:** July 2026  

---

## Table of Contents
1. Executive System Summary
2. Tailwind CSS Typography & Token Configurations
3. The Strict 8-Point Spacing Array Matrix
4. Border Radius, Border Scale & Elevation Levels
5. Component States & Interactive Micro-Animations
6. Accessibility & Contrast Compliance (WCAG 2.1 AA)
7. Production Code Mapping (React & Tailwind Hooks)
8. Conclusion

---

## 1. Executive System Summary

### 1.1 Purpose
This document defines the atomic visual constants, layout parameters, and interactive states for **NexaMart AI**. It acts as the definitive source of truth for the styling layer, providing the exact configurations needed to build a clean, consistent UI across both light and dark modes.

---

## 2. Tailwind CSS Typography & Token Configurations

NexaMart AI utilizes the **Inter** font family as its primary typographic anchor. The system relies on semantic scaling tokens to enforce clean layout patterns:

### 2.1 Typographic Scale Config Table

| Element Name | Tailwind Class Token | Font Weight | Pixel Equivalence | Functional Application |
| :--- | :--- | :--- | :--- | :--- |
| **Display Heading** | `text-4xl tracking-tight` | `font-bold` (700) | 36px / 2.25rem | Hero landing blocks, metrics banners. |
| **Primary Heading 1** | `text-2xl` | `font-bold` (700) | 24px / 1.5rem | Dashboard title frames, main panels. |
| **Subheading 2** | `text-xl` | `font-semibold` (600) | 20px / 1.25rem | Section title cards, mod boxes. |
| **Section Title 3** | `text-lg` | `font-medium` (500) | 18px / 1.125rem | Form section blocks, product cards. |
| **Body Standard** | `text-base` | `font-normal` (400) | 16px / 1.0rem | Descriptive blocks, field strings. |
| **Micro Text / Cap** | `text-xs uppercase` | `font-medium` (500) | 12px / 0.75rem | Meta labels, table headers, logs. |

---

## 3. The Strict 8-Point Spacing Array Matrix

To establish a solid layout rhythm across components, all paddings, margins, gaps, and structural dimensions are restricted to multi-point intervals based on an **8px grid spacing module**:

```
[4px] ──► [8px] ──► [16px] ──► [24px] ──► [32px] ──► [40px] ──► [48px] ──► [64px]
(xs)       (sm)       (md)       (lg)       (xl)       (2xl)      (3xl)      (4xl)
```

| Spacing Token | Tailwind Class Token | Pixel Value | Intended Spatial Use Cases |
| :--- | :--- | :--- | :--- |
| `spacing-xs` | `p-1` / `m-1` / `gap-1` | 4px | Inner elements, icon-to-text separation grids. |
| `spacing-sm` | `p-2` / `m-2` / `gap-2` | 8px | Button interiors, badge boundaries, list spacing. |
| `spacing-md` | `p-4` / `m-4` / `gap-4` | 16px | Product card paddings, grid layouts, system forms. |
| `spacing-lg` | `p-6` / `m-6` / `gap-6` | 24px | Standard dashboard workspace block dividers. |
| `spacing-xl` | `p-8` / `m-8` / `gap-8` | 32px | Checkout container margins, canvas boundaries. |
| `spacing-2xl` | `p-12` / `m-12` | 48px | Empty hero states, onboarding structures. |

---

## 4. Border Radius, Border Scale & Elevation Levels

### 4.1 Rounded Edge Configuration Arrays
* **Small (`rounded-md` — 6px):** Assigned to tight input containers, active checkboxes, and select dropdown nodes.
* **Medium (`rounded-xl` — 10px):** Default element curve applied across all floating product displays, banners, and toast sheets.
* **Large (`rounded-2xl` — 16px):** Large frame structures including administrator dashboard matrices, checkout card modals, and sliding panels.
* **Pill (`rounded-full` — 9999px):** Status indicators, chip items, stock indicators, and interaction icons.

### 4.2 Shadows & Depth Mapping (Elevation Scale)

```
Layer 01: [Base Workspace Canvas] ────► Background surfaces (z-0)
Layer 02: [Content Workspace Cards] ──► Low drop shadow effect (`shadow-sm`, z-10)
Layer 03: [Floating Overlay System] ──► Mid dropdown shadow scale (`shadow-md`, z-30)
Layer 04: [Active System Dialogs] ────► Deep high-contrast shadow layer (`shadow-2xl`, z-50)
```

---

## 5. Component States & Interactive Micro-Animations

Every component must deliver unambiguous visual feedback within **150 milliseconds** of a user interaction.

### 5.1 Button Component Matrix & State Definitions

- **Default Active state:** Clear high-contrast colored boxes using custom palette tokens (`brand-primary`).
- **Hover State Interaction:** Shifts the baseline tone 10% deeper (`hover:bg-sky-500` or `dark:hover:bg-sky-300`) with a smooth easing profile (`transition-colors duration-150 ease-in-out`).
- **Focused Boundary State:** Displays a clear ring wrapper outlining the element container (`focus:ring-2 focus:ring-offset-2 focus:ring-sky-500`) to guarantee high keyboard accessibility tracking.
- **Asynchronous Loading State:** Temporarily locks clicks (`disabled:cursor-not-allowed`), fades opacity to 50%, and swaps text labels out for an active animated looping loading spinner.

---

## 6. Accessibility & Contrast Compliance (WCAG 2.1 AA)

To satisfy academic project compliance standards, all layout structures must adhere to strict accessibility checks:

- **Color Independence:** Color can never be used as the sole identifier for data updates. For instance, input validation failure frames must display an error icon (`AlertCircle`) alongside the red text banner.
- **Semantic Anchor Markup:** Forms must connect explicit label identifiers directly to input fields using matching `id` properties (`<label htmlFor="sku">...<input id="sku" />`).
- **Screen Reader Descriptions:** Icons that lack text labels must include descriptive `aria-label=""` parameters inside their code strings to assist screen reader navigation.

---

## 7. Production Code Mapping (React & Tailwind Hooks)

To ensure your Tailwind CSS configurations are easily maintainable, update your `tailwind.config.js` file with this modular tokens baseline:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enables toggle support via the dark class wrapper
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          success: 'var(--brand-success)',
          error: 'var(--brand-error)',
        },
        background: {
          page: 'var(--background-page)',
          surface: 'var(--background-surface)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
    },
  },
  plugins: [],
}
```

### 7.1 CSS Variables Setup

Create a `globals.css` file with the following color token definitions for seamless light/dark mode switching:

```css
:root {
  --brand-primary: #0284C7;
  --brand-success: #16A34A;
  --brand-error: #DC2626;
  --background-page: #F8FAFC;
  --background-surface: #FFFFFF;
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --border-element: #E2E8F0;
}

:root.dark {
  --brand-primary: #38BDF8;
  --brand-success: #4ADE80;
  --brand-error: #F87171;
  --background-page: #09090B;
  --background-surface: #18181B;
  --text-primary: #FAFAFA;
  --text-secondary: #A1A1AA;
  --border-element: #27272A;
}
```

---

## 8. Conclusion

The NexaMart AI Design System Guide bridges visual concept models and frontend execution. By enforcing an 8-point spacing array, defining uniform component behaviors, mapping out adaptive Tailwind color tokens, and meeting rigorous accessibility requirements, your app's interfaces will remain scalable, highly optimized, and simple to build.
