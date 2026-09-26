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

  const matchesSelection = (candidate: Record<string, string>, attributes: Record<string, string>) =>
    Object.entries(attributes).every(([key, value]) => candidate[key] === value);

  // An option value is offered only when some combination carrying the other
  // selected attributes exists AND has stock, so customers are never shown a
  // choice that cannot be bought.
  const isValueAvailable = (optionName: string, value: string) => {
    const candidate = { ...selectedAttributes, [optionName]: value };
    return variants.combinations.some(
      (combination) => (combination.stock || 0) > 0 && matchesSelection(combination.attributes, candidate)
    );
  };

  // Stock for the value under the current partial selection, used to hint
  // urgency on low-stock options.
  const getValueStock = (optionName: string, value: string) => {
    const candidate = { ...selectedAttributes, [optionName]: value };
    const matches = variants.combinations.filter(
      (combination) => matchesSelection(combination.attributes, candidate)
    );
    if (matches.length === 0) return null;
    return matches.reduce((total, combination) => total + (combination.stock || 0), 0);
  };

  const handleSelect = (optionName: string, value: string) => {
    const next = { ...selectedAttributes, [optionName]: value };
    const hasStockedCombination = variants.combinations.some(
      (combination) => (combination.stock || 0) > 0 && matchesSelection(combination.attributes, next)
    );
    if (!hasStockedCombination) return;
    onSelect(next);
  };

  return (
    <div className="space-y-5 mb-6">
      {variants.options.map((option) => {
        const isColor = option.name.toLowerCase() === 'color';
        const selectedValue = selectedAttributes[option.name];
        const availableCount = option.values.filter((value) => isValueAvailable(option.name, value)).length;
        return (
          <div key={option.name}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-secondary-foreground">
                {option.label}:
              </span>
              {selectedValue ? (
                <span className="text-sm text-foreground font-medium">
                  {selectedValue}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Select one</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const available = isValueAvailable(option.name, value);
                const selected = selectedValue === value;
                const valueStock = available ? getValueStock(option.name, value) : null;
                const isLowStock = valueStock !== null && valueStock > 0 && valueStock <= 5;
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
                    label={isLowStock ? `${value} · only ${valueStock} left` : value}
                    selected={selected}
                    disabled={!available}
                    onClick={() => handleSelect(option.name, value)}
                  />
                );
              })}
            </div>
            {availableCount < option.values.length && (
              <p className="text-xs text-muted-foreground mt-2">
                {availableCount === 0
                  ? `All ${option.label.toLowerCase()} options are currently sold out.`
                  : 'Greyed-out options are sold out for your current selection.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
