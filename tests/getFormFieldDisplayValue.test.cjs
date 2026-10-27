const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const start = source.indexOf('function getFormFieldDisplayValue(');
const helper = source.slice(start, source.indexOf('\n}\n', start) + 2);

class HTMLInputElement {
    constructor({ type = 'text', value = '', checked = false, label = '' }) {
        Object.assign(this, { tagName: 'input', type, value, checked, label });
    }
    closest() {
        return this.label ? { textContent: this.label } : null;
    }
}
class HTMLTextAreaElement {}
class HTMLSelectElement {}

/**
 * Checks one simple selector such as `input:not([type="hidden"]):not([type="radio"])` or `input[type="radio"]:checked`.
 * @param {HTMLInputElement} el - Fake input.
 * @param {string} selector - One selector, no commas.
 * @returns {boolean} Whether the input matches.
 */
function matches(el, selector) {
    const tag = selector.match(/^[a-z]+/)?.[0];
    if (tag && tag !== el.tagName) {
        return false;
    }
    const excluded = [...selector.matchAll(/:not\(\[type="(\w+)"\]\)/g)].map(m => m[1]);
    const required = selector.replace(/:not\([^)]*\)/g, '').match(/\[type="(\w+)"\]/)?.[1];
    return !excluded.includes(el.type)
        && (!required || required === el.type)
        && (!selector.includes(':checked') || el.checked);
}

/**
 * Builds a fake Knack field wrapper holding the given inputs.
 * @param {HTMLInputElement[]} inputs - Inputs in DOM order.
 * @returns {Object} Wrapper with querySelector/querySelectorAll.
 */
function wrapper(inputs) {
    const all = selector => inputs.filter(el => selector.split(',').some(part => matches(el, part.trim())));
    return { querySelector: selector => all(selector)[0] || null, querySelectorAll: all };
}

/**
 * Builds getFormFieldDisplayValue against one fake field.
 * @param {HTMLInputElement[]} inputs - The field's inputs.
 * @param {string} [date=''] - Date that getDateTimeParts reports.
 * @returns {string} The helper's result.
 */
function displayValue(inputs, date = '') {
    const fn = new Function('getFieldWrapper', 'getDateTimeParts', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'document',
        `${helper}\nreturn getFormFieldDisplayValue;`)(() => wrapper(inputs), () => ({ date }), HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement, {});
    return fn(1);
}

const radios = ticked => ['Owners only', 'Everyone'].map(value => new HTMLInputElement({ type: 'radio', value, checked: value === ticked }));

test('an unticked radio field returns an empty string, not the first option', () => {
    assert.equal(displayValue(radios(null)), '');
});

test('a ticked radio returns its value', () => {
    assert.equal(displayValue(radios('Everyone')), 'Everyone');
});

test('an unticked checkbox field returns an empty string', () => {
    assert.equal(displayValue([new HTMLInputElement({ type: 'checkbox', value: 'true', label: 'Yes' })]), '');
});

test('a ticked checkbox returns its label', () => {
    assert.equal(displayValue([new HTMLInputElement({ type: 'checkbox', value: 'true', checked: true, label: 'Yes' })]), 'Yes');
});

test('a text field still returns its value', () => {
    assert.equal(displayValue([new HTMLInputElement({ value: ' Winter Stew ' })]), 'Winter Stew');
});

test('a date field with an unticked All Day checkbox still returns its date', () => {
    const inputs = [new HTMLInputElement({ value: '22/10/2026' }), new HTMLInputElement({ type: 'checkbox', value: 'true', label: 'All Day' })];
    assert.equal(displayValue(inputs, '22/10/2026'), '22/10/2026');
    assert.equal(displayValue(inputs), '22/10/2026');
});
