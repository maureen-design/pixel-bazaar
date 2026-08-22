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

export function validateFullName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Full name is required';
  if (!/[A-Za-z]/.test(trimmed)) return 'Full name must contain at least one letter';
  if (!/^[A-Za-z]/.test(trimmed)) return 'Full name must start with a letter';
  return null;
}
