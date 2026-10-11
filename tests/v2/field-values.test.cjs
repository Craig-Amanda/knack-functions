const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const ID1 = 'a'.repeat(24); const ID2 = '0123456789abcdef01234567'; const ID3 = 'ABCDEF012345678901234567';
const HTML = `
<form id="f">
 <div id="kn-input-field_1"><label><input type="radio" name="r" value=" yes "> Yes</label><label><input type="radio" name="r" value="no" checked> No</label></div>
 <div id="kn-input-field_2"><select><option value="">-</option><option value="a"> Alpha </option><option value="b" selected>Beta</option></select></div>
 <div id="kn-input-field_3"><select multiple><option value="x" selected>X ray</option><option value="y" selected> </option><option value="z">Zed</option></select></div>
 <div id="kn-input-field_4"><label><input type="checkbox" value="c1" checked> One</label><label><input type="checkbox" value="" checked> Two</label><label><input type="checkbox" value="c3"> Three</label></div>
 <div id="kn-input-field_5"><input type="text" value="  typed "></div><div id="kn-input-field_6"><textarea> area </textarea></div><div id="kn-input-field_7"><input type="hidden" value="x"></div>
 <div id="kn-input-field_8"><div class="chzn-container"><div class="search-field"><input id="srch" value="zzz"></div></div><select><option value="">-</option></select></div>
</form>
<table><tr><td id="c1"><span><span class="${ID1}" data-kn="connection-value">Jon</span></span></td><td id="c2"><span class="${ID2}">x</span></td><td id="c3"><div id="${ID3}">y</div></td><td id="c4"><span>none</span></td></tr></table>
<p class="t" id="p1"> Hello </p><p class="t u">Hello</p><div class="t">Hello</div>`;
const BEFORE = `window.getDateTimeParts = () => ({ date: '' }); Knack.views.view_1 = { model: { view: { scene: { key: 'scene_1', slug: 's', scenes: [] } } } };`;
const NAMES = ['getNestedValue', 'removeHtml', 'removeHtmlWithFormatting', 'findElementByText', 'getSelectedRadioValue', 'getSelectedValue', 'getFormFieldDisplayValue', 'getFormFieldCheckboxValues', 'elementHasMeaningfulValue', 'hiddenInputHasMeaningfulValue', 'normaliseInputs', 'normaliseToElement', 'getIdFromElement', 'getConnectionIdFromHtml', 'getCurrentSceneInfo', 'getFieldWrapper', 'warnDeprecated', 'resolveElements', 'knackValueResolver', 'knackNavigator', 'isNodeList', 'isjQueryInstance'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE, exclude: ['getDateTimeParts'] }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text));
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('text and form value readers match V1', async () => {
    await same(() => {
        const ids = [1, 2, 3, 4, 5, 6, 7, 8, 99, 'field_2', 'x'];
        const root = document.getElementById('f');
        return {
            nested: [getNestedValue({ a: { b: [5] } }, 'a.b.0'), getNestedValue({}, 'a.b'), getNestedValue({ a: null }, 'a.b'), getNestedValue({ a: 1 }, 'a')],
            html: ['<b>x</b> y', 'plain', '', null, undefined, '<p>a</p><p>b</p>', '<img src=x onerror=window.__ran=1>t', '<style>s{}</style>v', 5].map((h) => removeHtml(h)), ran: window.__ran ?? null,
            fmt: ['<p>a</p><p>b</p>', 'a<br>b<br/>c', '<div>x&nbsp;y</div>\n\n\n<div>z</div>', 'no tags', '', null, 7, '  <i>t</i> '].map((h) => removeHtmlWithFormatting(h)),
            byText: [findElementByText('Hello')?.id, findElementByText('Hello', document, { tag: 'p' })?.id, findElementByText('Hello', document, { class: 't u' })?.className, findElementByText('Hello', root), findElementByText('x', document, { tag: 'div', class: 'q' })],
            radio: ids.map((i) => getSelectedRadioValue(i)), select: ids.map((i) => getSelectedValue(i)), display: ids.map((i) => getFormFieldDisplayValue(i)), checks: ids.map((i) => getFormFieldCheckboxValues(i)),
            scoped: getSelectedRadioValue(1, root),
            meaningful: Array.from(document.querySelectorAll('#f input, #f select, #f textarea')).map((e) => elementHasMeaningfulValue(e)).concat([elementHasMeaningfulValue(null), elementHasMeaningfulValue({})]),
            hidden: ['x', '', ' ', '[]', ' [ ] ', 'null', 'NULL', 'undefined', '%5B%5D', '%E0%A4%A', 0, null, 'ok'].map((v) => hiddenInputHasMeaningfulValue(v)),
        };
    });
});

