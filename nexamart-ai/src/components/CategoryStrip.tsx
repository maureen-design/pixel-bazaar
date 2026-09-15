import { Link } from 'react-router-dom';
import { useCategories } from '../hooks/useCategories';
import { LayoutGrid } from 'lucide-react';
import { Badge } from './ui/badge';
import { CategoryIcon } from '../utils/categoryIcons';

interface CategoryStripProps {
  selectedCategory: string | null;
  onCategorySelect: (categoryId: string | null) => void;
  counts: Record<string, number>;
}

export function CategoryStrip({ selectedCategory, onCategorySelect, counts }: CategoryStripProps) {
  const { categories, loading } = useCategories({ topLevelOnly: true });

  const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 h-12 w-32 bg-muted rounded-full animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
      <button
        onClick={() => onCategorySelect(null)}
        className={`flex-shrink-0 flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${
          selectedCategory === null
            ? 'bg-gradient-to-r from-brand to-brand-dark text-white shadow-lg shadow-brand/25'
            : 'bg-muted text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        <span>All</span>
        <Badge variant="secondary" className="ml-1">
          {totalCount}
        </Badge>
      </button>

      {categories.map((category) => (
        <div key={category.id} className="flex-shrink-0 flex items-center gap-1">
          <button
            onClick={() => onCategorySelect(category.id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-full font-medium transition-all ${
              selectedCategory === category.id
                ? 'bg-gradient-to-r from-brand to-brand-dark text-white shadow-lg shadow-brand/25'
                : 'bg-muted text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <CategoryIcon slug={category.slug} className="w-4 h-4" />
            <span>{category.name}</span>
            <Badge
              variant={selectedCategory === category.id ? 'default' : 'secondary'}
              className="ml-1"
            >
              {counts[category.id] || 0}
            </Badge>
          </button>
          <Link
            to={`/search?category=${category.id}`}
            className="text-xs font-medium text-primary hover:text-primary/80 hover:underline whitespace-nowrap px-2 py-2 -mr-1"
          >
            See All
          </Link>
        </div>
      ))}
    </div>
  );
}
