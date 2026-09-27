import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

interface WishlistItem {
  id: string;
  product_id: string;
  products: {
    id: string;
    name: string;
    slug: string;
    price: number;
    compare_price?: number;
    images: string[];
    rating: number;
    stock_quantity: number;
    vendor_id: string;
    vendor?: {
      id: string;
      store_name: string;
    };
  };
}

interface WishlistContextType {
  wishlistItems: WishlistItem[];
  wishlistCount: number;
  isLoading: boolean;
  addToWishlist: (productId: string) => Promise<void>;
  removeFromWishlist: (productId: string) => Promise<void>;
  isInWishlist: (productId: string) => boolean;
  refreshWishlist: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const wishlistCount = wishlistItems.length;

  const fetchWishlist = useCallback(async () => {
    if (!user) {
      setWishlistItems([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('wishlist_items')
        .select(`
          *,
          products (
            id,
            name,
            slug,
            price,
            compare_price,
            images,
            rating,
            stock_quantity,
            vendor_id,
            vendor:vendors (
              id,
              store_name
            )
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      setWishlistItems(data || []);
    } catch (error) {
      console.error('Error fetching wishlist:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const addToWishlist = async (productId: string) => {
    if (!user) {
      toast.error('Please sign in to add items to your wishlist');
      return;
    }

    try {
      const { error } = await supabase
        .from('wishlist_items')
        .insert({ user_id: user.id, product_id: productId });

      if (error) throw error;

      await fetchWishlist();
      toast.success('Added to wishlist!');
    } catch (error: any) {
      if (error.code === '23505') {
        toast.success('Already in wishlist!');
      } else {
        toast.error(error.message || 'Failed to add to wishlist');
      }
    }
  };

  const removeFromWishlist = async (productId: string) => {
    const removed = wishlistItems.find(item => item.product_id === productId);
    setWishlistItems(prev => prev.filter(item => item.product_id !== productId));

    try {
      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('user_id', user?.id)
        .eq('product_id', productId);

      if (error) throw error;
      toast.success('Removed from wishlist', {
        action: removed ? {
          label: 'Undo',
          onClick: async () => {
            await supabase
              .from('wishlist_items')
              .insert({ user_id: user?.id, product_id: productId });
            await fetchWishlist();
          },
        } : undefined,
      });
    } catch (error: any) {
      if (removed) setWishlistItems(prev => [...prev, removed]);
      toast.error(error.message || 'Failed to remove from wishlist');
    }
  };

  const isInWishlist = (productId: string): boolean => {
    return wishlistItems.some(item => item.product_id === productId);
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlistItems,
        wishlistCount,
        isLoading,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        refreshWishlist: fetchWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
}
