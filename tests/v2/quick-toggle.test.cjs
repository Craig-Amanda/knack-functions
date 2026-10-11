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
    const { v1, v2, v1Console, v2Console } = await both({ names: ['CAQuickToggle', 'knackNavigator', 'knackValueResolver'], html: HTML, before: BEFORE }, () => {
        const toggle = Object.create(CAQuickToggle.prototype);
        Object.assign(toggle, { viewId: 'view_7', inlineEditing: true, fieldsColor: { field_3: { bgColorTrue: 'green', bgColorFalse: 'red' } }, fieldMap: new Map([['field_3', 'Flag'], ['field_9', 'Flag - Name']]), data: [{ id: 'r1', field_3_raw: true }, { id: 'r2', field_3_raw: false }],
            quickToggleParams: { bgColorPending: 'gold', pendingClass: 'pend', showNotification: false }, quickToggleObj: {}, viewsToRefresh: [], numToProcess: 0, refreshTimer: 0 });
        toggle.startQtScanning = () => { toggle.scanned = true; };
        const out = {};
        toggle.updateTableColors(); out.styles = Array.from(document.querySelectorAll('td.field_3'), (td) => td.getAttribute('style'));
        document.querySelectorAll('td.field_3').forEach((td) => td.classList.add('caQtCellClickable'));
        toggle.setupCellClickHandlers();
        document.querySelector('#r1 td.field_3 span').click(); document.querySelector('#r2 td.field_3').click();
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
