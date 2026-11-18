const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `
<div id="view_1"><h2 class="kn-title"> Main &amp; Title </h2><div class="kn-description">Desc</div><div class="kn-table-wrapper"><table></table></div><div class="kn-records-nav">nav</div></div>
<div id="view_2"><h2 class="kn-title">Two</h2><form><input></form></div><div id="view_3"></div>
<div id="wrap"><section class="show-hide-section">sec</section><section class="show-hide-section">sec2</section></div>
<div id="view_4"><section class="plain">s</section><section class="a-id show-hide-section box-with-border">t</section></div>
<div id="view_5"><h2 class="kn-title">Five &amp; <b>six</b></h2><div class="kn-table-wrapper">x</div></div>
<button class="btn">go</button><a class="shr">shrink</a><span class="arr down"></span><div class="content" style="display:none">c</div>
<div id="view_6"><div class="kn-detail field_9"><div class="kn-detail-body"> yes </div></div><div class="kn-detail"><div class="kn-detail-body">  </div></div><div class="kn-detail"><div class="kn-detail-body">full</div></div></div>
<i class="h1">1</i><i class="h2">2</i><i class="h3">3</i>
<div class="kn-modal"><button class="close-modal">x</button></div><button class="plainbtn">p</button>`;
const BEFORE = `window.__nav = []; window.isDeveloper = true;
window.ktl.core.getKeywordsByType = (v, kw) => (window.__kw?.[kw] ?? []);
window.ktl.core.hasRoleAccess = (o) => !o?.denied; window.ktl.core.findParentURL = (u, n) => 'parent/' + n; window.ktl.views = { getViewType: () => window.__type || 'form' };
window.handleRedirect = (e, url) => window.__nav.push([e.type, url]);
window.showHideViewGroupContent = (id, delay, flex) => (window.__group = [id, delay, flex]);
window.waitSelector = ({ selector }) => new Promise((res, rej) => { const el = document.querySelector(selector); el ? res(el) : rej(new Error('missing ' + selector)); });`;
const NAMES = ['slideElements', 'bindClick', 'toggleShowHideViewContent', 'shrinkContent', 'showHideViewContent', 'appendShrinkLink', 'replaceTitleWithButton', 'wrapContentForShowHide', 'showHideGroup', 'wrapContentForShowHideGroup', 'preventKtlLongPressRefresh', 'setViewMaxWidth', 'hideEmptyFields', 'hideElementsByValue', 'getRedirectToPopUpConfig', 'bindRedirectToPopUpCloseButtons', 'redirectToPopUp', 'resolveElements', 'escapeHtml', 'sanitiseURL', 'removeClassFromSelector', 'warnDeprecated', 'toJQuery', 'removeClasses', 'addClasses', 'removeElement', 'borderRadiusLastVisible'];
const EXCLUDE = ['handleRedirect', 'showHideViewGroupContent', 'waitSelector'];

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: HTML, before: BEFORE, exclude: EXCLUDE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
}
const wait = 'await new Promise((resolve) => setTimeout(resolve, 120));';

test('show/hide section helpers match V1', async () => {
    await same(async () => {
        const out = {}; const html = () => document.body.innerHTML.replace(/\s+/g, ' ').replace(/ style="[^"]*"/g, '');
        replaceTitleWithButton('view_5', 'x5'); replaceTitleWithButton('view_5', 'x5'); out.title = document.getElementById('view_5').innerHTML.replace(/\s+/g, ' ');
        wrapContentForShowHide('view_5', 'table', 'x5'); wrapContentForShowHide('view_5', 'table', 'x5'); wrapContentForShowHide('view_2', 'form', 'x2'); wrapContentForShowHide('view_1', 'list', 'x1');
        wrapContentForShowHide('view_4', 'other', 'a-id'); wrapContentForShowHide('view_4', 'other', 'b-id'); wrapContentForShowHide('view_99', 'table', 'q'); wrapContentForShowHide('view_3', 'table', 'q');
        appendShrinkLink('wrap', 'x5'); appendShrinkLink('wrap', 'x5'); appendShrinkLink('view_5', 'g', true); appendShrinkLink('nope', 'n');
        out.html = html();
        return out;
    });
});

