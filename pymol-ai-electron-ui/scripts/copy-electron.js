import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/electron', { recursive: true });
cpSync('electron/main.cjs', 'dist/electron/main.cjs');
cpSync('electron/preload.cjs', 'dist/electron/preload.cjs');
console.log('Copied electron bundles.');
