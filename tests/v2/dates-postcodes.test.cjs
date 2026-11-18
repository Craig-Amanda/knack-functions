const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const NAMES = ['mapDateToRange', 'parseDateObject', 'resolveDateInput', 'formatDateTimeParts', 'getDateUKFormat', 'getOffsetDateUK', 'formatTime', 'getWeekdayName', 'formatCurrency', 'getEndOfDayIso', 'getWeeksAgoDate', 'getArrayOfWeekNumbersAndFields', 'getWeekNumber', 'extractPostcode', 'normaliseUkPostcode', 'validateUkMobileNumber', 'removeHtml', 'knackValueResolver'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: '<p></p>' }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text), 'console output differs');
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}

test('date parsing and formatting match V1', async () => {
    await same(() => {
        const inputs = [new Date(2024, 2, 5, 14, 7), new Date('x'), 1709647620000, '05/03/2024', '5/3/24', '31/02/2024', '<b>01/12/2023</b>', '2024-03-05T10:00:00', 'garbage', null, undefined, {}, '', NaN];
        const key = (d) => (d ? [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()] : d);
        return {
            parse: inputs.map((i) => key(parseDateObject(i))), uk: inputs.map((i) => getDateUKFormat(i)), time24: inputs.map((i) => formatTime(i)), time12: inputs.map((i) => formatTime(i, 12)),
            timeBad: formatTime(inputs[0], 'x'), timeStr: formatTime(inputs[0], '12'), weekday: inputs.slice(0, 5).map((i) => getWeekdayName(i)), weekdayFr: getWeekdayName(inputs[0], 'fr'),
            offset: [getOffsetDateUK('05/03/2024', 30), getOffsetDateUK('05/03/2024', -5), getOffsetDateUK('05/03/2024'), getOffsetDateUK('zzz', 1), getOffsetDateUK(inputs[0], 1)],
            eod: [getEndOfDayIso('05/03/2024'), getEndOfDayIso('zzz'), getEndOfDayIso(inputs[2])], parts: formatDateTimeParts(inputs[0]),
            weeksAgo: getWeeksAgoDate(0) === getDateUKFormat(new Date()) && getWeeksAgoDate(2) === getDateUKFormat(new Date(Date.now() - 14 * 864e5)),
            fields: getArrayOfWeekNumbersAndFields(100).length + getArrayOfWeekNumbersAndFields(100)[51],
            weekNo: ['2024-01-01', '2024-12-30', '2021-01-03', '2020-12-31', '2026-10-10'].map((d) => getWeekNumber(new Date(`${d}T12:00:00`))),
        };
    });
});

test('ranges, currency and postcode helpers match V1', async () => {
    await same(() => {
        const now = new Date(); const ago = (m) => `01/${String(((now.getMonth() - m) % 12 + 12) % 12 + 1).padStart(2, '0')}/${now.getFullYear() - Math.ceil(Math.max(0, m - now.getMonth()) / 12)}`;
        const ranges = [{ max: 3, label: 'recent' }, { max: 12, label: 'year' }];
        const addresses = ['1 High St, London SW1A 1AA', 'flat 2<br>Leeds ls1 4ap', 'M1 1AE', 'nowhere', '', null, 'SW1A1AA trailing', 'SW1A 1AA extra'];
        return {
            ranges: [ago(1), ago(6), ago(30)].map((d) => mapDateToRange(d, ranges)),
            money: [1234.5, '£1,234.50', '-5', 'abc', null, '', 0].map((v) => formatCurrency(v)).concat([formatCurrency(10, { currency: 'eur', locale: 'de-DE' }), formatCurrency(10, { currency: 'zzzz9' })]),
            extract: addresses.map((a) => extractPostcode(a)),
            norm: addresses.concat(['sw1a 1', 'SW1A1', 'M1 1', 'x']).map((a) => normaliseUkPostcode(a)),
            mobile: ['07123 456789', '(07123) 456-789', '+447123456789', '0044 7123', '07123', '0712345678901', '7123456789', '08123456789', '07abc', '', null, '0', '07'].flatMap((n) => [validateUkMobileNumber(n), validateUkMobileNumber(n, { allowIncomplete: true })]),
        };
    });
});
