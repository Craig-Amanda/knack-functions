const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const helper = source.slice(source.indexOf('const gridTruncationControllers'), source.indexOf('/**\n * Selects all text in input elements'));

test('grid previews follow updates without corrupting source content or nesting controls', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<main><div id="view_1"><table><tbody><tr><td class="field_1" data-column-index="0"><span class="col-0"></span></td><td data-field-key="field_2"></td><td class="field_3">Short</td><td class="field_4">Unconfigured</td></tr></tbody></table></div></main>');
        await page.addScriptTag({ content: `
            const knackNavigator = { normalizeFieldId: value => /^(field_)?\\d+$/.test(String(value).trim()) ? 'field_' + String(value).trim().replace('field_', '') : '' };
            const ktl = { core: { hasRoleAccess: options => !options.denied } };
            ${helper}
        ` });
        const initial = await page.evaluate(() => {
            const content = document.querySelector('.col-0');
            content.innerHTML = '<span data-kn="connection-value"><strong id="original">Park One</strong> - ' + 'Summer availability '.repeat(12) + '</span><br><span data-kn="connection-value">Park Two - All Year</span>';
            window.original = content.querySelector('#original');
            original.addEventListener('click', () => window.originalClicked = true);
            document.querySelector('[data-field-key="field_2"]').textContent = 'b'.repeat(200);
            window.controller = truncateColumnsInGrid.fromKeywords({key:'view_1', type:'table'}, {_trunk:[{params:[['field_1'], ['field_2', '150'], ['field_3']], options:{}}]});
            truncateColumnsInGrid('view_1', {75: [1], 150: 2});
            return {
                buttons: document.querySelectorAll('.trunk-toggle').length,
                defaultLength: content.querySelector('.trunk-preview').textContent.length,
                customLength: document.querySelector('[data-field-key="field_2"] .trunk-preview').textContent.length,
                connections: content.querySelectorAll('[data-kn="connection-value"]').length,
                ids: document.querySelectorAll('#original').length,
                bold: !!content.querySelector('.trunk-preview strong'),
                wrapper: content === document.querySelector('.col-0')
            };
        });
        assert.deepEqual(initial, {buttons:2, defaultLength:76, customLength:151, connections:2, ids:1, bold:true, wrapper:true});
        await page.locator('.col-0 .trunk-toggle').click();
        assert.equal(await page.locator('.col-0 .trunk-toggle').getAttribute('aria-expanded'), 'true');
        await page.locator('#original').click();
        assert.equal(await page.evaluate(() => window.originalClicked), true);
        await page.locator('.col-0 .trunk-toggle').press('Enter');
        assert.equal(await page.locator('.col-0 .trunk-toggle').getAttribute('aria-expanded'), 'false');

        // Matches Spot's asynchronous replacement of the .col-N wrapper's contents.
        await page.evaluate(() => {
            document.querySelector('.col-0').innerHTML = '<span data-kn="connection-value"><strong>New Park</strong> - ' + 'Updated availability '.repeat(10) + '</span>';
        });
        await page.waitForFunction(() => document.querySelector('.col-0 .trunk-preview')?.textContent.startsWith('New Park'));
        assert.equal(await page.locator('.col-0 .trunk-toggle').count(), 1);
        assert.equal(await page.locator('.col-0 [data-kn="connection-value"]').count(), 1);
        await page.locator('.col-0 .trunk-toggle').click();
        await page.evaluate(() => document.querySelector('.col-0 .trunk-full strong').firstChild.data = 'Changed Park');
        await page.waitForFunction(() => document.querySelector('.col-0 .trunk-preview')?.textContent.startsWith('Changed Park'));
        assert.equal(await page.locator('.col-0 .trunk-toggle').getAttribute('aria-expanded'), 'true');
        await page.evaluate(() => document.querySelector('.col-0 .trunk-full').textContent = 'One Off');
        await page.waitForFunction(() => !document.querySelector('.col-0 .trunk-toggle'));
        assert.equal(await page.locator('.col-0').textContent(), 'One Off');
        await page.evaluate(() => document.querySelector('.col-0').textContent = 'Long again '.repeat(20));
        await page.waitForFunction(() => !!document.querySelector('.col-0 .trunk-toggle'));

        // A new results page is picked up, including cells without a column wrapper.
        await page.evaluate(() => document.querySelector('tbody').innerHTML = '<tr><td class="field_1">' + 'Next page '.repeat(20) + '</td><td class="field_4">' + 'Untouched '.repeat(20) + '</td></tr>');
        await page.waitForFunction(() => !!document.querySelector('td.field_1 .trunk-toggle'));
        assert.equal(await page.locator('td.field_4 .trunk-toggle').count(), 0);
        await page.evaluate(() => {
            window.detached = document.querySelector('#view_1');
            document.querySelector('main').remove();
        });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
        assert.equal(await page.evaluate(async () => {
            detached.querySelector('td.field_1').textContent = 'Detached '.repeat(20);
            await new Promise(resolve => setTimeout(resolve, 0));
            return detached.querySelectorAll('.trunk-toggle').length;
        }), 0);
    } finally {
        await browser.close();
    }
});

