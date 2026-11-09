// MingTab promo video: real UI from the built extension (dist/) with demo data
// (docs/demo-data.json, never personal collections), captioned in the Four Ounces
// style, assembled with ffmpeg into a silent 1920x1080 H.264 MP4.
//
//   npm run build && node scripts/promo-video.mjs [out.mp4]
//
// Needs ffmpeg with libx264 on PATH. Frames are full-resolution screenshots
// (1280x720 at 1.5x = 1920x1080), held for set times and cross-faded between
// beats, so the UI stays sharp (Playwright's own screen recording is soft).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const out = path.resolve(process.argv[2] ?? path.join(root, 'release', 'mingtab-promo.mp4'));
const work = path.join(os.tmpdir(), `mingtab-promo-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(path.dirname(out), { recursive: true });

const FPS = 30;
const FADE = 0.5;

// Brand art from this repo: the MingTab seal icon and the Four Ounces mark
// (its geometry lives in src/app/FourOuncesMark.tsx; drawn here at the kit's
// large-size stroke of 6).
const seal = readFileSync(path.join(root, 'branding', 'icons', 'h-ming-seal.svg'), 'utf8')
  .replace(/<title>.*?<\/title>/, '')
  .replace(/<!--[\s\S]*?-->/g, '');
const enso = readFileSync(path.join(root, 'src', 'app', 'FourOuncesMark.tsx'), 'utf8').match(/const ENSO = '([^']+)'/)[1];
const mark = `<svg viewBox="0 0 104 72" width="208" height="144"><g fill="none" stroke="#EDE8DE" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 12 L4 44 H32 M26 26 V62"/><path d="M76 32 H98 L76 62 H98"/></g><g transform="translate(52 47) scale(0.43) translate(-50 -50)" fill="#C9A24A"><path d="${enso}"/></g></svg>`;

// Demo pages for the open-tabs pane. Made-up hosts (not HSTS-preloaded, so plain
// http works) all resolve to this local server, so saved tabs show believable sites.
const PAGES = {
  'http://docs.northwind.co/quarterly-plan': 'Quarterly plan',
  'http://design.northwind.co/review': 'Design review',
  'http://www.lisbonstays.com/shortlist': 'Hotel shortlist',
  'http://notes.northwind.co/packing-list': 'Packing list',
  'http://notes.northwind.co/standup': 'Team standup notes',
  'http://mail.northwind.co/inbox': 'Inbox (3)',
};
const titleOf = (host, url) => PAGES[`http://${host}${url}`] ?? 'Untitled';
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><title>${titleOf(req.headers.host, req.url)}</title>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = (title) => Object.keys(PAGES).find((u) => PAGES[u] === title);

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    `--host-resolver-rules=MAP *.northwind.co 127.0.0.1:${port}, MAP www.lisbonstays.com 127.0.0.1:${port}`,
  ],
});
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const id = new URL(worker.url()).host;

await worker.evaluate(async (urls) => {
  const win = await chrome.windows.create({ url: urls, focused: false });
  const tabs = await chrome.tabs.query({ windowId: win.id });
  const gid = await chrome.tabs.group({ tabIds: tabs.slice(2).map((t) => t.id), createProperties: { windowId: win.id } });
  await chrome.tabGroups.update(gid, { title: 'Lisbon trip', color: 'cyan' });
  await new Promise((r) => setTimeout(r, 800));
}, ['Quarterly plan', 'Design review', 'Hotel shortlist', 'Packing list'].map(url));

const page = await context.newPage();
for (const p of context.pages()) if (p !== page && p.url() === 'about:blank') await p.close();
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Work' : undefined));
await page.goto(`chrome-extension://${id}/src/newtab/index.html`);
// Two ordinary tabs beside MingTab, so "This window" looks like a real one.
await worker.evaluate(async (urls) => {
  const [self] = await chrome.tabs.query({ url: `chrome-extension://${chrome.runtime.id}/*` });
  for (const u of urls) await chrome.tabs.create({ windowId: self.windowId, url: u, active: false, index: 0 });
  await new Promise((r) => setTimeout(r, 500));
}, ['Team standup notes', 'Inbox (3)'].map(url));

