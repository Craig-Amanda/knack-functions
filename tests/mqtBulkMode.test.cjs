const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const classSource = source.slice(source.indexOf('class CAMultiChoiceQuickToggle {'), source.indexOf('/**\n * KnackError'));

const context = vm.createContext({
    HTMLElement: class HTMLElement {},
    clearTimeout,
    knackNavigator: {
        normalizeFieldId: (value) => (/^(field_)?\d+$/.test(String(value).trim()) ? `field_${String(value).trim().replace('field_', '')}` : ''),
        normalizeViewColumnHeader: (value) => String(value || '').trim().toLowerCase(),
    },
    knackValueResolver: { toStringSafe: (value) => (value === null || value === undefined ? '' : String(value)) },
});
vm.runInContext(`${classSource}\nthis.CAMultiChoiceQuickToggle = CAMultiChoiceQuickToggle;`, context);
const { CAMultiChoiceQuickToggle } = context;

const setup = (params) => {
    const toggle = new CAMultiChoiceQuickToggle('view_1', []);
    const kwInstance = { params, options: {} };
    toggle.viewTargets = toggle.extractViewTargets(kwInstance);
    toggle.setupBulkOptions(kwInstance);
    return toggle;
};

test('the first group stays the target list and bulk mode is off without a [bulk] group', () => {
    const toggle = setup([['On App', 'Bookable']]);
    assert.deepEqual([...toggle.viewTargets], ['On App', 'Bookable']);
    assert.equal(toggle.bulkEnabled, false);
    assert.equal(toggle.matchesBulkTarget('field_688', 'On App'), false);
});

test('a bare [bulk] group enables bulk mode on every _mqt column', () => {
    const toggle = setup([['On App', 'Bookable'], ['bulk']]);
    assert.deepEqual([...toggle.viewTargets], ['On App', 'Bookable']);
    assert.equal(toggle.matchesBulkTarget('field_688', 'On App'), true);
    assert.equal(toggle.matchesBulkTarget('field_1514', 'Bookable'), true);
});

test('[bulk, ...] limits bulk mode to the listed headers or field ids', () => {
    const byHeader = setup([['On App', 'Bookable'], ['bulk', 'On App']]);
    assert.equal(byHeader.matchesBulkTarget('field_688', 'On App'), true);
    assert.equal(byHeader.matchesBulkTarget('field_1514', 'Bookable'), false);

    const byFieldId = setup([['field_688', 'field_1514'], ['Bulk', 'field_688']]);
    assert.equal(byFieldId.matchesBulkTarget('field_688', 'Visible'), true);
    assert.equal(byFieldId.matchesBulkTarget('field_1514', 'Bookable'), false);
});

test('a [bulk] group in first place is not read as a target', () => {
    const toggle = setup([['bulk']]);
    assert.deepEqual([...toggle.viewTargets], []);
    assert.equal(toggle.bulkEnabled, true);
});

test('choice values keep the field shape and queued keys stay unique within one millisecond', () => {
    const toggle = new CAMultiChoiceQuickToggle('view_1', []);
    assert.deepEqual([...toggle.buildChoiceValue({ field_688_raw: ['Yes'] }, 'field_688', 'No')], ['No']);
    assert.equal(toggle.buildChoiceValue({ field_688_raw: 'Yes' }, 'field_688', 'No'), 'No');

    for (let i = 0; i < 5; i++) toggle.queueToggle('view_1', 'field_688', 'No', `rec${i}`, null);
    assert.equal(Object.keys(toggle.quickToggleObj).length, 5);
    assert.equal(toggle.numToProcess, 5);
});
