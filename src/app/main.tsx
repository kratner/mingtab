import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { surfaceFromPath } from './surface';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App surface={surfaceFromPath(location.pathname)} />
  </StrictMode>,
);
