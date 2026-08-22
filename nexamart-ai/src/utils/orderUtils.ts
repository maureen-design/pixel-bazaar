import { supabase } from '../lib/supabaseClient';
import type { DeliveryMethod } from '../components/checkout/DeliveryMethodSelector';

export interface ShippingAddress {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  county: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  vendor_id: string;
  total_amount: number;
  shipping_address: ShippingAddress;
  shipping_cost: number;
  tax_amount: number;
  discount_amount: number;
  status: string;
  payment_status: string;
  payment_method: string;
  delivery_method: string;
  delivery_cost: number;
  payment_type: string;
  payment_deadline: string;
  coupon_id: string | null;
  coupon_code: string | null;
  created_at: string;
}

// Browser submits order intent only. The authoritative order (prices, stock,
// vendor, shipping, tax, discount, totals, order number, payment state) is
// computed by the server-side SECURITY DEFINER RPC public.create_order().
export async function createOrder(
  cartItems: any[],
  shippingAddress: ShippingAddress,
  paymentMethod: string,
  couponCode?: string | null,
  deliveryMethod: DeliveryMethod = 'standard',
  paymentType: 'now' | 'later' = 'now',
): Promise<Order | null> {
  try {
    const items = cartItems.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      variant_id: item.variant_id || null,
      variant_attributes: item.variant_attributes || null,
    }));

    const { data, error } = await supabase
      .rpc('create_order', {
        p_request: {
          items,
          shipping_address: shippingAddress,
          delivery_method: deliveryMethod,
          payment_method: paymentMethod,
          payment_type: paymentType,
          coupon_code: couponCode || null,
        },
      })
      .single();

    if (error) throw error;
    return data as Order;
  } catch (error) {
    console.error('Error creating order:', error);
    return null;
  }
}

export async function releaseStock(orderId: string): Promise<void> {
  try {
    // Delegates to the authoritative, idempotent server-side RPC so that both
    // base stock_quantity and variant-combination stock are restored exactly
    // once. The RPC guards against releasing for paid/delivered/processing/
    // shipped orders and against double-release via orders.stock_released.
    // Not wired into any client polling path on purpose (server callbacks are
    // the authoritative release point to avoid double-releasing).
    await supabase.rpc('release_stock_for_order', { p_order_id: orderId });
  } catch (error) {
    console.error('Error releasing stock:', error);
  }
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .eq('id', orderId)
      .single();

    if (error) throw error;
    return data as Order;
  } catch (error) {
    console.error('Error fetching order:', error);
    return null;
  }
}

export async function getOrdersByUserId(userId: string): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Order[];
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}
