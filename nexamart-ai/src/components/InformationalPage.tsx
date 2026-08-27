import type { ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

interface InformationalPageProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

// Shared shell for static informational pages (About / Contact / Privacy /
// Terms): keeps them visually consistent with the storefront while staying
// readable as documents.
export function InformationalPage({ title, subtitle, children }: InformationalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{title}</h1>
        {subtitle ? (
          <p className="text-lg text-muted-foreground mb-10">{subtitle}</p>
        ) : (
          <div className="mb-10" />
        )}
        <div className="space-y-10">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
