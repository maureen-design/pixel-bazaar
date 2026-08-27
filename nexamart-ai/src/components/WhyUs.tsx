import { Store, Truck, CreditCard, Sparkles } from 'lucide-react';

const FEATURES = [
  {
    icon: Store,
    title: 'Verified Sellers',
    description: 'Every vendor is vetted and verified for your peace of mind.',
  },
  {
    icon: Truck,
    title: 'Nationwide Delivery',
    description: 'Fast door delivery or convenient pickup stations across Kenya.',
  },
  {
    icon: CreditCard,
    title: 'Secure Payments',
    description: 'Pay instantly with M-Pesa, card, or bank transfer.',
  },
  {
    icon: Sparkles,
    title: 'Smart Recommendations',
    description: 'Tell our AI what you need and get personalized suggestions instantly.',
  },
];

export function WhyUs() {
  return (
    <section className="mb-16" aria-labelledby="why-us-heading">
      <h2 id="why-us-heading" className="text-2xl font-bold mb-6">
        Why Shop With Us?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="bg-card border border-border rounded-xl p-6 transition-all duration-200 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-brand to-brand-dark rounded-xl flex items-center justify-center mb-4">
              <feature.icon aria-hidden="true" className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
            <p className="text-muted-foreground text-sm">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
