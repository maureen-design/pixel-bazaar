import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductGalleryProps {
  images: string[];
  productName: string;
  activeIndex: number;
  onIndexChange: (index: number) => void;
  variantLabel?: string;
  categorySlug?: string;
}

const DEFAULT_VIEW_LABELS = ['Front', 'Back', 'Side', 'Detail'];

const VIEW_LABELS: Record<string, string[]> = {
  fashion: ['Front', 'Back', 'Side', 'Detail'],
  'fashion-mens': ['Front', 'Back', 'Side', 'Detail'],
  'fashion-womens': ['Front', 'Back', 'Side', 'Detail'],
  shoes: ['Side', 'Front', 'Back', 'Sole'],
  bags: ['Front', 'Back', 'Interior', 'Detail'],
  'home-living': ['Front', 'Side', 'Back', 'Detail'],
  electronics: ['Front', 'Back', 'Side', 'Ports'],
  books: ['Cover', 'Back', 'Preview'],
};

function viewDescription(index: number, count: number, categorySlug?: string): string {
  if (count === 4) {
    const labels = VIEW_LABELS[categorySlug || ''] || DEFAULT_VIEW_LABELS;
    const label = labels[index];
    if (label) return `${label} view`;
  }
  return `View ${index + 1} of ${count}`;
}

export function ProductGallery({
  images,
  productName,
  activeIndex,
  onIndexChange,
  variantLabel,
  categorySlug,
}: ProductGalleryProps) {
  const reduceMotion = useReducedMotion();
  const count = images.length;

  if (count === 0) return null;

  const safeIndex = Math.min(Math.max(activeIndex, 0), count - 1);
  const hasMultiple = count > 1;

  const nameWithVariant = variantLabel ? `${variantLabel} ${productName}` : productName;
  const currentView = viewDescription(safeIndex, count, categorySlug);
  const mainAlt = hasMultiple ? `${nameWithVariant}, ${currentView}` : nameWithVariant;
  const statusText = hasMultiple ? `${nameWithVariant}, ${currentView}` : nameWithVariant;

  const handlePrev = () => {
    if (safeIndex > 0) onIndexChange(safeIndex - 1);
  };

  const handleNext = () => {
    if (safeIndex < count - 1) onIndexChange(safeIndex + 1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasMultiple) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  return (
    <div className="w-full">
      <div
        role="group"
        aria-roledescription="image gallery"
        aria-label={`${productName} image gallery`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative aspect-square bg-card rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={safeIndex}
            src={images[safeIndex]}
            alt={mainAlt}
            draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          />
        </AnimatePresence>

        {hasMultiple && (
          <>
            <motion.div
              className="absolute inset-0 z-[5] cursor-grab active:cursor-grabbing"
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.x < -48 || info.velocity.x < -400) handleNext();
                else if (info.offset.x > 48 || info.velocity.x > 400) handlePrev();
              }}
            />

            <button
              type="button"
              onClick={handlePrev}
              disabled={safeIndex === 0}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-card/80 backdrop-blur-sm border border-border text-foreground shadow-sm flex items-center justify-center hover:bg-card disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronLeft aria-hidden="true" className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={safeIndex === count - 1}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-card/80 backdrop-blur-sm border border-border text-foreground shadow-sm flex items-center justify-center hover:bg-card disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronRight aria-hidden="true" className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto pb-1 mt-4">
          {images.map((image, index) => {
            const active = index === safeIndex;
            const label = `${viewDescription(index, count, categorySlug)} of ${nameWithVariant}`;
            return (
              <button
                key={index}
                type="button"
                onClick={() => onIndexChange(index)}
                aria-label={label}
                aria-current={active ? 'true' : undefined}
                className={`w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg overflow-hidden border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active
                    ? 'border-primary ring-2 ring-primary/40'
                    : 'border-border hover:border-muted-foreground/60'
                }`}
              >
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {statusText}
      </span>
    </div>
  );
}
