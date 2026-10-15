const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const start = source.indexOf('async function waitGetValueFromDetail(');
const helper = source.slice(start, source.indexOf('\n}\n', start) + 2);

/**
 * Builds waitGetValueFromDetail against a fake detail view.
 * @param {Object<string, string>} detailText - Text of each field on the view, keyed by field_ key.
 * @returns {Function} The helper under test.
 */
function buildHelper(detailText) {
    const knackNavigator = {
        normalizeViewId: value => /^(view_)?\d+$/.test(String(value).trim()) ? 'view_' + String(value).trim().replace('view_', '') : '',
        normalizeFieldId: value => /^(field_)?\d+$/.test(String(value).trim()) ? 'field_' + String(value).trim().replace('field_', '') : '',
    };
    const waitSelector = async ({ selector }) => {
        const fieldKey = selector.match(/\.(field_\d+) /)?.[1];
        if (!(fieldKey in detailText)) {
            throw new Error('not found');
        }
        return { textContent: ` ${detailText[fieldKey]} `, innerHTML: `<b>${detailText[fieldKey]}</b>` };
    };
    const console = { warn() {}, error() {} };
    return new Function('knackNavigator', 'waitSelector', 'console', `${helper}\nreturn waitGetValueFromDetail;`)(knackNavigator, waitSelector, console);
}

const waitGetValueFromDetail = buildHelper({ field_407: 'Tattershall Lakes', field_963: 'abc123', field_2336: 'Private' });

test('values are keyed by the ID as passed and by the field_ key', async () => {
    const values = await waitGetValueFromDetail({ viewId: 'view_1', fieldIds: [407, '2336', 'field_963'] });
    assert.equal(values[407], 'Tattershall Lakes');
    assert.equal(values.field_407, 'Tattershall Lakes');
    assert.equal(values['2336'], 'Private');
    assert.equal(values.field_2336, 'Private');
    assert.equal(values.field_963, 'abc123');
});

test('destructuring by numeric key still works', async () => {
    const { 407: park, 2336: funded } = await waitGetValueFromDetail({ viewId: 'view_1', fieldIds: [407, 2336] });
    assert.equal(park, 'Tattershall Lakes');
    assert.equal(funded, 'Private');
});

test('missing fields are null under both keys', async () => {
    const values = await waitGetValueFromDetail({ viewId: 'view_1', fieldIds: [407, 999], delay: 1 });
    assert.equal(values[999], null);
    assert.equal(values.field_999, null);
});

test('a single field ID still returns the value directly', async () => {
    assert.equal(await waitGetValueFromDetail({ viewId: 'view_1', fieldIds: 407 }), 'Tattershall Lakes');
    assert.equal(await waitGetValueFromDetail({ viewId: 'view_1', fieldIds: 'field_407', returnHtml: true }), '<b>Tattershall Lakes</b>');
});
