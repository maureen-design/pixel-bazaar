import { Link } from 'react-router-dom';
import { FileQuestion, Home, Search } from 'lucide-react';
import { buttonVariants } from '../components/ui/button';

export function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          Sorry, we couldn't find the page you're looking for. It might have been moved or doesn't exist.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className={buttonVariants()}>
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
          <Link to="/search" className={buttonVariants({ variant: 'outline' })}>
            <Search className="w-4 h-4 mr-2" />
            Search Products
          </Link>
        </div>
      </div>
    </div>
  );
}
