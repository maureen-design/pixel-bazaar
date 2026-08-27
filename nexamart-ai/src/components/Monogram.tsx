import { useSettings } from '../hooks/useSettings';

function getInitials(siteName: string): string {
  const words = siteName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || 'NM';
}

interface MonogramProps {
  className?: string;
}

export function Monogram({ className = 'w-8 h-8 text-sm' }: MonogramProps) {
  const { settings } = useSettings();
  const initials = getInitials(settings.siteName);

  return (
    <div className={`bg-gradient-to-br from-brand to-brand-dark rounded-lg flex items-center justify-center font-bold text-white ${className}`}>
      {initials}
    </div>
  );
}
