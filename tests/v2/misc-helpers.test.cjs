const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `
<div id="view_30"><table class="kn-table"><thead><tr><th class="field_1">A</th><th class="field_2">B</th><th class="field_3">C</th></tr></thead>
 <colgroup><col><col><col></colgroup>
 <tbody><tr><td class="field_1">x</td><td class="field_2"> </td><td class="field_3"></td></tr><tr><td class="field_1">y</td><td class="field_2"></td><td class="field_3"></td></tr></tbody></table></div>
<ul id="lst"></ul><ul id="lst2"><li>already</li></ul><ul id="lst3"></ul>
<div class="field_9"><div class="kn-detail-body"><span>One</span><span>Two &lt; 3</span><span> </span><span>One</span><span><span>nested</span></span></div></div>
<div id="view_40"><div id="kn-input-field_5" class="kn-input"><textarea id="view_40-field_5"></textarea></div>
 <div id="kn-input-field_6" class="kn-input"><div class="redactor-editor" contenteditable="true">rich</div><textarea id="view_40-field_6"></textarea></div></div>
<div id="view_41"><div id="kn-input-field_5" class="kn-input"><textarea id="view_41-field_5"></textarea></div>
 <div id="kn-input-field_7"><input type="radio" name="r7" value="a"><input type="radio" name="r7" value="b"></div>
 <div id="kn-input-field_8"><select><option value="">-</option><option value="p">P</option></select></div></div>
<div id="view_42"><div id="kn-input-field_5" class="kn-input"><textarea id="view_42-field_5"></textarea></div>
 <div id="kn-input-field_7" class="kn-input"><input type="radio" name="t7" value="a"><input type="radio" name="t7" value="b"></div>
 <div id="kn-input-field_8" class="kn-input"><select><option value="">-</option><option value="p">P</option></select></div></div>
<div class="kn-details-link"><a href="#">Restore minutes</a><a href="#">Other</a></div>
<div id="wrap_a"><input type="text" value="hi"></div><div id="wrap_b"><input type="hidden" value=""><input type="text" value=""></div><div id="wrap_c"><input type="checkbox" checked></div>`;
const BEFORE = `window.ktl.core.waitSelector = (s) => Promise.resolve($(s)[0]); // jQuery lookup, like KTL, so V1's :contains selector works
window.ktl.views = { refreshView(v) { (window.refreshed ||= []).push(v); } };
window.getValueFromDetail = () => 'Form A, Form B ,, Missing';
window.__store = {}; window.initSecureStorage = () => {};
window.setSecureStorage = (k, r, f, v) => { window.__store[f] = v; };
window.getSecureStorage = () => Promise.resolve(window.__restore);`;
const NAMES_EXCLUDE = ['getValueFromDetail', 'initSecureStorage', 'setSecureStorage', 'getSecureStorage'];

async function same(names, scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names, html: HTML, before: BEFORE, exclude: NAMES_EXCLUDE, statements: ['textEquals'] }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('style, colour, escape and small pure helpers match V1', async () => {
    await same(['ensureMenuButtonActiveStyles', 'updateButtonColourOnFormComplete', 'escapeHTML', 'getCurrentYear', 'createFilterForWeekObj', 'compareAge', 'isInOfficeHours', 'convertToDateObj', 'evaluate', 'applyOperator'], async () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="view_1"><a class="knViewLink">l</a></div><div id="view_2"><a class="knViewLink">m</a></div>');
        ensureMenuButtonActiveStyles(); ensureMenuButtonActiveStyles();
        updateButtonColourOnFormComplete('field_1', { 'Form A': 1, 'Form B': 2 }, 'rgb(1, 2, 3)');
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
            style: [document.querySelectorAll('#kf-menu-button-active-style').length, document.getElementById('kf-menu-button-active-style').textContent.replace(/\s+/g, ' ')],
            colours: Array.from(document.querySelectorAll('a.knViewLink'), (a) => a.style.backgroundColor),
            esc: escapeHTML(`<a href="x">Tom & 'J'</a>`), escNull: escapeHTML(null),
            year: getCurrentYear(), filter: createFilterForWeekObj({ conxField: 'f1', typeField: 'f2' }, 'rec', 'T'),
            age: ['>', '<', '>=', '==', '?'].map((op) => compareAge('01/01/2000', 18, op)),
            office: [isInOfficeHours(), isInOfficeHours('00:00', '23:59'), isInOfficeHours('23:58', '23:59')],
        };
    });
});

