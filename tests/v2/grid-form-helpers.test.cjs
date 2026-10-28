const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `
<div id="view_20" class="kn-view">
  <h3 class="kn-title">Old</h3>
  <table class="kn-table"><thead><tr><th class="field_1">Name *</th><th class="field_2">Park</th><th class="field_3">Other</th></tr></thead>
  <tbody>
    <tr class="kn-table-group kn-group-level-1"><td colspan="3">Group A</td></tr>
    <tr id="a"><td class="field_1"><span>Bold <b>one</b></span></td><td class="field_2"><span class="knViewLink__label">x</span></td><td class="field_3"><span>c</span></td></tr>
    <tr id="b"><td class="field_1"><span>Two</span></td><td class="field_2"><span class="knViewLink__label">y</span></td><td class="field_3">no span</td></tr>
  </tbody></table>
  <div class="kn-list-container">  </div><div class="kn-list-container">full</div>
</div>
<div id="view_21">
  <input id="i_text" type="text"><textarea id="i_area"></textarea><div class="search-field"><input id="i_search" type="text" value="zzz"></div>
  <select id="i_sel"><option value=""></option><option value="a">A</option></select>
  <input type="checkbox" name="view_21-field_9" value="1">
  <div id="kn-input-field_30"><input type="radio" name="r30" value="yes"><input type="radio" name="r30" value="no"></div>
</div>
<div id="df"><span class="removeIfBlank">Label: </span><span class="removeIfBlank">Label: ok</span><span class="removeIfBlank"> -- </span><span class="removeIfBlank">dash</span></div>
<p class="rx">foo-1 foo-2</p><td class="field_77">abc abc</td>
<div id="view_22_field_5_chzn"><ul><li>Apple</li><li>Banana</li><li>Apricot</li></ul></div>
<input id="v_empty" type="text"><input id="v_full" type="text" value="x">
<div class="t1">t1</div><div class="t2">t2</div>`;
const BEFORE = 'window.snap = () => document.body.innerHTML.replace(/\\s+/g, " "); window.ktl.core.waitSelector = (s) => Promise.resolve(document.querySelector(s));';

async function same(names, scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names, html: HTML, before: BEFORE, statements: ['textEquals'] }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('updateViewTitleIfSelectorFound, hideEmptyListItems, prependTextToGroupBy match V1', async () => {
    await same(['updateViewTitleIfSelectorFound', 'hideEmptyListItems', 'prependTextToGroupBy'], async () => {
        updateViewTitleIfSelectorFound('view_20', '#df', 'New');
        updateViewTitleIfSelectorFound('view_20', '#nope', 'Never');
        await new Promise((resolve) => setTimeout(resolve, 20));
        hideEmptyListItems('view_20');
        prependTextToGroupBy('<i>G</i>', 'view_20', 1);
        return snap();
    });
});

test('replaceTextInGrid matches V1 for field class and header text targets', async () => {
    await same(['replaceTextInGrid'], () => {
        replaceTextInGrid('view_20', 'field_1', 'field_2');
        const byField = snap();
        replaceTextInGrid('view_20', 'field_3', 'Name');
        return [byField, snap()];
    });
});

test('removeBlanksFromDF and replaceTextRegex match V1', async () => {
    await same(['removeBlanksFromDF', 'replaceTextRegex'], () => {
        removeBlanksFromDF($('#df'), ':');
        const a = document.getElementById('df').innerHTML;
        removeBlanksFromDF($('#df'));
        replaceTextRegex('.rx', /foo/, 'bar'); replaceTextRegex(77, /abc/, 'X', true);
        return [a, snap()];
    });
    const r = await realm({ file: V2, names: ['removeBlanksFromDF'], html: HTML });
    try {
        assert.equal(await r.run(() => { removeBlanksFromDF(document.getElementById('df'), ':'); return document.querySelectorAll('#df .removeIfBlank').length; }), 1);
    } finally { await r.close(); }
});

