const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `
<div id="view_1"><div id="kn-input-field_5" class="kn-input"><select><option value="">-</option><option value="rec1">One</option><option value="rec2">Two</option></select></div></div>
<div id="view_2"><div id="kn-input-field_6" class="kn-input"><div class="chzn-search"><input></div><select><option value="">-</option></select></div></div>
<div id="view_3"><table><thead><tr><th>A</th></tr></thead><tbody>
 <tr><td class="field_6087">idA</td><td><a class="go">Open *</a><a>Other</a></td></tr><tr><td class="field_6087"> idB </td><td><a class="go">Open</a></td></tr></tbody></table></div>
<div id="view_4"><a>Open</a><a>Close</a></div><div id="view_5"><ul><li>Open</li><li>Close</li></ul></div>`;
const BEFORE = `window.CONNECTION_FIELDS_OBJECT = { clients: { sceneIdAPI: 's', viewIdAPI: 'v', clientPKField: 'field_9' } };
window.ktl.core.waitSelector = (s) => Promise.resolve(document.querySelector(s)); window.__kw = {}; window.__type = 'table'; window.__denied = false;
window.ktl.core.getKeywordsByType = () => window.__kw.list || []; window.ktl.core.hasRoleAccess = () => !window.__denied; window.ktl.views = { getViewType: () => window.__type };
const api = { getRecord: async (s, v, id) => ({ field_9_raw: 'Name ' + id }) };
window.getKnackApiClient = () => api;
$(document).on('chosen:dummy', () => {});`;
const NAMES = ['addConnectionIdToRecord', 'buttonToUrl', 'getViewRootElement', 'getRecordID', 'sanitiseURL', 'removeElement', 'getTableRowElements', 'getTableRows', 'refreshChosen', 'fireEvent', 'bindClick', 'resolveElements', 'warnDeprecated', 'toJQuery', 'knackNavigator', 'knackValueResolver', 'CLASS_HIDDEN', 'getFieldWrapper'];
const EXCLUDE = ['getKnackApiClient'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE, exclude: EXCLUDE, statements: ['textEquals'] }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text));
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('addConnectionIdToRecord matches V1 for a loaded list and for a Chosen search lookup', async () => {
    await same(async () => {
        const out = {}; const updates = []; $(document).on('liszt:updated', (e) => updates.push(e.target.tagName));
        await addConnectionIdToRecord('view_1', 5, 'rec2'); out.loaded = [document.querySelector('#view_1 select').value, document.getElementById('kn-input-field_5').className];
        await addConnectionIdToRecord('view_1', 5, 'rec1'); out.again = document.querySelector('#view_1 select').value;
        await addConnectionIdToRecord('view_99', 5, 'rec1');
        const select = document.querySelector('#view_2 select'); const search = document.querySelector('#view_2 .chzn-search input'); const log = [];
        $(search).on('input', () => { log.push('input:' + search.value); if (!select.querySelector('option[value="r9"]')) select.insertAdjacentHTML('beforeend', '<option value="r9">' + search.value + '</option>'); });
        await addConnectionIdToRecord('view_2', 6, 'abc', 'clients');
        await new Promise((resolve) => setTimeout(resolve, 900));
        out.lookup = [select.value, log, document.activeElement === search, updates.length];
        return out;
    });
});

test('buttonToUrl binds table, plain and menu links like V1', async () => {
    await same(async () => {
        const out = {}; const errs = []; const ce = console.error; console.error = (m) => errs.push(String(m));
        const run = (type, key, groups) => { window.__type = type; window.__kw = { list: [{ options: {}, params: groups }] }; buttonToUrl({ key }, { _btnurl: 1 }); };
        const hashAfter = (el) => { location.hash = ''; el.click(); return location.hash; };
        run('table', 'view_3', [['Open', '#child'], ['Missing', '#x'], ['only']]); out.table = [...document.querySelectorAll('#view_3 a.go')].map(hashAfter); out.other = hashAfter(document.querySelectorAll('#view_3 a')[1]);
        run('details', 'view_4', [['Open', '#detail', 'false']]); out.plain = hashAfter(document.querySelector('#view_4 a'));
        run('details', 'view_4', [['Open', '#detail2', 'true', 2]]); out.child = hashAfter(document.querySelector('#view_4 a'));
        run('menu', 'view_5', [['Close', '#menu']]); out.menu = hashAfter(document.querySelectorAll('#view_5 li')[1]);
        run('form', 'view_4', [['Open', '#never']]); run('table', 'view_4', []); buttonToUrl({ key: 'view_4' }, {});
        console.error = ce; out.errs = errs;
        return out;
    });
});

test('V2 buttonToUrl removes the links for users without role access (V1 threw a ReferenceError)', async () => {
    const r = await realm({ file: V2, names: NAMES, html: HTML, before: BEFORE, exclude: EXCLUDE });
    try {
        assert.deepEqual(await r.run(() => { window.__denied = true; window.__kw = { list: [{ options: {}, params: [['Open', '#x']] }] }; window.__type = 'details'; buttonToUrl({ key: 'view_4' }, { _btnurl: 1 }); return Array.from(document.querySelectorAll('#view_4 a'), (a) => a.textContent); }), ['Close']);
    } finally { await r.close(); }
});
