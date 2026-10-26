import { useEffect, useState } from 'react';
import { SKIPPED_KEY, UPDATE_KEY, currentNotice, runningVersion, type UpdateNotice } from './update';

/** Re-reads the notice when the stored check changes and whenever the page comes back into view. */
export function useUpdateNotice(): UpdateNotice {
  const [notice, setNotice] = useState<UpdateNotice>({ kind: 'none' });
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const refresh = () => void currentNotice().then(setNotice, () => {});
    refresh();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (UPDATE_KEY in changes || SKIPPED_KEY in changes)) refresh();
    };
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    chrome.storage.onChanged.addListener(onChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return notice;
}

export function UpdateBanner() {
  const notice = useUpdateNotice();
  const [hidden, setHidden] = useState(false);
  if (notice.kind === 'none' || hidden) return null;

  if (notice.kind === 'restart') {
    return (
      <div className="update-banner" role="status" aria-label="Update">
        <span>
          <b>MingTab {notice.version} is ready.</b> Restart MingTab to start using it. Open MingTab pages close and
          reopen on the board.
        </span>
        <button type="button" className="primary small" onClick={() => chrome.runtime.reload()}>
          Restart MingTab
        </button>
      </div>
    );
  }

  const { release } = notice;
  return (
    <div className="update-banner" role="status" aria-label="Update">
      <span>
        <b>MingTab {release.version} is available.</b> You have {runningVersion()}.{' '}
        {release.zipUrl ? 'Download it, unzip it over your MingTab folder, then come back here to restart.' : ''}
      </span>
      {release.zipUrl && (
        <a className="button primary small" href={release.zipUrl}>
          Download
        </a>
      )}
      <a className="button small" href={release.notesUrl} target="_blank" rel="noreferrer">
        What's new
      </a>
      <button type="button" className="small" onClick={() => void chrome.storage.local.set({ [SKIPPED_KEY]: release.version })}>
        Skip this version
      </button>
      <button type="button" className="icon-btn" aria-label="Hide until next time" title="Hide until next time" onClick={() => setHidden(true)}>
        ✕
      </button>
    </div>
  );
}
