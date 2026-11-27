const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `<div id="view_3"><table><thead><tr><th class="field_1">A</th><th class="field_2 x">B</th></tr></thead></table></div>
<div class="field_10"><div class="kn-detail-body">  Hello <b>there</b>  </div></div><div class="field_11"><div class="kn-detail-body"></div></div>
<span class="ins">x</span><span class="ins">y</span>`;
const BEFORE = `Knack.scenes = { models: [{ attributes: { key: 'scene_4', slug: 'schools' }, views: { models: [{ attributes: { key: 'view_8' } }] } }] };
Knack.views.view_7 = { model: { view: { key: 'view_7', scene: { key: 'scene_2', slug: 'home' } } } };
Knack.views.view_6 = { model: { view: { key: 'view_6', scene: { key: '3' } } } };`;
const NAMES = ['getValueFromDetail', 'getValueFromDetailBody', 'insertValFromDetail', 'getIndexOfColumnHeader', 'normaliseText', 'recordHasValue', 'getWeekCommencingDate', 'constructList', 'csvToArray', 'startsWithVowel', 'sanitiseURL', 'getNewURL', 'getRecordID', 'getIdBeforeSceneSlug', 'getSceneFromViewId', 'warnDeprecated', 'knackNavigator'];

async function same(scenario, names = NAMES) {
    const { v1, v2, v1Console, v2Console } = await both({ names, html: HTML, before: BEFORE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
    return { v1Console, v2Console };
}

test('detail readers, column index and text helpers match V1', async () => {
    const { v2Console } = await same(() => {
        insertValFromDetail(10, '.ins'); insertValFromDetail(99, '.gone');
        const insNull = Array.from(document.querySelectorAll('.ins'), (e) => e.textContent);
        insertValFromDetail(99, '.ins');
        return {
            text: getValueFromDetail(10), html: getValueFromDetail(10, true), empty: getValueFromDetail(11), missing: getValueFromDetail(99),
            body: [getValueFromDetailBody(10), getValueFromDetailBody(10, true), getValueFromDetailBody(99)], insNull, ins: Array.from(document.querySelectorAll('.ins'), (e) => e.textContent),
            idx: [getIndexOfColumnHeader(document.getElementById('view_3'), 2), getIndexOfColumnHeader(document.getElementById('view_3'), [1, 2, 9]), getIndexOfColumnHeader(document.body, 1)],
            norm: [normaliseText(' A<br/>B <b>c</b>\n'), normaliseText(null), normaliseText(12)],
            has: [[], [null, ''], ['x'], { a: { b: 0 } }, { a: {} }, new Date('x'), new Date(), true, false, NaN, 0, Infinity, ' ', 'a', null, undefined].map((v) => recordHasValue(v)),
        };
    });
    assert.ok(v2Console.some((m) => m.text.includes('field_99 not found')));
});

test('week, list, csv, vowel and URL helpers match V1 (except the constructList comma fix)', async () => {
    await same(() => {
        const origHash = location.hash; location.hash = '#a/parent1/schools/rec9/';
        const out = {
            weeks: ['2024-01-01', '2024-01-03', '2024-01-07', '2024-03-31', '2024-10-27', '2023-12-31'].map((d) => getWeekCommencingDate(new Date(`${d}T12:00:00`))),
            list: [[], ['a'], ['a', 'b'], ['a', 'b', 'c']].map((a) => constructList(a, 'and')),
            csv: [csvToArray(' a, b ,a,,c'), csvToArray('a,b,a', true), csvToArray(''), csvToArray(null), csvToArray(5)],
            vowel: ['apple', 'Egg', 'bat', '', ' apple', 'Umbrella', '1'].map((w) => startsWithVowel(w)),
            url: [sanitiseURL('https://x.io/a/b?q=1'), sanitiseURL(new URL('https://x.io/a?z=2')), getNewURL('https://x.io/a/b/c/d/e?q=1'), getNewURL('https://x.io/a/b/c/d/e', 1), getNewURL('a', 5)],
            rec: [getRecordID(), getRecordID(1), getRecordID(3), getRecordID(0)],
            before: ['schools', 'parent1', 'nope', 'a', ''].map((s) => getIdBeforeSceneSlug(s)),
        };
        location.hash = origHash;
        return out;
    });
    const r = await realm({ file: V2, names: ['constructList'], html: HTML });
    try { assert.equal(await r.run(() => constructList(['a, b', 'c, d'], 'or')), 'a, b or c, d'); } finally { await r.close(); }
});

test('getSceneFromViewId shim matches V1 for the common cases and is deprecated', async () => {
    await same(() => ({ direct: getSceneFromViewId('view_7'), numeric: getSceneFromViewId(7), scan: getSceneFromViewId('view_8'), missing: getSceneFromViewId('view_99'), none: [getSceneFromViewId(''), getSceneFromViewId(null)] }));
    const r = await realm({ file: V2, names: ['getSceneFromViewId', 'getValueFromDetailBody', 'warnDeprecated', 'getValueFromDetail', 'knackNavigator'], html: HTML, before: BEFORE + 'window.isDeveloper = true; window.__warn = []; console.warn = (m) => window.__warn.push(m);' });
    try {
        assert.deepEqual(await r.run(() => { getSceneFromViewId('view_7'); getSceneFromViewId('view_7'); getValueFromDetailBody(10); return window.__warn; }),
            ['[knackFunctions] getSceneFromViewId is deprecated; use knackNavigator.getSceneInfoForView().', '[knackFunctions] getValueFromDetailBody is deprecated; use getValueFromDetail().']);
    } finally { await r.close(); }
});
