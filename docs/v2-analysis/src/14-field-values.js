// Batch 7: V1 lines 17126-17437, 18723-18734, 18774-18832. Native; reads form values and ids out of rendered HTML.

/**
 * Reads a nested property by dotted path.
 * @param {Object} obj - Source object.
 * @param {string} path - Dotted path, e.g. `a.b.c`.
 * @returns {*} The value, or undefined when any step is missing.
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((value, key) => value?.[key], obj);
}

/**
 * Parses HTML into an inert fragment (nothing loads or runs) and returns its text.
 * @param {*} html - HTML or text (null becomes an empty string).
 * @returns {string}
 */
function htmlToText(html) {
    const template = document.createElement('template');
    template.innerHTML = html === null ? '' : String(html);
    return template.content.textContent;
}

/**
 * Extracts plain text from an HTML string.
 * @param {string} htmlString - HTML content.
 * @returns {string} Text without tags.
 */
function removeHtml(htmlString) {
    return htmlToText(htmlString);
}

/**
 * Converts HTML into readable plain text, keeping line breaks for `<br>` and block endings.
 * @param {*} value - HTML or plain text.
 * @returns {string}
 */
function removeHtmlWithFormatting(value) {
    const text = String(value || '').trim();
    if (!text.includes('<')) return text;
    return htmlToText(text.replace(/<\s*br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n'))
        .replace(/ /g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Finds the first element whose trimmed text equals `text`.
 * @param {string} text - Exact text.
 * @param {ParentNode} [root=document] - Where to search.
 * @param {{tag?: string, class?: string}} [filter={}] - Restrict by tag and/or space-separated classes.
 * @returns {Element|null} The element, or null (with a console warning).
 */
function findElementByText(text, root = document, filter = {}) {
    const { tag, class: classFilter } = filter;
    const classes = classFilter ? classFilter.split(/\s+/) : [];
    const found = Array.from(root.querySelectorAll(tag || '*'))
        .find((element) => classes.every((name) => element.classList.contains(name)) && element.textContent.trim() === text);
    if (!found) console.warn(`[findElementByText] No element found with text "${text}"${tag ? `, tag "${tag}"` : ''}${classFilter ? `, class "${classFilter}"` : ''}`);
    return found ?? null;
}

/**
 * Gets the checked radio value of a Knack field.
 * @param {string|number} fieldId - Field id.
 * @param {ParentNode} [root=document] - Where to look.
 * @returns {string} Trimmed value, or `''`.
 */
function getSelectedRadioValue(fieldId, root = document) {
    return getFieldWrapper(fieldId, root)?.querySelector('input[type="radio"]:checked')?.value?.trim() || '';
}

/**
 * Gets the selected value of a Knack select field.
 * @param {string|number} fieldId - Field id.
 * @param {ParentNode} [root=document] - Where to look.
 * @returns {string|string[]} Trimmed value; an array of non-empty values for a multiple select; `''` when absent.
 */
function getSelectedValue(fieldId, root = document) {
    const select = getFieldWrapper(fieldId, root)?.querySelector('select');
    if (!select) return '';
    if (select.multiple) return Array.from(select.selectedOptions, (option) => option.value.trim()).filter(Boolean);
    return select.value?.trim() || '';
}

/**
 * Reads what a user sees in a Knack form field: checked radio, selected option text, checked checkbox labels,
 * a date, or typed text.
 * @param {string|number} fieldId - Field id.
 * @param {ParentNode} [root=document] - Where to look.
 * @returns {string} Display text (multiple values joined with `, `), or `''`.
 */
function getFormFieldDisplayValue(fieldId, root = document) {
    const wrapper = getFieldWrapper(fieldId, root);
    if (!wrapper) return '';
    const text = (value) => String(value || '').trim();

    const checkedRadio = wrapper.querySelector('input[type="radio"]:checked');
    if (checkedRadio) return text(checkedRadio.value);

    const select = wrapper.querySelector('select');
    if (select) {
        if (select.multiple) return Array.from(select.selectedOptions, (option) => text(option.textContent || option.value)).filter(Boolean).join(', ');
        return text(select.selectedOptions[0]?.textContent || select.value);
    }

    const checked = Array.from(wrapper.querySelectorAll('input[type="checkbox"]:checked'));
    if (checked.length) return checked.map((input) => text(input.closest('label')?.textContent || input.value)).filter(Boolean).join(', ');

    const { date } = getDateTimeParts(wrapper);
    if (date) return date;
    const input = wrapper.querySelector('input:not([type="hidden"]), textarea');
    return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? text(input.value) : '';
}

/**
 * Gets the values of the checked checkboxes in a Knack field.
 * @param {string|number} fieldId - Field id.
 * @param {ParentNode} [root=document] - Where to look.
 * @returns {string[]} Values (label text when a checkbox has no value).
 */
function getFormFieldCheckboxValues(fieldId, root = document) {
    return Array.from(getFieldWrapper(fieldId, root)?.querySelectorAll('input[type="checkbox"]:checked') ?? [],
        (input) => String(input.value || input.closest('label')?.textContent || '').trim()).filter(Boolean);
}

/**
 * Whether an input, textarea or select holds a non-blank value (Chosen's search box is ignored).
 * @param {HTMLElement} inputElement - Control to check.
 * @returns {boolean}
 */
function elementHasMeaningfulValue(inputElement) {
    if (!(inputElement instanceof HTMLElement) || inputElement.closest('.chzn-container .search-field, .chosen-container .search-field')) return false;
    const filled = (value) => Boolean(knackValueResolver.toStringSafe(value));
    if (inputElement instanceof HTMLSelectElement && inputElement.multiple) return Array.from(inputElement.selectedOptions).some((option) => filled(option.value));
    return filled(inputElement.value);
}

/**
 * Whether a hidden input's value is meaningful (not blank, `[]`, `null` or `undefined`, after URI decoding).
 * @param {*} value - Hidden input value.
 * @returns {boolean}
 */
function hiddenInputHasMeaningfulValue(value) {
    const rawValue = knackValueResolver.toStringSafe(value);
    if (!rawValue) return false;
    let decoded = rawValue;
    try { decoded = decodeURIComponent(rawValue); } catch { /* keep the raw text */ }
    const compact = decoded.replace(/\s+/g, '');
    return compact !== '[]' && !['null', 'undefined'].includes(compact.toLowerCase());
}

/**
 * Parses an HTML string into a wrapper `div` (an Element is returned as is).
 * @param {Element|string|null} input - Element or HTML.
 * @returns {Element|null}
 */
function normaliseToElement(input) {
    if (input instanceof Element) return input;
    if (typeof input !== 'string' || !input) return null;
    return Object.assign(document.createElement('div'), { innerHTML: input.trim() });
}

/**
 * Finds a 24-character hex record id in the id or classes of an element, or of the elements inside an HTML string.
 * V1 returned null for every HTML string input; V2 searches the elements inside it.
 * @param {Element|string|null} eleOrHtml - Element or HTML.
 * @returns {string|null}
 */
function getIdFromElement(eleOrHtml) {
    const element = normaliseToElement(eleOrHtml);
    if (!element) return null;
    const hex24 = /^[a-fA-F0-9]{24}$/;
    const candidates = element.matches('span, div, a') && typeof eleOrHtml !== 'string' ? [element] : Array.from(element.querySelectorAll('span, div, a'));
    for (const node of candidates) {
        if (hex24.test(node.id)) return node.id;
        const token = Array.from(node.classList).find((name) => hex24.test(name));
        if (token) return token;
    }
    return null;
}

/**
 * Gets the connected record id from a Knack table cell (the `data-kn="connection-value"` span, its ancestors,
 * then any span).
 * @param {Element|string|null} cellElOrHtml - Cell element or HTML.
 * @returns {string|null}
 */
function getConnectionIdFromHtml(cellElOrHtml) {
    const root = normaliseToElement(cellElOrHtml);
    if (!root) return null;
    const connection = root.querySelector('span[data-kn="connection-value"]');
    const direct = getIdFromElement(connection);
    if (direct) return direct;

    for (let ancestor = connection?.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        const id = getIdFromElement(ancestor);
        if (id) return id;
    }
    for (const span of root.querySelectorAll('span')) {
        const id = getIdFromElement(span);
        if (id) return id;
    }
    return null;
}
