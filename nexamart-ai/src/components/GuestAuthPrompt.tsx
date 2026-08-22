import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';

interface GuestAuthPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextPath?: string;
  title?: string;
  message?: string;
}

export function GuestAuthPrompt({
  open,
  onOpenChange,
  nextPath = '/',
  title = 'Save this product',
  message = 'Create an account or sign in to save products to your wishlist and find them anytime.',
}: GuestAuthPromptProps) {
  const navigate = useNavigate();

  const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';

  const goToAuth = (path: 'login' | 'signup') => {
    onOpenChange(false);
    navigate(`${path}?next=${encodeURIComponent(safeNext)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Heart aria-hidden="true" className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-lg">{title}</DialogTitle>
          <DialogDescription className="text-center">{message}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button onClick={() => goToAuth('login')}>Sign In</Button>
          <Button variant="outline" onClick={() => goToAuth('signup')}>Create Account</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Maybe Later</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
