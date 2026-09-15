import { useState } from 'react';
import { Package, CreditCard, Store, UserCog, Clock, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { InformationalPage } from '../components/InformationalPage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const TOPICS = [
  {
    icon: Package,
    title: 'Order Support',
    value: 'order',
    description: 'Questions about an order, delivery, or pickup.',
  },
  {
    icon: CreditCard,
    title: 'Payment Questions',
    value: 'payment',
    description: 'M-Pesa, card, bank transfer, and Pay Later queries.',
  },
  {
    icon: Store,
    title: 'Vendor & Product Issues',
    value: 'vendor',
    description: 'Problems with a product, a listing, or a vendor.',
  },
  {
    icon: UserCog,
    title: 'Account Assistance',
    value: 'account',
    description: 'Help signing in, updating details, or closing your account.',
  },
];

export function Contact() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [subject, setSubject] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-contact-form', {
        body: {
          name: name.trim(),
          email: email.trim(),
          subject,
          order_number: orderNumber.trim() || null,
          message: message.trim(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to send message');
      setSent(true);
      toast.success('Message sent! We\'ll get back to you soon.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <InformationalPage
        title="Contact us"
        subtitle="Questions, issues, or feedback — we are here to help."
      >
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Message sent!</h2>
          <p className="text-muted-foreground mb-6">
            We've received your message and will get back to you within 1-2 business days.
          </p>
          <Button onClick={() => { setSent(false); setSubject(''); setOrderNumber(''); setMessage(''); }}>
            Send another message
          </Button>
        </div>
      </InformationalPage>
    );
  }

  return (
    <InformationalPage
      title="Contact us"
      subtitle="Questions, issues, or feedback — we are here to help."
    >
      <section aria-labelledby="contact-form">
        <h2 id="contact-form" className="text-xl font-semibold mb-4">Send us a message</h2>
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Topic</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TOPICS.map((topic) => (
                <button
                  key={topic.value}
                  type="button"
                  onClick={() => setSubject(topic.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center ${
                    subject === topic.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                  }`}
                >
                  <topic.icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{topic.title}</span>
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Order number (optional)"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="e.g. ORD-20260904-001"
          />

          <div>
            <label className="block text-sm font-medium mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help you?"
              required
              rows={5}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              We typically respond within 1-2 business days.
            </p>
            <Button type="submit" disabled={sending}>
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Message
            </Button>
          </div>
        </form>
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