test('legacy calls remain one-shot; keyword validation and Unicode limits are safe', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<div id="view_2"><table><tbody><tr><td class="field_1"></td><td class="field_2">' + 'Long text '.repeat(20) + '</td></tr></tbody></table></div>');
        await page.addScriptTag({ content: `const knackNavigator = {normalizeFieldId: value => /^(field_)?\\d+$/.test(String(value)) ? 'field_' + String(value).replace('field_', '') : ''}; const ktl = {core:{hasRoleAccess: options => !options.denied}}; ${helper}` });
        await page.evaluate(() => {
            document.querySelector('.field_1').textContent = '👨‍👩‍👧‍👦'.repeat(80);
            truncateColumnsInGrid('view_2', {75: 1});
        });
        assert.equal(await page.locator('.field_1 .trunk-preview').textContent(), '👨‍👩‍👧‍👦'.repeat(75) + '…');
        await page.evaluate(() => {
            document.querySelector('.field_1').textContent = 'Replacement '.repeat(20);
            truncateColumnsInGrid.fromKeywords({key:'view_2',type:'table'}, {_trunk:[
                {params:[['field_2', '0'], ['field_2', '-1'], ['field_2', '1.5'], ['field_2','bad'], ['invalid']]},
                {params:[['field_2']], options:{denied:true}}
            ]});
        });
        assert.equal(await page.locator('.field_2 .trunk-toggle').count(), 0);
        // A separate one-shot view must not pick up later writes.
        await page.evaluate(() => {
            document.body.insertAdjacentHTML('beforeend', '<div id="view_3"><table><tr><td class="field_1">' + 'Initial '.repeat(20) + '</td></tr></table></div>');
            truncateColumnsInGrid('view_3', {75:[1]});
            document.querySelector('#view_3 td').textContent = 'Updated '.repeat(20);
        });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
        assert.equal(await page.locator('#view_3 .trunk-toggle').count(), 0);
    } finally {
        await browser.close();
    }
});

test('collapsed connection links retain native navigation after truncation and updates', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent('<div id="view_4"><table><tr><td class="field_402"></td></tr></table></div>');
        await page.addScriptTag({ content: `const knackNavigator = {normalizeFieldId: value => 'field_' + String(value).replace('field_', '')}; ${helper}` });
        await page.evaluate(() => {
            document.querySelector('td').innerHTML = '<span data-kn="connection-value"><a id="park-original" data-kn="connection-link" href="#park-one" title="Park details"><strong>Cleethorpes Pearl</strong></a></span>, <a href="#park-two" target="_blank" rel="noopener">Golden Sands</a>, ' + 'Other parks '.repeat(20);
            truncateColumnsInGrid('view_4', {25:[402]}, {observe:true});
        });
        const links = page.locator('.trunk-preview a');
        assert.equal(await links.count(), 2);
        assert.equal(await links.nth(0).getAttribute('href'), '#park-one');
        assert.equal(await links.nth(0).getAttribute('title'), 'Park details');
        assert.equal(await links.nth(1).textContent(), 'Golden');
        assert.equal(await links.nth(1).getAttribute('href'), '#park-two');
        assert.equal(await links.nth(1).getAttribute('target'), '_blank');
        assert.equal(await links.nth(1).getAttribute('rel'), 'noopener');
        assert.equal(await page.locator('#park-original').count(), 1);
        assert.equal(await page.locator('[data-kn="connection-value"]').count(), 1);
        assert.equal(await page.locator('.trunk-preview [data-kn]').count(), 0);
        await links.nth(0).click();
        assert.equal(await page.evaluate(() => location.hash), '#park-one');
        assert.equal(await page.locator('.trunk-toggle').getAttribute('aria-expanded'), 'false');
        await page.evaluate(() => history.replaceState(null, '', '#reset'));
        await links.nth(0).press('Enter');
        assert.equal(await page.evaluate(() => location.hash), '#park-one');
        await page.locator('.trunk-toggle').click();
        assert.equal(await page.locator('.trunk-full a').count(), 2);
        await page.locator('#park-original').click();
        assert.equal(await page.evaluate(() => location.hash), '#park-one');
        await page.evaluate(() => {
            document.querySelector('td').innerHTML = '<a href="#updated-park">Updated Park</a>, ' + 'More parks '.repeat(20);
        });
        await page.waitForFunction(() => document.querySelector('.trunk-preview a')?.getAttribute('href') === '#updated-park');
        await page.locator('.trunk-preview a').click();
        assert.equal(await page.evaluate(() => location.hash), '#updated-park');
    } finally {
        await browser.close();
    }
});