await page.getByRole('button', { name: 'Import from Toby' }).click();
await page.getByLabel('Toby export (.json)').setInputFiles(path.join(root, 'docs', 'demo-data.json'));
await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.locator('.card').first().waitFor();
await page.getByRole('button', { name: 'Rename Imported from Toby' }).click();
await page.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: 'Work', exact: true }).waitFor();
await page.getByRole('button', { name: 'Star October release' }).click();
await page.getByRole('button', { name: 'Tag Lisbon trip' }).click();
await page.getByRole('combobox', { name: 'Add tag to Lisbon trip' }).fill('Travel');
await page.getByRole('combobox', { name: 'Add tag to Lisbon trip' }).press('Enter');
await page.getByRole('button', { name: 'Tag Lisbon trip' }).click();

const setTheme = async (mode) => {
  await page.evaluate((m) => localStorage.setItem('mingtab.theme', m), mode);
  await page.reload();
  await page.locator('.card').first().waitFor();
  await page.waitForTimeout(400);
};
await setTheme('dark');

// --- overlays -------------------------------------------------------------
const OVERLAY_CSS = `
#promo-cap{position:fixed;left:0;right:0;bottom:0;z-index:2147483646;display:flex;align-items:center;gap:18px;
  padding:16px 32px;background:rgba(14,13,11,.94);border-top:1px solid #2C2A26;pointer-events:none}
#promo-cap .k{font:400 12px 'Archivo Black',sans-serif;letter-spacing:.18em;color:#C9A24A;white-space:nowrap}
#promo-cap .l{font:600 24px/1.2 Inter,sans-serif;color:#EDE8DE;letter-spacing:-.01em}
#promo-card{position:fixed;inset:0;z-index:2147483647;background:#0E0D0B;color:#EDE8DE;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:22px;text-align:center}
#promo-card .row{display:flex;align-items:center;gap:26px}
#promo-card .n{font:400 64px 'Archivo Black',sans-serif;letter-spacing:.04em}
#promo-card .t{font:600 34px Inter,sans-serif;color:#EDE8DE}
#promo-card .s{font:400 22px Inter,sans-serif;color:#9A948A}
#promo-card .g{font:400 22px Inter,sans-serif;color:#C9A24A}
.promo-hit{outline:3px solid #C9A24A !important;outline-offset:3px !important;border-radius:6px}`;

const ensureCss = () =>
  page.evaluate((css) => {
    if (!document.getElementById('promo-css')) {
      const s = document.createElement('style');
      s.id = 'promo-css';
      s.textContent = css;
      document.head.append(s);
    }
  }, OVERLAY_CSS);

const caption = async (label, line, lift = 0) => {
  await ensureCss();
  await page.evaluate(
    ([label, line, lift]) => {
      document.getElementById('promo-cap')?.remove();
      if (!line) return;
      const d = document.createElement('div');
      d.id = 'promo-cap';
      d.innerHTML = `<span class="k"></span><span class="l"></span>`;
      d.querySelector('.k').textContent = label;
      d.querySelector('.l').textContent = line;
      d.style.bottom = `${lift}px`;
      document.body.append(d);
    },
    [label, line, lift],
  );
};

const card = async (html) => {
  await ensureCss();
  await page.evaluate((html) => {
    document.getElementById('promo-card')?.remove();
    if (!html) return;
    const d = document.createElement('div');
    d.id = 'promo-card';
    d.innerHTML = html;
    document.body.append(d);
  }, html);
  await page.evaluate(() => document.fonts.ready);
};

const highlight = (locator, on) => locator.evaluate((el, on) => el.classList.toggle('promo-hit', on), on);

// --- frames ---------------------------------------------------------------
const beats = [];
let frameNo = 0;
const beat = () => beats.push([]) && beats[beats.length - 1];
const shot = async (seconds) => {
  const file = path.join(work, `f${String(frameNo++).padStart(4, '0')}.png`);
  await page.screenshot({ path: file });
  beats[beats.length - 1].push({ file, seconds });
};

// 1. Title
beat();
await card(
  `<div class="row"><div style="width:120px;height:120px">${seal.replace('<svg ', '<svg width="120" height="120" ')}</div><div class="n">MINGTAB</div></div>` +
    `<div class="t">Keep your tab bar clear.</div><div class="s">A tab manager for Chrome</div>`,
);
await shot(3.5);
await card('');

// 2. Board overview
beat();
await caption('MINGTAB', 'Your tabs, saved as collections. Spaces keep them sorted.');
await shot(5);

