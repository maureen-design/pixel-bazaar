import { supabase } from './supabaseClient';

export type DeliveryMethod = 'standard' | 'express' | 'pickup';

export interface CountySurcharges {
  [county: string]: number;
}

export interface PlatformSettings {
  siteName: string;
  siteDescription: string;
  supportEmail: string;
  currency: string;
  taxRate: number;
  standardShippingCost: number;
  expressShippingCost: number;
  pickupEnabled: boolean;
  expressEnabled: boolean;
  countySurcharges: CountySurcharges;
  defaultCountySurcharge: number;
  mpesaEnabled: boolean;
  cardEnabled: boolean;
  bankPayLaterEnabled: boolean;
  bankTransferEnabled: boolean;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  bankSwiftCode: string;
  bankTransferDeadlineHours: number;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  siteName: 'NexaMart AI',
  siteDescription: 'Your trusted multi-vendor marketplace for amazing products from trusted sellers.',
  supportEmail: 'support@nexamart-ai.com',
  currency: 'KES',
  taxRate: 16,
  standardShippingCost: 250,
  expressShippingCost: 600,
  pickupEnabled: true,
  expressEnabled: true,
  countySurcharges: {
    Nairobi: 150,
    Mombasa: 300,
    Kisumu: 250,
    Nakuru: 200,
    Eldoret: 350,
    'Uasin Gishu': 350,
  },
  defaultCountySurcharge: 500,
  mpesaEnabled: true,
  cardEnabled: true,
  bankPayLaterEnabled: true,
  bankTransferEnabled: true,
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankBranch: '',
  bankSwiftCode: '',
  bankTransferDeadlineHours: 72,
};

const PUBLIC_KEYS = [
  'site_name', 'site_description', 'support_email', 'currency', 'tax_rate',
  'standard_shipping_cost', 'express_shipping_cost',
  'pickup_enabled', 'express_enabled',
  'county_surcharges', 'default_county_surcharge',
  'mpesa_enabled', 'card_enabled', 'bank_pay_later_enabled',
  'bank_transfer_enabled', 'bank_name', 'bank_account_name',
  'bank_account_number', 'bank_branch', 'bank_swift_code',
  'bank_transfer_deadline_hours',
] as const;

type SettingKey = (typeof PUBLIC_KEYS)[number];
type RawSettingMap = Partial<Record<SettingKey, unknown>>;

let cachedSettings: PlatformSettings | null = null;
let inflightSettings: Promise<PlatformSettings> | null = null;

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function normalize(raw: RawSettingMap): PlatformSettings {
  return {
    siteName: toString(raw.site_name, DEFAULT_SETTINGS.siteName),
    siteDescription: toString(raw.site_description, DEFAULT_SETTINGS.siteDescription),
    supportEmail: toString(raw.support_email, DEFAULT_SETTINGS.supportEmail),
    currency: toString(raw.currency, DEFAULT_SETTINGS.currency),
    taxRate: toNumber(raw.tax_rate, DEFAULT_SETTINGS.taxRate),
    standardShippingCost: toNumber(raw.standard_shipping_cost, DEFAULT_SETTINGS.standardShippingCost),
    expressShippingCost: toNumber(raw.express_shipping_cost, DEFAULT_SETTINGS.expressShippingCost),
    pickupEnabled: toBoolean(raw.pickup_enabled, DEFAULT_SETTINGS.pickupEnabled),
    expressEnabled: toBoolean(raw.express_enabled, DEFAULT_SETTINGS.expressEnabled),
    countySurcharges:
      typeof raw.county_surcharges === 'object' && raw.county_surcharges !== null && !Array.isArray(raw.county_surcharges)
        ? (raw.county_surcharges as CountySurcharges)
        : DEFAULT_SETTINGS.countySurcharges,
    defaultCountySurcharge: toNumber(raw.default_county_surcharge, DEFAULT_SETTINGS.defaultCountySurcharge),
    mpesaEnabled: toBoolean(raw.mpesa_enabled, DEFAULT_SETTINGS.mpesaEnabled),
    cardEnabled: toBoolean(raw.card_enabled, DEFAULT_SETTINGS.cardEnabled),
    bankPayLaterEnabled: toBoolean(raw.bank_pay_later_enabled, DEFAULT_SETTINGS.bankPayLaterEnabled),
    bankTransferEnabled: toBoolean(raw.bank_transfer_enabled, DEFAULT_SETTINGS.bankTransferEnabled),
    bankName: toString(raw.bank_name, DEFAULT_SETTINGS.bankName),
    bankAccountName: toString(raw.bank_account_name, DEFAULT_SETTINGS.bankAccountName),
    bankAccountNumber: toString(raw.bank_account_number, DEFAULT_SETTINGS.bankAccountNumber),
    bankBranch: toString(raw.bank_branch, DEFAULT_SETTINGS.bankBranch),
    bankSwiftCode: toString(raw.bank_swift_code, DEFAULT_SETTINGS.bankSwiftCode),
    bankTransferDeadlineHours: toNumber(raw.bank_transfer_deadline_hours, DEFAULT_SETTINGS.bankTransferDeadlineHours),
  };
}

