import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const assets = readdirSync('dist/assets').filter(name => !name.endsWith('.map')).map(name => `/assets/${name}`);
const files = ['/', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', ...assets];
const hash = createHash('sha256').update(files.join('\n') + readFileSync('dist/index.html', 'utf8')).digest('hex').slice(0, 12);
const source = readFileSync('public/sw.js', 'utf8').replace('/* PRECACHE */ []', JSON.stringify(files)).replace('pagemate-shell-v1', `pagemate-shell-${hash}`);
writeFileSync('dist/sw.js', source);
console.log(`PWA shell: ${files.length} assets cached; private data excluded.`);
