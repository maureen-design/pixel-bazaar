import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { PasswordInput } from '../components/ui/PasswordInput';
import { PasswordRequirements } from '../components/ui/PasswordRequirements';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  meetsAllRequirements,
  firstUnmetRequirement,
  isSameAsCurrent,
} from '../utils/passwordValidation';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Sun, Moon, Bell, UserCircle, Eye, Type, Volume2, MapPin, Plus, Trash2, Edit, Star } from 'lucide-react';
import { KENYA_COUNTIES, getTownsForCounty } from '../data/kenya-counties';
import { useAccessibilityPreferences } from '../hooks/useAccessibilityPreferences';

export function Settings() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const { isHighContrast, isLargeText, toggleHighContrast, toggleLargeText } = useAccessibilityPreferences();
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
  });
  const [speechRate, setSpeechRate] = useState(1);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
    }
    const savedTheme = localStorage.getItem('theme');
    setIsDark(savedTheme !== 'light');
    const savedRate = localStorage.getItem('nexamart-speech-rate');
    if (savedRate) {
      const rate = Number(savedRate);
      if ([0.5, 0.75, 1, 1.25, 1.5].includes(rate)) setSpeechRate(rate);
    }
  }, [profile]);

  const handleProfileUpdate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone })
        .eq('id', user?.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('No profile row exists for your account. Please sign out and sign in again.');
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    // Enforced the same rule as signup. This page previously accepted any 6
    // character password, which let a user downgrade a strong password set
    // during registration.
    if (!meetsAllRequirements(newPassword)) {
      const unmet = firstUnmetRequirement(newPassword);
      toast.error(`Password must meet all requirements${unmet ? `: ${unmet.toLowerCase()}` : ''}`);
      return;
    }
    if (isSameAsCurrent(newPassword, currentPassword)) {
      toast.error('Your new password must be different from your current password');
      return;
    }
    setChangingPw(true);
    try {
      // Re-authenticate with current password first
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      if (authError) {
        toast.error('Current password is incorrect');
        return;
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      toast.success('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      const lower = (error?.message || '').toLowerCase();
      if (lower.includes('same as') || lower.includes('previous')) {
        toast.error('Your new password must be different from your current password');
      } else if (lower.includes('at least') || lower.includes('characters')) {
        toast.error('Password does not meet the requirements listed below');
      } else {
        toast.error(error.message || 'Failed to update password');
      }
    } finally {
      setChangingPw(false);
    }
  };

  const toggleTheme = () => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  const handleSpeechRateChange = (rate: number) => {
    setSpeechRate(rate);
    localStorage.setItem('nexamart-speech-rate', String(rate));
  };

  // Address management state
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addressDialog, setAddressDialog] = useState<{ open: boolean; mode: 'add' | 'edit'; address?: any }>({ open: false, mode: 'add' });
  const [addressForm, setAddressForm] = useState({
    full_name: '',
    phone: '',
    address_line: '',
    city: '',
    county: '',
    postal_code: '',
    is_default: false,
  });
  const [savingAddress, setSavingAddress] = useState(false);
  const [deletingAddress, setDeletingAddress] = useState<string | null>(null);

  const fetchAddresses = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching addresses:', error);
    } else {
      setAddresses(data || []);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, [user]);

  const openAddressDialog = (mode: 'add' | 'edit', address?: any) => {
    if (mode === 'edit' && address) {
      setAddressForm({
        full_name: address.full_name,
        phone: address.phone,
        address_line: address.address_line,
        city: address.city,
        county: address.county,
        postal_code: address.postal_code || '',
        is_default: address.is_default,
      });
    } else {
      setAddressForm({
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        address_line: '',
        city: '',
        county: '',
        postal_code: '',
        is_default: false,
      });
    }
    setAddressDialog({ open: true, mode, address });
  };

  const closeAddressDialog = () => {
    setAddressDialog({ open: false, mode: 'add' });
    setAddressForm({
      full_name: profile?.full_name || '',
      phone: profile?.phone || '',
      address_line: '',
      city: '',
      county: '',
      postal_code: '',
      is_default: false,
    });
  };

  const isValidKenyanPhone = (value: string): boolean => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('07')) return true;
    if (digits.length === 12 && digits.startsWith('254')) return true;
    return false;
  };

  const handleSaveAddress = async () => {
    if (!user) return;
    if (!addressForm.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!addressForm.phone.trim()) { toast.error('Phone number is required'); return; }
    if (!isValidKenyanPhone(addressForm.phone.trim())) { toast.error('Please enter a valid Kenyan phone number'); return; }
    if (!addressForm.address_line.trim()) { toast.error('Address is required'); return; }
    if (!addressForm.city.trim()) { toast.error('City/town is required'); return; }
    if (!addressForm.county.trim()) { toast.error('County is required'); return; }

    // Check max 5 addresses limit for add mode
    if (addressDialog.mode === 'add' && addresses.length >= 5) {
      toast.error('Maximum 5 addresses allowed. Delete an existing address first.');
      return;
    }

    setSavingAddress(true);
    try {
      // If setting as default, unset other defaults first
      if (addressForm.is_default) {
        await supabase
          .from('addresses')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true);
      }

      if (addressDialog.mode === 'add') {
        const { error } = await supabase
          .from('addresses')
          .insert({
            user_id: user.id,
            full_name: addressForm.full_name.trim(),
            phone: addressForm.phone.trim(),
            address_line: addressForm.address_line.trim(),
            city: addressForm.city.trim(),
            county: addressForm.county.trim(),
            postal_code: addressForm.postal_code.trim() || null,
            is_default: addressForm.is_default,
          });
        if (error) throw error;
        toast.success('Address saved successfully');
      } else {
        const { error } = await supabase
          .from('addresses')
          .update({
            full_name: addressForm.full_name.trim(),
            phone: addressForm.phone.trim(),
            address_line: addressForm.address_line.trim(),
            city: addressForm.city.trim(),
            county: addressForm.county.trim(),
            postal_code: addressForm.postal_code.trim() || null,
            is_default: addressForm.is_default,
          })
          .eq('id', addressDialog.address.id)
          .eq('user_id', user.id);
        if (error) throw error;
        toast.success('Address updated successfully');
      }
      closeAddressDialog();
      fetchAddresses();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save address');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!user) return;
    setDeletingAddress(addressId);
    try {
      const { error } = await supabase
        .from('addresses')
        .delete()
        .eq('id', addressId)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Address deleted successfully');
      fetchAddresses();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete address');
    } finally {
      setDeletingAddress(null);
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (!user) return;
    try {
      // Unset current default
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true);
      // Set new default
      const { error } = await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', addressId)
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Default address updated');
      fetchAddresses();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update default address');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold mb-6">Settings</h1>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCircle className="w-5 h-5 text-primary" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted border-border opacity-60"
                />
              </div>
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="bg-muted border-border"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                  className="bg-muted border-border"
                />
              </div>
              <Button onClick={handleProfileUpdate} disabled={loading}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                Saved Addresses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {addresses.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-4">No saved addresses yet</p>
                  <Button onClick={() => openAddressDialog('add')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Address
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {addresses.map((address) => (
                      <div
                        key={address.id}
                        className={`p-4 border rounded-lg ${
                          address.is_default ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            {address.is_default && (
                              <div className="flex items-center gap-1 text-primary text-xs font-medium mb-2">
                                <Star className="w-3 h-3 fill-current" />
                                Default
                              </div>
                            )}
                            <p className="font-medium">{address.full_name}</p>
                            <p className="text-sm text-muted-foreground">{address.phone}</p>
                            <p className="text-sm text-muted-foreground">{address.address_line}</p>
                            <p className="text-sm text-muted-foreground">
                              {address.city}, {address.county}
                              {address.postal_code && ` - ${address.postal_code}`}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            {!address.is_default && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSetDefault(address.id)}
                                title="Set as default"
                              >
                                <Star className="w-4 h-4" />
                              </Button>
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openAddressDialog('edit', address)}
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteAddress(address.id)}
                                disabled={deletingAddress === address.id}
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {addresses.length < 5 && (
                    <Button onClick={() => openAddressDialog('add')} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add New Address
                    </Button>
                  )}
                  {addresses.length >= 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Maximum 5 addresses reached. Delete an address to add a new one.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PasswordInput
                label="Current Password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <PasswordInput
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password"
                autoComplete="new-password"
                error={
                  newPassword && !meetsAllRequirements(newPassword)
                    ? 'Password does not meet all requirements below'
                    : undefined
                }
              />
              <PasswordInput
                label="Confirm Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirm new password"
                autoComplete="new-password"
                error={
                  confirmPassword && confirmPassword !== newPassword
                    ? 'Passwords do not match'
                    : undefined
                }
              />
              {newPassword && <PasswordRequirements value={newPassword} compact />}
              <Button
                onClick={handlePasswordChange}
                disabled={
                  changingPw ||
                  !currentPassword ||
                  !newPassword ||
                  !meetsAllRequirements(newPassword)
                }
              >
                {changingPw ? 'Updating...' : 'Update Password'}
              </Button>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'email', label: 'Email Notifications' },
                { key: 'push', label: 'Push Notifications' },
                { key: 'sms', label: 'SMS Notifications' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <button
                    role="switch"
                    aria-checked={notifications[key as keyof typeof notifications]}
                    aria-label={label}
                    onClick={() =>
                      setNotifications((prev) => ({
                        ...prev,
                        [key]: !prev[key as keyof typeof prev],
                      }))
                    }
                    className={`w-12 h-6 rounded-full transition-colors ${
                      notifications[key as keyof typeof notifications]
                        ? 'bg-primary'
                        : 'bg-muted'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        notifications[key as keyof typeof notifications]
                          ? 'translate-x-6'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isDark ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
                Theme Preference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Dark Mode</span>
                <button
                  role="switch"
                  aria-checked={isDark}
                  aria-label="Toggle dark mode"
                  onClick={toggleTheme}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    isDark ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isDark ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  High Contrast
                </span>
                <button
                  role="switch"
                  aria-checked={isHighContrast}
                  aria-label="Toggle high contrast mode"
                  onClick={toggleHighContrast}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    isHighContrast ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isHighContrast ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Large Text
                </span>
                <button
                  role="switch"
                  aria-checked={isLargeText}
                  aria-label="Toggle large text mode"
                  onClick={toggleLargeText}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    isLargeText ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isLargeText ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {isDark ? 'Dark' : 'Light'} mode
                {isHighContrast ? ' · High contrast' : ''}
                {isLargeText ? ' · Large text' : ''}
              </p>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-primary" />
                Speech Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-5 gap-2">
                {[
                  { value: 0.5, label: 'Slower' },
                  { value: 0.75, label: 'Slow' },
                  { value: 1, label: 'Normal' },
                  { value: 1.25, label: 'Fast' },
                  { value: 1.5, label: 'Faster' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSpeechRateChange(value)}
                    aria-label={label}
                    aria-pressed={speechRate === value}
                    className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                      speechRate === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border hover:border-muted-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Controls the speed of text-to-speech for "Listen" buttons. Current: {speechRate}x
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Address Dialog */}
      <Dialog open={addressDialog.open} onOpenChange={(open) => { if (!open) closeAddressDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{addressDialog.mode === 'add' ? 'Add New Address' : 'Edit Address'}</DialogTitle>
            <DialogDescription>
              {addressDialog.mode === 'add' ? 'Save a new shipping address for faster checkout.' : 'Update your saved shipping address.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="addr-full-name">Full Name *</Label>
              <Input
                id="addr-full-name"
                value={addressForm.full_name}
                onChange={(e) => setAddressForm({ ...addressForm, full_name: e.target.value })}
                placeholder="Your full name"
              />
            </div>
            <div>
              <Label htmlFor="addr-phone">Phone Number *</Label>
              <Input
                id="addr-phone"
                type="tel"
                value={addressForm.phone}
                onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                placeholder="0712 345 678"
              />
            </div>
            <div>
              <Label htmlFor="addr-address">Address Line *</Label>
              <Input
                id="addr-address"
                value={addressForm.address_line}
                onChange={(e) => setAddressForm({ ...addressForm, address_line: e.target.value })}
                placeholder="Street address, building, floor, etc."
              />
            </div>
            <div>
              <Label htmlFor="addr-county">County *</Label>
              <Select value={addressForm.county} onValueChange={(value) => setAddressForm({ ...addressForm, county: value, city: '' })}>
                <SelectTrigger id="addr-county">
                  <SelectValue placeholder="Select county" />
                </SelectTrigger>
                <SelectContent>
                  {KENYA_COUNTIES.map((county) => (
                    <SelectItem key={county.name} value={county.name}>
                      {county.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="addr-city">City/Town *</Label>
              <Select
                value={addressForm.city}
                onValueChange={(value) => setAddressForm({ ...addressForm, city: value })}
                disabled={!addressForm.county}
              >
                <SelectTrigger id="addr-city">
                  <SelectValue placeholder="Select city/town" />
                </SelectTrigger>
                <SelectContent>
                  {getTownsForCounty(addressForm.county).map((town) => (
                    <SelectItem key={town} value={town}>
                      {town}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="addr-postal">Postal Code (optional)</Label>
              <Input
                id="addr-postal"
                value={addressForm.postal_code}
                onChange={(e) => setAddressForm({ ...addressForm, postal_code: e.target.value })}
                placeholder="e.g., 00100"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="addr-default"
                checked={addressForm.is_default}
                onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                className="w-4 h-4 rounded border-border"
              />
              <Label htmlFor="addr-default" className="text-sm">Set as default address</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={closeAddressDialog} disabled={savingAddress}>
                Cancel
              </Button>
              <Button onClick={handleSaveAddress} disabled={savingAddress}>
                {savingAddress ? 'Saving...' : addressDialog.mode === 'add' ? 'Add Address' : 'Update Address'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
