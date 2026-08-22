import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Activate dark mode by default unless the user chose light mode previously.
// Applying this before render prevents a dark flash on reload in light mode.
if (localStorage.getItem('theme') !== 'light') {
  document.documentElement.classList.add('dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);