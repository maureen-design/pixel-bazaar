import { Check } from 'lucide-react';

interface ColorSwatchProps {
  colorName: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const COLOR_MAP: Record<string, string> = {
  black: '#111111',
  white: '#ffffff',
  navy: '#1B2A4A',
  red: '#dc2626',
  blue: '#2563eb',
  green: '#16a34a',
  grey: '#6b7280',
  gray: '#6b7280',
  olive: '#708238',
  brown: '#8b5a2b',
  beige: '#f5f5dc',
  yellow: '#eab308',
  orange: '#ea580c',
  pink: '#ec4899',
  purple: '#9333ea',
  teal: '#0d9488',
};

export function ColorSwatch({ colorName, selected, disabled, onClick }: ColorSwatchProps) {
  const hex = COLOR_MAP[colorName.toLowerCase()] || '#cccccc';
  const isLight = ['white', 'beige', 'yellow', 'orange'].includes(colorName.toLowerCase());

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={colorName}
      aria-label={colorName}
      aria-pressed={selected}
      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
        disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span
        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${
          selected
            ? 'border-primary ring-2 ring-primary/30 scale-110'
            : 'border-border hover:border-primary/60'
        }`}
        style={{ backgroundColor: hex }}
      >
        {selected && (
          <Check
            className={`w-4 h-4 ${isLight ? 'text-gray-900' : 'text-white'}`}
            strokeWidth={3}
          />
        )}
        {!selected && isLight && (
          <span className="w-full h-full rounded-full border border-border/50" />
        )}
      </span>
    </button>
  );
}
