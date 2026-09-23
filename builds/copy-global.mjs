/**
 * Copies knackFunctions.js to dist/knackFunctions.global.js ahead of minification. Done in Node rather than
 * `mkdir -p && cp` so `npm run build` works the same from Windows (cmd.exe) as on the Linux CI runner.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../knackFunctions.js', import.meta.url));
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));

mkdirSync(distDir, { recursive: true });
copyFileSync(source, `${distDir}knackFunctions.global.js`);
