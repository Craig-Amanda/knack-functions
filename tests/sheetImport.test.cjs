const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const start = source.indexOf('class SheetImportCore {');
const end = source.indexOf('\n}\n', start) + 3;
const SheetImportCore = new Function(`${source.slice(start, end)}\nreturn SheetImportCore;`)();

test('findHeaderRow skips title rows above the headings', () => {
    const rows = [
        ['BATCH 8'],
        ['', ''],
        ['UPRN', 'Address', 'Tenant', 'Phone'],
        [1001, '1 High St', 'Mr J Smith', '07700 900123']
    ];
    assert.equal(SheetImportCore.findHeaderRow(rows), 2);
});

test('buildColumns keeps 3 preview values and names blank headings', () => {
    const rows = [['Name', ''], ['a', ''], ['', ''], ['b', 'x'], ['c', ''], ['d', '']];
    const { columns, body } = SheetImportCore.buildColumns(rows, 0, 3);
    assert.deepEqual(columns[0].preview, ['a', 'b', 'c']);
    assert.equal(columns[1].header, 'Column B');
    assert.equal(body.length, 4);
    assert.equal(body[0].number, 2);
});

test('autoMap uses saved, alias, exact and close matches, once each', () => {
    const columns = [
        { header: 'Post Code', empty: false },
        { header: 'Tenant Name', empty: false },
        { header: 'Descripton', empty: false },
        { header: 'Description', empty: false },
        { header: 'Random', empty: false },
        { header: 'Blank', empty: true }
    ];
    const options = [
        { value: 'p:zip', label: 'Postcode', names: ['Postcode'] },
        { value: 'j:name', label: 'Resident Name' },
        { value: 'j:desc', label: 'Description' },
        { value: 'ignore', label: 'Ignore', multi: true },
        { value: 'notes:j', label: 'Notes', multi: true }
    ];
    const result = SheetImportCore.autoMap(columns, options, {
        aliases: { 'j:name': ['Tenant Name'] },
        fallback: 'notes:j'
    });
    assert.deepEqual(result, ['p:zip', 'j:name', 'notes:j', 'j:desc', 'notes:j', 'ignore']);
});

test('dateParts reads serials, text and Dates', () => {
    assert.deepEqual(SheetImportCore.dateParts(46093), { year: 2026, month: 3, day: 12 });
    assert.deepEqual(SheetImportCore.dateParts('01/02/2026'), { year: 2026, month: 2, day: 1 });
    assert.deepEqual(SheetImportCore.dateParts('2026-03-12'), { year: 2026, month: 3, day: 12 });
    assert.deepEqual(SheetImportCore.dateParts('12 Mar 26'), { year: 2026, month: 3, day: 12 });
    assert.deepEqual(SheetImportCore.dateParts(new Date(2026, 2, 11, 23, 59, 50)), { year: 2026, month: 3, day: 12 });
    assert.equal(SheetImportCore.dateParts('31/02/2026'), null);
    assert.equal(SheetImportCore.formatDate({ year: 2026, month: 3, day: 2 }, 'mm/dd/yyyy'), '03/02/2026');
    assert.equal(SheetImportCore.formatDate({ year: 2026, month: 3, day: 2 }, 'dd/mm/yyyy'), '02/03/2026');
});

test('parseName handles titles, joint titles and Last, First', () => {
    assert.deepEqual(SheetImportCore.parseName('Mrs Jane Smith'), { title: 'Mrs', first: 'Jane', last: 'Smith' });
    assert.deepEqual(SheetImportCore.parseName('Smith, John'), { title: '', first: 'John', last: 'Smith' });
    assert.deepEqual(SheetImportCore.parseName('Mr & Mrs Brown'), { title: '', first: 'Mr & Mrs', last: 'Brown' });
    assert.deepEqual(SheetImportCore.parseName('Mr Patel'), { title: 'Mr', first: '', last: 'Patel' });
});

test('parseAddress finds the postcode and town', () => {
    assert.deepEqual(SheetImportCore.parseAddress('1 High St, Flat 2, Leicester, le1 1aa'),
        { street: '1 High St', street2: 'Flat 2', city: 'Leicester', zip: 'LE1 1AA' });
    assert.deepEqual(SheetImportCore.parseAddress('5 Low Rd\nOadby LE2 4AB'),
        { street: '5 Low Rd', street2: '', city: 'Oadby', zip: 'LE2 4AB' });
});

test('splitPhones and assignPhones sort mobiles and landlines', () => {
    const numbers = SheetImportCore.splitPhones('+44 7700 900123 / 0116 234 5678 or 07700900123');
    assert.deepEqual(numbers, [{ number: '07700900123', mobile: true }, { number: '01162345678', mobile: false }]);
    const { values, overflow } = SheetImportCore.assignPhones(
        [...numbers, { number: '07800111222', mobile: true }, { number: '01163334444', mobile: false }],
        { mobile: ['f_mob'], other: ['f_land'] }
    );
    assert.deepEqual(values, { f_mob: '07700900123', f_land: '01162345678' });
    assert.deepEqual(overflow.map((entry) => entry.number), ['07800111222', '01163334444']);
});

