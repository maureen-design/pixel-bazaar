// Display-only formatter: groups an account number into blocks of four,
// e.g. "1234567890123456" -> "1234 5678 9012 3456".
// The stored value is never modified — this is purely for readability.
// Alphanumeric account numbers group the same way; stray whitespace is ignored.
export function formatBankAccount(value: string): string {
  const clean = value.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  const groups = clean.match(/.{1,4}/g) || [clean];
  return groups.join(' ');
}
