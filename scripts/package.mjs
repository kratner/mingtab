// Builds dist/ and zips it for a release: release/mingtab-<version>.zip, plus
// release/NOTES.md (this version's CHANGELOG.md section, then install steps)
// for the GitHub Release page.
// With --store (npm run package:store): builds dist-store/ for the Chrome Web
// Store instead (no manifest key, no GitHub update checks) and zips it to
// release/mingtab-<version>-store.zip. Upload that zip in the developer dashboard.
// Cross-platform: uses the system zip on macOS/Linux, PowerShell on Windows.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const store = process.argv.includes('--store');
const out = path.join(root, 'release');
const zip = path.join(out, store ? `mingtab-${version}-store.zip` : `mingtab-${version}.zip`);
const distDir = path.join(root, store ? 'dist-store' : 'dist');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, store ? ['run', 'build', '--', '--outDir', 'dist-store', '--emptyOutDir'] : ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: store ? { ...process.env, VITE_STORE: '1' } : process.env,
});
const manifest = JSON.parse(readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
if (manifest.version !== version) throw new Error(`${path.basename(distDir)} is ${manifest.version}, package.json is ${version}`);
if (store && manifest.key) throw new Error('dist-store/manifest.json has a key: the Chrome Web Store rejects it');
if (!store && !manifest.key) throw new Error('dist/manifest.json has no key: the extension ID would not be fixed');

mkdirSync(out, { recursive: true });
if (existsSync(zip)) rmSync(zip);
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zip}'`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zip, '.'], { cwd: distDir, stdio: 'inherit' });
}
if (store) {
  console.log(`→ ${path.relative(root, zip)} (Chrome Web Store)`);
  process.exit(0);
}

// "## 0.7.0 — date" up to the next "## " heading.
const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const section = changelog.split(/^## /m).find((s) => s.startsWith(`${version} `));
if (!section) throw new Error(`CHANGELOG.md has no "## ${version}" section`);
const changes = section.slice(section.indexOf('\n') + 1).trim().replace(/^### /gm, '## ');

writeFileSync(
  path.join(out, 'NOTES.md'),
  `${changes}

## Install or update MingTab ${version}

1. Download **mingtab-${version}.zip** below and unzip it into a folder you'll keep, for example \`~/Applications/MingTab\` or \`C:\\Users\\<you>\\MingTab\`. To **update**, unzip over the same folder (replace everything).
2. Open \`chrome://extensions\`, turn on **Developer mode**, click **Load unpacked** and choose that folder. (Updating: MingTab shows **Restart MingTab** within a minute; click it, or ↻ on MingTab in \`chrome://extensions\`.)
3. Pin MingTab, then **Settings → Sign in with Google** to sync.

Every copy has the same extension ID (\`${'jclkedgbnlmbonoihhobgnmdoehmddpo'}\`), so where you unzip it doesn't matter. Full guide: README.md.
`,
);
console.log(`→ ${path.relative(root, zip)}`);
