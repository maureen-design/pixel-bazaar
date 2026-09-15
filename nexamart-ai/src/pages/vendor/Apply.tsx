import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Clock, CheckCircle, MapPin, Tag } from 'lucide-react';
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

  // Show pending status if application exists but not approved
  if (vendor && !vendor.is_verified) {
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
      // Check if user already has a pending application
      const { data: existingVendor } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (existingVendor) {
        toast.error('You already have a vendor application');
        return;
      }

      // Create vendor application
      const { error } = await supabase.from('vendors').insert({
        user_id: user.id,
        store_name: formData.business_name,
        store_description: formData.business_description,
        phone: formData.phone.trim(),
        city: formData.city.trim(),
        main_categories: formData.main_categories.join(', '),
        is_verified: false,
      });

      if (error) throw error;

      setSubmitted(true);
      toast.success('Application submitted successfully!');
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
    } catch (error: any) {
      console.error('Application error:', error);
      toast.error(error.message || 'Failed to submit application');
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

            <Button
              type="submit"
              className="w-full py-4 text-lg"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit Application'}
            </Button>
          </form>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
