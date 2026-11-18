/**
 * Differential tests: the V2 foundation helpers behave like their V1 counterparts for every input V1 accepted.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const VIEW_HTML = `
<div id="view_12" class="kn-view kn-form">
  <form>
    <div id="kn-input-field_7" class="kn-input"><input id="view_12-field_7" type="text" value=" 1,250.75 "></div>
    <div id="kn-input-field_8" class="kn-input"><input type="radio" name="r" value="a"><input type="radio" name="r" value="b" checked></div>
    <div class="kn-submit"><button class="kn-button is-primary" type="submit">Submit</button></div>
  </form>
  <p class="note" style="display:none">hidden</p><p class="note">shown</p>
</div>
<div id="connection-form-view"><input type="hidden" value="view_99"></div>
<span class="label">  Name * </span><span class="label">Other</span>`;

async function expectSame(names, scenario, arg, statements = []) {
    const { v1, v2, v1Console, v2Console } = await both({ names, html: VIEW_HTML, statements }, scenario, arg);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.filter((m) => m.type === 'pageerror'), [], 'V2 page errors');
    assert.deepEqual(v1Console.filter((m) => m.type === 'pageerror'), [], 'V1 page errors');
}

test('resolveElement / resolveElements match V1 for V1-supported inputs', async () => {
    await expectSame(['resolveElement', 'resolveElements'], () => {
        const tag = (el) => (el ? `${el.tagName}#${el.id}.${el.className}` : null);
        return {
            sel: tag(resolveElement('#view_12')),
            el: tag(resolveElement(document.querySelector('.note'))),
            none: resolveElement(null),
            missing: resolveElement('#nope'),
            selAll: resolveElements('.note').map(tag),
            nodeList: resolveElements(document.querySelectorAll('.label')).map(tag),
            array: resolveElements([document.body, null, 'x']).map(tag),
            one: resolveElements(document.body).map(tag),
            empty: resolveElements(undefined),
        };
    });
});

test('V2 resolveElement(s) also accept jQuery collections, Document roots and mixed arrays', async () => {
    const r = await realm({ file: V2, names: ['resolveElement', 'resolveElements'], html: VIEW_HTML });
    try {
        const out = await r.run(() => ({
            jq: resolveElement($('.note')).textContent,
            doc: resolveElement(document) === document,
            jqAll: resolveElements($('.note')).length,
            mixed: resolveElements(['.note', document.body]).length,
            scoped: resolveElements('input', document.getElementById('kn-input-field_8')).length,
        }));
        assert.deepEqual(out, { jq: 'hidden', doc: true, jqAll: 2, mixed: 3, scoped: 2 });
    } finally { await r.close(); }
});

test('getById matches V1 with and without a context', async () => {
    await expectSame(['getById'], () => {
        const tag = (el) => (el ? el.id || el.tagName : null);
        return {
            plain: tag(getById('view_12')),
            hash: tag(getById('#view_12')),
            ctx: tag(getById('kn-input-field_7', { context: '#view_12' })),
            ctxMiss: tag(getById('kn-input-field_7', { context: '#connection-form-view' })),
            badCtx: tag(getById('view_12', { context: '#nope' })),
            empty: getById(''),
            nul: getById(null),
            zero: getById(0),
        };
    });
});

test('getViewRootElement / getSubmitButton / getFieldWrapper match V1', async () => {
    await expectSame(['getViewRootElement', 'getSubmitButton', 'getFieldWrapper'], () => {
        const tag = (el) => (el ? el.id || el.tagName : null);
        return {
            key: tag(getViewRootElement('view_12')),
            num: tag(getViewRootElement(12)),
            upper: tag(getViewRootElement('VIEW_12')),
            selector: tag(getViewRootElement('#view_12 .note')),
            el: tag(getViewRootElement(document.querySelector('.note'))),
            obj: tag(getViewRootElement({ key: 'view_12' })),
            conx: tag(getViewRootElement('view_99')),
            missing: tag(getViewRootElement('view_1')),
            junk: tag(getViewRootElement('abc')),
            submit: getSubmitButton('view_12')?.textContent,
            submitMissing: getSubmitButton('view_1'),
            wrapper: tag(getFieldWrapper(7)),
            wrapperKey: tag(getFieldWrapper('field_8', document.getElementById('view_12'))),
            wrapperMiss: getFieldWrapper('field_9'),
            wrapperBad: getFieldWrapper('x'),
        };
    });
});

test('V2 getViewRootElement accepts a bare numeric string, which made V1 throw an invalid-selector error', async () => {
    const r = await realm({ file: V2, names: ['getViewRootElement'], html: VIEW_HTML });
    try {
        assert.equal(await r.run(() => getViewRootElement('12')?.id), 'view_12');
    } finally { await r.close(); }
});

test('setVisibility / showIf / toggleVisibility match V1', async () => {
    await expectSame(['setVisibility', 'showIf', 'toggleVisibility'], () => {
        const displays = () => Array.from(document.querySelectorAll('.note'), (el) => el.style.display);
        const out = {};
        setVisibility('.note', false); out.hideAll = displays();
        setVisibility(document.querySelector('.note'), true); out.showFirst = displays();
        showIf('.note', () => true); out.showIfFn = displays();
        toggleVisibility('.note'); out.toggled = displays();
        toggleVisibility(document.querySelectorAll('.note'), false); out.toggledOff = displays();
        toggleVisibility('.note', () => true); out.toggledFn = displays();
        setVisibility(null, true); setVisibility(undefined, false);
        return out;
    });
});

test('getNumericValue / escapeHtml / escapeHTML / cssEscape / debounce match V1', async () => {
    await expectSame(['getNumericValue', 'escapeHtml', 'escapeHTML', 'cssEscape', 'debounce'], async () => {
        const calls = [];
        const d = debounce((v) => calls.push(v), 20);
        d(1); d(2); d(3);
        await new Promise((resolve) => setTimeout(resolve, 60));
        d(4);
        await new Promise((resolve) => setTimeout(resolve, 60));
        return {
            stripped: getNumericValue('#view_12-field_7', true),
            raw: getNumericValue('#view_12-field_7'),
            el: getNumericValue(document.getElementById('view_12-field_7'), true),
            missing: getNumericValue('#nope'),
            junk: getNumericValue({}),
            esc: escapeHtml(`<a href="x">Tom & 'Jerry'</a>`),
            escNull: escapeHtml(null),
            ESC: escapeHTML(`<a href="x">Tom & 'Jerry'</a>`),
            ESCNull: escapeHTML(undefined),
            css: cssEscape('field[1].x'),
            calls,
        };
    });
});

test('getElementByText / selectTextOnFocus / fadeFormConfirmation match V1', async () => {
    await expectSame(['getElementByText', 'selectTextOnFocus', 'fadeFormConfirmation'], async () => {
        const view = document.getElementById('view_12');
        view.insertAdjacentHTML('beforeend', '<div class="kn-form-confirmation">Saved</div>');
        const input = document.getElementById('view_12-field_7');
        selectTextOnFocus('view_12', 'input[type="text"]');
        input.focus();
        await new Promise((resolve) => setTimeout(resolve, 10));
        fadeFormConfirmation(view, { delayMs: 60, fadeDurationMs: 100 });
        fadeFormConfirmation(view, { delayMs: 60, fadeDurationMs: 100 });
        const scheduled = view.querySelector('.kn-form-confirmation').dataset.formConfirmationFadeScheduled;
        await new Promise((resolve) => setTimeout(resolve, 120));
        return {
            exact: getElementByText('.label', 'Other')?.outerHTML,
            partial: getElementByText('.label', 'Nam', false)?.outerHTML,
            miss: getElementByText('.label', 'Nam'),
            selected: input.selectionEnd - input.selectionStart === input.value.length,
            scheduled,
            removed: !view.querySelector('.kn-form-confirmation'),
        };
    });
});

test('evaluate shim and :textEquals pseudo-selector match V1', async () => {
    await expectSame(['evaluate', 'getElementByText'], () => ({
        add: evaluate(2)('+')(3), lt: evaluate(2)('<')(3), eq: evaluate('2')('==')(2), bad: evaluate(1)('?')(2),
        pseudo: $('.label:textEquals(Name)').length, pseudoMiss: $('.label:textEquals(Nope)').length,
    }), undefined, ['textEquals']);
});

