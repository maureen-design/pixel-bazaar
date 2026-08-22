# NexaMart AI — Reusable UI Component Inventory Spec Sheet
**Version:** 1.0  
**Status:** Approved / Core Frontend Reference  
**Last Updated:** July 2026  

---

## Table of Contents
1. Directory Tree & Architecture Mapping
2. Core Layout & Container Blueprints
3. High-Fidelity Type Definitions & Prop Interfaces
4. Asynchronous Feedback Frameworks
5. System Accessibility Checklist (WCAG 2.1 AA)
6. Component Reusability & Guardrail Rules

---

## 1. Directory Tree & Architecture Mapping

To maintain full separation of concerns, all component files are arranged using a modular, domain-driven structure under the `src/components/` root path:

```
src/components/
├── ui/                     # Atomic, low-level headless elements (Shadcn pattern)
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Table.tsx
│   ├── Badge.tsx
│   └── Dialog.tsx
├── layout/                 # Structural containers and view-wrappers
│   ├── AppLayout.tsx
│   ├── Navbar.tsx
│   └── Sidebar.tsx
├── dashboard/              # Analytics panels, widgets, and activity feeds
│   ├── StatisticsCard.tsx
│   └── AnalyticsChart.tsx
├── commerce/               # Product loops, galleries, and checkout elements
│   ├── ProductCard.tsx
│   ├── ProductFilter.tsx
│   └── OrderSummary.tsx
└── feedback/               # Async notifications, placeholders, and screens
    ├── Skeleton.tsx
    └── EmptyState.tsx
```

---

## 2. Core Layout & Container Blueprints

### 2.1 The Global `AppLayout` Shell

Every dashboard route inside the application structure dynamically loads via the generic layout shell to preserve active visual state structures.

```
┌────────────────────────────────────────────────────────┐
│                        NAVBAR                          │
├───────────┬────────────────────────────────────────────┤
│           │                                            │
│           │            BREADCRUMB HEADER               │
│           │ ────────────────────────────────────────── │
│  SIDEBAR  │                                            │
│  (Nav)    │                                            │
│           │            MAIN CONTENT AREA               │
│           │            (Dynamic Page Wrapper)          │
│           │                                            │
│           │                                            │
└───────────┴────────────────────────────────────────────┘
```

---

## 3. High-Fidelity Type Definitions & Prop Interfaces

These strict TypeScript type contracts must be implemented across your React components to prevent runtime boundary crashes.

### 3.1 `Button` Component Interface (`src/components/ui/Button.tsx`)

```typescript
import { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}
```

### 3.2 `ProductCard` Component Interface (`src/components/commerce/ProductCard.tsx`)

```typescript
export interface ProductCardProps {
  id: string;
  title: string;
  price: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  vendorName: string;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  badgeLabel?: 'New' | 'Sale' | 'Featured' | 'Best Seller';
  onAddToCart: (id: string) => void;
  onToggleWishlist: (id: string) => void;
}
```

### 3.3 `StatisticsCard` Component Interface (`src/components/dashboard/StatisticsCard.tsx`)

```typescript
import { ReactNode } from 'react';

export interface StatisticsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend: {
    direction: 'up' | 'down' | 'neutral';
    percentage: number;
    timeframeString: string;
  };
}
```

### 3.4 `Input` Component Interface (`src/components/ui/Input.tsx`)

```typescript
import { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  variant?: 'default' | 'filled';
  fullWidth?: boolean;
}
```

### 3.5 `Table` Component Interface (`src/components/ui/Table.tsx`)

```typescript
export interface TableProps {
  columns: TableColumn[];
  data: Record<string, any>[];
  isLoading?: boolean;
  onRowClick?: (row: Record<string, any>) => void;
  variant?: 'striped' | 'bordered' | 'compact';
}

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  renderer?: (value: any) => React.ReactNode;
}
```

---

## 4. Asynchronous Feedback Frameworks

### 4.1 Skeleton Screen Loading Rules

- Data cards awaiting asynchronous resolution fetches must swap their actual child layouts with matching `<Skeleton />` shimmering container elements.
- The element dimensions must mirror the loading data structure's exact layout outline to eliminate layout shifts (Cumulative Layout Shift) once resolved.

```typescript
// Example implementation
export function ProductCardSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}
```

### 4.2 Empty State Structural Rules

