/**
 * Acceptance gate for the KnackNavigator and KnackValueResolver simplifications: every public method gives the
 * same answer in V1 and V2 for a fixture app, except the documented getViewObject fix.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `<div id="view_5" class="kn-view"><div id="kn-input-field_1"></div>
<table><thead><tr><th class="field_1" data-field-key="field_1">Name</th><th class="field_2">Ages &amp; Co</th><th>Edit</th></tr></thead></table></div>`;
const BEFORE = `
const field = (key, type, extra = {}) => ({ attributes: { key, type, name: key + ' name', ...extra } });
Knack.objects = { models: [{ fields: { models: [field('field_1', 'short_text'), field('field_2', 'number'), field('field_3', 'multiple_choice', { format: { options: ['A', ' B ', 'A', ''] } }), field('field_4', 'date_time', { format: { date_format: 'dd/mm/yyyy', time_format: 'military' } }), field('field_5', 'connection'), field('field_6', 'equation')] } }] };
Knack.scenes = { models: [{ attributes: { key: 'scene_1', slug: 'home' }, views: { models: [{ attributes: { key: 'view_9', type: 'table', source: { object: 'object_1' }, columns: [{ field: { key: 'field_1' }, header: 'Name' }, { id: 'field_2', header: 'Ages' }], fields: [{ key: 'field_1' }, { key: 'field_2' }, { key: 'x' }] } }] } }] };
Knack.views.view_5 = { model: { view: { key: 'view_5', type: 'table', columns: [{ field: { key: 'field_1' }, header: 'Name' }, { field: { key: 'field_2' }, header: 'Ages &amp; Co' }, { id: 'edit', header: 'Edit' }], fields: [{ key: 'field_1' }, { key: 'field_1' }, { key: 'field_2' }, { key: 'bad' }] } } };`;
const NAMES = ['KnackNavigator', 'knackNavigator', 'KnackValueResolver', 'knackValueResolver', 'getFieldWrapper', 'getViewRootElement', 'getIdBeforeSceneSlug'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('navigator id normalisers and maps match V1', async () => {
    await same(() => {
        const n = knackNavigator; const inputs = [12, '12', ' View_12 ', 'VIEW_9', 'view_', 'view_x', 'field_3', '', null, undefined, 'view_view_1', '1.5', ' 7 '];
        return {
            view: inputs.map((v) => n.normalizeViewId(v)), field: inputs.map((v) => n.normalizeFieldId(v)), scene: inputs.map((v) => n.normalizeSceneId(v)),
            raw: inputs.map((v) => n.normalizeRawFieldId(v)), prefixed: n.normalizePrefixedId('OBJECT_4', 'object_'),
            fieldMap: n.normalizeFieldMap({ a: 3, b: 'field_4', c: 'zz' }), rawMap: n.normalizeRawFieldMap({ a: 3, b: 'field_4_raw' }), nullMap: [n.normalizeFieldMap(null), n.normaliseViewMap(undefined)],
            viewMap: n.normaliseViewMap({ a: 5, b: ['x', 6, 7], c: [], d: 'nope' }),
        };
    });
});

test('navigator metadata lookups match V1', async () => {
    await same(() => {
        const n = knackNavigator;
        return {
            viewDirect: n.getViewObject('view_5')?.key, viewScene: n.getViewObject(9)?.key, viewMissing: n.getViewObject('view_77'), viewBad: n.getViewObject('x'),
            forObject: [n.isViewForObject('view_9', 'object_1'), n.isViewForObject('view_9', 'object_2'), n.isViewForObject('view_9', 'object_1', { viewType: 'table' })],
            fieldIds: n.getViewFieldIds('view_5'), cols: n.getViewColumns('view_5').length,
            col: [n.getViewColumn('view_5', 'field_2')?.header, n.getViewColumn('view_5', 'Edit')?.id, n.getViewColumn('view_5', { field: { key: 'field_1' } })?.header],
            idx: [n.getViewColumnIndex('view_5', 'field_2'), n.getViewColumnIndex('view_5', 'edit'), n.getViewColumnIndex('view_9', 'field_2'), n.getViewColumnIndex('view_9', 'nope'), n.getViewColumnIndex('', 'field_1')],
            rendered: [n.getRenderedViewColumnIndex('view_5', 'field_1'), n.getRenderedViewColumnIndex('view_5', 'Edit'), n.getRenderedViewColumnIndex('view_8', 'field_1')],
            selectors: n.getViewColumnSelectors('view_5', 'field_2'), width: n.getViewColumnWidth('view_5', 'field_1'),
            meta: [n.getFieldMeta('field_1')?.type, n.getFieldMeta(99), n.getFieldMeta('')], types: ['field_1', 3, 'field_4', 'x', ''].map((f) => n.getFieldType(f)),
            choices: n.getFieldChoiceOptions('field_3'), byLabel: [n.getFieldIdFromLabel('view_5', 'field_1 name'), n.getFieldIdFromHeader('view_5', 'name'), n.getHeaderFromFieldId('view_5', 'field_2')],
            scene: [n.getSceneInfoForView('view_9'), n.getSceneInfoForView('view_5'), n.getSceneInfoForView('view_1')],
            wrapper: [n.getFieldWrapper(document.getElementById('view_5'), 1)?.id, n.getFieldWrapper(document.body, 'field_9'), n.getFieldWrapper(null, 1), n.getFieldWrapper(document.body, 'x')],
        };
    });
});

test('V2 getViewObject finds a view that renders after it was first asked for (V1 cached the miss)', async () => {
    const pageScript = (file) => realm({ file, names: NAMES, html: HTML, before: BEFORE });
    const [r1, r2] = await Promise.all([pageScript('knackFunctions.js'), pageScript(V2)]);
    const scenario = () => { const early = knackNavigator.getViewObject('view_55'); Knack.views.view_55 = { model: { view: { key: 'view_55' } } }; return [early, knackNavigator.getViewObject('view_55')?.key ?? null]; };
    try {
        assert.deepEqual(await r1.run(scenario), [null, null]);
        assert.deepEqual(await r2.run(scenario), [null, 'view_55']);
    } finally { await Promise.all([r1.close(), r2.close()]); }
});

test('value resolver conversions match V1 across field types', async () => {
    await same(() => {
        const r = knackValueResolver;
        const conn = [[{ id: 'a1', identifier: ' One ' }, { id: 'b2' }], { id: 'c3', identifier: 'Three' }, [], [{}], [null], ['str'], 'abc', 5, 0, null, [{ id: 0 }], [[{ id: 'n' }]], [{ id: ' sp ' }, 'x', null, 7]];
        const dt = { date: '03/15/2024', hours: '09', minutes: '05', am_pm: 'PM', time: '9:05 PM' };
        const records = { field_1: 'Alice', field_1_raw: 'Alice', field_2: '1,234.5', field_2_raw: 1234.5, field_3: 'A, B', field_3_raw: ['A', 'B'], field_4: '15/03/2024', field_4_raw: dt, field_5: 'One', field_5_raw: conn[0], field_6: '7', field_6_raw: 7, field_7_raw: null };
        const types = ['short_text', 'number', 'multiple_choice', 'date_time', 'connection', 'equation', 'name', 'boolean', 'currency', 'email', 'file', 'unknown'];
        return {
            refs: conn.map((c) => r.toConnectionRef(c)), ids: conn.map((c) => r.toConnectionIds(c)),
            readOnly: types.concat([' EQUATION ', null, 'count']).map((t) => r.isReadOnlyFieldType(t)), structured: types.concat([' Email ', null]).map((t) => r.isStructuredFieldType(t)),
            cmp: ['  a   b\n c ', null, 5, { x: 1 }].map((v) => r.normalizeComparableText(v)),
            api: types.map((t) => r.toApiValue({ rawValue: t === 'date_time' ? dt : t === 'connection' ? conn[0] : 'v', displayValue: ' disp ', fieldType: t })),
            request: types.map((t) => r.toRequestValue({ rawValue: t === 'date_time' ? dt : t === 'connection' ? conn[0] : t === 'name' ? { first: 'A', last: 'B' } : 'v', displayValue: 'd', fieldType: t, targetKey: t === 'date_time' ? 'field_4' : undefined })),
            requestNull: [r.toRequestValue({ rawValue: null, displayValue: 'd', fieldType: 'short_text' }), r.toRequestValue({ rawValue: undefined, displayValue: 'd', fieldType: 'name' })],
            resolve: ['field_1', 'field_2', 'field_3', 'field_4', 'field_5', 'field_6', 'field_7', 'field_9'].map((f) => ['typed', 'raw', 'display', 'api', 'request'].map((mode) => r.resolve(records, f, { mode, fallback: 'FB' }))),
            meta: ['field_1', 'field_4', 'field_5'].map((f) => r.describeFieldValue(records, f)), valueMeta: ['field_2', 'field_5'].map((f) => r.getFieldValueMeta(records, f)),
            payload: r.buildRequestPayload(records, ['field_1', 'field_2', 'field_4']), label: r.getRecordLabel({ id: 'rid', ...records }, ['field_1', 'field_5', 'field_1']),
            strings: [r.toStringSafe(' x '), r.toStringSafe(Symbol('s')), r.toStringArray('a, b,,c'), r.toDisplayString({ identifier: 'id' }), r.toBooleanValue('Yes'), r.toNumberValue('1,234.5x')],
            shape: ['field_1', 'field_6'].map((f) => r.getFieldShape(f)), type: r.getFieldType('field_4'), meta2: r.getFieldMeta('field_3')?.type,
        };
    });
});
