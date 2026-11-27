/**
 * Loads the complete V1 and V2 bundles as classic scripts in a page (as Knack does) and checks that V2 loads without
 * errors, defines every global it declares, and exposes the same shape as V1 for each of them.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { realm, V1, V2, shutdown } = require('./harness.cjs');
const { topLevelNames } = require('./extract.cjs');

after(shutdown);

// Object globals whose own keys intentionally differ from V1.
const KEY_EXCEPTIONS = { knackNavigator: 'the private _fieldTypeCache map was dropped (getFieldType reuses the memoised field meta)' };

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8');

async function load(file) {
    const r = await realm({ file: V1, names: ['getById'], html: '<div id="knack-body"></div>' }); // jQuery + stubs only
    try {
        await r.run(() => { window.__globalsBefore = null; });
        await r.page.addScriptTag({ content: read(file) });
        const names = topLevelNames(file);
        const shapes = await r.run((list) => Object.fromEntries(list.map((name) => {
            let value; try { value = (0, eval)(name); } catch (error) { return [name, 'MISSING']; }
            const type = typeof value;
            return [name, type === 'function' ? `function/${value.length}` : type === 'object' && value ? `object:${Object.keys(value).sort().join(',')}` : type];
        })), names);
        return { shapes, errors: r.consoleMessages.filter((m) => m.type === 'pageerror').map((m) => m.text) };
    } finally { await r.close(); }
}

test('V2 loads cleanly and every global it declares exists', async () => {
    const v2 = await load(V2);
    assert.deepEqual(v2.errors, []);
    assert.deepEqual(Object.entries(v2.shapes).filter(([, shape]) => shape === 'MISSING'), []);
});

test('V2 globals have the same kind (and parameter count) as V1, except documented additions', async () => {
    const [v1, v2] = [await load(V1), await load(V2)];
    assert.deepEqual(v1.errors, []);
    const different = Object.entries(v2.shapes).filter(([name, shape]) => name in v1.shapes && v1.shapes[name] !== shape && !shape.startsWith('object:') && !v1.shapes[name].startsWith('object:'));
    assert.deepEqual(different, [], 'globals whose kind or arity differs from V1');
    const objects = Object.entries(v2.shapes).filter(([name, shape]) => shape.startsWith('object:') && v1.shapes[name]?.startsWith('object:') && v1.shapes[name] !== shape && !(name in KEY_EXCEPTIONS)).map(([name]) => name);
    assert.deepEqual(objects, [], 'object globals whose keys differ from V1');
});
