import { CheckCircle2, Circle } from 'lucide-react';
import { PASSWORD_REQUIREMENTS } from '../../utils/passwordValidation';

interface PasswordRequirementsProps {
  value: string;
}

export function PasswordRequirements({ value }: PasswordRequirementsProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-1.5">
      <p className="text-sm font-medium text-foreground">Your password must have:</p>
      <ul className="space-y-1.5">
        {PASSWORD_REQUIREMENTS.map((req) => {
          const met = req.test(value);
          return (
            <li
              key={req.label}
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
              {req.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
