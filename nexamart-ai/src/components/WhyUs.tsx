import { Store, Truck, CreditCard, Sparkles, Headphones } from 'lucide-react';

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
  {
    icon: Headphones,
    title: '24/7 Support',
    description: 'Our team is always here to help with any questions or issues.',
  },
];

export function WhyUs() {
  return (
    <section className="mb-16" aria-labelledby="why-us-heading">
      <h2 id="why-us-heading" className="text-2xl font-bold mb-6">
        Why Shop With Us?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="bg-card border border-border rounded-xl p-5 transition-all duration-200 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-dark rounded-lg flex items-center justify-center mb-3">
              <feature.icon aria-hidden="true" className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-foreground text-sm mb-1">{feature.title}</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
