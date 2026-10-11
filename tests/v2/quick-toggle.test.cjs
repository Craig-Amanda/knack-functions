const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `<div id="view_7" class="kn-table kn-view"><table><tbody>
 <tr id="r1"><td class="field_3 cell-edit" data-field-key="field_3"><span>Yes</span></td><td class="field_4">x</td></tr>
 <tr id="r2"><td class="field_3 cell-edit" data-field-key="field_3" style="color: red"><span>No</span></td><td class="field_4">y</td></tr></tbody></table></div>`;
const BEFORE = `$.fn.bindFirst = function (type, handler) { return this.on(type, handler); }; Knack.getUserAttributes = () => ({ id: 'u1', name: 'Pat' });
window.ktl.views = { getDataFromRecId: (v, r) => ({ field_3_raw: r === 'r1' }) }; window.ktl.core.infoPopup = () => {};`;

test('CAQuickToggle table colouring and cell clicks behave like V1 without jQuery', async () => {
    const { v1, v2, v1Console, v2Console } = await both({ names: ['CAQuickToggle', 'knackNavigator', 'knackValueResolver'], html: HTML, before: BEFORE }, async () => {
        const toggle = Object.create(CAQuickToggle.prototype);
        Object.assign(toggle, { viewId: 'view_7', inlineEditing: true, fieldsColor: { field_3: { bgColorTrue: 'green', bgColorFalse: 'red' } }, fieldMap: new Map([['field_3', 'Flag'], ['field_9', 'Flag - Name']]), data: [{ id: 'r1', field_3_raw: true }, { id: 'r2', field_3_raw: false }],
            quickToggleParams: { bgColorPending: 'gold', pendingClass: 'pend', showNotification: false }, quickToggleObj: {}, viewsToRefresh: [], numToProcess: 0, refreshTimer: 0 });
        toggle.startQtScanning = () => { toggle.scanned = true; };
        const out = {};
        toggle.updateTableColors(); out.styles = Array.from(document.querySelectorAll('td.field_3'), (td) => td.getAttribute('style'));
        document.querySelectorAll('td.field_3').forEach((td) => td.classList.add('caQtCellClickable'));
        toggle.setupCellClickHandlers();
        document.querySelector('#r1 td.field_3 span').click(); await new Promise((resolve) => setTimeout(resolve, 5)); // Jobs are keyed by Date.now(), so clicks need distinct milliseconds.
        document.querySelector('#r2 td.field_3').click();
        out.after = [Array.from(document.querySelectorAll('td.field_3'), (td) => [td.style.backgroundColor, td.className]), Object.values(toggle.quickToggleObj).map(({ viewId, fieldId, value, recId, processed, additionalData }) => [viewId, fieldId, value, recId, processed, additionalData]), toggle.viewsToRefresh, toggle.numToProcess, toggle.scanned ?? false];
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'bulkEditCb'; cb.checked = true; document.body.append(cb);
        const before = toggle.numToProcess; document.querySelector('#r1 td.field_3').click(); out.blocked = toggle.numToProcess === before;
        const empty = Object.create(CAQuickToggle.prototype); Object.assign(empty, { fieldsColor: {}, viewId: 'view_7', data: [] }); out.noop = empty.updateTableColors() === undefined;
        return out;
    });
    assert.deepEqual(v2, v1);
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
    assert.equal(v1.after[1].length, 2, 'both clicks should queue a toggle');
});

test('a failed update no longer blocks the quick toggle queue (V1 retried the failed job forever)', async () => {
    const { realm, V2 } = require('./harness.cjs');
    const r = await realm({ file: V2, names: ['CAQuickToggle', 'CAMultiChoiceQuickToggle', 'getKnackApiClient', 'KnackAPI', 'knackNavigator', 'knackValueResolver', 'KnackError'], html: HTML,
        before: BEFORE + `Knack.scenes = { models: [{ attributes: { key: 'scene_1' }, views: { models: [{ attributes: { key: 'view_7' } }] } }] }; window.alert = () => {}; ktl.views.autoRefresh = () => {};` });
    try {
        const out = await r.run(async () => {
            window.knackAPI = new KnackAPI({ showSpinner: false, debug: false }); window.knackAPI.updateRecord = async () => { throw new Error('PUT failed'); };
            const ce = console.error; console.error = () => {};
            const results = [];
            for (const Toggle of [CAQuickToggle, CAMultiChoiceQuickToggle]) {
                const toggle = Object.create(Toggle.prototype);
                Object.assign(toggle, { quickToggleObj: { a: { viewId: 'view_7', fieldId: 'field_3', value: true, recId: 'r1', processed: true }, b: { viewId: 'view_7', fieldId: 'field_3', value: false, recId: 'r2', processed: false } }, numToProcess: 2, quickToggleParams: { showNotification: false }, qtScanItv: setInterval(() => {}, 1000) });
                toggle.doQuickToggle('a');
                await new Promise((resolve) => setTimeout(resolve, 30));
                results.push([Object.keys(toggle.quickToggleObj), toggle.numToProcess, toggle.qtScanItv !== null]);
                toggle.doQuickToggle('b'); await new Promise((resolve) => setTimeout(resolve, 30));
                results.push([Object.keys(toggle.quickToggleObj), toggle.numToProcess, toggle.qtScanItv]);
            }
            console.error = ce;
            return results;
        });
        assert.deepEqual(out, [[['b'], 1, true], [[], 0, null], [['b'], 1, true], [[], 0, null]]);
    } finally { await r.close(); }
});

