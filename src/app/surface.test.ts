import { describe, expect, it } from 'vitest';
import { surfaceFromPath } from './surface';

describe('surfaceFromPath', () => {
  it('detects the new-tab page', () => {
    expect(surfaceFromPath('/src/newtab/index.html')).toBe('newtab');
  });

  it('defaults to the side panel', () => {
    expect(surfaceFromPath('/src/sidepanel/index.html')).toBe('sidepanel');
    expect(surfaceFromPath('/')).toBe('sidepanel');
  });
});
