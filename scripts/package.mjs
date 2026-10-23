// Builds dist/ and zips it for a release: release/mingtab-<version>.zip, plus
// release/NOTES.md (install steps) for the GitHub Release page.
// Cross-platform: uses the system zip on macOS/Linux, PowerShell on Windows.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const out = path.join(root, 'release');
const zip = path.join(out, `mingtab-${version}.zip`);

execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
const manifest = JSON.parse(readFileSync(path.join(root, 'dist', 'manifest.json'), 'utf8'));
if (manifest.version !== version) throw new Error(`dist is ${manifest.version}, package.json is ${version}`);
if (!manifest.key) throw new Error('dist/manifest.json has no key: the extension ID would not be fixed');

mkdirSync(out, { recursive: true });
if (existsSync(zip)) rmSync(zip);
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${path.join(root, 'dist')}\\*' -DestinationPath '${zip}'`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-qr', zip, '.'], { cwd: path.join(root, 'dist'), stdio: 'inherit' });
}

writeFileSync(
  path.join(out, 'NOTES.md'),
  `## Install or update MingTab ${version}

1. Download **mingtab-${version}.zip** below and unzip it into a folder you'll keep, for example \`~/Applications/MingTab\` or \`C:\\Users\\<you>\\MingTab\`. To **update**, unzip over the same folder (replace everything).
2. Open \`chrome://extensions\`, turn on **Developer mode**, click **Load unpacked** and choose that folder. (Updating: click ↻ on MingTab instead.)
3. Pin MingTab, then **Settings → Sign in with Google** to sync.

Every copy has the same extension ID (\`${'jclkedgbnlmbonoihhobgnmdoehmddpo'}\`), so where you unzip it doesn't matter. Full guide: README.md.
`,
);
console.log(`→ ${path.relative(root, zip)}`);
