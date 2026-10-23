/* toby-space-map.js
 *
 * Toby's JSON export has no spaces or organizations: it's a flat list of
 * collections. This read-only console script recovers which space each
 * collection belongs to, so MingTab's importer can rebuild them.
 *
 * Run it in the DevTools console on https://web.gettoby.com while logged in.
 * It downloads toby-space-map.json. It reads Toby Web's cached state from
 * localStorage, sends nothing anywhere, and changes nothing in Toby.
 *
 * Collections are matched to the export by a fingerprint (SHA-256 of the
 * title plus card URLs) so the map itself holds no URLs. The importer
 * computes the same fingerprint (src/import/toby.ts → fingerprint()).
 */
(async () => {
  const state = JSON.parse(JSON.parse(localStorage.state)['@@@@TOBY_WRAPPER_KEY@@@@']);
  const spaces = [];
  for (const team of state.teams.teams) {
    for (const g of team.groups?.groups || []) {
      spaces.push({ id: g.id, name: g.name || '', org: team.name, type: g.type, createdAt: g.createdAt });
    }
  }
  const hash = async (str) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)))]
      .slice(0, 6)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const lists = [];
  for (const l of Object.values(state.lists)) {
    const cards = [...l.cards].sort((a, b) => a.position - b.position);
    lists.push({
      fp: await hash(l.title + '\n' + cards.map((c) => c.url).join('\n')),
      spaceId: l.groupId,
      position: l.position,
      star: !!l.star,
      createdAt: l.createdAt,
    });
  }
  const map = { kind: 'toby-space-map', version: 1, spaces, lists };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' }));
  a.download = 'toby-space-map.json';
  a.click();
  console.log(`toby-space-map.json: ${spaces.length} spaces, ${lists.length} collections`);
})();
