import type { ReactNode } from 'react';
import { InformationalPage } from '../components/InformationalPage';
import { useSettings } from '../hooks/useSettings';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xl font-semibold mb-3">{title}</h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export function Terms() {
  const { settings } = useSettings();

  return (
    <InformationalPage
      title="Terms of Service"
      subtitle={`The rules for using ${settings.siteName}.`}
    >
      <Section id="tos-acceptance" title="1. Acceptance of terms">
        <p>
          By creating an account or placing an order on {settings.siteName}, you agree to these
          terms. If you do not agree, please do not use the platform.
        </p>
      </Section>

      <Section id="tos-accounts" title="2. Accounts">
        <p>
          You are responsible for providing accurate account information and for keeping your
          sign-in credentials secure. Do not share your account with others, and tell us at{' '}
          <a href={`mailto:${settings.supportEmail}`} className="text-brand hover:underline break-all">
            {settings.supportEmail}
          </a>{' '}
          if you believe your account has been compromised.
        </p>
      </Section>

      <Section id="tos-model" title="3. Marketplace model">
        <p>
          {settings.siteName} is a multi-vendor marketplace: it connects customers with
          independent vendors who list and sell their own products. The marketplace provides
          discovery, checkout, payments, and order tracking; product listings are provided by
          the vendors.
        </p>
      </Section>

      <Section id="tos-orders" title="4. Orders">
        <ul className="list-disc pl-6 space-y-1">
          <li>An order is created when you complete checkout; stock for its items is reserved at that point.</li>
          <li>Prices are shown in Kenyan Shillings (KES) and the total — including delivery costs, applicable tax, and any coupon discounts — is displayed before you place the order.</li>
          <li>Delivery options (standard, express, or pickup) and their costs are shown at checkout.</li>
          <li>You can follow your order through its statuses (pending payment, processing, delivered, cancelled) on your Orders page.</li>
        </ul>
      </Section>

      <Section id="tos-payments" title="5. Payment methods">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong className="text-foreground">M-Pesa</strong> — you approve an STK Push request sent to your phone.</li>
          <li><strong className="text-foreground">Card (via Paystack)</strong> — card details are entered on Paystack&apos;s secure hosted checkout, not on this site.</li>
          <li><strong className="text-foreground">Bank transfer</strong> — you transfer to the account shown in the order instructions.</li>
          <li><strong className="text-foreground">Pay Later</strong> — eligible orders can be paid after the order is placed.</li>
        </ul>
        <p>An order is only fulfilled once its payment is confirmed by the platform.</p>
      </Section>

      <Section id="tos-paylater" title="6. Pay Later">
        <p>
          Pay Later orders must be completed within <strong className="text-foreground">24 hours</strong>{' '}
          of placement. If payment is not completed within that window, the order may be
          cancelled and the reserved stock released back to the vendor.
        </p>
      </Section>

      <Section id="tos-bank" title="7. Bank transfer">
        <p>
          Bank transfer orders remain pending until the platform verifies that your payment has
          been received. Transfers should be made within the deadline shown with your order
          instructions (72 hours by default); unverified orders past their deadline may be
          cancelled and their reserved stock released.
        </p>
      </Section>

      <Section id="tos-vendors" title="8. Vendors">
        <p>
          Vendors are verified by the marketplace before listing products, and are responsible
          for providing truthful product information (including price, description, images, and
          stock), fulfilling orders once payment is confirmed, and keeping their listings
          up to date.
        </p>
      </Section>

      <Section id="tos-cancellation" title="9. Cancellation &amp; payment failure">
        <p>
          Orders that are unpaid, fail payment, or miss their payment deadline may be cancelled
          automatically. When that happens, the stock reserved for those items is released so it
          becomes available to other customers again.
        </p>
      </Section>

      <Section id="tos-limitation" title="10. Limitation of liability &amp; demo context">
        <p>
          This marketplace is provided as-is as a demonstration project. While we work hard to
          keep listings accurate and payments reliable, the service is offered without
          enterprise-grade guarantees, and nothing here constitutes legal advice or certified
          compliance documentation.
        </p>
      </Section>

      <Section id="tos-law" title="11. Governing law">
        <p>These terms are governed by the laws of Kenya.</p>
      </Section>
    </InformationalPage>
  );
}
