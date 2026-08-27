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

export function Privacy() {
  const { settings } = useSettings();

  return (
    <InformationalPage
      title="Privacy Policy"
      subtitle={`How ${settings.siteName} handles your information.`}
    >
      <Section id="pp-collect" title="1. Information we collect">
        <p>
          To operate the marketplace we collect the information you provide when using it:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong className="text-foreground">Account information</strong> — your name and email address when you create an account.</li>
          <li><strong className="text-foreground">Phone number</strong> — used for delivery contact and to initiate M-Pesa payments.</li>
          <li><strong className="text-foreground">Delivery information</strong> — the shipping address and county you enter at checkout.</li>
          <li><strong className="text-foreground">Order information</strong> — the items you buy, amounts paid, payment method and status, coupons applied, and order history.</li>
          <li><strong className="text-foreground">Vendor information</strong> — if you apply as a vendor, your store name and description.</li>
        </ul>
      </Section>

      <Section id="pp-auth" title="2. Authentication">
        <p>
          Sign-in is handled by Supabase Auth. Your password is verified and managed by
          Supabase&apos;s authentication service; {settings.siteName} does not store your raw
          password. Password reset emails are sent on our behalf by the same service.
        </p>
      </Section>

      <Section id="pp-payments" title="3. Payments">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong className="text-foreground">M-Pesa:</strong> the phone number you provide is
            sent to Safaricom&apos;s M-Pesa service to initiate an STK Push payment request on
            your phone.
          </li>
          <li>
            <strong className="text-foreground">Card payments:</strong> card payments are
            processed through Paystack&apos;s hosted checkout. You enter card details on
            Paystack&apos;s secure page — {settings.siteName} never receives or stores your card
            number or CVV.
          </li>
          <li>
            <strong className="text-foreground">Bank transfer:</strong> we show you transfer
            instructions and an order reference so your payment can be matched to your order.
          </li>
          <li>
            <strong className="text-foreground">Pay Later:</strong> eligible orders can be placed
            now and remain pending until payment is completed.
          </li>
        </ul>
      </Section>

      <Section id="pp-local" title="4. Storage on your device">
        <p>
          The app stores small pieces of data in your browser&apos;s local storage to work
          better for you: your guest shopping cart (so items survive a page reload before you
          sign in) and your theme preference (light or dark mode). This data stays in your
          browser and can be cleared at any time through your browser settings.
        </p>
      </Section>

      <Section id="pp-delivery" title="5. Order &amp; delivery information">
        <p>
          Your shipping address, phone number, and order details are used to fulfil and deliver
          your order, keep you informed of its status, and contact you if something needs to be
          confirmed. Vendors receive the information needed to prepare and dispatch the products
          you ordered from them.
        </p>
      </Section>

      <Section id="pp-third-party" title="6. Third-party services">
        <p>The platform relies on a small number of service providers:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong className="text-foreground">Supabase</strong> — application database, storage, and authentication.</li>
          <li><strong className="text-foreground">Paystack</strong> — hosted card checkout and payment confirmation.</li>
          <li><strong className="text-foreground">Safaricom M-Pesa (Daraja)</strong> — mobile money payment initiation and confirmation.</li>
        </ul>
        <p>No other third-party advertising or tracking services are used.</p>
      </Section>

      <Section id="pp-rights" title="7. Your rights &amp; contact">
        <p>
          You can access and update your account details from your profile, and view your full
          order history while signed in. For questions about your data, corrections, deletion
          requests, or anything else related to privacy, email{' '}
          <a href={`mailto:${settings.supportEmail}`} className="text-brand hover:underline break-all">
            {settings.supportEmail}
          </a>
          .
        </p>
      </Section>

      <Section id="pp-scope" title="8. Scope of this policy">
        <p>
          This policy describes how this marketplace handles information and is provided in good
          faith for informational purposes. It is not legal advice or a certified compliance
          document. If you have questions about anything described here, contact us at{' '}
          <a href={`mailto:${settings.supportEmail}`} className="text-brand hover:underline break-all">
            {settings.supportEmail}
          </a>
          .
        </p>
      </Section>
    </InformationalPage>
  );
}
