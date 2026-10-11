const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `
<div id="view_9"><form>
 <div id="kn-input-field_1" class="kn-input"><label class="option radio"><input type="radio" name="r1" value="a" checked> Alpha</label><label class="option radio"><input type="radio" name="r1" value="b"> Beta</label></div>
 <div id="kn-input-field_2" class="kn-input"><label class="option radio"><input type="radio" name="r2" value="c"> Gamma</label></div>
 <div id="kn-input-field_3" class="kn-input"><label class="option checkbox"><input type="checkbox" value="v1" checked> First</label><label class="option checkbox"><input type="checkbox" value="v2"> Second one</label><label class="option checkbox"><input type="checkbox" value='q"x'> Quote</label></div>
 <div id="kn-input-field_4" class="kn-input"><input type="text" value="hello"><textarea>area</textarea><select id="view_9-field_4"><option value="">-</option><option value="p" selected>P</option><option value="q">Q</option></select><select multiple id="multi"><option selected>m1</option><option selected>m2</option></select></div>
 <div id="kn-input-field_5" class="kn-input" style="display:none"><label class="option radio"><input type="radio" name="r5" value="h"> Hidden</label></div>
</form>
<select id="conx"><option value="">-</option><option value="id1">Name One</option><option value="id2">Name Two</option></select>
<table><thead><tr><th class="field_1">A</th><th class="field_2">B</th></tr></thead><tbody><tr id="r1"><td>x</td><td><span class="knViewLink__label">old</span> y</td></tr><tr id="2abc"><td>z</td><td>w</td></tr></tbody></table>
<div class="msg"><span class="m">msg</span></div><span class="nl">null</span><span class="nl">ok</span><span class="nl">xnullx</span><i class="st">Not done</i><i class="st">Done</i><input id="field_7">
<div id="f1"><textarea>t</textarea></div><div id="f2"><select><option>1</option></select></div></div>`;
const BEFORE = `window.state = () => Array.from(document.querySelectorAll('#view_9 input, #view_9 textarea, #view_9 select'), (e) => [e.id || e.name || e.tagName, e.type, e.value, e.checked, e.selectedIndex]); window.__log = []; document.addEventListener('change', (e) => window.__log.push('change:' + (e.target.id || e.target.name || e.target.tagName)), true);
document.addEventListener('input', (e) => window.__log.push('input:' + (e.target.id || e.target.name || e.target.tagName)), true);
$(document).on('liszt:updated', (e) => window.__log.push('chosen:' + e.target.id));`;
const NAMES = ['isElementVisible', 'isInputEmpty', 'replaceValueInTD', 'showHideMsgBasedOnSelect', 'clearInput', 'resetSelectToFirstOption', 'toggleCheckboxOption', 'changeRadioButtonLabel', 'setupFieldStatus', 'removeNull', 'selectFromSelect', 'selectFromConx', 'addPlaceholderToInput', 'checkAllRadioAnswered', 'changeCellTextBasedOnCellContent', 'refreshChosen', 'getFieldWrapper', 'resolveElements', 'normaliseInputs', 'fireEvent', 'removeElement', 'toggleMessage', 'getAllTableRows', 'getIndexOfColumnHeader', 'addInputEventListener', 'cssEscape', 'isjQueryInstance', 'isNodeList', 'warnDeprecated', 'knackNavigator'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text));
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('clearInput and resetSelectToFirstOption match V1', async () => {
    await same(() => {
        const out = {};
        clearInput('#f1'); out.f1 = document.querySelector('#f1 textarea').value;
        clearInput(document.getElementById('kn-input-field_1'), true); out.radio = state(); out.log1 = [...window.__log]; window.__log.length = 0;
        clearInput($('#kn-input-field_4'), true); out.field4 = state(); out.log2 = [...window.__log]; window.__log.length = 0;
        clearInput(document.querySelector('#kn-input-field_3 input'), false); clearInput([document.getElementById('kn-input-field_2'), null]); clearInput(null);
        out.after = state();
        const sel = document.getElementById('view_9-field_4'); sel.value = 'q';
        resetSelectToFirstOption(sel); resetSelectToFirstOption(sel); sel.value = 'q'; resetSelectToFirstOption(sel, { silent: true, updateChosen: false }); resetSelectToFirstOption(null);
        out.log3 = [...window.__log]; out.sel = [sel.selectedIndex, Array.from(sel.options, (o) => o.hasAttribute('selected'))];
        return out;
    });
});