export function invalidateSettings(): void {
  cachedSettings = null;
  inflightSettings = null;
}

export async function getSettings(): Promise<PlatformSettings> {
  if (cachedSettings) return cachedSettings;
  if (inflightSettings) return inflightSettings;

  inflightSettings = (async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', PUBLIC_KEYS);

      if (error) throw error;

      const raw: RawSettingMap = {};
      for (const row of data ?? []) {
        raw[row.key as SettingKey] = row.value;
      }

      cachedSettings = normalize(raw);
      return cachedSettings;
    } catch {
      cachedSettings = { ...DEFAULT_SETTINGS };
      return cachedSettings;
    }
  })();

  return inflightSettings;
}

const KEY_MAP: Record<keyof PlatformSettings, string> = {
  siteName: 'site_name',
  siteDescription: 'site_description',
  supportEmail: 'support_email',
  currency: 'currency',
  taxRate: 'tax_rate',
  standardShippingCost: 'standard_shipping_cost',
  expressShippingCost: 'express_shipping_cost',
  pickupEnabled: 'pickup_enabled',
  expressEnabled: 'express_enabled',
  countySurcharges: 'county_surcharges',
  defaultCountySurcharge: 'default_county_surcharge',
  mpesaEnabled: 'mpesa_enabled',
  cardEnabled: 'card_enabled',
  bankPayLaterEnabled: 'bank_pay_later_enabled',
  bankTransferEnabled: 'bank_transfer_enabled',
  bankName: 'bank_name',
  bankAccountName: 'bank_account_name',
  bankAccountNumber: 'bank_account_number',
  bankBranch: 'bank_branch',
  bankSwiftCode: 'bank_swift_code',
  bankTransferDeadlineHours: 'bank_transfer_deadline_hours',
};

export async function updateSettings(partial: Partial<PlatformSettings>): Promise<void> {
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(KEY_MAP) as (keyof PlatformSettings)[]) {
    if (key in partial) {
      payload[KEY_MAP[key]] = partial[key];
    }
  }

  const { error } = await supabase.rpc('set_platform_settings', { p_settings: payload });
  if (error) throw error;

  invalidateSettings();
}

export function getDeliveryBaseCost(method: DeliveryMethod, settings: PlatformSettings): number {
  switch (method) {
    case 'express':
      return settings.expressShippingCost;
    case 'pickup':
      return 0;
    case 'standard':
      return settings.standardShippingCost;
  }
}

export function getCountySurcharge(county: string | undefined, settings: PlatformSettings): number {
  if (!county) return 0;
  const needle = county.trim().toLowerCase();
  const entry = Object.entries(settings.countySurcharges).find(
    ([name]) => name.trim().toLowerCase() === needle
  );
  return entry ? entry[1] : settings.defaultCountySurcharge;
}

export function getShippingCostFor(
  method: DeliveryMethod,
  county: string | undefined,
  settings: PlatformSettings
): number {
  if (method === 'pickup') return 0;
  return getDeliveryBaseCost(method, settings) + getCountySurcharge(county, settings);
}
