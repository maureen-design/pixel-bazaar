export interface PasswordRequirement {
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'One number', test: (v) => /\d/.test(v) },
  { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function meetsAllRequirements(value: string): boolean {
  return PASSWORD_REQUIREMENTS.every((req) => req.test(value));
}

/**
 * Human-readable reason a password fails, or null when it passes.
 *
 * Returns only the FIRST unmet requirement on purpose. Listing every failure
 * at once ("needs uppercase, needs digit, needs special") reads as a wall of
 * red on every keystroke and discourages people from finishing. The
 * PasswordRequirements checklist already shows all of them live.
 */
export function firstUnmetRequirement(value: string): string | null {
  if (!value) return null;
  const unmet = PASSWORD_REQUIREMENTS.find((req) => !req.test(value));
  return unmet ? unmet.label : null;
}

/**
 * True when the new password is the same as the current one.
 *
 * Supabase rejects a repeat with an opaque "should be different" message, so
 * catching it up front turns a confusing server error into a clear one.
 */
export function isSameAsCurrent(newPassword: string, currentPassword: string): boolean {
  if (!newPassword || !currentPassword) return false;
  return newPassword === currentPassword;
}

export function validateFullName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Full name is required';
  if (!/[A-Za-z]/.test(trimmed)) return 'Full name must contain at least one letter';
  if (!/^[A-Za-z]/.test(trimmed)) return 'Full name must start with a letter';
  return null;
}
