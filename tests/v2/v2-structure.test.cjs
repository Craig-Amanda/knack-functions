/**
 * Structural guarantees for knackFunctionsV2.js against knackFunctions.js:
 * - it parses as a classic script with no duplicate top-level declarations;
 * - every V1 global is either declared in V2 or listed in V2's "Not yet ported" index;
 * - every V1 function that V2 declares keeps V1's parameter list exactly (a signature change must ship under a
 *   new name, with the old name kept as a shim), unless tests/v2/signature-exceptions.json documents why the
 *   change is backwards compatible (e.g. a new optional trailing parameter).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parse } = require('acorn');

const ROOT = path.join(__dirname, '..', '..');
const V1_PATH = path.join(ROOT, 'knackFunctions.js');
const V2_PATH = process.env.KF_V2_PATH || path.join(ROOT, 'knackFunctionsV2.js');
const EXCEPTIONS_PATH = path.join(__dirname, 'signature-exceptions.json');

function declarations(source) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    const out = new Map();
    const duplicates = [];
    const add = (name, params, kind) => { if (out.has(name)) duplicates.push(name); out.set(name, { params, kind }); };
    const paramText = (fn) => fn.params.map((p) => source.slice(p.start, p.end).replace(/\s+/g, '')).join(',');
    for (const node of ast.body) {
        if (node.type === 'FunctionDeclaration') add(node.id.name, paramText(node), 'function');
        else if (node.type === 'ClassDeclaration') add(node.id.name, null, 'class');
        else if (node.type === 'VariableDeclaration') {
            for (const d of node.declarations) {
                if (d.id.type !== 'Identifier') continue;
                const fn = d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') ? paramText(d.init) : null;
                add(d.id.name, fn, fn === null ? node.kind : `${node.kind} fn`);
            }
        }
    }
    return { out, duplicates };
}

function pendingIndex(source) {
    // Lines such as `// TODO(v2-wave-2): renderInteractiveTable` inside the "Not yet ported" section.
    return new Set([...source.matchAll(/^\s*\/\/\s*TODO\(v2-wave-[123]\):\s*([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
}

test('knackFunctionsV2.js exists, parses as a classic script and passes node --check', () => {
    assert.ok(fs.existsSync(V2_PATH), 'knackFunctionsV2.js is missing');
    execFileSync(process.execPath, ['--check', V2_PATH], { stdio: 'pipe' });
    const { duplicates } = declarations(fs.readFileSync(V2_PATH, 'utf8'));
    assert.deepEqual(duplicates, [], 'duplicate top-level declarations in V2');
});

test('every V1 global is declared in V2 or listed in its "Not yet ported" index', () => {
    const v1 = declarations(fs.readFileSync(V1_PATH, 'utf8')).out;
    const v2Source = fs.readFileSync(V2_PATH, 'utf8');
    const v2 = declarations(v2Source).out;
    const pending = pendingIndex(v2Source);
    const missing = [...v1.keys()].filter((name) => !v2.has(name) && !pending.has(name));
    assert.deepEqual(missing, [], 'V1 globals neither ported nor indexed as pending');
    const bothPortedAndPending = [...pending].filter((name) => v2.has(name));
    assert.deepEqual(bothPortedAndPending, [], 'names listed as pending that V2 already declares');
});

test('V2 keeps the V1 parameter list for every function it declares under a V1 name', () => {
    const v1 = declarations(fs.readFileSync(V1_PATH, 'utf8')).out;
    const v2 = declarations(fs.readFileSync(V2_PATH, 'utf8')).out;
    const exceptions = fs.existsSync(EXCEPTIONS_PATH) ? JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, 'utf8')) : {};
    const changed = [];
    for (const [name, v1Decl] of v1) {
        const v2Decl = v2.get(name);
        if (!v2Decl || v1Decl.params === null || v2Decl.params === null) continue;
        if (v1Decl.params === v2Decl.params) continue;
        const exception = exceptions[name];
        if (exception && exception.v1 === v1Decl.params && exception.v2 === v2Decl.params && exception.reason) continue;
        changed.push(`${name}: V1 (${v1Decl.params}) vs V2 (${v2Decl.params})`);
    }
    assert.deepEqual(changed, [], 'parameter lists that changed without a documented exception');
});
