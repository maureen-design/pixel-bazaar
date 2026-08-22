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
}

export function PasswordInput({
  label,
  value,
  onChange,
  placeholder = 'Enter a password',
  error,
  autoComplete = 'new-password',
  required,
}: PasswordInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <Input
          label={label}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="pr-10"
          error={error}
          required={required}
        />
      </div>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        aria-pressed={show}
        className="mt-[27px] p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
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
