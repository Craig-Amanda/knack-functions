const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { realm, V1, shutdown } = require('./harness.cjs');

after(shutdown);

test('harness loads V1 functions with their in-file dependencies', async () => {
    const r = await realm({
        file: V1,
        names: ['getNumericValue', 'escapeHTML'],
        html: '<input id="n" value="£1,234.50"><input id="p" value="abc">',
    });
    try {
        const result = await r.run(() => ({
            stripped: getNumericValue('#n', true),
            unstripped: getNumericValue('#n'),
            missing: getNumericValue('#nope'),
            escaped: escapeHTML('<a href="x">&</a>'),
        }));
        assert.equal(result.stripped, 1234.5);
        assert.ok(Number.isNaN(result.unstripped), `unstripped parse was ${result.unstripped}`);
        assert.ok(Number.isNaN(result.missing), `missing element gave ${result.missing}`);
        assert.equal(result.escaped, '&#60;a href=&#34;x&#34;&#62;&#38;&#60;/a&#62;');
        assert.deepEqual(r.consoleMessages.filter((m) => m.type === 'pageerror'), []);
    } finally {
        await r.close();
    }
});
