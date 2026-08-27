import { Mail, Package, CreditCard, Store, UserCog, Clock } from 'lucide-react';
import { InformationalPage } from '../components/InformationalPage';
import { useSettings } from '../hooks/useSettings';

const TOPICS = [
  {
    icon: Package,
    title: 'Order support',
    description: 'Questions about an order, delivery, or pickup.',
  },
  {
    icon: CreditCard,
    title: 'Payment questions',
    description: 'M-Pesa, card, bank transfer, and Pay Later queries.',
  },
  {
    icon: Store,
    title: 'Vendor & product issues',
    description: 'Problems with a product, a listing, or a vendor.',
  },
  {
    icon: UserCog,
    title: 'Account assistance',
    description: 'Help signing in, updating details, or closing your account.',
  },
];

export function Contact() {
  const { settings } = useSettings();
  const email = settings.supportEmail;

  return (
    <InformationalPage
      title="Contact us"
      subtitle="Questions, issues, or feedback — we are here to help."
    >
      <section aria-labelledby="contact-email">
        <h2 id="contact-email" className="text-xl font-semibold mb-4">Email support</h2>
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-brand to-brand-dark rounded-xl flex items-center justify-center flex-shrink-0">
            <Mail aria-hidden="true" className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground break-all">{email}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The fastest way to reach our support team.
            </p>
          </div>
          <a
            href={`mailto:${email}`}
            className="sm:ml-auto flex-shrink-0 inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand text-white font-semibold rounded-lg transition-all duration-300"
          >
            Email us
          </a>
        </div>
        <p className="text-sm text-muted-foreground mt-4 flex items-start gap-2">
          <Clock aria-hidden="true" className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand" />
          <span>
            We typically respond within one to two business days. Including your order number
            helps us help you faster.
          </span>
        </p>
      </section>

      <section aria-labelledby="contact-topics">
        <h2 id="contact-topics" className="text-xl font-semibold mb-4">What we can help with</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TOPICS.map((topic) => (
            <div key={topic.title} className="bg-card border border-border rounded-xl p-5">
              <topic.icon aria-hidden="true" className="w-5 h-5 text-brand mb-3" />
              <h3 className="font-semibold text-foreground mb-1">{topic.title}</h3>
              <p className="text-sm text-muted-foreground">{topic.description}</p>
            </div>
          ))}
        </div>
      </section>
    </InformationalPage>
  );
}
