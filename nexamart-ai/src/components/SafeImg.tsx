import { Package } from 'lucide-react';
import { useState } from 'react';

interface SafeImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackClassName?: string;
}

export function SafeImg({ fallbackClassName, className, ...props }: SafeImgProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={`${className || ''} ${fallbackClassName || ''} flex items-center justify-center bg-muted`}>
        <Package className="w-6 h-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      {...props}
      className={className}
      onError={() => setError(true)}
    />
  );
}
