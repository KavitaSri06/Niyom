import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installNumberInputScrollGuard } from './lib/numberInputScrollGuard';

// Guards every number field in the app against accidental trackpad edits.
installNumberInputScrollGuard();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