test('scheduleDailyRefresh schedules the same delays as V1', async () => {
    const run = () => {
        const calls = []; const realSet = window.setTimeout; const realInt = window.setInterval;
        window.setTimeout = (fn, ms) => { calls.push(['timeout', ms]); fn(); return 0; };
        window.setInterval = (fn, ms) => { calls.push(['interval', ms]); fn(); return 0; };
        scheduleDailyRefresh('view_9', new Date().getHours(), new Date().getMinutes() + 1);
        window.setTimeout = realSet; window.setInterval = realInt;
        return { calls, refreshed: window.refreshed };
    };
    const { v1, v2 } = await both({ names: ['scheduleDailyRefresh'], html: HTML, before: BEFORE }, run);
    assert.equal(v2.calls[1][1], 86400000);
    assert.deepEqual(v2.refreshed, v1.refreshed);
    assert.ok(Math.abs(v2.calls[0][1] - v1.calls[0][1]) < 2000, `${v1.calls[0][1]} vs ${v2.calls[0][1]}`);
});

test('addConxDetailsToList matches V1 for plain values; V2 inserts values as text', async () => {
    await same(['addConxDetailsToList'], async () => {
        await addConxDetailsToList('#lst2', 'field_9');
        await addConxDetailsToList('#lst3', 'field_none', 'Nothing here');
        await addConxDetailsToList('#nolist', 'field_9');
        document.querySelector('.field_9 .kn-detail-body').innerHTML = '<span>One</span><span>Two</span><span>One</span>';
        await addConxDetailsToList('#lst', 'field_9');
        return [document.getElementById('lst').outerHTML, document.getElementById('lst2').outerHTML, document.getElementById('lst3').outerHTML];
    });
    const r = await realm({ file: V2, names: ['addConxDetailsToList'], html: HTML, before: BEFORE });
    try {
        assert.equal(await r.run(async () => { await addConxDetailsToList('#lst', 'field_9'); return document.getElementById('lst').innerHTML; }), '<li>One</li><li>Two &lt; 3</li><li>nested</li>');
    } finally { await r.close(); }
});

test('mapFieldsToView matches V1, including a select changed through jQuery (as Chosen does)', async () => {
    await same(['mapFieldsToView'], () => {
        const errors = []; const err = console.error; console.error = (m) => errors.push(m);
        let chosenUpdates = 0; $(document).on('liszt:updated', () => { chosenUpdates += 1; });
        mapFieldsToView([5], [7], [8], 'view_41', 'view_42');
        mapFieldsToView([99], [], [], 'view_41', 'view_42');
        const ta = document.getElementById('view_41-field_5'); ta.value = 'hello'; ta.dispatchEvent(new Event('blur'));
        const radio = document.querySelector('#view_41 input[value="b"]'); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true }));
        const sel = document.querySelector('#view_41 select'); sel.value = 'p'; $(sel).trigger('change');
        console.error = err;
        return {
            text: document.getElementById('view_42-field_5').value,
            radio: Array.from(document.querySelectorAll('#view_42 input[type=radio]'), (i) => i.checked),
            select: document.querySelector('#view_42 select').value, chosenUpdates, errors,
            hidden: Array.from(document.querySelectorAll('#view_42 .kn-input'), (e) => e.className),
        };
    });
});

test('column helpers match V1', async () => {
    await same(['disableCellsByColHead', 'hideEmptyGridColumns', 'getAllTableRows', 'knackNavigator'], () => {
        disableCellsByColHead('view_30', 2); disableCellsByColHead('view_30', 99); disableCellsByColHead('view_99', 1);
        hideEmptyGridColumns('view_30', ['field_2', 3, 'bad']); hideEmptyGridColumns('view_30', 'x');
        return document.getElementById('view_30').outerHTML.replace(/\s+/g, ' ');
    });
});

test('minutes storage helpers match V1', async () => {
    await same(['setupLocalStorageMinutes', 'reloadMinutes', 'getRecordID', 'sanitiseURL', 'getTextArea', 'getTextAreas', 'getFieldId', 'warnDeprecated', 'toJQuery'], async () => {
        setupLocalStorageMinutes('k', ['view_40'], 'Restore');
        await new Promise((resolve) => setTimeout(resolve, 10));
        document.getElementById('view_40-field_5').value = 'typed'; document.getElementById('view_40-field_5').dispatchEvent(new Event('blur'));
        const ed = document.querySelector('#view_40 .redactor-editor'); ed.innerHTML = '<b>new</b>'; ed.dispatchEvent(new Event('blur'));
        const stored = { ...window.__store };
        window.__restore = { 'view_40-field_5': 'restored', 'kn-input-field_6': '<i>r</i>' };
        const link = document.querySelectorAll('.kn-details-link a')[0]; const click = new MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(click);
        const other = document.querySelectorAll('.kn-details-link a')[1]; const prevented = !other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { stored, prevented, defaultPrevented: click.defaultPrevented, ta: document.getElementById('view_40-field_5').value, editor: document.querySelector('#view_40 .redactor-editor').innerHTML };
    });
});

test('fieldWrapperHasValue matches V1', async () => {
    await same(['fieldWrapperHasValue', 'elementHasMeaningfulValue', 'hiddenInputHasMeaningfulValue'], () =>
        ['wrap_a', 'wrap_b', 'wrap_c'].map((id) => fieldWrapperHasValue(document.getElementById(id))).concat([fieldWrapperHasValue(null), fieldWrapperHasValue({})]));
});
