export interface ShippingAddress {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  county: string;
}

type ShippingAddressLike = string | ShippingAddress | Record<string, unknown> | null | undefined;

export function formatShippingAddress(value: ShippingAddressLike): string {
  let addr: Record<string, unknown> | null = null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      const parsed: unknown = JSON.parse(trimmed);
      addr = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return '';
    }
  } else if (value && typeof value === 'object') {
    addr = value as Record<string, unknown>;
  }

  if (!addr) return '';

  const str = (v: unknown): string => (v == null ? '' : String(v).trim());
  const fullName = str(addr.full_name);
  const address = str(addr.address);
  const city = str(addr.city);
  const county = str(addr.county);
  const phone = str(addr.phone);

  const lines: string[] = [];
  if (fullName) lines.push(fullName);
  if (address) lines.push(address);

  const countyLabel = county ? (/county$/i.test(county) ? county : `${county} County`) : '';
  const locality = [city, countyLabel].filter(Boolean).join(', ');
  if (locality) lines.push(locality);

  if (phone) lines.push(`Phone: ${phone}`);

  return lines.join('\n');
}

export function formatOrderDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
