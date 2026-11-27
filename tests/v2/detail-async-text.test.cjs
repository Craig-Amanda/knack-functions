const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const ID1 = 'a'.repeat(24); const ID2 = 'b'.repeat(24);
const HTML = `
<div id="view_1"><div class="kn-detail field_5"><div class="kn-detail-label"><span>Staff Name</span></div><div class="kn-detail-body"><span>  Sam  </span></div></div>
 <div class="kn-detail field_6"><div class="kn-detail-body"><span><b>rich</b></span></div></div>
 <div class="kn-detail field_7"><div class="kn-detail-body"><span><span class="${ID1}" data-kn="connection-value">A</span></span><span><span class="${ID2}" data-kn="connection-value">B</span></span></div></div>
 <div class="kn-detail field_8"><div class="kn-detail-body"><span><span class="${ID1}" data-kn="connection-value">A</span></span></div></div>
 <div class="kn-detail field_9"><div class="kn-detail-body"><span></span></div></div>
 <form><div id="kn-input-field_1"><div class="kn-label"><span>Old</span><span class="kn-required">*</span></div></div></form>
 <table><thead><tr><th class="field_2"><span><a><span>Head</span><span class="icon">i</span></a></span></th></tr></thead></table></div>
<input id="cap" type="text"><span class="fill"></span><span class="fill"></span><div id="host"></div>`;
const BEFORE = `window.__store = {}; window.__fail = null;
window.ktl.storage = { initSecureLs: () => (window.__fail === 'init' ? Promise.reject(new Error('init boom')) : Promise.resolve()),
  lsGetItem: (k) => { if (window.__fail === 'get') throw new Error('get boom'); return window.__store[k]; }, lsSetItem: (k, v) => { if (window.__fail === 'set') throw new Error('set boom'); window.__store[k] = v; } };
window.waitSelector = ({ selector, textCondition, returnType }) => new Promise((res, rej) => {
  let found = textCondition ? Array.from(document.querySelectorAll(selector)).find((e) => e.textContent.trim() === textCondition.text) : (returnType === 'elements' ? Array.from(document.querySelectorAll(selector)) : document.querySelector(selector));
  (found && (!Array.isArray(found) || found.length)) ? res(found) : rej(new Error('missing ' + selector)); });
window.addInputEventListener = (el, cb, o) => (o.events || ['input']).forEach((ev) => el.addEventListener(ev, (e) => cb(e, el)));
Knack.getUserAttributes = () => ({ name: 'Pat' });`;
const NAMES = ['waitGetValueFromDetail', 'waitGetConxIdFromDetailId', 'createDropdownHTML', 'capitaliseInput', 'capitaliseString', 'buildKnackAssetInfo', 'forceDownloadFile', 'formatFileSizeBytes', 'fetchFileSizeBytes', 'insertStaffName', 'updateLabelText', 'initSecureStorage', 'setSecureStorage', 'getSecureStorage', 'fileViewer', 'getIdFromElement', 'getConnectionIdFromHtml', 'normaliseToElement', 'getViewRootElement', 'resolveElements', 'warnDeprecated', 'knackNavigator', 'knackValueResolver', 'OFFICE_EXTENSIONS'];
const EXCLUDE = ['waitSelector', 'addInputEventListener'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE, exclude: EXCLUDE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text));
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('detail readers match V1', async () => {
    await same(async () => ({
        one: await waitGetValueFromDetail({ viewId: 'view_1', fieldIds: 5 }), html: await waitGetValueFromDetail({ fieldIds: 'field_6', returnHtml: true }), empty: await waitGetValueFromDetail({ fieldIds: 9 }),
        many: await waitGetValueFromDetail({ viewId: 1, fieldIds: [5, 'field_6', 99], delay: 10 }), missing: await waitGetValueFromDetail({ fieldIds: 98, delay: 10 }),
        conx: await Promise.all([7, 8, 9, 99].map((f) => waitGetConxIdFromDetailId({ viewId: 'view_1', fieldId: f, delay: 10 }))),
    }));
});

test('dropdown, capitalisation, asset and file-size helpers match V1', async () => {
    await same(async () => {
        const out = { dd: [createDropdownHTML('d1').outerHTML, createDropdownHTML('d2', false, 'Pick').outerHTML] };
        const typed = (v, ev = 'input') => { const i = document.getElementById('cap'); i.value = v; i.dispatchEvent(Object.assign(new Event(ev), ev === 'input' ? { inputType: 'insertText', data: v.slice(-1) } : {})); return i.value; };
        capitaliseInput('view_1', '#cap'); capitaliseInput('view_99', '#cap'); capitaliseInput('view_1', '#nope');
        document.getElementById('view_1').insertAdjacentHTML('beforeend', '<input id="cap2"><input id="cap3"><input id="cap4">');
        capitaliseInput('view_1', '#cap2', { mode: 'all' }); capitaliseInput('view_1', '#cap3', { mode: 'sentence', trim: false }); capitaliseInput('view_1', '#cap4', { mode: 'title', smartWords: false, preserveCapitalAfterPrefixes: ['mc', 'O\''] });
        const t = (id, v, ev) => { const i = document.getElementById(id); i.value = v; i.dispatchEvent(Object.assign(new Event(ev || 'input'), { inputType: 'insertText', data: 'x' })); return i.value; };
        out.cap = [typed('the lord OF the rings and war'), typed('jean-luc o\'neil '), typed('  spaced  ', 'blur'), typed(''), t('cap2', 'shout'), t('cap3', 'sentence case '), t('cap3', ' sp ', 'blur'), t('cap4', 'ronald mcdonald and the o\'brien'), t('cap4', 'mc')];
        out.str = ['abc def ', '', '  ', 5, null].map((s) => capitaliseString(s)).concat([capitaliseString('abc def-x', { allCaps: false }), capitaliseString(' x', {})]);
        Knack.application_id = 'app1';
        out.asset = [buildKnackAssetInfo('id1', 'My File.PDF'), buildKnackAssetInfo('', 'x'), buildKnackAssetInfo('i', 'noext'), buildKnackAssetInfo('i', 'a b.tar.gz')];
        out.size = [0, -5, 'x', 1, 1023, 1024, 1536, 10240, 1048576, 5 * 1024 ** 3, 1e15, null].map((b) => formatFileSizeBytes(b));
        return out;
    });
});