// 3. Save a window from the open-tabs pane
beat();
await caption('SAVE', 'Save a whole window in one click.');
const saveWindow = page.getByRole('button', { name: 'Save window' }).last();
await highlight(saveWindow, true);
await shot(2.2);
await highlight(saveWindow, false);
const before = await page.locator('.collection').count();
await saveWindow.click();
// Saving asks for a name first.
await page.locator('input:focus').fill('Planning week');
await page.waitForTimeout(200);
await shot(1.4);
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForFunction((n) => document.querySelectorAll('.collection').length > n, before, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(500);
await caption('SAVE', 'Saved and closed. Bring it back whenever you need it.');
await shot(3.8);

// 4. Search
beat();
await caption('SEARCH', 'Find anything you saved, or any open tab. Press /.');
await page.keyboard.press('/');
await shot(0.8);
for (const ch of 'lisbon') {
  await page.keyboard.type(ch);
  await page.waitForTimeout(250);
  await shot(0.18);
}
await page.waitForTimeout(300);
await shot(3.2);
await page.getByRole('searchbox', { name: 'Search' }).fill('');
await page.keyboard.press('Escape');

// 5. Select mode
beat();
await caption('SELECT', 'Pick cards anywhere. Act on them together.', 64);
await page.getByRole('button', { name: 'Select', exact: true }).click();
await page.waitForTimeout(300);
await shot(1.2);
for (const name of ['Lisbon - Wikipedia', 'Flights to Portugal', 'Customer survey results - Google Sheets']) {
  await page.getByRole('checkbox', { name: `Select ${name}` }).click();
  await page.waitForTimeout(250);
  await shot(0.8);
}
await shot(2.4);
await page.getByRole('button', { name: 'Done', exact: true }).click();

// 6. Stats
beat();
await caption('STATS', "See what you've saved: biggest collections, top sites, duplicates.");
await page.getByRole('button', { name: 'Stats' }).first().click();
await page.getByRole('list', { name: 'Totals' }).waitFor();
await page.waitForTimeout(400);
await shot(4.5);
await page.getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name: 'Work', exact: true }).click();

// 7. Light theme
beat();
await setTheme('light');
await caption('THEMES', 'Light or dark. Your collections stay on your computer.');
await shot(3.5);

// 8. End card
beat();
await card(
  `<div class="row"><div style="width:96px;height:96px">${seal.replace('<svg ', '<svg width="96" height="96" ')}</div><div class="n" style="font-size:52px">MINGTAB</div></div>` +
    `<div class="t">Free on the Chrome Web Store</div>` +
    `<div style="margin-top:28px">${mark}</div><div class="s">A Four Ounces tool · <span class="g">fourounces.live</span></div>`,
);
await shot(4.5);

await context.close();
server.close();

// --- assemble -------------------------------------------------------------
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const clips = beats.map((frames, i) => {
  // Each frame is looped for exactly its hold time, then the frames are joined.
  const inputs = frames.flatMap((f) => ['-loop', '1', '-framerate', String(FPS), '-t', String(f.seconds), '-i', f.file]);
  const join = frames.map((_, k) => `[${k}:v]scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[f${k}]`).join(';');
  const concat = `${frames.map((_, k) => `[f${k}]`).join('')}concat=n=${frames.length}:v=1:a=0[v]`;
  const clip = path.join(work, `beat${i}.mp4`);
  ff([...inputs, '-filter_complex', `${join};${concat}`, '-map', '[v]', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-r', String(FPS), clip]);
  // Measure the clip: the concat demuxer's timing differs a little from the sum of holds.
  const seconds = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]).toString().trim(),
  );
  return { clip, seconds };
});

// Cross-fade the beats into one clip.
const inputs = clips.flatMap((c) => ['-i', c.clip]);
let filter = '';
let last = '[0:v]';
let offset = 0;
for (let i = 1; i < clips.length; i++) {
  offset += clips[i - 1].seconds - FADE;
  const label = i === clips.length - 1 ? '[v]' : `[x${i}]`;
  filter += `${last}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}${label};`;
  last = label;
}
const total = offset + clips[clips.length - 1].seconds;
filter += `[v]fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[out]`;
ff([...inputs, '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', out]);
rmSync(work, { recursive: true, force: true });
console.log(`→ ${out} (${total.toFixed(1)} s)`);