test('id extraction matches V1 for elements; V2 also searches inside HTML strings (V1 returned null)', async () => {
    await same(() => {
        const cell = (id) => document.getElementById(id);
        const toTag = (e) => (e ? e.tagName : e);
        return {
            wrap: [normaliseToElement('<span>a</span>')?.tagName, normaliseToElement(''), normaliseToElement(null), toTag(normaliseToElement(cell('c1'))), normaliseToElement(5)],
            fromEl: ['c1', 'c2', 'c3', 'c4'].map((id) => getIdFromElement(cell(id))), fromNull: [getIdFromElement(null), getIdFromElement('')],
            conx: ['c1', 'c2', 'c3', 'c4'].map((id) => getConnectionIdFromHtml(cell(id))), conxNull: getConnectionIdFromHtml(null),
            conxHtml: getConnectionIdFromHtml(cell('c1').innerHTML), conxHtmlNone: getConnectionIdFromHtml('<span>x</span>'),
        };
    });
    const r = await realm({ file: V2, names: ['getIdFromElement', 'normaliseToElement'], html: HTML });
    try {
        assert.deepEqual(await r.run(() => [getIdFromElement(`<p><span class="${'b'.repeat(24)}">x</span></p>`), getIdFromElement('<p>none</p>')]), ['b'.repeat(24), null]);
    } finally { await r.close(); }
});

test('normaliseInputs and getCurrentSceneInfo shims match V1', async () => {
    await same(() => {
        const arr = [document.body, null];
        const tags = (a) => a.map((e) => (e && e.tagName) || e);
        let e1 = []; const orig = console.error; console.error = (m) => e1.push(String(m).slice(0, 60));
        const scene = [getCurrentSceneInfo('view_1'), getCurrentSceneInfo('view_1', 0), getCurrentSceneInfo('view_77')];
        console.error = orig;
        return { str: tags(normaliseInputs('.t')), el: tags(normaliseInputs(document.body)), jq: tags(normaliseInputs($('.t'))), nl: tags(normaliseInputs(document.querySelectorAll('p'))), arr: tags(normaliseInputs(arr)) , same: normaliseInputs(arr) === arr, none: [normaliseInputs(null), normaliseInputs('')], other: normaliseInputs(5).length, hc: normaliseInputs(document.getElementsByTagName('p')).length, scene, e1 };
    });
    const r = await realm({ file: V2, names: ['normaliseInputs', 'getCurrentSceneInfo', 'warnDeprecated', 'resolveElements', 'knackNavigator', 'isNodeList', 'isjQueryInstance'], html: HTML, before: BEFORE + 'window.isDeveloper = true; window.__w = []; console.warn = (m) => window.__w.push(m);' });
    try {
        assert.deepEqual(await r.run(() => { normaliseInputs('p'); normaliseInputs('p'); getCurrentSceneInfo('view_1'); return window.__w; }),
            ['[knackFunctions] normaliseInputs is deprecated; use resolveElements().', '[knackFunctions] getCurrentSceneInfo is deprecated; use knackNavigator.getCurrentSceneInfo().']);
    } finally { await r.close(); }
});
