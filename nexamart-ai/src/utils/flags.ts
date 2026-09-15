const CODE_TO_FLAG: Record<string, string> = {
  AF: '\u{1F1E6}\u{1F1EB}', AL: '\u{1F1E6}\u{1F1F1}', DZ: '\u{1F1E9}\u{1F1FF}', AR: '\u{1F1E6}\u{1F1F7}',
  AU: '\u{1F1E6}\u{1F1FA}', AT: '\u{1F1E6}\u{1F1F9}', BD: '\u{1F1E7}\u{1F1E9}', BE: '\u{1F1E7}\u{1F1EA}',
  BR: '\u{1F1E7}\u{1F1F7}', CA: '\u{1F1E8}\u{1F1E6}', CN: '\u{1F1E8}\u{1F1F3}', CO: '\u{1F1E8}\u{1F1F4}',
  EG: '\u{1F1EA}\u{1F1EC}', FR: '\u{1F1EB}\u{1F1F7}', DE: '\u{1F1E9}\u{1F1EA}', GH: '\u{1F1EC}\u{1F1ED}',
  IN: '\u{1F1EE}\u{1F1F3}', ID: '\u{1F1EE}\u{1F1E9}', IT: '\u{1F1EE}\u{1F1F9}', JP: '\u{1F1EF}\u{1F1F5}',
  KE: '\u{1F1F0}\u{1F1EA}', MY: '\u{1F1F2}\u{1F1FE}', MX: '\u{1F1F2}\u{1F1FD}', MA: '\u{1F1F2}\u{1F1E6}',
  NG: '\u{1F1F3}\u{1F1EC}', PK: '\u{1F1F5}\u{1F1F0}', PH: '\u{1F1F5}\u{1F1ED}', SA: '\u{1F1F8}\u{1F1E6}',
  ZA: '\u{1F1FF}\u{1F1E6}', KR: '\u{1F1F0}\u{1F1F7}', ES: '\u{1F1EA}\u{1F1F8}', TZ: '\u{1F1F9}\u{1F1FF}',
  TH: '\u{1F1F9}\u{1F1ED}', TR: '\u{1F1F9}\u{1F1F7}', AE: '\u{1F1E6}\u{1F1EA}', GB: '\u{1F1EC}\u{1F1E7}',
  US: '\u{1F1FA}\u{1F1F8}', VN: '\u{1F1FB}\u{1F1F3}',
};

export function countryFlag(code?: string | null): string | null {
  if (!code || code.length !== 2) return null;
  const upper = code.toUpperCase();
  return CODE_TO_FLAG[upper] || null;
}
