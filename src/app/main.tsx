import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SelectionProvider } from '../select/selection';
import { App } from './App';
import { applyAppearance, parseTextSize } from './prefs';
import { surfaceFromPath } from './surface';
import './app.css';

// Apply the saved text size and corners before the first paint, so the page
// doesn't redraw at another size once App's effect runs.
try {
  applyAppearance(parseTextSize(localStorage.getItem('mingtab.textSize') ?? ''), localStorage.getItem('mingtab.corners') === 'square' ? 'square' : 'rounded');
} catch {
  /* storage blocked: the CSS defaults apply */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SelectionProvider>
      <App surface={surfaceFromPath(location.pathname)} />
    </SelectionProvider>
  </StrictMode>,
);
