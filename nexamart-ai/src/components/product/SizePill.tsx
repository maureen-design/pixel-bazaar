interface SizePillProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function SizePill({ label, selected, disabled, onClick }: SizePillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-md text-sm font-medium border transition-all ${
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-foreground border-border hover:border-primary/60'
      } ${disabled ? 'opacity-30 cursor-not-allowed line-through' : 'cursor-pointer'}`}
    >
      {label}
    </button>
  );
}