test('toggle, shrink and showHideViewContent behave like V1 after the slide finishes', async () => {
    await same(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const state = () => [document.querySelector('.content').style.display, document.querySelector('.arr').className, document.querySelector('.btn').className];
        const out = [];
        toggleShowHideViewContent($('.btn'), $('.content'), $('.arr'), 20); toggleShowHideViewContent($('.btn'), $('.content'), $('.arr'), 20);
        shrinkContent($('.shr'), $('.content'), $('.arr'), 20, $('.btn'));
        document.querySelector('.btn').click(); await wait(150); out.push(state());
        document.querySelector('.btn').click(); await wait(150); out.push(state());
        document.querySelector('.btn').click(); await wait(150); document.querySelector('.shr').click(); await wait(150); out.push(state());
        document.querySelector('.btn').click(); await wait(150); out.push(state());
        return out;
    });
});

test('showHideGroup builds the same DOM as V1', async () => {
    await same(async () => {
        showHideGroup([1, 3, 99], true); await new Promise((resolve) => setTimeout(resolve, 80)); const missing = [window.__group ?? null];
        showHideGroup([1, 2], true); await new Promise((resolve) => setTimeout(resolve, 120)); showHideGroup([1, 2], false); await new Promise((resolve) => setTimeout(resolve, 120));
        return { dom: document.body.innerHTML.replace(/\s+/g, ' '), group: window.__group, missing };
    });
});

test('keyword handlers match V1', async () => {
    await same(async () => {
        const out = {};
        window.__kw = { _vmxw: [{ params: [['500']] }, { params: [['40%']] }, { params: [['abc']] }, { params: [['12.5']] }, { options: { denied: true }, params: [['1']] }], _hebv: [{ params: [['field_9', 'yes', '.h1', '.h2'], ['field_9', '!yes', '.h3'], ['field_9', 'x']] }] };
        setViewMaxWidth({ key: 'view_6' }); out.width = document.getElementById('view_6').style.maxWidth;
        setViewMaxWidth({ key: 'view_77' });
        hideEmptyFields({ key: 'view_6' }); out.details = document.querySelectorAll('#view_6 .kn-detail-body').length;
        hideElementsByValue({ key: 'view_6' }, { _hebv: 1 }); hideElementsByValue({ key: '' }, { _hebv: 1 }); hideElementsByValue({ key: 'view_6' }, {});
        out.hidden = Array.from(document.querySelectorAll('.h1, .h2, .h3'), (e) => e.style.display);
        out.cfg = [getRedirectToPopUpConfig(), getRedirectToPopUpConfig([{ params: [['false', 'x']] }]), getRedirectToPopUpConfig([{ params: [['true', ' scene_12 ']] }, {}, { params: [[null, '', 'SCENE_3']] }])];
        const el = document.querySelector('.plainbtn'); const log = []; el.addEventListener('click', () => log.push('bubbled')); document.body.addEventListener('click', () => log.push('body'));
        preventKtlLongPressRefresh(el); preventKtlLongPressRefresh(null); el.click(); out.stop = log;
        window.__kw = { _rtp: [{ params: [[]] }] }; window.__type = 'form';
        redirectToPopUp({ key: 'view_6' }, { _rtp: [{ params: [[]] }] }); redirectToPopUp({ key: 'view_6' }, { _rtp: [{ params: [[]] }] });
        document.querySelector('.close-modal').click(); $(document).trigger('knack-form-submit.view_6', [{}]); out.nav1 = [...window.__nav]; window.__nav.length = 0;
        redirectToPopUp({ key: 'view_6' }, {}); redirectToPopUp({ key: 'view_7' }, { _rtp: [{ params: [['false']] }] }); $(document).trigger('knack-form-submit.view_7', [{}]); out.nav2 = [...window.__nav];
        return out;
    });
});
