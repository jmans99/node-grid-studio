import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installFonts } from './lib/fonts';
import './styles.css';

installFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
