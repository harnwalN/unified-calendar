import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Global styles first so component stylesheets (imported by App) win ties in the cascade.
import './styles/tokens.css';
import './styles/app.css';
import App from './App';

// Dev-only mock data (`?mock`); the dynamic import is dropped from production builds.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  void import('./dev/mockEvents').then((m) => m.loadMockData());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
