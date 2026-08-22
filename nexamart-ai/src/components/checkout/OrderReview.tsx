import type { DeliveryMethod } from './DeliveryMethodSelector';
import { getDeliveryBaseCost, getCountySurcharge, type PlatformSettings } from '../../lib/settings';
import type { ShippingAddress } from '../../utils/orderUtils';

interface OrderReviewProps {
  items: any[];
  formData: ShippingAddress;
  deliveryMethod: DeliveryMethod;
  formatPrice: (n: number) => string;
  settings: PlatformSettings;
}

export function OrderReview({ items, formData, deliveryMethod, formatPrice, settings }: OrderReviewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">Shipping Address</h3>
        <div className="bg-muted/30 rounded-lg p-4 text-sm space-y-1 text-muted-foreground">
          <p className="text-foreground font-medium">{formData.full_name}</p>
          <p>{formData.phone}</p>
          <p>{formData.address}</p>
          <p>{formData.city}, {formData.county}</p>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Delivery Method</h3>
        <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
          <p className="text-foreground font-medium capitalize">{deliveryMethod}</p>
          <p>Delivery: {formatPrice(getDeliveryBaseCost(deliveryMethod, settings))}</p>
          {deliveryMethod !== 'pickup' && (
            <p>Location surcharge: {formatPrice(getCountySurcharge(formData.county, settings))}</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Items ({items.length})</h3>
        <div className="space-y-2">
          {items.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between text-sm bg-muted/30 rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-medium truncate">{item.products?.name}</p>
                {item.variant_attributes && (
                  <p className="text-muted-foreground text-xs">{Object.values(item.variant_attributes).join(', ')}</p>
                )}
                <p className="text-muted-foreground">Qty: {item.quantity}</p>
              </div>
              <p className="text-foreground font-semibold ml-4">
                {formatPrice((item.variant_price || item.products?.price || 0) * item.quantity)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
