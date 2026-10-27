const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const sliceFrom = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const escapeHelper = sliceFrom('function escapeHtml(value)', '\n\n');
const visibleHelper = sliceFrom('function isElementVisible(target', '\n}\n') + '\n}';
const copyHelpers = sliceFrom('function buildTableBodyClipboardData', 'if (typeof globalThis !== \'undefined\') {\n    globalThis.copyViewBodyToClipboard');

// Two rows trimmed from a NABCEL table: multi-line Works Done cells, trailing <br>s and a hidden column.
const tableHtml = `<div id="view_1" class="kn-table"><div class="table-keyword-search"></div><div class="kn-table-wrapper"><table><tbody>
<tr id="a">
  <td class="field_2040"><span class="col-0">
0048
  </span></td>
  <td class="field_1771"><span class="col-1">
<span data-kn="connection-value">2 Man job install new Crabtree RCD</span><br><br>
  </span></td>
  <td class="field_9" style="display:none">hidden</td>
  <td class="field_2244"><span class="col-2">
18/09/2026
  </span></td>
</tr>
<tr id="b">
  <td class="field_2040"><span class="col-0">
0277
  </span></td>
  <td class="field_1771"><span class="col-1">
<span data-kn="connection-value">New outside light fitted</span><br><span data-kn="connection-value">Need to<br>Return when parts in stock <br><br>Morgan "M"</span>
  </span></td>
  <td class="field_9" style="visibility:hidden">hidden</td>
  <td class="field_2244"><span class="col-2">
16/09/2026
  </span></td>
</tr>
</tbody></table></div></div>`;

test('_copybody keeps multi-line cells in one Excel cell', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const page = await context.newPage();
        // The async clipboard API needs a secure origin, which about:blank is not.
        await page.route('http://localhost/', route => route.fulfill({ contentType: 'text/html', body: `<main>${tableHtml}</main>` }));
        await page.goto('http://localhost/');
        await page.addScriptTag({ content: `
            const knackNavigator = { normalizeViewId: value => value };
            const ktl = {
                views: { getViewType: () => 'table' },
                core: {
                    hasRoleAccess: () => true,
                    timedPopup: message => { window.popup = message; },
                    selectElementContents: element => {
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        if (!element) return;
                        const range = document.createRange();
                        range.selectNodeContents(element);
                        selection.addRange(range);
                    }
                }
            };
            ${escapeHelper}
            ${visibleHelper}
            ${copyHelpers}
            copyViewBodyToClipboard({ key: 'view_1' }, { _copybody: [{}] });
        ` });

        await page.locator('.knackCopyBodyButton').click();
        const clipboard = await page.evaluate(async () => {
            const [item] = await navigator.clipboard.read();
            return {
                html: await (await item.getType('text/html')).text(),
                text: await (await item.getType('text/plain')).text(),
                popup: window.popup
            };
        });

        const sameCell = '<br style="mso-data-placement:same-cell;">';
        assert.equal(clipboard.popup, 'Table copied to clipboard');
        // navigator.clipboard.read() sanitises the HTML (adds <tbody>, unescapes quotes), so match row by row.
        assert.ok(clipboard.html.includes(
            '<tr><td>0048</td><td>2 Man job install new Crabtree RCD</td><td>18/09/2026</td></tr>'
        ), clipboard.html);
        assert.ok(clipboard.html.includes(
            `<tr><td>0277</td><td>New outside light fitted${sameCell}Need to${sameCell}Return when parts in stock${sameCell}${sameCell}Morgan "M"</td><td>16/09/2026</td></tr>`
        ), clipboard.html);
        assert.ok(!clipboard.html.includes('hidden'), clipboard.html);
        assert.equal(clipboard.text,
            '0048\t2 Man job install new Crabtree RCD\t18/09/2026\n' +
            '0277\t"New outside light fitted\nNeed to\nReturn when parts in stock\n\nMorgan ""M"""\t16/09/2026'
        );
    } finally {
        await browser.close();
    }
});