test('collectPhones drops numbers repeated across columns and keeps the column name', () => {
    const cells = ['07700 900123', '0116 234 5678', '07700900123', '07800111222 / 0116 2345678'];
    const columns = [
        { index: 0, header: 'Contact Tel' },
        { index: 1, header: 'Home Tel' },
        { index: 2, header: 'Telephone' },
        { index: 3, header: 'Work Telephone' },
    ];
    assert.deepEqual(SheetImportCore.collectPhones(cells, columns), [
        { number: '07700900123', mobile: true, source: 'Contact Tel' },
        { number: '01162345678', mobile: false, source: 'Home Tel' },
        { number: '07800111222', mobile: true, source: 'Work Telephone' },
    ]);
});

test('phoneNoteLines groups extra numbers by column', () => {
    assert.deepEqual(SheetImportCore.phoneNoteLines([
        { number: '07800111222', source: 'Work Telephone' },
        { number: '01163334444' },
        { number: '07800333444', source: 'Work Telephone' },
    ]), ['Work Telephone: 07800111222, 07800333444', 'Other phone: 01163334444']);
});

test('convertValue converts by field type and warns on bad values', () => {
    assert.deepEqual(SheetImportCore.convertValue('Mrs Jane Smith', { type: 'name', format: { format: 'First Last' } }).value, { first: 'Jane', last: 'Smith' });
    assert.deepEqual(SheetImportCore.convertValue('le11aa', { type: 'address' }, 'zip').value, { zip: 'LE1 1AA' });
    assert.equal(SheetImportCore.convertValue('yes', { type: 'boolean' }).value, true);
    assert.equal(SheetImportCore.convertValue('maybe', { type: 'boolean' }).value, null);
    assert.match(SheetImportCore.convertValue('maybe', { type: 'boolean' }).warning, /not yes or no/);
    assert.equal(SheetImportCore.convertValue('urgent', { type: 'multiple_choice', format: { options: ['Urgent', 'Routine'] } }).value, 'Urgent');
    assert.deepEqual(SheetImportCore.convertValue('a, b', { type: 'multiple_choice', format: { type: 'checkboxes', options: ['A', 'B'] } }).value, ['A', 'B']);
    assert.equal(SheetImportCore.convertValue('£1,250.50', { type: 'currency' }).value, 1250.5);
    assert.equal(SheetImportCore.convertValue('Email: a.b@x.co.uk', { type: 'email' }).value, 'a.b@x.co.uk');
    assert.equal(SheetImportCore.convertValue('', { type: 'short_text' }).value, null);
});

test('suggestChoice reads Y/N as Yes/No for choice fields', () => {
    const asbestos = { type: 'multiple_choice', format: { options: ['Yes', 'No', 'TBC'] } };
    assert.equal(SheetImportCore.suggestChoice('Y', asbestos), 'Yes');
    assert.equal(SheetImportCore.suggestChoice('n', asbestos), 'No');
    assert.equal(SheetImportCore.suggestChoice('tbc', asbestos), 'TBC');
    assert.equal(SheetImportCore.suggestChoice('Unknown', asbestos), '');
    assert.equal(SheetImportCore.suggestChoice('ticked', { type: 'boolean' }), 'Yes');
    assert.equal(SheetImportCore.convertValue('Y', asbestos).value, 'Yes');
});

test('convertValue follows a value map, and "Don\'t send" gives no warning', () => {
    const asbestos = { type: 'multiple_choice', format: { options: ['Yes', 'No', 'TBC'] } };
    const map = { unknown: 'TBC', 'not checked': '' };
    assert.equal(SheetImportCore.convertValue('Unknown', asbestos, '', map).value, 'TBC');
    assert.deepEqual(SheetImportCore.convertValue('Not checked', asbestos, '', map), { value: null });
    assert.match(SheetImportCore.convertValue('Maybe', asbestos, '', map).warning, /not one of the options/);
    assert.equal(SheetImportCore.convertValue('Red', { type: 'boolean' }, '', { red: 'Yes' }).value, true);
    assert.deepEqual(SheetImportCore.convertValue('Red', { type: 'boolean' }, '', { red: '' }), { value: null });
    const multi = { type: 'multiple_choice', format: { type: 'checkboxes', options: ['Gas', 'Electric'] } };
    assert.deepEqual(SheetImportCore.convertValue('G, E, Gas', multi, '', { g: 'Gas', e: 'Electric' }).value, ['Gas', 'Electric']);
});

