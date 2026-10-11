const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `
<div id="view_12" class="kn-view">
  <table><tbody>
    <tr id="r1"><td><input type="checkbox" checked></td></tr>
    <tr id="r2"><td><input type="checkbox"></td></tr>
    <tr id="r3"><td><input type="checkbox" checked></td></tr>
  </tbody></table>
  <textarea id="t1"></textarea><textarea id="t2"></textarea>
  <div id="kn-input-field_5" class="kn-input"><input id="view_12-field_5" type="text"><input type="text"></div>
  <div id="kn-input-field_6" class="kn-input"><input id="view_12-field_6" type="text"><input id="view_12-field_6-time" type="text"></div>
  <div id="kn-input-field_7" class="kn-input"><input id="view_12-field_7" type="text" value="keep"><input id="view_12-field_7-time" type="text"></div>
</div>
<p class="a b">one</p><p class="a">two</p><span id="doomed">x</span><span class="doomed">y</span>`;
const BEFORE = 'window.FIELD_IDS_FOR_LOGGED_IN_USER=[5,99];window.SET_CURRENT_DATE_FIELDS=[6,7];';

async function same(names, scenario) {
    const { v1, v2, v2Console, v1Console } = await both({ names, html: HTML, before: BEFORE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('removeElement matches V1 for selector, element, jQuery and array input', async () => {
    await same(['removeElement'], () => {
        removeElement('#doomed'); removeElement(document.querySelector('.doomed'));
        removeElement(['.a', '#nope']); removeElement($('#nope'));
        return document.body.innerHTML.replace(/\s+/g, ' ');
    });
});

test('class helpers match V1 and the old names are deprecated shims returning jQuery', async () => {
    await same(['addClasses', 'removeClasses', 'addClassToSelector', 'removeClassFromSelector', 'warnDeprecated', 'toJQuery', 'toClassList'], () => {
        const r = {};
        r.add = addClassToSelector('.a', 'x y').length;
        r.addJq = addClassToSelector($('.a'), ['z']).jquery !== undefined;
        r.addArray = addClassToSelector(['.a'], 'w');
        r.remove = removeClassFromSelector('.a', 'x').length;
        r.removeArray = removeClassFromSelector(['.a'], 'y');
        r.classes = Array.from(document.querySelectorAll('.a'), (e) => e.className);
        return r;
    });
    const r = await realm({ file: V2, names: ['addClasses', 'removeClasses'], html: HTML });
    try {
        const out = await r.run(() => ({ added: addClasses('.a', 'n m').map((e) => e.className), removed: removeClasses('.a', ['n']).length }));
        assert.deepEqual(out, { added: ['a b n m', 'a n m'], removed: 2 });
    } finally { await r.close(); }
});

test('checked rows, text areas and getFieldId match V1 (shims keep jQuery return types)', async () => {
    await same(['getCheckedRowIds', 'getCheckedRows', 'getCheckedRowElements', 'getTextArea', 'getTextAreas', 'getFieldId', 'warnDeprecated', 'toJQuery'], () => ({
        ids: getCheckedRowIds('view_12'),
        rows: getCheckedRows('view_12').map((row) => [row.jquery !== undefined, row.attr('id')]),
        none: getCheckedRowIds('view_99'),
        areas: getTextArea('view_12').map((_, el) => el.id).get(),
        isJq: getTextArea('view_12').jquery !== undefined,
        fid: getFieldId($('#view_12-field_5')), fidNone: getFieldId($('#kn-input-field_5')),
    }));
});

test('input notifications match V1', async () => {
    await same(['showInputNotification', 'updateInputNotification', 'removeInputNotification'], async () => {
        const id = showInputNotification($('#view_12-field_5'), 'Hello', 'red');
        const note = document.getElementById(id);
        const r = { text: note.textContent, cls: note.className, bg: note.style.backgroundColor, after: note.previousElementSibling.id };
        updateInputNotification(id, 'Changed'); r.updated = document.getElementById(id).textContent;
        removeInputNotification(id); r.removed = !document.getElementById(id);
        const timed = showInputNotification($('#view_12-field_6'), 'bye', 'blue', 20);
        await new Promise((resolve) => setTimeout(resolve, 60));
        r.timedRemoved = !document.getElementById(timed);
        updateInputNotification('missing', 'x'); removeInputNotification('missing');
        return r;
    });
});

test('API_TIMER, getMax and the user/date field fillers match V1', async () => {
    await same(['API_TIMER', 'getMax', 'updateFieldsInArrays', 'updateUserFields', 'updateDateFields', 'getDateUKFormat', 'getViewRootElement'], async () => {
        await API_TIMER(5);
        const r = { max: getMax({ a: 1, b: 3, c: 3, d: '3' }), maxEmpty: getMax({}) };
        updateFieldsInArrays('view_12');
        r.values = Array.from(document.querySelectorAll('#view_12 input[type=text]'), (i) => [i.id, i.value.replace(/\d{2}:\d{2}$/, 'HH:MM').replace(/\d{2}\/\d{2}\/\d{4}/, 'DATE')]);
        r.hidden = document.getElementById('kn-input-field_5').className;
        document.getElementById('view_12-field_6').value = ''; document.getElementById('view_12-field_6-time').value = '';
        updateDateFields('view_12', [{ fieldId: 6, insertTime: false }, 'x', -1, 7], true);
        r.noTime = [document.getElementById('view_12-field_6-time').value, !!document.getElementById('view_12-field_6').value];
        return r;
    });
});

test('V2 getFieldId also accepts a native element or selector (V1 needed jQuery)', async () => {
    const r = await realm({ file: V2, names: ['getFieldId'], html: HTML });
    try {
        assert.deepEqual(await r.run(() => [getFieldId(document.getElementById('t1')), getFieldId('#t2'), getFieldId('#nope')]), ['t1', 't2', undefined]);
    } finally { await r.close(); }
});
