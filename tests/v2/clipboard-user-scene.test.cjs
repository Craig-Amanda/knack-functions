const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `
<div id="knack-body"><div class="kn-scenes"><div id="kn-scene_5" class="kn-scene"><div id="view_1" class="kn-view">
 <div class="kn-details-link"><div class="kn-detail-body">link</div></div>
 <div class="kn-detail field_1"><div class="kn-detail-label">Phone</div><div class="kn-detail-body">0123</div></div>
 <div class="kn-detail field_2"><div class="kn-detail-label">Skip</div><div class="kn-detail-body">nope</div></div>
 <div class="kn-detail field_3"><div class="kn-detail-body">  </div></div>
 <span class="ca-click-to-copy client-email">a@b.c</span><span class="ca-click-to-copy">just text</span><span class="ca-click-to-copy">📋</span><span class="ca-click-to-copy funder-email">f@b.c 📋</span>
</div></div></div><div class="kn-modal"><div id="kn-scene_9" class="kn-scene"></div></div></div></div>
<div class="kn-input" id="in1"><input class="probe"></div><div class="kn-special-title"><span class="probe2"></span></div><div class="kn-input"><input></div>
<select id="plain"><option>1</option></select><select id="chosen" class="chzn-done"><option>1</option><option>2</option></select>
<ul id="m" class="menu-links__list"><li><a href="#">a</a></li><li style="display:none"><a href="#">b</a></li><li><a href="#">c</a></li></ul>
<div id="view_2"><div class="kn-submit"><input name="id" value="rec7"></div></div><div id="target"></div><span class="u1"></span><span class="u1"></span>`;
const BEFORE = `window.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } }, configurable: true });
Knack.getUserRoles = (r) => ['profile_1', 'Admin'].includes(r); Knack.getUserAttributes = () => ({ name: 'Pat' }); Knack.showSpinner = () => { window.__spin = (window.__spin || 0) + 1; };`;
const NAMES = ['copyTextToClipboard', 'addCopyToDetails', 'setupClickToCopy', 'onInputChange', 'toggleMessage', 'isUserRole', 'isUserName', 'getBackgroundSceneId', 'isSceneToIgnore', 'showPopUpNotification', 'insertLoggedInUser', 'borderRadiusLastVisible', 'getFormId', 'toggleElements', 'splitAndTrimField', 'showNotification', 'warnDeprecated', 'resolveElements', 'resolveElement', 'toggleVisibility', 'setVisibility', 'csvToArray', 'fireEvent'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE }, scenario);
    const clean = (a) => a.filter((m) => m.type === 'pageerror');
    assert.deepEqual(clean([...v1Console, ...v2Console]), []);
    return { v1, v2, v1Console, v2Console };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('copy helpers match V1 (V2 drops a debug log)', async () => {
    const { v1, v2 } = await same(async () => {
        const view = document.getElementById('view_1');
        addCopyToDetails(view, { includeLabels: true, excludeFieldIds: ['field_2'] }); addCopyToDetails(view, { includeLabels: true });
        setupClickToCopy('view_1');
        document.querySelectorAll('.kn-detail-body, .ca-click-to-copy').forEach((e) => e.click());
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { copied: window.__copied, html: view.outerHTML.replace(/\s+/g, ' ').replace(/ ?style="[^"]*"/g, (s) => s) };
    });
    assert.deepEqual(v2, v1);
    assert.ok(v1.copied.includes('Phone: 0123') && v1.copied.includes('a@b.c'));
});

test('onInputChange, toggleMessage and the user helpers match V1', async () => {
    await same(async () => {
        const log = []; const make = (id) => document.getElementById(id);
        onInputChange($('#plain'), (el) => log.push(['plain', el.id]));
        make('plain').dispatchEvent(new Event('change', { bubbles: true }));
        onInputChange($('#chosen'), (el) => log.push(['chosen', el.id]), false);
        $('#chosen').trigger('change');
        toggleMessage(false, '.probe'); toggleMessage(true, '.probe2'); toggleMessage(true, '.nothing');
        const display = Array.from(document.querySelectorAll('.kn-input, .kn-special-title'), (e) => e.style.display);
        const names = []; const fill = insertLoggedInUser('.u1', (n) => names.push(n));
        const errors = []; const [e1, w1] = [console.error, console.warn]; console.error = (m) => errors.push(m); console.warn = (m) => errors.push(m);
        const results = [insertLoggedInUser('.nope'), insertLoggedInUser(12), insertLoggedInUser(document.querySelector('.u1')), insertLoggedInUser(document.querySelectorAll('.u1'))];
        console.error = e1; console.warn = w1;
        return { log, display, fill, names, results, errors, u: Array.from(document.querySelectorAll('.u1'), (e) => e.textContent), role: [isUserRole(['x', 'Admin']), isUserRole(['x']), isUserRole([]), isUserRole(undefined), isUserRole(['profile_1'])], name: [isUserName('Pat'), isUserName('pat')], formId: [getFormId('view_2'), getFormId('view_1')] };
    });
});

test('scene helpers, borderRadiusLastVisible and showPopUpNotification match V1', async () => {
    await same(async () => {
        const r = { bg: getBackgroundSceneId(), ignore: [isSceneToIgnore([5]), isSceneToIgnore(['5', 9]), isSceneToIgnore([9]), isSceneToIgnore([]), isSceneToIgnore(['x'])] };
        borderRadiusLastVisible('m'); borderRadiusLastVisible('nope'); borderRadiusLastVisible('m', 5);
        r.radii = Array.from(document.querySelectorAll('#m a'), (a) => a.style.borderRadius);
        showPopUpNotification('#target', '<b>Hi</b>', 'red', 'pop', 10);
        const mid = document.querySelector('.pop')?.outerHTML.replace(/\s+/g, ' ');
        await new Promise((resolve) => setTimeout(resolve, 700));
        return { ...r, mid, gone: !document.querySelector('.pop'), spin: window.__spin };
    });
});

test('toggleElements and splitAndTrimField shims match V1 and warn once', async () => {
    await same(() => {
        document.body.insertAdjacentHTML('beforeend', '<i class="t1">1</i><i class="t2">2</i>');
        const d = () => [document.querySelector('.t1').style.display, document.querySelector('.t2').style.display];
        const out = [];
        toggleElements('.t1', false); out.push(d()); toggleElements('.t1', true); out.push(d()); toggleElements(['.t1', '.t2'], [false, true]); out.push(d());
        toggleElements(['.t1', '.t2'], true); out.push(d()); toggleElements(['.t1'], false); out.push(d());
        return { out, split: [splitAndTrimField(' a, b ,c'), splitAndTrimField(''), splitAndTrimField(null), splitAndTrimField('x')] };
    });
    const r = await realm({ file: V2, names: ['toggleElements', 'splitAndTrimField', 'warnDeprecated'], html: HTML, before: 'window.isDeveloper = true; window.__w = []; console.warn = (m) => window.__w.push(m);' });
    try {
        assert.deepEqual(await r.run(() => { toggleElements('.x', true); toggleElements('.x', true); splitAndTrimField('a'); return window.__w; }), [
            '[knackFunctions] toggleElements is deprecated; use setVisibility() or toggleVisibility().', '[knackFunctions] splitAndTrimField is deprecated; use csvToArray().']);
    } finally { await r.close(); }
});
