// Batch 4: V1 lines 9036-9045, 9057-9080, 9132-9157, 9170-9208, 11508-11514, 11556-11590, 18330-18351, 18631-18637, 18835-18857, 18878-18880.
// Native DOM only. Scene lookups go through knackNavigator.

/**
 * Reads the value of a Knack detail field.
 * @param {string|number} fieldID - Field id number (the `field_N` class).
 * @param {boolean} [returnHtml=false] - Return the inner HTML instead of the text.
 * @returns {string|null} Trimmed value, or null when the field is not on the page.
 */
function getValueFromDetail(fieldID, returnHtml = false) {
    const fieldElement = document.querySelector(`.field_${fieldID} .kn-detail-body`);
    if (!fieldElement) {
        console.log(`Error: Element with field_${fieldID} not found.`);
        return null;
    }
    return (returnHtml ? fieldElement.innerHTML : fieldElement.textContent).trim();
}

/**
 * Writes a detail field's text into every element matching a selector.
 * @param {string|number} fieldID - Field id number.
 * @param {string} insertSpan - Selector of the elements to fill.
 */
function insertValFromDetail(fieldID, insertSpan) {
    const value = getValueFromDetail(fieldID);
    document.querySelectorAll(insertSpan).forEach((element) => { element.textContent = value; });
}

/**
 * Finds the position of table columns by their `field_N` header class.
 * @param {Element} viewElement - View root.
 * @param {string|number|Array<string|number>} fieldIds - One field id or several.
 * @returns {number|number[]} Zero-based index (-1 when absent); an array when given an array.
 */
function getIndexOfColumnHeader(viewElement, fieldIds) {
    const many = Array.isArray(fieldIds);
    if (!viewElement) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: viewElement is undefined'), { fieldIds });
        return many ? fieldIds.map(() => -1) : -1;
    }
    if (fieldIds === undefined || fieldIds === null) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: fieldIds is undefined or null'), { viewElement });
        return -1;
    }
    const headerRow = viewElement.querySelector('table thead tr');
    if (!headerRow) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: headerRow not found'), { viewElement, fieldIds });
        return many ? fieldIds.map(() => -1) : -1;
    }
    const headers = Array.from(headerRow.children);
    const indexOf = (fieldId) => headers.findIndex((header) => header.classList.contains(`field_${fieldId}`));
    return many ? fieldIds.map(indexOf) : indexOf(fieldIds);
}

/**
 * Strips markup and all whitespace and lower-cases, for comparing rendered text.
 * @param {*} value - Text or HTML.
 * @returns {string}
 */
function normaliseText(value) {
    return String(value ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .toLowerCase()
        .replace(/\s+/g, '');
}

/**
 * Whether a record value holds anything (recurses into arrays and objects).
 * @param {*} recordValue - Value from a Knack record.
 * @returns {boolean}
 */
function recordHasValue(recordValue) {
    if (Array.isArray(recordValue)) return recordValue.some(recordHasValue);
    if (recordValue instanceof Date) return !Number.isNaN(recordValue.getTime());
    if (recordValue && typeof recordValue === 'object') return Object.values(recordValue).some(recordHasValue);
    if (typeof recordValue === 'boolean') return true;
    if (typeof recordValue === 'number') return Number.isFinite(recordValue);
    return String(recordValue ?? '').trim() !== '';
}

/**
 * Gets the Monday of a date's week, formatted for the UK.
 * @param {Date} date - Any date.
 * @returns {string} e.g. `1 Jan 2024`.
 */
function getWeekCommencingDate(date) {
    const monday = new Date(date);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Joins strings as a readable list: `a, b and c`. V1 split on the last comma anywhere in the text, so a last item
 * containing a comma was mangled; V2 joins the items directly.
 * @param {string[]} stringsArr - Items.
 * @param {string} joinStr - Word before the last item, e.g. `and`.
 * @returns {string}
 */
function constructList(stringsArr, joinStr) {
    if (stringsArr.length < 2) return stringsArr.join(', ');
    return `${stringsArr.slice(0, -1).join(', ')} ${joinStr} ${stringsArr.at(-1)}`;
}

/**
 * Splits a comma-separated string into trimmed items.
 * @param {string} csvString - Text such as `a, b, c`.
 * @param {boolean} [removeDuplicates=false] - Drop repeated items.
 * @returns {string[]} Empty array (with a console error) for non-string or empty input.
 */
function csvToArray(csvString, removeDuplicates = false) {
    if (!csvString || typeof csvString !== 'string') {
        console.error('Invalid input. Please provide a non-empty string.');
        return [];
    }
    const items = csvString.split(',').map((item) => item.trim());
    return removeDuplicates ? [...new Set(items)] : items;
}

/**
 * Whether a word starts with a vowel (a, e, i, o, u), for choosing "a" or "an".
 * @param {string} word - Word to test.
 * @returns {boolean}
 */
function startsWithVowel(word) {
    return /^[aeiou]/i.test(String(word ?? ''));
}

/**
 * Removes the query string from a URL.
 * @param {string|URL} urlToClean - URL, e.g. `window.location.href`.
 * @returns {string}
 */
function sanitiseURL(urlToClean) {
    return String(urlToClean ?? '').split('?')[0];
}

/**
 * Removes trailing path segments from a URL (query string dropped).
 * @param {string} currURL - Current URL.
 * @param {number} [numPops=3] - Segments to remove.
 * @returns {string}
 */
function getNewURL(currURL, numPops = 3) {
    const segments = sanitiseURL(currURL).split('/');
    segments.length = Math.max(0, segments.length - numPops);
    return segments.join('/');
}

/**
 * Gets a segment of the current page URL; by default the record id of `.../record-id/`.
 * @param {number|null} [part=null] - Position counted from the end (default: second from the end).
 * @returns {string|undefined}
 */
function getRecordID(part = null) {
    const parts = sanitiseURL(window.location.href).split('/');
    return parts[parts.length - (part || 2)];
}

/**
 * Gets the URL hash segment immediately before a scene slug (the parent record id in nested Knack routes).
 * @param {string} sceneSlug - Scene slug to locate.
 * @returns {string} The segment, or `''` when the slug is absent or first.
 */
function getIdBeforeSceneSlug(sceneSlug) {
    const parts = window.location.hash.replace(/^#/, '').split('/').filter(Boolean);
    const slugIndex = parts.indexOf(sceneSlug);
    return slugIndex < 1 ? '' : parts[slugIndex - 1];
}
