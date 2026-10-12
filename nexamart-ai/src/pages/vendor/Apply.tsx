import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Clock, CheckCircle, XCircle, MapPin, Tag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { toast } from 'sonner';
import { motion } from 'motion/react';

const PRODUCT_CATEGORIES = [
  'Electronics & Gadgets',
  'Fashion & Clothing',
  'Home & Kitchen',
  'Beauty & Personal Care',
  'Sports & Outdoors',
  'Books & Stationery',
  'Toys & Games',
  'Automotive',
  'Health & Wellness',
  'Food & Groceries',
  'Other',
];

export function VendorApply() {
  const navigate = useNavigate();
  const { user, vendor } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    business_name: '',
    business_description: '',
    phone: '',
    city: '',
    main_categories: [] as string[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Redirect if already a vendor
  useEffect(() => {
    if (vendor?.is_verified) {
      navigate('/vendor/dashboard');
    }
  }, [vendor, navigate]);

  // B1: live platform commission rate (fraction → percent) for the disclosure
  // above submit. public.platform_commission_rate() is granted to anon and
  // authenticated (0037), so this works for guests too. Falls back to the
  // known default of 15% if the RPC is unavailable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('platform_commission_rate');
        if (!cancelled && !error && typeof data === 'number' && Number.isFinite(data)) {
          setCommissionRate(Math.round(data * 100 * 100) / 100);
        }
      } catch {
        // non-critical; the disclosure copy falls back to the default rate
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // B2: rejected → reapply. Prefills the form from the existing vendors row
  // (get_my_vendor returns the private fields, including phone/main_categories)
  // and reveals the form; submission then updates the row instead of inserting.
  const startReapply = () => {
    if (vendor) {
      setFormData({
        business_name: vendor.store_name || '',
        business_description: vendor.store_description || '',
        phone: vendor.phone || '',
        city: vendor.city || '',
        main_categories: Array.isArray(vendor.main_categories)
          ? vendor.main_categories
          : (vendor.main_categories || '').toString().split(',').map((s: string) => s.trim()).filter(Boolean),
      });
      setErrors({});
    }
    setReapplying(true);
  };

  // Show pending/rejected status if an application exists but is not approved.
  if (vendor && !vendor.is_verified && !reapplying) {
    const isRejected = !!vendor.last_rejected_at || (vendor.rejection_count ?? 0) > 0;

    if (isRejected) {
      return (
        <div className="min-h-screen bg-background text-foreground">
          <Navbar />
          <div className="max-w-2xl mx-auto px-4 py-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-xl p-8 border border-border text-center"
            >
              <div className="w-16 h-16 bg-warning/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="w-8 h-8 text-warning" />
              </div>
              <h1 className="text-2xl font-bold mb-4">Application Not Approved</h1>
              <p className="text-muted-foreground mb-4">
                Your vendor application for <span className="font-medium text-foreground">{vendor.store_name}</span> was not
                approved this time.
              </p>
              {vendor.rejection_reason && (
                <div className="bg-muted rounded-lg p-4 text-left text-sm mb-6">
                  <p className="font-medium text-foreground mb-1">Reason</p>
                  <p className="text-muted-foreground">{vendor.rejection_reason}</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button onClick={startReapply}>Apply Again</Button>
                <Button variant="outline" onClick={() => navigate('/')}>Back to Home</Button>
              </div>
            </motion.div>
          </div>
          <Footer />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl p-8 border border-border text-center"
          >
            <div className="w-16 h-16 bg-warning/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Clock className="w-8 h-8 text-warning" />
            </div>
            <h1 className="text-2xl font-bold mb-4">Application Under Review</h1>
            <p className="text-muted-foreground mb-6">
              Your vendor application is currently being reviewed by our team. 
              You will be notified once your application is approved.
            </p>
            <Button onClick={() => navigate('/')}>Back to Home</Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.business_name.trim()) {
      newErrors.business_name = 'Business name is required';
    }
    if (!formData.business_description.trim()) {
      newErrors.business_description = 'Business description is required';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }
    if (!formData.city.trim()) {
      newErrors.city = 'City/Location is required';
    }
    if (formData.main_categories.length === 0) {
      newErrors.main_categories = 'Select at least one product category';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    if (!user) {
      toast.error('Please sign in to apply as a vendor');
      navigate('/login');
      return;
    }

    setLoading(true);

    try {
      // Check if user already has a pending application.
      // get_my_vendor() rather than `select * from vendors where user_id = ...`:
      // migration 0032 revoked SELECT on user_id for authenticated sessions, so
      // both the star and the ownership filter are no longer permitted. Same
      // migration, same reason as the AuthContext lookup.
      const existingData = await supabase
        .rpc('get_my_vendor')
        .maybeSingle();

      const existingVendor = existingData.data as { id: string } | null;

      if (existingVendor && !reapplying) {
        toast.error('You already have a vendor application');
        return;
      }

      if (!existingVendor) {
        // New application (first time): INSERT path.
        // Create vendor application. `phone` is NOT a vendors column any more:
        // migration 0034 moved it to vendor_private, because a role holding
        // table-level SELECT on vendors cannot be denied individual columns, and
        // that table-level grant is what PostgREST needs for the product embeds.
        // The public half goes in first; trg_vendors_ensure_private_row creates
        // the matching vendor_private row, so the upsert below cannot orphan and
        // is safe to retry.
        const { data: created, error } = await supabase
          .from('vendors')
          .insert({
            user_id: user.id,
            store_name: formData.business_name,
            store_description: formData.business_description,
            city: formData.city.trim(),
            main_categories: formData.main_categories.join(', '),
            is_verified: false,
          })
          .select('id')
          .single();

        if (error) throw error;

        const { error: privateError } = await supabase
          .from('vendor_private')
          .upsert({ vendor_id: created.id, phone: formData.phone.trim() });

        if (privateError) throw privateError;
      } else {
        // Reapply: UPDATE the existing vendors row (vendors.user_id is UNIQUE,
        // so a second INSERT would collide). Clear the rejection fields and
        // return the application to pending; the protect trigger keeps
        // is_verified false for non-admins regardless.
        const { error: updateError } = await supabase
          .from('vendors')
          .update({
            store_name: formData.business_name,
            store_description: formData.business_description,
            city: formData.city.trim(),
            main_categories: formData.main_categories.join(', '),
            is_verified: false,
          })
          .eq('id', existingVendor.id);

        if (updateError) throw updateError;

        const { error: privateError } = await supabase
          .from('vendor_private')
          .update({
            phone: formData.phone.trim(),
            rejection_reason: null,
            last_rejected_at: null,
          })
          .eq('vendor_id', existingVendor.id);

        if (privateError) throw privateError;
      }

      setSubmitted(true);
      toast.success(reapplying ? 'Application resubmitted successfully!' : 'Application submitted successfully!');
      supabase.functions.invoke('send-admin-notification', {
        body: {
          event: 'new_vendor_application',
          data: {
            store_name: formData.business_name,
            business_name: formData.business_name,
            applicant_name: user.email || 'Vendor',
          },
        },
      }).catch(() => {});
    } catch (error: unknown) {
      console.error('Application error:', error);
      toast.error((error as { message?: string })?.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card rounded-xl p-8 border border-border text-center"
          >
            <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h1 className="text-2xl font-bold mb-4">Application Submitted!</h1>
            <p className="text-muted-foreground mb-6">
              Your vendor application has been submitted successfully. 
              Our team will review your application and you will be notified once approved.
            </p>
            <Button onClick={() => navigate('/')}>Back to Home</Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      
      <div className="max-w-2xl mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Become a Vendor</h1>
            <p className="text-muted-foreground">
              Join our marketplace and start selling your products to thousands of customers
            </p>
          </div>

          <form onSubmit={handleSubmit} className="bg-card rounded-xl p-8 border border-border space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Business Name *</label>
              <Input
                type="text"
                name="business_name"
                value={formData.business_name}
                onChange={handleInputChange}
                placeholder="Your Store Name"
                error={errors.business_name}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Business Description *</label>
              <textarea
                name="business_description"
                value={formData.business_description}
                onChange={handleInputChange}
                placeholder="Describe your business and the products you sell"
                rows={4}
                className={`w-full px-4 py-3 bg-muted border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground ${
                  errors.business_description ? 'border-destructive' : 'border-border'
                }`}
              />
              {errors.business_description && (
                <p className="text-destructive text-sm mt-1">{errors.business_description}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Phone Number *</label>
              <Input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="+254 7XX XXX XXX"
                error={errors.phone}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                City / Location *
              </label>
              <Input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="e.g. Nairobi, Mombasa, Kisumu"
                error={errors.city}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                <Tag className="w-4 h-4 inline mr-1" />
                Main Product Categories *
              </label>
              <p className="text-xs text-muted-foreground mb-2">Select all that apply</p>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        main_categories: prev.main_categories.includes(cat)
                          ? prev.main_categories.filter(c => c !== cat)
                          : [...prev.main_categories, cat],
                      }));
                      setErrors(prev => ({ ...prev, main_categories: '' }));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      formData.main_categories.includes(cat)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-muted-foreground/30 text-muted-foreground'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {errors.main_categories && (
                <p className="text-destructive text-sm mt-1">{errors.main_categories}</p>
              )}
            </div>

            <div className="bg-muted rounded-lg px-4 py-3 text-xs text-muted-foreground leading-relaxed">
              Platform commission is <span className="font-medium text-foreground">{commissionRate ?? 15}%</span> of the
              merchandise subtotal. Excludes tax and shipping.
            </div>

            <Button
              type="submit"
              className="w-full py-4 text-lg"
              disabled={loading}
            >
              {loading ? 'Submitting...' : reapplying ? 'Resubmit Application' : 'Submit Application'}
            </Button>
          </form>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
