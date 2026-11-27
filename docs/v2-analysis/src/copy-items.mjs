// usage: node copy-items.mjs "header comment" name1 name2 ... > section.js
// Copies V1 top-level items verbatim (with the comment block directly above each) in V1 order.
import { readFileSync } from 'node:fs';
const SP = process.env.SP;
const src = readFileSync('/home/user/knack-functions/knackFunctions.js', 'utf8').split('\n');
const inv = JSON.parse(readFileSync(SP + '/inventory.json', 'utf8'));
const [header, ...names] = process.argv.slice(2);
const items = names.map((n) => { const i = inv.find((x) => x.name === n); if (!i) throw new Error('unknown ' + n); return i; }).sort((a, b) => a.start - b.start);
const out = [`// ${header}`];
for (const i of items) {
  let from = i.start;
  while (from > 1 && /^\s*(\/\*\*|\*|\*\/|\/\/)/.test(src[from - 2])) from -= 1;
  // keep a leading comment block only when it is directly attached (no blank line between)
  out.push('', src.slice(from - 1, i.end).join('\n'));
}
console.log(out.join('\n'));
