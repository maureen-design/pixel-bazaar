import { useState } from 'react';
import { Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { GuestAuthPrompt } from './GuestAuthPrompt';

interface WishlistButtonProps {
  productId: string;
  className?: string;
  variant?: 'default' | 'icon';
}

export function WishlistButton({ productId, className = '', variant = 'icon' }: WishlistButtonProps) {
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const { user } = useAuth();
  const location = useLocation();
  const [promptOpen, setPromptOpen] = useState(false);
  const inWishlist = isInWishlist(productId);

  const nextPath = `${location.pathname}${location.search}`;

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setPromptOpen(true);
      return;
    }
    if (inWishlist) {
      await removeFromWishlist(productId);
    } else {
      await addToWishlist(productId);
    }
  };

  if (variant === 'default') {
    return (
      <>
        <button
          onClick={handleToggle}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            inWishlist
              ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
          } ${className}`}
        >
          <Heart aria-hidden="true" className={`w-5 h-5 ${inWishlist ? 'fill-destructive' : ''}`} />
          {inWishlist ? 'Remove from Wishlist' : 'Add to Wishlist'}
        </button>
        <GuestAuthPrompt open={promptOpen} onOpenChange={setPromptOpen} nextPath={nextPath} />
      </>
    );
  }

  return (
    <>
      <motion.button
        onClick={handleToggle}
        whileTap={{ scale: 0.85 }}
        animate={{ scale: inWishlist ? [1, 1.3, 1] : 1 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className={`p-2 rounded-full transition-colors ${
          inWishlist
            ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
            : 'bg-black/40 text-white hover:bg-black/60'
        } ${className}`}
        aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      >
          <Heart aria-hidden="true" className={`w-5 h-5 ${inWishlist ? 'fill-destructive' : ''}`} />
        </motion.button>
      <GuestAuthPrompt open={promptOpen} onOpenChange={setPromptOpen} nextPath={nextPath} />
    </>
  );
}
