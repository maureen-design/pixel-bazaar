import { useState, useEffect, useRef, useMemo } from 'react';
import { Store, Upload, Camera, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card } from '../../components/ui/card';
import { toast } from 'sonner';
import { motion } from 'motion/react';

interface VendorSettings {
  store_name: string;
  store_description: string;
  business_name: string;
  store_logo: string;
  store_cover: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function VendorSettings() {
  const { vendor } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [settings, setSettings] = useState<VendorSettings>({
    store_name: '',
    store_description: '',
    business_name: '',
    store_logo: '',
    store_cover: '',
  });

  const [original, setOriginal] = useState<VendorSettings>({
    store_name: '',
    store_description: '',
    business_name: '',
    store_logo: '',
    store_cover: '',
  });

  useEffect(() => {
    if (vendor) {
      const initial = {
        store_name: vendor.store_name || '',
        store_description: vendor.store_description || '',
        business_name: vendor.business_name || '',
        store_logo: vendor.store_logo || '',
        store_cover: vendor.store_cover || '',
      };
      setSettings(initial);
      setOriginal(initial);
    }
  }, [vendor]);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(original),
    [settings, original]
  );

  const set = <K extends keyof VendorSettings>(key: K, value: VendorSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!settings.store_name.trim()) {
      toast.error('Store name is required');
      return;
    }
    if (!settings.business_name.trim()) {
      toast.error('Business name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('vendors')
        .update({
          store_name: settings.store_name.trim(),
          store_description: settings.store_description.trim(),
          business_name: settings.business_name.trim(),
          store_logo: settings.store_logo,
          store_cover: settings.store_cover,
        })
        .eq('id', vendor.id);

      if (error) throw error;
      setOriginal(settings);
      setSaved(true);
      toast.success('Settings saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(original);
    setSaved(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `vendor-logo-${vendor.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      set('store_logo', publicUrl);
      toast.success('Logo uploaded');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Cover image must be under 5MB');
      return;
    }

    setUploadingCover(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `vendor-cover-${vendor.id}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      set('store_cover', publicUrl);
      toast.success('Cover image uploaded');
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload cover image');
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Store Settings</h1>
          <p className="text-muted-foreground">Manage your store profile and public information</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Saved indicator */}
      {saved && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center gap-2 text-sm text-success bg-success/10 border border-success/20 rounded-lg px-4 py-3"
        >
          <CheckCircle className="w-4 h-4" />
          Settings saved successfully
        </motion.div>
      )}

      {/* Cover + Logo */}
      <Card className="bg-card border-border overflow-hidden">
        {/* Cover */}
        <div className="relative h-32 bg-muted">
          {settings.store_cover ? (
            <img
              src={settings.store_cover}
              alt="Store cover"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-primary/20 to-primary/5" />
          )}
          <button
            onClick={() => coverInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group"
            disabled={uploadingCover}
          >
            {uploadingCover ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : (
              <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={handleCoverUpload}
            className="hidden"
          />

          {/* Logo */}
          <div className="absolute -bottom-8 left-6">
            <div className="relative group">
              <div className="w-20 h-20 rounded-xl bg-card border-4 border-card shadow-lg flex items-center justify-center overflow-hidden">
                {settings.store_logo ? (
                  <img
                    src={settings.store_logo}
                    alt="Store logo"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-primary">
                    {getInitials(settings.store_name || settings.business_name || 'S')}
                  </span>
                )}
              </div>
              <button
                onClick={() => logoInputRef.current?.click()}
                className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors"
                disabled={uploadingLogo}
              >
                {uploadingLogo ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

        <div className="pt-12 p-6">
          {/* Store Status */}
          <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-muted/50">
            <Store className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">{vendor?.business_name || vendor?.store_name}</p>
              <p className="text-xs text-muted-foreground">
                {vendor?.is_verified ? (
                  <span className="text-success flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Verified Vendor
                  </span>
                ) : (
                  <span className="text-warning flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Pending Verification
                  </span>
                )}
              </p>
            </div>
            {vendor?.rating > 0 && (
              <div className="text-sm text-muted-foreground">
                Rating: <span className="font-medium text-foreground">{Number(vendor.rating).toFixed(1)}</span>/5
              </div>
            )}
          </div>

          {/* Form */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="store_name">Store Name *</Label>
                <Input
                  id="store_name"
                  value={settings.store_name}
                  onChange={(e) => set('store_name', e.target.value)}
                  placeholder="Your store display name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is how buyers see your store across the marketplace
                </p>
              </div>

              <div>
                <Label htmlFor="business_name">Business Name *</Label>
                <Input
                  id="business_name"
                  value={settings.business_name}
                  onChange={(e) => set('business_name', e.target.value)}
                  placeholder="Legal or trading name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your registered business or trading name
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="store_description">Store Description</Label>
              <textarea
                id="store_description"
                value={settings.store_description}
                onChange={(e) => set('store_description', e.target.value)}
                placeholder="Tell buyers what makes your store special..."
                rows={4}
                className="w-full px-4 py-3 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {settings.store_description.length}/500 characters
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Info Card */}
      <Card className="bg-card border-border p-6">
        <h3 className="font-semibold mb-3">Account Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{vendor?.profiles?.email || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Sales</p>
            <p className="font-medium">{vendor?.total_sales || 0} orders</p>
          </div>
          <div>
            <p className="text-muted-foreground">Member Since</p>
            <p className="font-medium">
              {vendor?.created_at
                ? new Date(vendor.created_at).toLocaleDateString('en-KE', {
                    year: 'numeric',
                    month: 'long',
                  })
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Store Rating</p>
            <p className="font-medium">
              {vendor?.rating > 0
                ? `${Number(vendor.rating).toFixed(1)} / 5.00`
                : 'No ratings yet'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
