// Batch 10: V1 lines 18265-18324 (waitGetValueFromDetail), 18183-18218, 18340-18400, 18891-18966, 19345-19574, 19592-19598,
// 19831-19884, 20183-20218, 20340-20389, 13932-13938. Native; async/await throughout.
// waitGetValueFromDetail and waitGetConxIdFromDetailId passed their `delay` to waitSelector, which reads `timeout`, so it
// was ignored; V2 passes it as `timeout`.

/**
 * Waits for detail field(s) to render and reads their values.
 * @param {Object} options
 * @param {string|number} [options.viewId] - View to search; omit to search the page.
 * @param {string|number|Array<string|number>} options.fieldIds - Field id(s).
 * @param {number} [options.delay=20000] - Milliseconds to wait for each field.
 * @param {boolean} [options.returnHtml=false] - Return inner HTML instead of text.
 * @returns {Promise<string|null|Object<string, string|null>>} The value for one id; a `{field_N: value}` map for an array.
 */
async function waitGetValueFromDetail({ viewId, fieldIds, delay = 20000, returnHtml = false }) {
    const many = Array.isArray(fieldIds);
    const view = viewId ? knackNavigator.normalizeViewId(viewId) : '';
    try {
        const entries = await Promise.all([fieldIds].flat().map(async (fieldId) => {
            const field = knackNavigator.normalizeFieldId(fieldId);
            try {
                const element = await waitSelector({ selector: `${view ? `#${view} ` : ''}.${field} .kn-detail-body span`, timeout: delay });
                return [field, (returnHtml ? element.innerHTML : element.textContent)?.trim() || null];
            } catch {
                console.warn(`Field ${field} not found ${view ? `in view ${view}` : 'globally'} within ${delay}ms.`);
                return [field, null];
            }
        }));
        const values = Object.fromEntries(entries);
        return many ? values : values[knackNavigator.normalizeFieldId(fieldIds)];
    } catch (error) {
        console.error(`Error retrieving values for fields in view ${viewId}:`, error);
        return many ? Object.fromEntries([fieldIds].flat().map((fieldId) => [fieldId, null])) : null;
    }
}

/**
 * Waits for a connection detail field and returns the connected record id(s).
 * @param {Object} options
 * @param {string} options.viewId - View id.
 * @param {string|number} options.fieldId - Field id number.
 * @param {number} [options.delay=5000] - Milliseconds to wait for the field.
 * @returns {Promise<string|string[]|null>} One id, an array for several, or null.
 */
async function waitGetConxIdFromDetailId({ viewId, fieldId, delay = 5000 }) {
    try {
        const elements = await waitSelector({ selector: `#${viewId} .field_${fieldId} .kn-detail-body`, timeout: delay, returnType: 'elements' });
        if (!elements?.length) return null;
        await new Promise((resolve) => setTimeout(resolve, 100)); // Let Knack finish rendering the connection spans.

        const ids = Array.from(elements).flatMap((element) => {
            const found = Array.from(element.querySelectorAll('span[data-kn="connection-value"]')).flatMap((node) => {
                const matches = [getIdFromElement(node)];
                for (let ancestor = node.parentElement; ancestor && ancestor !== element; ancestor = ancestor.parentElement) matches.push(getIdFromElement(ancestor));
                return matches.filter(Boolean);
            });
            if (found.length) return [...new Set(found)];
            const fallback = getConnectionIdFromHtml(element);
            return fallback ? [fallback] : [];
        });
        const unique = [...new Set(ids)];
        return unique.length > 1 ? unique : unique[0] ?? null;
    } catch (error) {
        console.error(`Error getting connection ID from detail view: ${error}`);
        return null;
    }
}

/**
 * Builds a Knack-styled multiple-choice select (label, optional required marker, empty `select`).
 * @param {string} dropName - Select name and id.
 * @param {boolean} [isRequired=true] - Add the required asterisk.
 * @param {string} [labelText='Select'] - Label text.
 * @returns {HTMLDivElement}
 */
function createDropdownHTML(dropName, isRequired = true, labelText = 'Select') {
    const make = (tag, className, ...children) => {
        const element = Object.assign(document.createElement(tag), { className });
        element.append(...children);
        return element;
    };
    const select = document.createElement('select');
    select.setAttribute('data-placeholder', 'Select');
    select.setAttribute('name', dropName);
    select.setAttribute('id', dropName);
    select.className = 'select';
    select.style.verticalAlign = 'bottom';

    const label = document.createElement('label');
    label.setAttribute('for', dropName);
    label.className = 'label kn-label';
    label.append(Object.assign(document.createElement('span'), { textContent: `${labelText} ` }), make('span', 'selectText'));
    if (isRequired) label.append(Object.assign(make('span', 'kn-required'), { textContent: '*' }));

    return make('div', 'kn-input kn-input-multiple_choice control', label, make('div', 'kn-select', make('div', 'kn-select', select)));
}

/**
 * Auto-capitalises an input as the user types (and trims on blur).
 * @param {string|number|Element} viewId - View reference.
 * @param {string} inputSelector - Input selector inside the view.
 * @param {Object} [options] - `mode` (`title` | `sentence` | `all`), `trim`, `smartWords` (keep small words lower-case),
 *   `preserveCapitalAfterPrefixes` (e.g. `['Mc']` so `mcdonald` becomes `McDonald`).
 */
function capitaliseInput(viewId, inputSelector, options = { mode: 'title', trim: true, smartWords: true, preserveCapitalAfterPrefixes: [] }) {
    const input = getViewRootElement(viewId)?.querySelector(inputSelector);
    if (!input) return;
    const minorWords = ['and', 'or', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'a', 'an', 'but', 'nor', 'as'];
    const { mode = 'title', trim = true, smartWords = true, preserveCapitalAfterPrefixes = [] } = options || {};
    const prefixes = (Array.isArray(preserveCapitalAfterPrefixes) ? preserveCapitalAfterPrefixes : [])
        .map((prefix) => String(prefix || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);

    const titleWord = (word, index, full) => {
        let capitalised = word.replace(/(^|[-'])\w/g, (match) => match.toUpperCase()).replace(/(?<!^|[-'])\w/g, (match) => match.toLowerCase());
        const prefix = prefixes.find((candidate) => capitalised.length > candidate.length && capitalised.slice(0, candidate.length).toLowerCase() === candidate.toLowerCase());
        if (prefix) capitalised = `${capitalised.slice(0, prefix.length)}${capitalised.charAt(prefix.length).toUpperCase()}${capitalised.slice(prefix.length + 1)}`;
        const isMinor = smartWords && minorWords.includes(capitalised.toLowerCase()) && index !== 0 && index + word.length !== full.length;
        return isMinor ? capitalised.toLowerCase() : capitalised;
    };

    addInputEventListener(input, (event, inputElement) => {
        let text = inputElement.value;
        if (!text) return;
        if (trim && event?.type === 'blur') text = text.trim();
        let result = text;
        if (mode === 'all') result = text.toUpperCase();
        else if (mode === 'sentence') result = text.charAt(0).toUpperCase() + text.slice(1);
        else if (mode === 'title' && (!event || event.inputType !== 'insertText' || event.data !== ' ')) result = text.replace(/\b[\w'-]+\b/g, titleWord);

        if (inputElement.value === result) return;
        const caret = inputElement.selectionStart;
        inputElement.value = result;
        if (typeof caret === 'number' && inputElement === document.activeElement) inputElement.setSelectionRange(caret, caret);
    }, { events: ['input', 'blur'] });
}

/**
 * Upper-cases a string, or capitalises each word.
 * @param {string} str - Text.
 * @param {{allCaps?: boolean}} [options] - `allCaps` (default true) for upper case; false capitalises each word.
 * @returns {string} Empty string for non-string or blank input.
 */
function capitaliseString(str, options = { allCaps: true }) {
    if (typeof str !== 'string' || !str.trim()) return '';
    const { allCaps = true } = options;
    return allCaps ? str.trim().toUpperCase() : str.trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Builds the download details of a Knack asset.
 * @param {string} assetId - Asset id.
 * @param {string} fileName - File name.
 * @returns {{assetId: string, fileName: string, extension: string, assetUrl: string}|{}} Empty object when an argument is missing.
 */
function buildKnackAssetInfo(assetId, fileName) {
    if (!assetId || !fileName) return {};
    return {
        assetId,
        fileName,
        extension: fileName.match(/\.([^.]+)$/)?.[1].toLowerCase() ?? '',
        assetUrl: `https://api.knack.com/v1/applications/${knackNavigator.getApplicationId()}/download/asset/${assetId}/${encodeURIComponent(fileName)}`,
    };
}

/**
 * Downloads a file through a blob link; opens it in a new tab when the fetch fails.
 * @param {string} url - File URL.
 * @param {string} [fileName] - Name to save as.
 * @returns {Promise<void>}
 */
async function forceDownloadFile(url, fileName) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download fetch failed with status ${response.status}`);
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = Object.assign(document.createElement('a'), { href: blobUrl, download: fileName || '' });
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error('forceDownloadFile: falling back to opening the file directly.', error);
        window.open(url, '_blank', 'noopener');
    }
}

/**
 * Formats a byte count (`1.5 MB`).
 * @param {number|string} bytes - Size in bytes.
 * @returns {string} Empty string for non-positive or non-numeric input.
 */
function formatFileSizeBytes(bytes) {
    const size = Number(bytes);
    if (!Number.isFinite(size) || size <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = size;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${unitIndex === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Looks up an asset's size with a HEAD request and stores it on the item.
 * V1 also accepted error responses; V2 returns null for them.
 * @param {{assetUrl: string, fileSize?: number|null}} item - Item to fill.
 * @returns {Promise<number|null>} The size in bytes, or null.
 */
async function fetchFileSizeBytes(item) {
    try {
        const response = await fetch(item.assetUrl, { method: 'HEAD' });
        const length = response.ok ? response.headers.get('content-length') : null;
        item.fileSize = length ? Number(length) : null;
    } catch {
        item.fileSize = null;
    }
    return item.fileSize;
}

/**
 * Writes the "Staff Name" detail value (or the logged-in user's name) into elements.
 * @param {string|Element|NodeList|Array} target - Elements to fill.
 */
function insertStaffName(target) {
    try {
        const userName = knackNavigator.getUserName() || '';
        const fill = (text) => resolveElements(target).forEach((element) => { element.textContent = text; });
        waitSelector({ selector: '.kn-detail-label', textCondition: { text: 'Staff Name', exact: true }, timeout: 5000 })
            .then((staffField) => fill(staffField.nextElementSibling.textContent.trim() || userName))
            .catch((error) => {
                console.error(`Error finding staff field: ${error}`);
                fill(userName);
            });
    } catch (error) {
        errorHandler.handle(error, { function: 'insertStaffName', target }, 'insertStaffName');
    }
}

/**
 * `_ul` keyword handler: replaces a field's label text (`{br}`, `{strong}`, `{em}`, `{hr}` tags allowed).
 * @param {string} viewId - View id.
 * @param {string} viewType - View type.
 * @param {string} fieldId - `field_N`.
 * @param {{params: Array<string[]>}} keyword - Keyword parameters: `[text]` or `[text, viewTypes]`.
 */
function updateLabelText(viewId, viewType, fieldId, { params }) {
    const viewElement = getViewRootElement(viewId);
    if (!viewElement) return console.warn(`View ${viewId} not found for updateLabelText`);

    const selectors = {
        form: `#kn-input-${fieldId} .kn-label span:not(.kn-required)`,
        details: `.${fieldId} .kn-detail-label > span`,
        list: `.${fieldId} .kn-detail-label > span`,
        table: `th.${fieldId} > span > a > span:not(span.icon)`,
        search: `th.${fieldId} > span > a > span:not(span.icon)`,
    };
    const labelText = params[0].join(', ');
    const selector = params.length === 2 ? (selectors[viewType] && params[1][0].includes(viewType[0]) ? selectors[viewType] : null) : selectors[viewType];

    const replacements = { '{br}': '<br>', '{strong}': '<strong>', '{/strong}': '</strong>', '{em}': '<em>', '{/em}': '</em>', '{hr}': '<hr>' };
    const html = Object.entries(replacements).reduce((text, [pattern, replacement]) => text.replaceAll(pattern, replacement), labelText || '');
    const target = selector && viewElement.querySelector(selector);
    if (target) target.innerHTML = html;
}

/**
 * Reads a secure-storage object (creating it when missing or unreadable).
 * @param {string} storageKey - Storage key.
 * @returns {Promise<Object>} Stored records, keyed by record id.
 */
async function initSecureStorage(storageKey) {
    if (!storageKey || typeof storageKey !== 'string') throw new Error('Invalid storage key provided. Must be a non-empty string.');
    try {
        await ktl.storage.initSecureLs();
        try {
            const content = ktl.storage.lsGetItem(storageKey, false, false, true);
            if (!content) {
                console.log(`Storage '${storageKey}' doesn't exist yet, initializing empty storage.`);
                ktl.storage.lsSetItem(storageKey, '{}', false, false, true);
                return {};
            }
            try {
                return JSON.parse(content);
            } catch (parseError) {
                console.warn(`Error parsing content of '${storageKey}', returning empty object:`, parseError);
                ktl.storage.lsSetItem(storageKey, '{}', false, false, true);
                return {};
            }
        } catch (getItemError) {
            console.error(`Error accessing storage '${storageKey}':`, getItemError);
            throw new Error(`Failed to get item from secure storage: ${getItemError.message}`);
        }
    } catch (initError) {
        console.error('Failed to initialize secure storage:', initError);
        throw new Error(`Secure storage initialization failed: ${initError.message}`);
    }
}

/**
 * Saves a field value for a record in secure storage, with an expiry.
 * @param {string} storageKey - Storage key.
 * @param {string} recordKey - Record id.
 * @param {string} fieldId - Field key to save under.
 * @param {*} valueToStore - Value.
 * @param {number} [daysUntilExpiry=5] - Days before the record's data expires.
 * @returns {Promise<void>}
 */
async function setSecureStorage(storageKey, recordKey, fieldId, valueToStore, daysUntilExpiry = 5) {
    const storage = await initSecureStorage(storageKey);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + daysUntilExpiry);
    storage[recordKey] = { ...storage[recordKey], expirationDate: expiry.getTime(), [fieldId]: valueToStore };
    ktl.storage.lsSetItem(storageKey, JSON.stringify(storage), false, false, true);
}

/**
 * Reads a record's saved data from secure storage, dropping expired records.
 * @param {string} storageKey - Storage key.
 * @param {string} recordKey - Record id.
 * @returns {Promise<Object|string>} The record's saved fields, or `''`.
 */
async function getSecureStorage(storageKey, recordKey) {
    const storage = await initSecureStorage(storageKey);
    const now = Date.now();
    for (const id of Object.keys(storage)) if (now > storage[id].expirationDate) delete storage[id];
    ktl.storage.lsSetItem(storageKey, JSON.stringify(storage), false, false, true);
    return storage[recordKey] || '';
}
