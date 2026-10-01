import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}

/**
 * Password field with a reveal toggle.
 *
 * The toggle is a real <button type="button"> so it never submits the form,
 * and it carries aria-pressed plus a label that states the action, so screen
 * reader users know whether the password is currently visible.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  placeholder = 'Enter a password',
  error,
  autoComplete = 'new-password',
  required,
  hint,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  // The toggle is positioned over the input, so its offset depends on whether
  // a label and an error message are present. Hard-coded 38px matched only the
  // label-present, no-error case and drifted elsewhere.
  const toggleTop = label ? (error ? 'top-[76px]' : 'top-[38px]') : (error ? 'top-[38px]' : 'top-0');

  return (
    <div className="relative">
      <Input
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
        error={error}
        hint={hint}
        required={required}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? `Hide ${label || 'password'}` : `Show ${label || 'password'}`}
        aria-pressed={show}
        title={show ? 'Hide password' : 'Show password'}
        className={`absolute right-1 ${toggleTop} p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors`}
      >
        {show ? (
          <EyeOff aria-hidden="true" className="w-4 h-4" />
        ) : (
          <Eye aria-hidden="true" className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}