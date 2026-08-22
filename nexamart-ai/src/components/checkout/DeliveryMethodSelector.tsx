import { Truck, Zap, Store } from 'lucide-react';
import { formatPrice } from '../../config/pricing';
import {
  getDeliveryBaseCost,
  getCountySurcharge,
  type DeliveryMethod,
  type PlatformSettings,
} from '../../lib/settings';

export type { DeliveryMethod } from '../../lib/settings';

interface DeliveryOption {
  id: DeliveryMethod;
  label: string;
  description: string;
  icon: typeof Truck;
  eta: string;
  enabled: boolean;
}

export function DeliveryMethodSelector({
  value,
  onChange,
  county,
  settings,
}: {
  value: DeliveryMethod;
  onChange: (v: DeliveryMethod) => void;
  county: string;
  settings: PlatformSettings;
}) {
  const surcharge = county ? getCountySurcharge(county, settings) : 0;

  const options: DeliveryOption[] = [
    { id: 'standard', label: 'Standard Delivery', description: 'Delivered to your doorstep', icon: Truck, eta: '2-4 days', enabled: true },
    { id: 'express', label: 'Express Delivery', description: 'Fast-tracked delivery', icon: Zap, eta: 'Same day', enabled: settings.expressEnabled },
    { id: 'pickup', label: 'Pickup', description: 'Pick up from our location', icon: Store, eta: '1-2 days', enabled: settings.pickupEnabled },
  ];

  const visible = options.filter((opt) => opt.enabled);

  return (
    <div className="space-y-3">
      {visible.map(opt => {
        const Icon = opt.icon;
        const base = getDeliveryBaseCost(opt.id, settings);
        const total = opt.id === 'pickup' ? 0 : base + surcharge;
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all text-left ${
              selected ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
            }`}
          >
            <div className={`w-12 h-12 ${selected ? 'bg-primary' : 'bg-muted'} rounded-lg flex items-center justify-center`}>
              <Icon className={`w-6 h-6 ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1">
              <p className="font-medium">{opt.label}</p>
              <p className="text-sm text-muted-foreground">{opt.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">ETA: {opt.eta}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{total === 0 ? 'Free' : formatPrice(total)}</p>
              {county && opt.id !== 'pickup' && (
                <p className="text-xs text-muted-foreground">incl. {formatPrice(surcharge)} surcharge</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