test('validateInputEmpty, areAllInputsEmpty and the date helpers match V1', async () => {
    await same(['validateInputEmpty', 'areAllInputsEmpty', 'weeksBetween', 'convertToDateObj'], () => {
        const r = { empty: validateInputEmpty('v_empty'), full: validateInputEmpty('v_full'), cls: document.getElementById('v_empty').className };
        document.getElementById('v_empty').value = 'typed'; document.getElementById('v_empty').dispatchEvent(new Event('blur'));
        r.cleared = document.getElementById('v_empty').className;
        r.all = [areAllInputsEmpty('view_21'), areAllInputsEmpty(''), areAllInputsEmpty('view_99')];
        document.getElementById('i_text').value = ' ';
        r.ws = areAllInputsEmpty('view_21');
        document.querySelector('[name="view_21-field_9"]').checked = true;
        r.checked = [areAllInputsEmpty('view_21'), areAllInputsEmpty('view_21', ['field_9'])];
        document.getElementById('i_sel').value = 'a';
        r.sel = [areAllInputsEmpty('view_21', ['field_9']), areAllInputsEmpty('view_21', ['field_9', 'i_sel'])];
        r.weeks = [weeksBetween(new Date(2024, 0, 1), new Date(2024, 0, 9)), weeksBetween(new Date(2024, 0, 9), new Date(2024, 0, 1)), weeksBetween(new Date(2024, 0, 1), new Date(2024, 0, 1))];
        r.date = convertToDateObj('24/05/2023').getTime();
        return r;
    });
});

test('V2 validateInputEmpty returns false for a missing input instead of throwing', async () => {
    const r = await realm({ file: V2, names: ['validateInputEmpty'], html: HTML });
    try { assert.equal(await r.run(() => validateInputEmpty('nope')), false); } finally { await r.close(); }
});

test('filterSelectByText, setSelectedRadioValue and the show/hide helpers match V1', async () => {
    await same(['filterSelectByText', 'setSelectedRadioValue', 'showHideEleBasedOnRadios', 'showHideEleBasedOnString', 'getFieldWrapper'], () => {
        const r = {};
        filterSelectByText('view_22', 5, 'Ap'); r.chzn = Array.from(document.querySelectorAll('#view_22_field_5_chzn li'), (li) => li.style.display);
        const events = []; const wrap = document.getElementById('kn-input-field_30');
        wrap.addEventListener('change', () => events.push('native')); $(wrap).on('change', () => events.push('jq'));
        showHideEleBasedOnRadios(30, 'yes', '.t1');
        showHideEleBasedOnRadios(30, ['yes', 'no'], '.t2', true);
        r.start = [document.querySelector('.t1').style.display, document.querySelector('.t2').style.display];
        r.set = [setSelectedRadioValue(30, ' yes '), setSelectedRadioValue(30, 'zzz'), setSelectedRadioValue(31, 'yes'), setSelectedRadioValue(30, '')];
        r.after = [document.querySelector('.t1').style.display, document.querySelector('.t2').style.display];
        r.checked = document.querySelector('#kn-input-field_30 :checked').value;
        showHideEleBasedOnString('hello world', { hello: '.t1', nope: '.t2' });
        r.str = [document.querySelector('.t1').style.display, document.querySelector('.t2').style.display];
        r.errors = []; const err = console.error; console.error = (m) => r.errors.push(m);
        showHideEleBasedOnRadios(99, 'x', '.t1'); showHideEleBasedOnRadios(30, 'x', '.missing'); console.error = err;
        r.eventKinds = events.includes('native');
        return r;
    });
});

test('getTableRows shim keeps jQuery rows; getTableRowElements gives native rows in the same order', async () => {
    await same(['getTableRows', 'getTableRowElements', 'warnDeprecated', 'toJQuery'], () => {
        const out = [];
        const collect = (...args) => getTableRows('view_20', (i, row) => out.push([i, row.jquery !== undefined, row.attr('id') ?? row.text().trim().slice(0, 6)]), ...args);
        collect(); collect(true); collect(false, true); collect(true, true); getTableRows('', () => out.push('never'));
        return out;
    });
    const r = await realm({ file: V2, names: ['getTableRowElements'], html: HTML });
    try {
        assert.deepEqual(await r.run(() => { const ids = []; getTableRowElements('view_20', (i, row) => ids.push([i, row.tagName, row.id]), true, true); return ids; }),
            [[0, 'TR', ''], [1, 'TR', ''], [2, 'TR', 'a'], [3, 'TR', 'b']]);
    } finally { await r.close(); }
});
