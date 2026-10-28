const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');

/**
 * Pulls a top-level function's source out of knackFunctions.js.
 * @param {string} name - Function name.
 * @returns {string}
 */
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\n}\n', start) + 2);
}

class FakeElement {
    /**
     * @param {string} tagName - e.g. 'SELECT'.
     * @param {string[]} [classes] - Class names.
     */
    constructor(tagName, classes = []) {
        this.tagName = tagName;
        this.classList = { contains: (c) => classes.includes(c) };
        this.nextElementSibling = null;
        this.handlers = [];
        this.nativeListeners = [];
    }

    addEventListener(type, fn) {
        this.nativeListeners.push({ type, fn });
    }
}
class FakeNodeList {}

/**
 * A fake jQuery with jQuery's namespaced on/off rules: .off('type.a.b') removes handlers that have both
 * namespaces a and b; .off('type.a') removes every handler with namespace a.
 * @returns {Function}
 */
function buildFakeJquery() {
    const parse = (token) => {
        const [type, ...namespaces] = token.split('.');
        return { type, namespaces };
    };
    const j = (el) => ({
        on(types, selectorOrFn, maybeFn) {
            const fn = typeof selectorOrFn === 'function' ? selectorOrFn : maybeFn;
            types.split(' ').forEach((token) => {
                const { type, namespaces } = parse(token);
                el.handlers.push({ type, namespaces, fn });
            });
            return this;
        },
        off(types) {
            types.split(' ').forEach((token) => {
                const { type, namespaces } = parse(token);
                el.handlers = el.handlers.filter((h) => !(
                    (!type || h.type === type) && namespaces.every((ns) => h.namespaces.includes(ns))
                ));
            });
            return this;
        },
    });
    j.fn = {};
    return j;
}

/**
 * Builds addInputEventListener against a fake window with jQuery.
 * @returns {{ addInputEventListener: Function, jq: Function }}
 */
function buildHelper() {
    const jq = buildFakeJquery();
    const window = { jQuery: jq, setTimeout };
    const factory = new Function(
        'window', 'Element', 'NodeList', 'document',
        `${extract('resolveElements')}\n${extract('addInputEventListener')}\nreturn addInputEventListener;`
    );
    return { addInputEventListener: factory(window, FakeElement, FakeNodeList, {}), jq };
}

/**
 * Runs every handler on the element for an event type, as jQuery would on trigger.
 * @param {FakeElement} el
 * @param {string} type
 */
function fire(el, type) {
    el.handlers.filter((h) => h.type === type).forEach((h) => h.fn.call(el, { type }));
}

const chosenSelect = () => new FakeElement('SELECT', ['chzn-select']);

test('listeners with different code on one Chosen select all run', () => {
    const { addInputEventListener } = buildHelper();
    const select = chosenSelect();
    const calls = [];

    addInputEventListener(select, () => calls.push('url-gate'));
    addInputEventListener(select, () => calls.push('name-gate'));
    fire(select, 'change');

    assert.deepEqual(calls, ['url-gate', 'name-gate']);
});

test('registering the same code again replaces it instead of stacking', () => {
    const { addInputEventListener } = buildHelper();
    const select = chosenSelect();
    let count = 0;
    const register = () => addInputEventListener(select, function () { count++; });

    register();
    register();
    register();
    fire(select, 'change');

    assert.equal(count, 1);
    assert.equal(select.handlers.length, 1);
});

test('the legacy ktl_chosen namespace still removes every listener', () => {
    const { addInputEventListener, jq } = buildHelper();
    const select = chosenSelect();

    addInputEventListener(select, () => {});
    addInputEventListener(select, () => 'other');
    jq(select).off('change.ktl_chosen');

    assert.equal(select.handlers.length, 0);
});

test('timepicker listeners with different code all run, and the same code replaces', () => {
    const { addInputEventListener } = buildHelper();
    const input = new FakeElement('INPUT', ['ui-timepicker-input']);
    const calls = [];
    const first = () => addInputEventListener(input, () => calls.push('first'));

    first();
    first();
    addInputEventListener(input, () => calls.push('second'));
    fire(input, 'changeTime');

    assert.deepEqual(calls, ['first', 'second']);
});