test('network helpers match V1 (fetch stubbed); V2 treats HEAD errors as unknown size', async () => {
    const script = async () => {
        const calls = []; window.open = (...a) => calls.push(['open', ...a]); URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => calls.push(['revoke']);
        HTMLAnchorElement.prototype.click = function () { calls.push(['click', this.download, this.href]); };
        const respond = (init) => () => Promise.resolve({ ok: init.ok, status: init.ok ? 200 : 500, headers: { get: () => init.length }, blob: () => Promise.resolve('b') });
        window.fetch = respond({ ok: true, length: '2048' }); await forceDownloadFile('u1', 'f.txt'); await forceDownloadFile('u1');
        window.fetch = respond({ ok: false }); const orig = console.error; console.error = () => {}; await forceDownloadFile('u2', 'g'); console.error = orig;
        window.fetch = respond({ ok: true, length: '2048' }); const a = { assetUrl: 'x' }; const sizeOk = await fetchFileSizeBytes(a);
        window.fetch = respond({ ok: true, length: null }); const none = await fetchFileSizeBytes({ assetUrl: 'x' });
        window.fetch = () => Promise.reject(new Error('net')); const failed = await fetchFileSizeBytes({ assetUrl: 'x' });
        window.fetch = respond({ ok: false, length: '999' }); const errored = await fetchFileSizeBytes({ assetUrl: 'x' });
        return { calls, sizeOk, none, failed, errored };
    };
    const { v1, v2 } = await both({ names: NAMES, html: HTML, before: BEFORE, exclude: EXCLUDE }, script);
    assert.deepEqual({ ...v2, errored: 0 }, { ...v1, errored: 0 });
    assert.equal(v1.errored, 999); assert.equal(v2.errored, null);
});

test('staff name, label text and the file viewer shim match V1', async () => {
    await same(async () => {
        const out = {};
        insertStaffName('.fill'); await new Promise((resolve) => setTimeout(resolve, 30)); out.staff = Array.from(document.querySelectorAll('.fill'), (e) => e.textContent);
        document.querySelector('.kn-detail-label').remove(); const err = console.error; console.error = () => {};
        insertStaffName(document.querySelector('.fill')); insertStaffName(document.querySelectorAll('.fill')); await new Promise((resolve) => setTimeout(resolve, 30)); console.error = err;
        out.fallback = Array.from(document.querySelectorAll('.fill'), (e) => e.textContent);
        updateLabelText('view_1', 'form', 'field_1', { params: [['New', '{strong}bold{/strong}{br}x']] }); updateLabelText('view_1', 'table', 'field_2', { params: [['Col {em}t{/em}'], ['table']] });
        updateLabelText('view_1', 'table', 'field_2', { params: [['Other'], ['form']] }); updateLabelText('view_99', 'form', 'field_1', { params: [['x']] }); updateLabelText('view_1', 'nope', 'field_1', { params: [['x']] });
        out.labels = [document.querySelector('#kn-input-field_1').innerHTML, document.querySelector('th.field_2').innerHTML];
        out.viewer = [fileViewer('pdf', 'u'), fileViewer('docx', 'v'), fileViewer(null, 'w')];
        return out;
    });
});

test('secure storage matches V1 (state, errors and expiry)', async () => {
    await same(async () => {
        const out = []; const rec = async (p) => { try { return await p; } catch (e) { return `ERR:${e.message}`; } };
        const quiet = async (fn) => { const e = console.error, w = console.warn, l = console.log; console.error = console.warn = console.log = () => {}; try { return await fn(); } finally { await new Promise((resolve) => setTimeout(resolve, 20)); console.error = e; console.warn = w; console.log = l; } };
        out.push(await quiet(() => rec(initSecureStorage(''))), await quiet(() => rec(initSecureStorage(5))), await quiet(() => rec(initSecureStorage('k'))), { ...window.__store });
        await quiet(() => setSecureStorage('k', 'rec1', 'f1', 'v1')); await quiet(() => setSecureStorage('k', 'rec1', 'f2', 'v2', 1)); await new Promise((resolve) => setTimeout(resolve, 20));
        const parsed = JSON.parse(window.__store.k); out.push(Object.keys(parsed.rec1), parsed.rec1.f1, parsed.rec1.f2, typeof parsed.rec1.expirationDate);
        parsed.old = { expirationDate: 1, f: 'x' }; window.__store.k = JSON.stringify(parsed);
        out.push(await quiet(() => getSecureStorage('k', 'rec1')).then((r) => [r.f1, r.f2]), await quiet(() => getSecureStorage('k', 'nope')), Object.keys(JSON.parse(window.__store.k)));
        window.__store.bad = '{nope'; out.push(await quiet(() => initSecureStorage('bad')), window.__store.bad);
        for (const f of ['init', 'get', 'set']) { window.__fail = f; delete window.__store.z; out.push(await quiet(() => rec(initSecureStorage('z')))); }
        window.__fail = null;
        return out;
    });
});
