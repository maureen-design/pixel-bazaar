import { ShoppingBag, Store, Sparkles, CreditCard, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InformationalPage } from '../components/InformationalPage';
import { useSettings } from '../hooks/useSettings';
import { useMarketplaceStats } from '../hooks/useMarketplaceStats';

const STEPS = [
  'Customers browse categories, search, or ask the AI assistant to discover products.',
  'Every product belongs to a vendor — trusted sellers are verified before they list.',
  'At checkout you choose delivery (door delivery or pickup) and see the full cost breakdown.',
  'You pay using M-Pesa, card, bank transfer, or Pay Later.',
  'Your order status is tracked until it is delivered, and reserved stock is released automatically if payment is not completed.',
];

const DIFFERENTIATORS = [
  {
    icon: Store,
    title: 'Multi-vendor marketplace',
    description: 'Many independent sellers in one place, so you can compare and choose freely.',
  },
  {
    icon: CheckCircle2,
    title: 'Verified vendors',
    description: 'Sellers are reviewed and verified by the marketplace before listing products.',
  },
  {
    icon: Sparkles,
    title: 'AI-assisted discovery',
    description: 'Describe what you need in plain language and our assistant finds matching products.',
  },
  {
    icon: CreditCard,
    title: 'Flexible payments',
    description: 'M-Pesa, card via a secure hosted checkout, bank transfer, or Pay Later.',
  },
];

export function About() {
  const { settings } = useSettings();
  const { productCount, vendorCount } = useMarketplaceStats();

  return (
    <InformationalPage
      title={`About ${settings.siteName}`}
      subtitle={settings.siteDescription}
    >
      <section aria-labelledby="about-intro">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-brand to-brand-dark rounded-2xl flex items-center justify-center flex-shrink-0">
            <ShoppingBag aria-hidden="true" className="w-7 h-7 text-white" />
          </div>
          <p className="text-lg font-medium text-foreground">
            {settings.siteName} is a multi-vendor online marketplace.
          </p>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Instead of buying from a single shop, our customers browse a curated catalogue of
          products from many independent vendors — all in one store, with one cart, one checkout,
          and one consistent experience.
        </p>
      </section>

      <section aria-labelledby="about-mission">
        <h2 id="about-mission" className="text-xl font-semibold mb-3">Our mission</h2>
        <p className="text-muted-foreground leading-relaxed">
          Our mission is simple: make it easy to find what you need and buy it with confidence.
          We bring trustworthy sellers together on one platform, keep pricing and delivery clear
          up front, and use AI to help customers describe what they are looking for in their own
          words — then find it.
        </p>
      </section>

      <section aria-labelledby="about-how">
        <h2 id="about-how" className="text-xl font-semibold mb-4">How the marketplace works</h2>
        <ol className="space-y-3">
          {STEPS.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand/10 text-brand text-sm font-bold flex items-center justify-center mt-0.5">
                {index + 1}
              </span>
              <span className="text-muted-foreground leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="about-different">
        <h2 id="about-different" className="text-xl font-semibold mb-4">
          What makes {settings.siteName} different
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DIFFERENTIATORS.map((item) => (
            <div key={item.title} className="bg-card border border-border rounded-xl p-5">
              <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-dark rounded-lg flex items-center justify-center mb-3">
                <item.icon aria-hidden="true" className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {(productCount !== null || vendorCount !== null) && (
        <section aria-labelledby="about-today" className="bg-card border border-border rounded-xl p-6">
          <h2 id="about-today" className="text-xl font-semibold mb-1">The marketplace today</h2>
          <p className="text-sm text-muted-foreground mb-4">Live numbers from the platform.</p>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div>
              <div className="text-3xl font-bold text-foreground">
                {productCount === null ? '—' : productCount.toLocaleString('en-KE')}
              </div>
              <div className="text-sm text-muted-foreground">Products online</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-foreground">
                {vendorCount === null ? 'Verified' : vendorCount.toLocaleString('en-KE')}
              </div>
              <div className="text-sm text-muted-foreground">
                {vendorCount === null ? 'Vendors' : 'Verified vendors'}
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand text-white font-semibold rounded-xl transition-all duration-300"
        >
          <ShoppingBag className="w-4 h-4" />
          Start shopping
        </Link>
      </section>
    </InformationalPage>
  );
}
