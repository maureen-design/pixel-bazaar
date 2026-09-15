import {
  Car,
  Sparkles,
  BookOpen,
  Cpu,
  Smartphone,
  Shirt,
  Sofa,
  Hammer,
  Dumbbell,
  ToyBrick,
  Package,
  ShoppingBag,
  Palette,
  Home,
  Zap,
  Gamepad2,
  Watch,
  Laptop,
  Gem,
  Cake,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryIconOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  { value: 'car', label: 'Automotive', icon: Car },
  { value: 'sparkles', label: 'Beauty', icon: Sparkles },
  { value: 'book-open', label: 'Books', icon: BookOpen },
  { value: 'cpu', label: 'Digital', icon: Cpu },
  { value: 'smartphone', label: 'Electronics', icon: Smartphone },
  { value: 'shirt', label: 'Fashion', icon: Shirt },
  { value: 'sofa', label: 'Home & Living', icon: Sofa },
  { value: 'hammer', label: 'Handmade', icon: Hammer },
  { value: 'dumbbell', label: 'Sports', icon: Dumbbell },
  { value: 'toy-brick', label: 'Toys', icon: ToyBrick },
  { value: 'shopping-bag', label: 'Shopping', icon: ShoppingBag },
  { value: 'palette', label: 'Art', icon: Palette },
  { value: 'home', label: 'Home', icon: Home },
  { value: 'zap', label: 'Energy', icon: Zap },
  { value: 'gamepad-2', label: 'Gaming', icon: Gamepad2 },
  { value: 'watch', label: 'Watches', icon: Watch },
  { value: 'laptop', label: 'Computers', icon: Laptop },
  { value: 'gem', label: 'Jewelry', icon: Gem },
  { value: 'cake', label: 'Food', icon: Cake },
  { value: 'package', label: 'General', icon: Package },
];

const SLUG_ICON_MAP: Record<string, LucideIcon> = {
  automotive: Car,
  beauty: Sparkles,
  books: BookOpen,
  'digital-products': Cpu,
  electronics: Smartphone,
  fashion: Shirt,
  'fashion-mens': Shirt,
  'fashion-womens': Shirt,
  'home-living': Sofa,
  'local-handmade': Hammer,
  shoes: ShoppingBag,
  sports: Dumbbell,
  toys: ToyBrick,
};

const VALUE_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((opt) => [opt.value, opt.icon])
);

export function getCategoryIcon(iconKey?: string, slug?: string): LucideIcon {
  if (iconKey && VALUE_ICON_MAP[iconKey]) return VALUE_ICON_MAP[iconKey];
  if (slug && SLUG_ICON_MAP[slug]) return SLUG_ICON_MAP[slug];
  return Package;
}

export function CategoryIcon({
  icon,
  slug,
  className,
}: {
  icon?: string;
  slug?: string;
  className?: string;
}) {
  const IconComponent = getCategoryIcon(icon, slug);
  return <IconComponent className={className} />;
}
