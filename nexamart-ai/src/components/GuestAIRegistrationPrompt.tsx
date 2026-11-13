import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { GuestAuthPrompt } from './GuestAuthPrompt';

export function GuestAIRegistrationPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleLimit = () => setOpen(true);
    window.addEventListener('nexamart:guest-ai-limit', handleLimit);
    return () => window.removeEventListener('nexamart:guest-ai-limit', handleLimit);
  }, []);

  return (
    <GuestAuthPrompt
      open={open}
      onOpenChange={setOpen}
      nextPath="/"
      title="Experience more with NexaMart AI"
      message="Create a free account to experience more of our AI shopping assistance and personalized recommendations. You can continue browsing the marketplace without registering."
      icon={<Sparkles aria-hidden="true" className="w-6 h-6 text-primary" />}
    />
  );
}
