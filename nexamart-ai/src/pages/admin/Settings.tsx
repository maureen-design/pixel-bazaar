import { useEffect, useState } from 'react';
import { Save, Settings as SettingsIcon, Plus, Trash2, Info, Lock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import { getSettings, updateSettings, invalidateSettings, type PlatformSettings } from '../../lib/settings';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

interface SurchargeRow {
  county: string;
  fee: string;
}

interface Draft {
  siteName: string;
  siteDescription: string;
  supportEmail: string;
  taxRate: string;
  standardShippingCost: string;
  expressShippingCost: string;
  defaultCountySurcharge: string;
  expressEnabled: boolean;
  pickupEnabled: boolean;
  countySurcharges: SurchargeRow[];
  mpesaEnabled: boolean;
  cardEnabled: boolean;
  bankPayLaterEnabled: boolean;
  bankTransferEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  bankSwiftCode: string;
  bankTransferDeadlineHours: string;
}

function settingsToDraft(s: PlatformSettings): Draft {
  return {
    siteName: s.siteName,
    siteDescription: s.siteDescription,
    supportEmail: s.supportEmail,
    taxRate: String(s.taxRate),
    standardShippingCost: String(s.standardShippingCost),
    expressShippingCost: String(s.expressShippingCost),
    defaultCountySurcharge: String(s.defaultCountySurcharge),
    expressEnabled: s.expressEnabled,
    pickupEnabled: s.pickupEnabled,
    countySurcharges: Object.entries(s.countySurcharges).map(([county, fee]) => ({ county, fee: String(fee) })),
    mpesaEnabled: s.mpesaEnabled,
    cardEnabled: s.cardEnabled,
    bankPayLaterEnabled: s.bankPayLaterEnabled,
    bankTransferEnabled: s.bankTransferEnabled,
    bankName: s.bankName,
    bankAccountName: s.bankAccountName,
    bankAccountNumber: s.bankAccountNumber,
    bankBranch: s.bankBranch,
    bankSwiftCode: s.bankSwiftCode,
    bankTransferDeadlineHours: String(s.bankTransferDeadlineHours),
  };
}

function buildPayload(draft: Draft): Partial<PlatformSettings> {
  const taxRate = Number(draft.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new Error('Tax rate must be between 0 and 100');
  }

  const countySurcharges: Record<string, number> = {};
  for (const row of draft.countySurcharges) {
    const name = row.county.trim();
    if (!name) throw new Error('County name cannot be empty');
    const fee = Number(row.fee);
    if (!Number.isFinite(fee) || fee < 0) throw new Error(`Fee for "${name}" must be a non-negative number`);
    countySurcharges[name] = fee;
  }

  const email = draft.supportEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid support email');
  }

  const numeric = (value: string, label: string): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number`);
    return n;
  };

  return {
    siteName: draft.siteName.trim() || 'NexaMart AI',
    siteDescription: draft.siteDescription.trim(),
    supportEmail: email,
    taxRate: Math.round(taxRate * 100) / 100,
    standardShippingCost: numeric(draft.standardShippingCost, 'Standard shipping cost'),
    expressShippingCost: numeric(draft.expressShippingCost, 'Express shipping cost'),
    defaultCountySurcharge: numeric(draft.defaultCountySurcharge, 'Default county surcharge'),
    expressEnabled: draft.expressEnabled,
    pickupEnabled: draft.pickupEnabled,
    countySurcharges,
    mpesaEnabled: draft.mpesaEnabled,
    cardEnabled: draft.cardEnabled,
    bankPayLaterEnabled: draft.bankPayLaterEnabled,
    bankTransferEnabled: draft.bankTransferEnabled,
    bankName: draft.bankName.trim(),
    bankAccountName: draft.bankAccountName.trim(),
    bankAccountNumber: draft.bankAccountNumber.trim(),
    bankBranch: draft.bankBranch.trim(),
    bankSwiftCode: draft.bankSwiftCode.trim(),
    bankTransferDeadlineHours: numeric(draft.bankTransferDeadlineHours, 'Bank transfer deadline'),
  };
}

export function AdminSettings() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getSettings().then((s) => {
      if (!active) return;
      setSaved(s);
      setDraft(settingsToDraft(s));
    });
    return () => {
      active = false;
    };
  }, []);

  if (!saved || !draft) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Loading platform settings...</p>
        </div>
        <div className="space-y-4 animate-pulse">
          <div className="bg-card rounded-xl border border-border p-6 max-w-2xl space-y-4">
            <div className="h-5 w-40 bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
            <div className="h-10 w-1/2 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  const dirty = JSON.stringify(settingsToDraft(saved)) !== JSON.stringify(draft);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft({ ...draft, [key]: value });
  };

  const setSurcharge = (index: number, field: keyof SurchargeRow, value: string) => {
    const rows = draft.countySurcharges.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    set('countySurcharges', rows);
  };

  const addSurcharge = () => {
    set('countySurcharges', [...draft.countySurcharges, { county: '', fee: '' }]);
  };

  const removeSurcharge = (index: number) => {
    set('countySurcharges', draft.countySurcharges.filter((_, i) => i !== index));
  };

  const [pendingWarnings, setPendingWarnings] = useState<Set<string>>(new Set());

  const handleSave = async () => {
    let payload: Partial<PlatformSettings>;
    try {
      payload = buildPayload(draft);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid settings');
      return;
    }

    const allPaymentsOff = !payload.mpesaEnabled && !payload.cardEnabled && !payload.bankPayLaterEnabled && !payload.bankTransferEnabled;
    if (allPaymentsOff && !pendingWarnings.has('payments')) {
      toast.warning('All payment methods will be disabled. Tap Save again to confirm.', { duration: 8000 });
      setPendingWarnings((prev) => new Set(prev).add('payments'));
      return;
    }
    if (payload.taxRate === 0 && !pendingWarnings.has('tax')) {
      toast.warning('Tax rate set to 0%. Tap Save again to confirm.', { duration: 8000 });
      setPendingWarnings((prev) => new Set(prev).add('tax'));
      return;
    }
    setPendingWarnings(new Set());

    setSaving(true);
    try {
      await updateSettings(payload);
      invalidateSettings();
      const next = await getSettings();
      setSaved(next);
      setDraft(settingsToDraft(next));
      toast.success('Settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(settingsToDraft(saved));
  };

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setChangingPw(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      if (signInErr) {
        toast.error('Current password is incorrect');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message || 'Failed to change password');
        return;
      }
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage platform-wide settings. Changes apply to the storefront immediately.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={!dirty || saving}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* General */}
      <section className="bg-card rounded-xl p-6 border border-border max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <SettingsIcon className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">General</h2>
        </div>
        <div className="space-y-4">
          <Input label="Site Name" value={draft.siteName} onChange={(e) => set('siteName', e.target.value)} />
          <Input label="Site Description" value={draft.siteDescription} onChange={(e) => set('siteDescription', e.target.value)} />
          <Input label="Support Email" type="email" value={draft.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} />
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>Currency is fixed at {saved.currency} for this release.</span>
          </div>
        </div>
      </section>

      {/* Tax */}
      <section className="bg-card rounded-xl p-6 border border-border max-w-2xl">
        <h2 className="text-xl font-semibold mb-5">Tax</h2>
        <div className="space-y-4">
          <Input
            label="Tax Rate (%)"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={draft.taxRate}
            onChange={(e) => set('taxRate', e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            VAT percentage applied to the product subtotal (not shipping). Order confirmations and the storefront update automatically.
          </p>
        </div>
      </section>

      {/* Shipping */}
      <section className="bg-card rounded-xl p-6 border border-border max-w-2xl">
        <h2 className="text-xl font-semibold mb-5">Shipping</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Standard Delivery Cost" type="number" min={0} value={draft.standardShippingCost} onChange={(e) => set('standardShippingCost', e.target.value)} />
            <Input label="Express Delivery Cost" type="number" min={0} value={draft.expressShippingCost} onChange={(e) => set('expressShippingCost', e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium text-sm">Express Delivery</p>
              <p className="text-xs text-muted-foreground">Offer express delivery at checkout</p>
            </div>
            <Switch id="express-enabled" checked={draft.expressEnabled} onCheckedChange={(v) => set('expressEnabled', v)} aria-label="Toggle express delivery" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium text-sm">Store Pickup</p>
              <p className="text-xs text-muted-foreground">Offer free store pickup at checkout</p>
            </div>
            <Switch id="pickup-enabled" checked={draft.pickupEnabled} onCheckedChange={(v) => set('pickupEnabled', v)} aria-label="Toggle store pickup" />
          </div>

          <div className="pt-2">
            <h3 className="font-semibold text-sm mb-2">County Surcharges</h3>
            <div className="space-y-2">
              {draft.countySurcharges.map((row, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <Input placeholder="County name" value={row.county} onChange={(e) => setSurcharge(index, 'county', e.target.value)} className="flex-1" />
                  <Input type="number" min={0} placeholder="Fee" value={row.fee} onChange={(e) => setSurcharge(index, 'fee', e.target.value)} className="w-32" />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${row.county || 'county'} surcharge`} onClick={() => removeSurcharge(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addSurcharge} className="mt-2 gap-1">
              <Plus className="w-4 h-4" /> Add County
            </Button>
          </div>

          <Input label="Default Surcharge (unlisted counties)" type="number" min={0} value={draft.defaultCountySurcharge} onChange={(e) => set('defaultCountySurcharge', e.target.value)} />
          <p className="text-sm text-muted-foreground">
            The surcharge is added to standard and express delivery for the selected county. Pickup is always free.
          </p>
        </div>
      </section>

      {/* Payments */}
      <section className="bg-card rounded-xl p-6 border border-border max-w-2xl">
        <h2 className="text-xl font-semibold mb-5">Payments</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium text-sm">M-Pesa (STK Push)</p>
              <p className="text-xs text-muted-foreground">Customers pay via M-Pesa STK push. Disabling rejects new M-Pesa orders server-side.</p>
            </div>
            <Switch id="mpesa-enabled" checked={draft.mpesaEnabled} onCheckedChange={(v) => set('mpesaEnabled', v)} aria-label="Toggle M-Pesa payments" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium text-sm">Credit / Debit Card (Paystack)</p>
              <p className="text-xs text-muted-foreground">
                Customers pay via Paystack card checkout. Disabling rejects new card orders server-side.
              </p>
            </div>
            <Switch id="card-enabled" checked={draft.cardEnabled} onCheckedChange={(v) => set('cardEnabled', v)} aria-label="Toggle card payments" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium text-sm">Pay Later (24-hour reservation)</p>
              <p className="text-xs text-muted-foreground">
                Customers can reserve orders and pay within 24 hours. Disabling rejects new Pay Later orders server-side.
              </p>
            </div>
            <Switch id="bank-pay-later-enabled" checked={draft.bankPayLaterEnabled} onCheckedChange={(v) => set('bankPayLaterEnabled', v)} aria-label="Toggle pay later" />
          </div>
        </div>
      </section>

      {/* Bank Transfer Details */}
      <section className="bg-card rounded-xl p-6 border border-border max-w-2xl">
        <h2 className="text-xl font-semibold mb-5">Bank Transfer</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="font-medium text-sm">Enable Bank Transfer</p>
              <p className="text-xs text-muted-foreground">
                Customers can select Bank Transfer at checkout. Disabling cancels pending bank orders via expiry.
              </p>
            </div>
            <Switch id="bank-transfer-enabled" checked={draft.bankTransferEnabled} onCheckedChange={(v) => set('bankTransferEnabled', v)} aria-label="Toggle bank transfer" />
          </div>
          <Input label="Bank Name" value={draft.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="e.g. KCB Bank" />
          <Input label="Account Name" value={draft.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} placeholder="e.g. NexaMart Ltd" />
          <Input
            label="Account Number"
            value={draft.bankAccountNumber}
            onChange={(e) => {
              const value = e.target.value.replace(/\s/g, '');
              if (/^[A-Za-z0-9]*$/.test(value) && value.length <= 20) {
                set('bankAccountNumber', value);
              }
            }}
            placeholder="e.g. 1234567890"
            error={
              draft.bankAccountNumber && draft.bankAccountNumber.length < 6
                ? 'Account number must be at least 6 characters'
                : undefined
            }
          />
          <p className="text-xs text-muted-foreground mt-1">
            Enter the bank account number as it appears on your bank statement. Typically 6–20 digits or alphanumeric.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Branch" value={draft.bankBranch} onChange={(e) => set('bankBranch', e.target.value)} placeholder="e.g. Nairobi Main" />
            <Input label="SWIFT/BIC Code" value={draft.bankSwiftCode} onChange={(e) => set('bankSwiftCode', e.target.value)} placeholder="e.g. KCBLKENA" />
          </div>
          <Input label="Payment Deadline (hours)" type="number" min={1} value={draft.bankTransferDeadlineHours} onChange={(e) => set('bankTransferDeadlineHours', e.target.value)} />
          <p className="text-sm text-muted-foreground">
            Orders not paid within this window are automatically cancelled and stock is released. Default: 72 hours.
          </p>
        </div>
      </section>

      {/* Account Security */}
      <section className="bg-card rounded-xl p-6 border border-border max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Account Security</h2>
        </div>
        <div className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your current password"
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 6 characters"
            error={newPassword.length > 0 && newPassword.length < 6 ? 'Must be at least 6 characters' : undefined}
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            error={confirmPassword.length > 0 && confirmPassword !== newPassword ? 'Passwords do not match' : undefined}
          />
          <Button onClick={handleChangePassword} disabled={changingPw || !currentPassword || !newPassword || !confirmPassword} className="gap-2">
            <Lock className="w-4 h-4" /> {changingPw ? 'Changing...' : 'Change Password'}
          </Button>
        </div>
      </section>
    </div>
  );
}