test('distinctValues counts each value once, most common first', () => {
    const rows = [['Y'], ['y'], ['N'], [''], ['Gas, Water']].map((cells) => ({ cells }));
    assert.deepEqual(SheetImportCore.distinctValues(rows.slice(0, 4), 0), [{ key: 'y', text: 'Y', count: 2 }, { key: 'n', text: 'N', count: 1 }]);
    assert.deepEqual(SheetImportCore.distinctValues(rows.slice(4), 0, true).map((entry) => entry.key), ['gas', 'water']);
});

test('titleCase and sentenceCase fix text typed all in one case only', () => {
    assert.equal(SheetImportCore.titleCase("JOHN O'BRIEN-SMITH"), "John O'Brien-Smith");
    assert.equal(SheetImportCore.titleCase('flat 2a, 1st floor'), 'Flat 2A, 1st Floor');
    assert.equal(SheetImportCore.titleCase('MR & MRS MCDONALD'), 'Mr & Mrs McDonald');
    assert.equal(SheetImportCore.titleCase("SMITH'S YARD"), "Smith's Yard");
    assert.equal(SheetImportCore.titleCase('Ruth de Souza'), 'Ruth de Souza');
    assert.equal(SheetImportCore.sentenceCase('NO HOT WATER. CALL FIRST\nDOG ON SITE'), 'No hot water. Call first\nDog on site');
    assert.equal(SheetImportCore.sentenceCase('LCC WO'), 'LCC WO');
    assert.equal(SheetImportCore.sentenceCase('GAP12345'), 'GAP12345');
    assert.equal(SheetImportCore.sentenceCase('Already Mixed TEXT'), 'Already Mixed TEXT');
    assert.deepEqual(SheetImportCore.convertValue('MRS JANE SMITH', { type: 'name', format: { format: 'Title First Last' } }).value, { title: 'Mrs', first: 'Jane', last: 'Smith' });
    assert.deepEqual(SheetImportCore.convertValue('1 HIGH ST, LEICESTER, le11aa', { type: 'address' }).value, { street: '1 High St', city: 'Leicester', zip: 'LE1 1AA' });
    assert.equal(SheetImportCore.convertValue('J.Smith@X.CO.UK', { type: 'email' }).value, 'j.smith@x.co.uk');
});

test('cleanSaved keeps well-formed choices and drops the rest', () => {
    const good = { address: 'property:field_1', 'values:priority': { mapping: 'job:field_2', values: { p1: 'P1' } }, __batch: { job: { field_3: 'Yes' } } };
    assert.deepEqual(SheetImportCore.cleanSaved(good, '__batch'), { clean: good, dropped: 0 });
    assert.deepEqual(SheetImportCore.cleanSaved(null, '__batch'), { clean: {}, dropped: 0 });
    assert.deepEqual(SheetImportCore.cleanSaved('oops', '__batch'), { clean: {}, dropped: 1 });
    assert.deepEqual(SheetImportCore.cleanSaved(['a'], '__batch'), { clean: {}, dropped: 1 });
    const mixed = { address: 'property:field_1', tenant: 7, 'values:x': 'job:field_2', __batch: { job: 'Yes' } };
    assert.deepEqual(SheetImportCore.cleanSaved(mixed, '__batch'), { clean: { address: 'property:field_1' }, dropped: 3 });
});

test('mergeValue joins parts and text', () => {
    assert.deepEqual(SheetImportCore.mergeValue({ first: 'J' }, { last: 'S' }), { first: 'J', last: 'S' });
    assert.equal(SheetImportCore.mergeValue('a', 'b', 'paragraph_text'), 'a\nb');
    assert.equal(SheetImportCore.mergeValue(undefined, 'b'), 'b');
});

test('dateParts keeps the day for an afternoon time and snaps values just before midnight', () => {
    assert.deepEqual(SheetImportCore.dateParts(46084.625), { year: 2026, month: 3, day: 3 });
    assert.deepEqual(SheetImportCore.dateParts(46084.99999), { year: 2026, month: 3, day: 4 });
    assert.deepEqual(SheetImportCore.dateParts(new Date(2026, 2, 3, 15, 0)), { year: 2026, month: 3, day: 3 });
    assert.deepEqual(SheetImportCore.dateParts(new Date(2026, 2, 3, 23, 59, 58)), { year: 2026, month: 3, day: 4 });
});

test('splitPhones handles +44 (0), 0044 and extensions', () => {
    assert.deepEqual(SheetImportCore.splitPhones('+44 (0)7700 900123'), [{ number: '07700900123', mobile: true }]);
    assert.deepEqual(SheetImportCore.splitPhones('0044 7700 900123'), [{ number: '07700900123', mobile: true }]);
    assert.deepEqual(SheetImportCore.splitPhones('0116 234 5678 ext 2'), [{ number: '01162345678', mobile: false }]);
});

test('suggestChoice works with no field', () => {
    assert.equal(SheetImportCore.suggestChoice('Yes', null), '');
});
