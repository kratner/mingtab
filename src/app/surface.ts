// The same app renders in two places. Layout differs: the side panel is a
// narrow single column, the new-tab page is a full board.
export type Surface = 'sidepanel' | 'newtab';

export function surfaceFromPath(pathname: string): Surface {
  return pathname.includes('/newtab/') ? 'newtab' : 'sidepanel';
}
