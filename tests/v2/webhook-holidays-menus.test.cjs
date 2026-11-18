const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const FIELDS = Array.from({ length: 52 }, (_, i) => `field_${200 + i}`);
const HTML = `
<div id="view_1"><table><thead><tr><th class="field_1">Name</th>${FIELDS.slice(0, 52).map((f) => `<th class="${f}">${f}</th>`).join('')}</tr></thead>
<tbody><tr class="kn-table-group"><td colspan="53">G</td></tr><tr id="r1"><td class="field_1">a</td>${FIELDS.map((f) => `<td class="${f}">1</td>`).join('')}</tr><tr id="r2" class="skip"><td class="field_1">b</td>${FIELDS.map((f) => `<td class="${f}">2</td>`).join('')}</tr></tbody></table></div>
<td class="field_77">1,500</td><td class="field_77">20</td><td class="field_77">abc</td><span class="knViewLink__label">Big 9999</span><span class="knViewLink__label">Other</span>
<div id="view_2"><div class="menu-links"><ul class="menu-links__list"><li class="old"><a class="kn-link">Old</a></li></ul></div></div>
<a class="open">Open file</a><button class="open">Open file too</button><a class="other">Nope</a><div id="view_3"><a class="open3">Get doc</a></div>
<input id="ta" value="x"><input id="tb" value=""><input id="tc" value="" ><input id="td" value="">
<input id="d1" type="date"><input id="d2" type="text"><input id="d3" type="date" disabled>`;
const BEFORE = `window.WEEK_NUM_SHARED_AREA_GRID = { weekNumberFields: ${JSON.stringify(FIELDS)}, sceneId: 's1', viewId: 'v1', conxField: 'f_c', typeField: 'f_t' }; window.KN_ASSET_PREFIX = 'asset/'; Knack.application_id = 'app1'; Knack.getUserToken = () => 'tok';
window.__nav = []; window.__open = []; window.open = (...a) => window.__open.push(a);
window.__fetch = (url, init) => { window.__calls = [...(window.__calls || []), [url, init && init.method, init && init.headers]]; return Promise.resolve(window.__resp(url)); };
window.fetch = (...a) => window.__fetch(...a);
const json = (b, ok = true, status = 200) => ({ ok, status, headers: { get: () => 'application/json; x' }, json: () => Promise.resolve(b), text: () => Promise.resolve(JSON.stringify(b)) });
const text = (b, ok = true, status = 200) => ({ ok, status, headers: { get: () => null }, json: () => Promise.reject(new Error('no')), text: () => Promise.resolve(b) });
window.__json = json; window.__text = text;`;
const NAMES = ['triggerWebhook', 'getBankHolidayWeekendRange', 'getGovBankHolidays', 'handleRedirect', 'getAllTableRows', 'showRelevantWeeks', 'updateWeekNumberObject', 'replaceLargeNo', 'openFileFromBtn', 'syncTextInputs', 'createButton', 'attachNativeDateInputPicker', 'renderMenuButtons', 'getKnackApiClient', 'resolveKnackApiUsageClient', 'KnackApiUsage', 'KnackAPI', 'getDateUKFormat', 'getWeekNumber', 'convertToDateObj', 'createFilterForWeekObj', 'sanitiseURL', 'fileViewer', 'ensureMenuButtonActiveStyles', 'fireEvent', 'resolveElements', 'warnDeprecated', 'ensureStyle', 'parseDateObject', 'removeHtml', 'knackNavigator', 'knackValueResolver', 'KnackError'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text));
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}
const q = 'const quiet = async (fn) => { const e = console.error, l = console.log; console.error = console.log = () => {}; try { return await fn(); } finally { console.error = e; console.log = l; } };';