test('checkbox, radio, option and status helpers match V1', async () => {
    await same(() => {
        const cls = () => Array.from(document.querySelectorAll('#kn-input-field_3 label'), (l) => l.className);
        toggleCheckboxOption('field_3', 'v1', false); toggleCheckboxOption('field_3', 'Second one', false); toggleCheckboxOption('field_3', 'v1', true); toggleCheckboxOption('field_3', 'nope', true); toggleCheckboxOption('field_99', 'x', true);
        const out = { cls: cls() };
        changeRadioButtonLabel(1, 'Alpha', 'Omega'); changeRadioButtonLabel(1, 'zzz', 'x');
        out.label = document.getElementById('kn-input-field_1').innerHTML.replace(/\s+/g, ' ');
        setupFieldStatus('x', true); document.querySelectorAll('.st').forEach((e) => e.classList.add('field_8')); setupFieldStatus(8, true); const amber = Array.from(document.querySelectorAll('.st'), (e) => e.style.backgroundColor);
        document.querySelectorAll('.st').forEach((e) => { e.style.backgroundColor = ''; }); setupFieldStatus(8); out.status = [amber, Array.from(document.querySelectorAll('.st'), (e) => e.style.backgroundColor)];
        removeNull('nl'); out.nulls = Array.from(document.querySelectorAll('.nl'), (e) => e.textContent);
        selectFromSelect('#conx', 'id2'); selectFromSelect('#conx', 'nope'); out.conx = document.getElementById('conx').value;
        document.getElementById('conx').value = ''; selectFromConx('view_9', 'x', 'Name One'); document.getElementById('conx').id = 'view_9-field_30'; selectFromConx('view_9', 30, 'Name One'); selectFromConx('view_9', 30, 'Nobody');
        out.conx2 = document.getElementById('view_9-field_30').value;
        addPlaceholderToInput(7, 'ph'); addPlaceholderToInput(8, 'none'); out.ph = document.getElementById('field_7').placeholder;
        out.radioAnswered = [checkAllRadioAnswered('view_9'), checkAllRadioAnswered('view_9', [2]), checkAllRadioAnswered('view_99')];
        return out;
    });
});

test('visibility, emptiness, table and message helpers match V1', async () => {
    await same(async () => {
        const out = {};
        out.vis = [isElementVisible('#kn-input-field_1'), isElementVisible('#kn-input-field_5'), isElementVisible('#nope'), isElementVisible(document.getElementById('f1')), isElementVisible('textarea', document.getElementById('f1')), isElementVisible(null), isElementVisible(document.createElement('p'))];
        out.empty = [isInputEmpty('f1', 'textarea'), isInputEmpty(document.getElementById('f2'), 'dropdown'), isInputEmpty('kn-input-field_1', 'choice'), isInputEmpty('kn-input-field_5', 'choice'), isInputEmpty('nope', 'choice'), isInputEmpty('f1', 'weird')];
        replaceValueInTD('view_9', 2, 'w', 'REPLACED'); replaceValueInTD('view_9', 9, 'w', 'x'); replaceValueInTD('view_99', 2, 'w', 'x');
        changeCellTextBasedOnCellContent('view_9', [{ id: 'r1', field_5: 'has tea' }, { id: '2abc', field_5: 'no' }, { id: 'missing', field_5: 'tea' }], 'field_5', 'field_2', 'tea', 'NEW');
        changeCellTextBasedOnCellContent('view_9', [{ id: '2abc', field_5: 'tea' }], 'field_5', 'field_99', 'tea', 'LAST', 'warning');
        out.table = document.querySelector('#view_9 table').outerHTML.replace(/\s+/g, ' ');
        showHideMsgBasedOnSelect('view_9', 4, ['p'], '.m'); out.msg1 = document.querySelector('.msg').style.display;
        const sel = document.getElementById('view_9-field_4'); sel.value = 'q'; sel.dispatchEvent(new Event('change', { bubbles: true })); out.msg2 = document.querySelector('.msg').style.display;
        showHideMsgBasedOnSelect('view_9', [4, 99], 'q', '.m'); out.errors = true;
        return out;
    });
});
