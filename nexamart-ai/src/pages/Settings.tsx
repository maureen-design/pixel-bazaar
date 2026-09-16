import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { Sun, Moon, Bell, UserCircle, Eye, Type } from 'lucide-react';

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
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [isLargeText, setIsLargeText] = useState(false);
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    sms: false,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
    }
    const savedTheme = localStorage.getItem('theme');
    setIsDark(savedTheme !== 'light');
    setIsHighContrast(document.documentElement.classList.contains('high-contrast'));
    setIsLargeText(document.documentElement.classList.contains('text-scale-large'));
  }, [profile]);

  const handleProfileUpdate = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, phone })
        .eq('id', user?.id);

      if (error) throw error;
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
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
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
      toast.error(error.message || 'Failed to update password');
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

  const toggleHighContrast = () => {
    const html = document.documentElement;
    if (html.classList.contains('high-contrast')) {
      html.classList.remove('high-contrast');
      localStorage.removeItem('high-contrast');
      setIsHighContrast(false);
    } else {
      html.classList.add('high-contrast');
      localStorage.setItem('high-contrast', 'true');
      setIsHighContrast(true);
    }
  };

  const toggleLargeText = () => {
    const html = document.documentElement;
    if (html.classList.contains('text-scale-large')) {
      html.classList.remove('text-scale-large');
      localStorage.removeItem('text-scale-large');
      setIsLargeText(false);
    } else {
      html.classList.add('text-scale-large');
      localStorage.setItem('text-scale-large', 'true');
      setIsLargeText(true);
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
              <CardTitle>Change Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="bg-muted border-border"
                />
              </div>
              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="bg-muted border-border"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="bg-muted border-border"
                />
              </div>
              <Button onClick={handlePasswordChange} disabled={changingPw || !currentPassword || !newPassword}>
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
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
