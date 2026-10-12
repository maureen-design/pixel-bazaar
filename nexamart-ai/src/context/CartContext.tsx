import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';
import type { ProductVariants } from '../types';

const GUEST_CART_KEY = 'nexamart_guest_cart';

export interface GuestProductSnapshot {
  id: string;
  name: string;
  price: number;
  images: string[];
  stock_quantity: number;
  vendor_id?: string;
  variants?: ProductVariants;
}

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  user_id: string;
  variant_id?: string;
  variant_attributes?: Record<string, string>;
  variant_price?: number;
  products?: GuestProductSnapshot;
}

interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  cartTotal: number;
  loading: boolean;
  addToCart: (
    productId: string,
    quantity: number,
    variantId?: string,
    variantAttributes?: Record<string, string>,
    variantPrice?: number,
    productSnapshot?: GuestProductSnapshot
  ) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function loadGuestCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveGuestCart(items: CartItem[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable (e.g. private mode) — cart stays in memory
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const mergingRef = useRef(false);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + (item.variant_price ?? item.products?.price ?? 0) * item.quantity, 0);

  const fetchCart = async () => {
    if (!user) {
      setCartItems(loadGuestCart());
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          *,
          products (*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      setCartItems(data || []);
    } catch (error) {
      console.error('Error fetching cart:', error);
    } finally {
      setLoading(false);
    }
  };

  const mergeGuestCart = async () => {
    if (mergingRef.current) return;
    const guestItems = loadGuestCart();
    if (guestItems.length === 0) {
      await fetchCart();
      return;
    }
    if (!user) return;

    mergingRef.current = true;
    try {
      setLoading(true);

      const { data: serverItems, error } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;

      const serverList = serverItems || [];
      for (const guestItem of guestItems) {
        const existing = serverList.find(
          (item) =>
            item.product_id === guestItem.product_id &&
            (item.variant_id || null) === (guestItem.variant_id || null)
        );

        if (existing) {
          // Cap merged quantity at available stock
          const stock = guestItem.products?.stock_quantity ?? existing.products?.stock_quantity ?? Infinity;
          const cappedQty = Math.min(existing.quantity + guestItem.quantity, stock);
          const { error: updErr } = await supabase
            .from('cart_items')
            .update({ quantity: cappedQty })
            .eq('id', existing.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await supabase
            .from('cart_items')
            .insert({
              user_id: user.id,
              product_id: guestItem.product_id,
              quantity: guestItem.quantity,
              variant_id: guestItem.variant_id || null,
              variant_attributes: guestItem.variant_attributes || null,
              variant_price: guestItem.variant_price ?? null,
            });
          if (insErr) throw insErr;
        }
      }

      localStorage.removeItem(GUEST_CART_KEY);
      await fetchCart();
    } catch (error) {
      console.error('Failed to merge guest cart:', error);
      toast.error('We could not sync your cart. Your items are still saved on this device.');
      setCartItems(guestItems);
      setLoading(false);
    } finally {
      mergingRef.current = false;
    }
  };

  useEffect(() => {
    if (isLoading) return;

    const userId = user?.id ?? null;
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    // Initial auth resolution: just load whatever cart applies.
    if (prev === undefined) {
      fetchCart();
      return;
    }

    // Guest -> authenticated transition (login/signup): merge guest cart, then fetch.
    if (prev === null && userId) {
      mergeGuestCart();
    } else if (prev !== null && userId === null) {
      // Signed out -> back to guest mode.
      setCartItems(loadGuestCart());
      setLoading(false);
    } else if (userId) {
      // Same user (or switched user) while authenticated: refetch.
      fetchCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  const addToCart = async (
    productId: string,
    quantity: number,
    variantId?: string,
    variantAttributes?: Record<string, string>,
    variantPrice?: number,
    productSnapshot?: GuestProductSnapshot
  ) => {
    if (!user) {
      const guestItems = loadGuestCart();
      const existing = guestItems.find(
        (item) =>
          item.product_id === productId &&
          (item.variant_id || null) === (variantId || null)
      );

      let nextItems: CartItem[];
      if (existing) {
        nextItems = guestItems.map((item) =>
          item.id === existing.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      } else {
        nextItems = [
          ...guestItems,
          {
            id: `${productId}:${variantId || 'base'}`,
            product_id: productId,
            quantity,
            user_id: '',
            variant_id: variantId,
            variant_attributes: variantAttributes,
            variant_price: variantPrice,
            products: productSnapshot,
          },
        ];
      }

      saveGuestCart(nextItems);
      setCartItems(nextItems);
      toast.success('Added to cart', {
        action: { label: 'View Cart', onClick: () => navigate('/cart') },
      });
      return;
    }

    try {
      // Check if item already exists in cart (same product + same variant)
      const existingItem = cartItems.find(
        (item) =>
          item.product_id === productId &&
          (item.variant_id || null) === (variantId || null)
      );

      if (existingItem) {
        // Update quantity
        const newQuantity = existingItem.quantity + quantity;
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: newQuantity })
          .eq('id', existingItem.id);

        if (error) throw error;
      } else {
        // Add new item
        const { error } = await supabase
          .from('cart_items')
          .insert({
            user_id: user.id,
            product_id: productId,
            quantity,
            variant_id: variantId || null,
            variant_attributes: variantAttributes || null,
            variant_price: variantPrice || null,
          });

        if (error) throw error;
      }

      await fetchCart();
      toast.success('Added to cart', {
        action: { label: 'View Cart', onClick: () => navigate('/cart') },
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to add to cart');
    }
  };

  const removeFromCart = async (itemId: string) => {
    // Capture the item so the confirmation can offer a one-tap Undo. addToCart
    // is declared above, so re-adding the same product/variant rebuilds the row.
    const removed = cartItems.find((item) => item.id === itemId);
    const undoAction = removed
      ? {
          action: {
            label: 'Undo',
            onClick: () =>
              addToCart(
                removed.product_id,
                removed.quantity,
                removed.variant_id,
                removed.variant_attributes,
                removed.variant_price,
                removed.products
              ),
          },
        }
      : undefined;

    if (!user) {
      const nextItems = loadGuestCart().filter((item) => item.id !== itemId);
      saveGuestCart(nextItems);
      setCartItems(nextItems);
      toast.success('Removed from cart', undoAction);
      return;
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      await fetchCart();
      toast.success('Removed from cart', undoAction);
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove item');
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (!user) {
      if (quantity < 1) {
        await removeFromCart(itemId);
        return;
      }
      const nextItems = loadGuestCart().map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      );
      saveGuestCart(nextItems);
      setCartItems(nextItems);
      return;
    }

    if (quantity < 1) {
      await removeFromCart(itemId);
      return;
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity })
        .eq('id', itemId);

      if (error) throw error;
      await fetchCart();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update quantity');
    }
  };

  const clearCart = async () => {
    if (!user) {
      saveGuestCart([]);
      setCartItems([]);
      return;
    }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      await fetchCart();
    } catch (error: any) {
      toast.error(error.message || 'Failed to clear cart');
    }
  };

  const refreshCart = async () => {
    await fetchCart();
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        cartCount,
        cartTotal,
        loading,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