test('cleanups: file carousel re-open, idle watchdog restart and KnackAPI base URL', async () => {
    const { realm, V2 } = require('./harness.cjs');
    const r = await realm({ file: V2, names: ['openFileCarousel', 'closeFileCarousel', 'ensureFileCarouselOverlay', 'renderFileCarouselItem', 'navigateFileCarousel', 'onFileCarouselPopState', 'fileCarouselState', 'showFileCarouselFallback', 'preloadFileCarouselImage', 'formatFileSizeBytes', 'fetchFileSizeBytes', 'idleWatchDogTimeout', 'KnackAPI', 'KnackError'], html: '<div id="knack-body"></div><button id="trigger">t</button>',
        before: `Knack.application_id = 'app1'; window.ktl.scenes = { resetIdleWatchdog() {}, getCfg: () => ({}) }; ` });
    try {
        const out = await r.run(async () => {
            const result = {};
            const items = [{ fileName: 'a.png', assetUrl: 'about:blank#a', extension: 'png' }, { fileName: 'b.png', assetUrl: 'about:blank#b', extension: 'png' }];
            let keydowns = 0; const realAdd = document.addEventListener.bind(document); document.addEventListener = (type, fn, o) => { if (type === 'keydown') keydowns += 1; return realAdd(type, fn, o); };
            const realRemove = document.removeEventListener.bind(document); let removed = 0; document.removeEventListener = (type, fn, o) => { if (type === 'keydown') removed += 1; return realRemove(type, fn, o); };
            const depth = history.length;
            openFileCarousel(items, 0, document.getElementById('trigger')); openFileCarousel(items, 1, document.getElementById('trigger'));
            result.reopen = [keydowns - removed, history.length - depth];
            document.getElementById('kfnFileCarousel').remove(); // A consumer removes the overlay while it is open.
            closeFileCarousel({ viaPopState: true });
            result.afterClose = [keydowns - removed, document.body.style.overflow, typeof fileCarouselState === 'undefined' ? null : fileCarouselState];
            const timers = []; const realSet = window.setTimeout, realClear = window.clearTimeout; window.setTimeout = (fn, ms) => { timers.push(ms); return timers.length; }; const cleared = []; window.clearTimeout = (id) => cleared.push(id);
            idleWatchDogTimeout(); idleWatchDogTimeout();
            window.setTimeout = realSet; window.clearTimeout = realClear; result.idle = [document.querySelectorAll('#ktl-idle-dialog').length, cleared.includes(1)];
            const api = new KnackAPI({ showSpinner: false, debug: false }); const urls = []; api._uploadAssetRequest = async (url) => { urls.push(url); return { id: 'x' }; };
            await api.uploadAsset(new Blob(['x'], { type: 'text/plain' })); Knack.api_dev = 'https://dev.example/v1/'; await api.uploadAsset(new Blob(['x'], { type: 'image/png' }));
            result.urls = urls;
            return result;
        });
        assert.deepEqual(out.reopen, [1, 1], 'one live keydown handler and one history entry after re-open');
        assert.deepEqual(out.afterClose.slice(0, 2), [0, ''], 'close tears down even when the overlay was removed');
        assert.equal(out.afterClose[2], null);
        assert.deepEqual(out.idle, [1, true], 'second idle dialog clears the first auto-logout timer');
        assert.deepEqual(out.urls, ['https://api.knack.com/v1/applications/app1/assets/file/upload', 'https://dev.example/v1/applications/app1/assets/image/upload']);
    } finally { await r.close(); }
});