test('webhook and bank holiday helpers match V1', async () => {
    await same(async () => {
        const quiet = async (fn) => { const e = console.error, l = console.log; console.error = console.log = () => {}; try { return await fn(); } finally { console.error = e; console.log = l; } };
        const rec = async (p) => { try { return await p; } catch (e) { return { thrown: e }; } };
        const out = {};
        window.__resp = (u) => (u.includes('bank-holidays') ? __json({ 'england-and-wales': { events: [{ date: '2025-04-18', title: 'Good Friday' }, { date: '2025-04-21', title: 'Easter Monday' }, { date: '2025-05-05', title: 'Early May bank holiday' }, { date: '2024-12-25', title: 'Christmas Day' }, { title: 'no date' }, null] }, scotland: { events: [{ date: '2025-01-02', title: '2nd January' }] }, 'northern-ireland': { events: [{ date: '2025-03-17', title: "St Patrick's Day" }] } }) : __json({ ok: 1 }));
        out.hooks = [await quiet(() => triggerWebhook('http://bad', {})), await quiet(() => triggerWebhook('https://ok', { a: 1 }, 'N')), await quiet(() => triggerWebhook('https://ok', {}, 'S', true))];
        window.__resp = () => __text('boom', false, 500); out.fail = await quiet(() => rec(triggerWebhook('https://x', {}, 'F')));
        window.__resp = () => { throw new Error('net'); }; out.net = await quiet(() => rec(triggerWebhook('https://x', {}, 'F')));
        out.calls = window.__calls.map(([u, m, h]) => [u, m, h && h.userToken]);
        out.range = ['2025-04-18', '2025-04-21', '2025-05-05', '2025-12-26'].map((d) => getBankHolidayWeekendRange(d));
        window.__resp = (u) => __json({ 'england-and-wales': { events: [{ date: '2025-04-18', title: 'Good Friday' }, { date: '2025-04-21', title: 'Easter Monday' }, { date: '2025-05-05', title: 'Early May bank holiday' }, { date: '2024-12-25', title: 'Christmas Day' }, { title: 'no date' }, null] }, scotland: { events: [{ date: '2025-01-02', title: '2nd January' }] }, 'northern-ireland': { events: [{ date: '2025-03-17', title: "St Patrick's Day" }] } });
        out.hol = [await getGovBankHolidays({ targetYear: 2025 }), await getGovBankHolidays({ targetYear: '2025', monthNumber: 4 }), await getGovBankHolidays({ targetYear: 2025, titleContains: 'MONDAY' }), await getGovBankHolidays({ targetYear: 2025, region: 'Scotland' }), await getGovBankHolidays({ targetYear: 2025, region: 'ireland' }), await getGovBankHolidays({ targetYear: 1999 })];
        out.errs = [await quiet(() => rec(getGovBankHolidays())), await quiet(() => rec(getGovBankHolidays({ targetYear: 'x' })))];
        window.__resp = () => __json({}, false, 503); out.http = await quiet(() => rec(getGovBankHolidays({ targetYear: 2025 })));
        return JSON.parse(JSON.stringify(out, (k, v) => (v instanceof Error ? v.message : v)));
    });
});

test('redirect, table rows, large numbers and file buttons match V1', async () => {
    await same(async () => {
        const out = {}; const rows = (...a) => { const r = []; getAllTableRows('view_1', (i, row) => r.push([i, row.id || row.className || row.tagName]), ...a); return r; };
        out.rows = [rows(), rows(true), rows(false, true), rows(true, true), rows(false, false, '.skip'), rows(true, true, 'tr.kn-table-group')]; getAllTableRows('', () => out.rows.push('never')); getAllTableRows('view_99', () => out.rows.push('never'));
        replaceLargeNo(77, 1000, 'BIG'); replaceLargeNo('9999', 5000, 'LINK', true); out.big = Array.from(document.querySelectorAll('.field_77, .knViewLink__label'), (e) => e.textContent);
        const errs = []; const ce = console.error; console.error = (m) => errs.push(m);
        openFileFromBtn('view_1', 'x', 'f'); openFileFromBtn('nope', 'x', 'f'); openFileFromBtn('view_3', 'Get', 'a/file.pdf'); openFileFromBtn('view_3', 'Get', 'b/file.PDF', true);
        console.error = ce; document.querySelector('.open3').click(); out.opened = window.__open; out.errs = errs;
        window.__nav = []; const realSet = window.setTimeout; window.setTimeout = (fn, ms) => { window.__nav.push(ms); return 0; };
        handleRedirect({ type: 'click' }, 'u'); handleRedirect({ type: 'knack-form-submit' }, 'u'); handleRedirect({ type: 'x' }, 'u'); handleRedirect(null, 'u'); handleRedirect({ type: 'click' }, '');
        document.body.insertAdjacentHTML('beforeend', '<div class="kn-modal"><button class="close-modal">c</button></div>'); handleRedirect({ type: 'knack-view-render' }, 'u2'); document.querySelector('.close-modal').click(); document.querySelector('.close-modal').click();
        window.setTimeout = realSet; out.timers = window.__nav;
        return out;
    });
});

