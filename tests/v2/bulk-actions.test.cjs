/**
 * The bulk actions family is ported as-is, but it leans on knackNavigator and knackValueResolver, which V2 simplified.
 * These tests run its pure entry points in V1 and V2 to check that the simplified classes are still a drop-in.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const BEFORE = `Knack.views.view_5 = { model: { view: { key: 'view_5', type: 'form', action: 'create', fields: [{ key: 'field_1' }, { key: 'field_2' }] } } };
Knack.objects = { models: [{ fields: { models: [{ attributes: { key: 'field_1', type: 'short_text' } }, { attributes: { key: 'field_2', type: 'connection' } }] } }] };`;
const NAMES = ['classifyBulkActionFailure', 'createBulkActionConfig', 'mergeBulkActionConfig', 'bulkActionSummarizeRunState', 'parseBulkActionKeywordGroups', 'normalizeBulkActionKeywordGroupsInput', 'parseBulkActionDefinition', 'resolveBulkActionFieldId', 'bulkActionUniqueStrings', 'bulkActionNormaliseLabelText', 'bulkActionNormalizeBasketItems', 'createBulkActionBasketStore', 'createBulkActionStorageAdapter', 'bulkActionBuildSubmitEventRecordPayload', 'bulkActionBuildReplicateBasePayload', 'bulkActionGetEmptyRequestValue', 'KnackBulkActions', 'createKnackBulkActions', 'resolveDefaultBulkActionAppId', 'bulkActionIsPlainObject', 'bulkActionObjectOrEmpty', 'bulkActionResolveConnectionFieldRecordId'];

const plain = (value) => JSON.parse(JSON.stringify(value, (key, v) => (v instanceof RegExp ? `re:${v.source}/${v.flags}` : v instanceof Set ? [...v] : typeof v === 'function' ? 'fn' : v)));

test('bulk action parsing, config and state helpers behave the same on the simplified classes', async () => {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: '<div id="view_5"></div>', before: BEFORE }, () => {
        const plain = (value) => JSON.parse(JSON.stringify(value, (key, v) => (v instanceof RegExp ? `re:${v.source}/${v.flags}` : v instanceof Set ? [...v] : typeof v === 'function' ? 'fn' : v)));
        const cfg = createBulkActionConfig({ namespace: ' ns ', basket: { ttlMs: '5', title: 'T' }, constants: { formFlowTtlMs: 9 }, action: { notify() {} } });
        const groups = [['label', 'field_1', 'field_2'], ['approve', 'view_5', 'cb1'], ['approve', 'view_5', 'field_2', 'dataCb'], ['create', 'view_5', 'field_2', 'dataCb'], ['bad']];
        return plain({
            fail: [{ status: 422, message: ' Required ' }, { body: { message: 'Nope' }, status: 500 }, { message: 'Network down' }, null, { response: { status: 404 } }].map((e) => classifyBulkActionFailure(e)),
            cfg, merged: mergeBulkActionConfig(cfg, { namespace: 'other', selection: { scope: 'page' }, basket: null }), defaults: createBulkActionConfig(null),
            runs: [{}, { total: 10, processed: 4, success: 3, failed: 1, isRunning: true }, { total: 3, processed: 3, success: 3, isRunning: false, completionMessage: ' Done ' }, { total: 0, isRunning: true, completionMessage: 'Prep' }].map((r) => bulkActionSummarizeRunState(r)),
            parsed: parseBulkActionKeywordGroups(groups, { sourceViewId: 'view_5', dataCallbackRegistry: { dataCb() {} } }), parsedNone: parseBulkActionKeywordGroups(null),
            input: [normalizeBulkActionKeywordGroupsInput([[['a', 'b']], ['c']], '_x'), normalizeBulkActionKeywordGroupsInput('x', '_x'), normalizeBulkActionKeywordGroupsInput(undefined, '_x')],
            def: [parseBulkActionDefinition(['x', 'view_5', 'field_2', 'd', 's', 'v'], 'create'), parseBulkActionDefinition(['x', 'view_5', 'cb', 's'], 'update'), parseBulkActionDefinition(['x', 'view_5', 'field_1', 'd'], 'update')],
            ids: [resolveBulkActionFieldId('2'), resolveBulkActionFieldId('field_9', 'view_5'), resolveBulkActionFieldId('x'), resolveBulkActionFieldId(null)],
            strings: [bulkActionUniqueStrings([' a ', 'a', '', null, 5, '5']), bulkActionNormaliseLabelText('  Hello   <b>W</b> '), bulkActionNormalizeBasketItems([{ id: 'x', label: 'L' }, null, { id: '' }, 'junk'])],
            plainChecks: [bulkActionIsPlainObject({}), bulkActionIsPlainObject([]), bulkActionIsPlainObject(null), bulkActionObjectOrEmpty(5), resolveDefaultBulkActionAppId({ Knack: { application_id: ' app ' } }), resolveDefaultBulkActionAppId(null)],
            exportKeys: Object.keys(KnackBulkActions).sort(),
        });
    });
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text));
    assert.ok(v1.parsed.actions.length >= 1 && v1.parsed.labelFieldIds.length === 2 && v1.fail.length === 5 && v1.exportKeys.length > 5, `fixture should exercise real data: ${JSON.stringify([v1.parsed.labelFieldIds, v1.parsed.actions.length, v1.parsed.warnings, v1.exportKeys.length])}`);
});
