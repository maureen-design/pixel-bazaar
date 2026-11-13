import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Activate dark mode by default unless the user chose light mode previously.
// Applying this before render prevents a dark flash on reload in light mode.
if (localStorage.getItem('theme') !== 'light') {
  document.documentElement.classList.add('dark');
}

// Restore accessibility preferences before React renders to avoid a visual flash.
if (localStorage.getItem('high-contrast') === 'true') {
  document.documentElement.classList.add('high-contrast');
}
if (localStorage.getItem('text-scale-large') === 'true') {
  document.documentElement.classList.add('text-scale-large');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);