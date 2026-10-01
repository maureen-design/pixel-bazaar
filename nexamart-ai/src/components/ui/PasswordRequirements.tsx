import { CheckCircle2, Circle } from 'lucide-react';
import { PASSWORD_REQUIREMENTS } from '../../utils/passwordValidation';

interface PasswordRequirementsProps {
  value: string;
  /** Two-column layout for settings pages with less vertical room. */
  compact?: boolean;
}

function RequirementRow({ label, met }: { label: string; met: boolean }) {
  return (
    <li
      className={`flex items-center gap-2 text-sm ${
        met ? 'text-success' : 'text-muted-foreground'
      }`}
    >
      <span className="sr-only">{met ? 'Requirement met: ' : 'Requirement not met: '}</span>
      {met ? (
        <CheckCircle2 aria-hidden="true" className="w-4 h-4 shrink-0" />
      ) : (
        <Circle aria-hidden="true" className="w-4 h-4 shrink-0" />
      )}
      {label}
    </li>
  );
}

export function PasswordRequirements({ value, compact }: PasswordRequirementsProps) {
  const allMet = PASSWORD_REQUIREMENTS.every((req) => req.test(value));

  return (
    <div className="bg-card border border-border rounded-lg" aria-label="Password requirements">
      <p className="text-sm font-medium text-foreground px-4 pt-4">Your password must have:</p>

      <ul
        className={
          compact
            ? 'px-4 pb-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1'
            : 'px-4 pb-4 mt-2 space-y-1.5'
        }
      >
        {PASSWORD_REQUIREMENTS.map((req) => (
          <RequirementRow key={req.label} label={req.label} met={req.test(value)} />
        ))}
      </ul>

      {/*
        Announced only when the checklist completes, and only while there is
        something typed. A polite region that fires on every keystroke would
        queue up an unreadable stream of announcements; silence until success
        is the useful signal.
      */}
      <p aria-live="polite" role="status" className="sr-only">
        {value && allMet ? 'All password requirements met' : ''}
      </p>
    </div>
  );
}