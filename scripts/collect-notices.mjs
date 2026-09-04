import { readFile, writeFile } from 'node:fs/promises';

const packages = ['react', 'react-dom', 'scheduler', 'three', '@fontsource/ibm-plex-mono', '@fontsource/barlow-condensed', 'steamworks.js', 'koffi'];
const notices = ['Undead Survivor — bundled library and font license notices\n\nElectron and Chromium notices are also included beside the extracted application executable.'];
notices.push(await readFile(new URL('../public/models/weapons/README.md', import.meta.url), 'utf8'));
for (const name of packages) {
  const root = new URL(`../node_modules/${name}/`, import.meta.url);
  const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const license = await readFile(new URL(name === 'koffi' ? 'LICENSE.txt' : 'LICENSE', root), 'utf8');
  notices.push(`${name} ${version}\n${'-'.repeat(60)}\n${license.trim()}`);
}
await writeFile(new URL('../public/THIRD-PARTY-NOTICES.txt', import.meta.url), notices.join('\n\n\n') + '\n');
