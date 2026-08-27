import { Check } from 'lucide-react';
import { XCircle } from 'lucide-react';

interface OrderTimelineProps {
  status: string;
  paymentStatus: string;
}

const FLOW = ['pending', 'processing', 'shipped', 'delivered'] as const;

const STEPS: { key: string; label: string }[] = [
  { key: 'placed', label: 'Placed' },
  { key: 'paid', label: 'Paid' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

// Visual progress tracker derived entirely from existing order fields —
// no backend changes, purely a presentation of the real lifecycle.
//
// Mapping (FLOW index -> STEPS completion):
//   pending    + unpaid  -> "Placed" done, current step "Paid"
//   pending    + paid    -> "Paid" done,   current step "Processing"
//   processing           -> "Processing" done (payment confirmed to reach here)
//   shipped              -> "Shipped" done
//   delivered            -> all done
export function OrderTimeline({ status, paymentStatus }: OrderTimelineProps) {
  const normalizedStatus = (FLOW as readonly string[]).includes(status) ? status : 'pending';
  const statusIndex = FLOW.indexOf(normalizedStatus as (typeof FLOW)[number]);
  const paid = paymentStatus === 'paid';

  const reached = statusIndex >= 1 ? statusIndex + 1 : paid ? 1 : 0;
  const currentIndex = reached < STEPS.length - 1 ? reached + 1 : -1;

  return (
    <nav aria-label="Order progress" className="bg-card border border-border rounded-xl p-6 mb-6">
      <ol className="flex items-start">
        {STEPS.map((step, i) => {
          const done = i <= reached;
          const isCurrent = i === currentIndex;
          return (
            <li key={step.key} className="flex items-start flex-1 last:flex-none min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                    done
                      ? 'bg-primary border-primary text-primary-foreground'
                      : isCurrent
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {done ? (
                    <Check aria-hidden="true" className="w-4 h-4" />
                  ) : (
                    <span aria-hidden="true" className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-primary' : 'bg-border'}`} />
                  )}
                </div>
                <span
                  className={`text-[11px] sm:text-xs font-medium whitespace-nowrap ${
                    done || isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`flex-1 h-0.5 mt-4 mx-2 min-w-[12px] rounded ${i < reached ? 'bg-primary' : 'bg-border'}`}
                />
              )}
            </li>
          );
        })}
      </ol>
      {!paid && (
        <p className="text-xs text-muted-foreground mt-4 text-center">
          Waiting for payment confirmation — the timeline updates automatically once your payment is received.
        </p>
      )}
    </nav>
  );
}

export function OrderCancelledNotice() {
  return (
    <div
      className="rounded-xl p-4 mb-6 bg-destructive/5 border border-destructive/20 flex items-start gap-3"
      role="alert"
    >
      <XCircle aria-hidden="true" className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-destructive">Order cancelled or payment failed</p>
        <p className="text-sm text-muted-foreground mt-1">
          Reserved stock has been released back to the vendor. You can safely place a new order.
        </p>
      </div>
    </div>
  );
}
