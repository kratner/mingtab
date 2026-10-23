import type { Surface } from './surface';

export function App({ surface }: { surface: Surface }) {
  return (
    <div className="app" data-surface={surface}>
      <header className="app-header">
        <h1>MingTab</h1>
        <span className="surface-tag">{surface === 'newtab' ? 'Board' : 'Side panel'}</span>
      </header>
      <main className="app-main">
        <p className="empty">Your bright hall is clear. Saved collections will appear here.</p>
      </main>
    </div>
  );
}