test('week grid, week object, sync, buttons, date pickers and menus match V1', async () => {
    await same(async () => {
        const out = {}; const orderOf = (id) => Array.from(document.querySelectorAll(`${id} tr`)[id === '#view_1 thead' ? 0 : 2].children, (c) => c.className + (c.style.display ? ':' + c.style.display : '') + (c.style.backgroundColor ? ':bg' : '')).join(',');
        showRelevantWeeks('view_1', 'red'); showRelevantWeeks('view_1', 'blue', 5, 2); showRelevantWeeks('view_99', 'red'); const warn = console.warn; console.warn = () => {}; showRelevantWeeks('view_2', 'x'); console.warn = warn;
        out.weeks = [orderOf('#view_1 thead'), orderOf('#view_1 tbody')];
        const calls = []; const api = new KnackAPI({ showSpinner: false, debug: false }); api.getRecords = async (...a) => { calls.push(['get', a]); return [{ id: 'rec1' }]; }; api.updateRecord = async (...a) => { calls.push(['upd', a]); };
        window.knackAPI = api; out.client = [getKnackApiClient() === api, resolveKnackApiUsageClient(api) === api, resolveKnackApiUsageClient() === api, resolveKnackApiUsageClient({}) === api, typeof KnackApiUsage.getStats, globalThis.knackAPIUsage === KnackApiUsage];
        await updateWeekNumberObject('conx1', '05/03/2024', 'VAL', 'T'); api.getRecords = async (...a) => { calls.push(['get', a]); return []; }; await updateWeekNumberObject('conx1', '05/03/2024', 'VAL', 'T');
        out.calls = JSON.parse(JSON.stringify(calls));
        const [a, b, c, d] = ['ta', 'tb', 'tc', 'td'].map((id) => document.getElementById(id)); const log = []; document.addEventListener('input', (e) => log.push('i:' + e.target.id), true); document.addEventListener('change', (e) => log.push('c:' + e.target.id), true);
        syncTextInputs(a, b); syncTextInputs(a, b); out.init = [a.value, b.value, [...log]]; log.length = 0; b.value = 'y'; b.dispatchEvent(new Event('input')); a.value = 'z'; a.dispatchEvent(new Event('change')); out.sync = [a.value, b.value, [...log]];
        c.value = ''; d.value = ' q '; syncTextInputs(c, d); out.recon = [c.value, d.value];
        const btn = createButton({ id: 'b1', html: '<i>x</i>', className: 'big', type: 'submit', attributes: { 'data-x': '1' }, onClick: () => log.push('clicked') }); btn.click(); const old = createButton('b2', 'Old', 'cls'); const dflt = createButton({});
        out.buttons = [btn.outerHTML, old.outerHTML, dflt.outerHTML, log.at(-1)];
        out.pickers = [attachNativeDateInputPicker('#d1').length, attachNativeDateInputPicker('#d1').length, attachNativeDateInputPicker(document.getElementById('d2')).length, attachNativeDateInputPicker([document.getElementById('d3'), null]).length, attachNativeDateInputPicker(document.querySelectorAll('input[type=date]')).length, attachNativeDateInputPicker(null).length, document.getElementById('d1').dataset.knackNativeDatePickerAttached];
        renderMenuButtons({ root: document.getElementById('view_2'), menuItems: [{ label: ' One ', id: 5, isActive: true, data: { k: 'v', '': 'no' }, colors: { baseColor: '#111', textColor: '#fff' } }, { className: 'extra', colors: { baseColor: '#222', activeColor: '#333' } }, null], buttonClass: ' wide ' });
        renderMenuButtons({ root: null }); renderMenuButtons({ root: document.body }); renderMenuButtons({ root: document.getElementById('view_2'), menuItems: 'bad' });
        out.menu = document.getElementById('view_2').innerHTML.replace(/\s+/g, ' ');
        return JSON.parse(JSON.stringify(out));
    });
});
