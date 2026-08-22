import type { ProductVariants } from '../../types';
import { ColorSwatch } from './ColorSwatch';
import { SizePill } from './SizePill';

interface VariantSelectorProps {
  variants: ProductVariants;
  selectedAttributes: Record<string, string>;
  onSelect: (attributes: Record<string, string>) => void;
}

export function VariantSelector({ variants, selectedAttributes, onSelect }: VariantSelectorProps) {
  if (!variants || !variants.options || variants.options.length === 0) {
    return null;
  }

  const isValueAvailable = (optionName: string, value: string) => {
    const others = { ...selectedAttributes, [optionName]: value };
    return variants.combinations.some((combination) => {
      return Object.entries(others).every(([key, val]) => combination.attributes[key] === val);
    });
  };

  const isComplete = variants.options.every(
    (option) => selectedAttributes[option.name]
  );

  const handleSelect = (optionName: string, value: string) => {
    const next = { ...selectedAttributes, [optionName]: value };
    if (isComplete) {
      const hasCombination = variants.combinations.some((combination) =>
        Object.entries(next).every(([key, val]) => combination.attributes[key] === val)
      );
      if (hasCombination) {
        onSelect(next);
      }
    } else {
      onSelect(next);
    }
  };

  return (
    <div className="space-y-5 mb-6">
      {variants.options.map((option) => {
        const isColor = option.name.toLowerCase() === 'color';
        return (
          <div key={option.name}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-secondary-foreground">
                {option.label}:
              </span>
              {selectedAttributes[option.name] && (
                <span className="text-sm text-foreground font-medium">
                  {selectedAttributes[option.name]}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const available = isValueAvailable(option.name, value);
                const selected = selectedAttributes[option.name] === value;
                return isColor ? (
                  <ColorSwatch
                    key={value}
                    colorName={value}
                    selected={selected}
                    disabled={!available}
                    onClick={() => handleSelect(option.name, value)}
                  />
                ) : (
                  <SizePill
                    key={value}
                    label={value}
                    selected={selected}
                    disabled={!available}
                    onClick={() => handleSelect(option.name, value)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