When database arrays or query filters return an empty list, your view must display a standard `<EmptyState />` layout containing exactly these fields:

1. **Icon Focus:** A large, muted gray semantic action icon centered at the top.
2. **Title Block:** A direct summary description (e.g., `"No Matching Products Found"`).
3. **Description Text:** Optional secondary context line (e.g., `"Try adjusting your filters or search terms"`).
4. **Action Trigger:** A primary clear route interaction button (e.g., `"Clear Active Filters"`).

```typescript
// Example empty state component
export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 text-gray-400">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {description}
        </p>
      )}
      {actionLabel && (
        <Button onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
```

---

## 5. System Accessibility Checklist (WCAG 2.1 AA)

All core interactive UI elements must implement these baseline screen-reader and keyboard mappings:

- **Focus States:** Every text input, checkbox, selection menu, and action link wrapper must render a bold visible ring on keyboard focus (`focus-visible:ring-2 focus-visible:ring-sky-500`).
- **ARIA Parameters:** Interactive elements that expand or trigger dropdown layers must declare contextual expansion attributes (`aria-expanded="true"`, `aria-controls="dropdown-panel-id"`).
- **Form Relationships:** All entry components must explicitly attach to descriptive title text arrays via linked matching identifier tags (`<label htmlFor="price-field">` linking directly to `<input id="price-field">`).
- **Color + Icon Indicators:** Error states must combine red text with an icon symbol (e.g., `AlertCircle`) rather than relying solely on color coding.
- **Screen Reader Text:** Buttons with icon-only content must include descriptive `aria-label` attributes (e.g., `aria-label="Add to cart"`).

### 5.1 Form Accessibility Template

```typescript
// Accessible form field pattern
export function FormField({
  label,
  id,
  error,
  required,
  ...inputProps
}: FormFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className="focus-visible:ring-2 focus-visible:ring-sky-500"
        {...inputProps}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle size={16} />
          {error}
        </p>
      )}
    </div>
  );
}
```

---

## 6. Component Reusability & Guardrail Rules

### 6.1 The Single Responsibility Rule
If a component begins handling unrelated calculations, it must be decomposed into simpler, presentation-only subcomponents.

**❌ Anti-pattern:**
```typescript
// Bad: Component handling too many concerns
export function ProductManager() {
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState({});
  const [sortOrder, setSortOrder] = useState('asc');
  
  // Sorting logic
  const sortedProducts = products.sort(/* ... */);
  
  // Filtering logic
  const filteredProducts = sortedProducts.filter(/* ... */);
  
  // Calculations
  const totalValue = filteredProducts.reduce(/* ... */);
  
  return <div>{/* JSX here */}</div>;
}
```

**✅ Preferred pattern:**
```typescript
// Good: Separated concerns
export function ProductManager() {
  const { products } = useProducts();
  const { filteredProducts } = useProductFilters(products);
  const { sortedProducts } = useProductSort(filteredProducts);
  
  return <ProductList products={sortedProducts} />;
}

export function ProductList({ products }: { products: Product[] }) {
  return (
    <div>
      {products.map(p => <ProductCard key={p.id} {...p} />)}
    </div>
  );
}
```

### 6.2 No Data-Fetch Overloading
Reusable UI components found in `src/components/ui/` should remain entirely presentation-focused. Pass state variables and event handling triggers downstream exclusively using clean React props.

**Rule:** Do not fetch data inside `ui/` components. All data should be resolved at the page level using hooks and passed down as props.

### 6.3 No Direct String Styling
Avoid styling variables in local component logic code blocks. Centralize global color adjustments inside `tailwind.config.js` token definitions.

**❌ Anti-pattern:**
```typescript
const buttonColor = isDark ? '#38BDF8' : '#0284C7';
return <button style={{ backgroundColor: buttonColor }}>Click</button>;
```

**✅ Preferred pattern:**
```typescript
return (
  <button className="bg-brand-primary hover:bg-sky-500 dark:bg-sky-400">
    Click
  </button>
);
```

---

## Conclusion

This Component Inventory Spec Sheet establishes the baseline for all reusable UI elements in NexaMart AI. By maintaining strict TypeScript contracts, enforcing single-responsibility patterns, and adhering to accessibility standards, your component library will remain scalable, maintainable, and accessible across all user interfaces.
