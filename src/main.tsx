import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
// Global styles first so component stylesheets (imported by App) win ties in the cascade.
import './styles/tokens.css';
import './styles/app.css';
import './styles/motion.css';
import App from './App';

// Dev-only mock data (`?mock`); the dynamic import is dropped from production builds.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  void Promise.all([import('./dev/mockEvents'), import('./dev/mockTasks'), import('./dev/mockTime')]).then(
    ([events, tasks, time]) => {
      events.loadMockData();
      tasks.loadMockTasks();
      time.loadMockTime();
    },
  );
}

// Dev-only visual feedback toolbar; lazy so it never lands in the production bundle.
const Agentation = import.meta.env.DEV
  ? lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {Agentation && (
      <Suspense fallback={null}>
        <Agentation />
      </Suspense>
    )}
  </StrictMode>,
);
