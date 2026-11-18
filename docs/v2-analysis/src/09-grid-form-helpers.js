// Batch 2: V1 lines 11596-11696, 13180-13195, 13781-13813, 13943-14023, 14091-14099, 17226-17260, 17642-17650, 17836-17866.
// Native DOM only. getTableRows returned jQuery-wrapped rows to its callback, so it is a shim over getTableRowElements.

/**
 * Replaces a view's title once `selector` appears on the page.
 * @param {string} viewId - View id, e.g. `view_12`.
 * @param {string} selector - Selector to wait for (up to 10 seconds).
 * @param {string} newTitle - Replacement title text.
 */
function updateViewTitleIfSelectorFound(viewId, selector, newTitle) {
    ktl.core.waitSelector(selector, 10000).then(() => {
        const title = document.querySelector(`#${viewId} h3.kn-title`);
        if (title && document.querySelector(selector)) title.textContent = newTitle;
    });
}

/**
 * Copies one column's link text into another column's link label, row by row.
 * @param {string} viewId - View id.
 * @param {string} sourceField - Source column class, e.g. `field_12`.
 * @param {string} targetField - Target column as `field_N` or exact header text (a trailing required `*` is ignored).
 */
function replaceTextInGrid(viewId, sourceField, targetField) {
    const headers = document.querySelectorAll(`#${viewId} .kn-table thead th`);
    const header = targetField.startsWith('field_')
        ? document.querySelector(`#${viewId} .kn-table thead th.${targetField}`)
        : Array.from(headers).find((th) => th.textContent.replace('*', '').trim() === targetField);
    const targetIndex = header ? Array.from(header.parentElement.children).indexOf(header) : -1;

    document.querySelectorAll(`#${viewId} .kn-table tbody tr`).forEach((row) => {
        const html = row.querySelector(`td.${sourceField} span`)?.innerHTML;
        if (html === undefined) return;
        Array.from(row.children).at(targetIndex)?.querySelectorAll('span.knViewLink__label').forEach((label) => {
            label.innerHTML = html;
            label.querySelectorAll('span').forEach((inner) => { inner.style.textDecoration = 'none'; });
        });
    });
}

/**
 * Removes `.removeIfBlank` spans whose text (optionally the part after a separator) is empty or only dashes.
 * @param {Element|JQuery|string} dfData - Display-field container(s), e.g. a `td`.
 * @param {string} [separator] - Only the text after this separator is checked, e.g. `:`.
 */
function removeBlanksFromDF(dfData, separator) {
    const dashPattern = /^-+\s*-*$/;
    resolveElements(dfData).flatMap((root) => Array.from(root.querySelectorAll('.removeIfBlank'))).forEach((span) => {
        const text = span.textContent.trim();
        const toCheck = separator ? (text.split(separator)[1] ?? '').trim() : text;
        if (toCheck === '' || dashPattern.test(toCheck)) span.remove();
    });
}

/**
 * Hides empty list containers in a view.
 * @param {string} viewId - View id.
 */
function hideEmptyListItems(viewId) {
    document.querySelectorAll(`#${viewId} .kn-list-container`).forEach((container) => {
        if (container.textContent.trim() === '') container.style.display = 'none';
    });
}

/**
 * Flags an input as invalid when empty (focusing and scrolling to it) and re-checks it on blur.
 * V1 threw a TypeError for a missing input; V2 returns false.
 * @param {string} inputId - Input element id (without `#`).
 * @returns {boolean} True when the input has a value.
 */
function validateInputEmpty(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return false;
    input.addEventListener('blur', () => input.classList.toggle('inputInvalid', !input.value));
    if (input.value) return true;
    input.classList.add('inputInvalid');
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    return false;
}

/**
 * Prepends text (parsed as HTML, as in V1) to each group-by cell of a grid.
 * @param {string} txtToAdd - Text or HTML to prepend; a space is appended.
 * @param {string} viewId - View id.
 * @param {number} [groupLevel=1] - Group level to target.
 */
function prependTextToGroupBy(txtToAdd, viewId, groupLevel = 1) {
    document.querySelectorAll(`#${viewId} .kn-group-level-${groupLevel} td`).forEach((cell) => {
        cell.insertAdjacentHTML('afterbegin', `${txtToAdd} `);
    });
}

/**
 * Calls `callback(index, row)` for each row of a view's table, in document order.
 * @param {string} viewId - View id.
 * @param {(index: number, row: HTMLTableRowElement) => void} callback - Receives the index and the native row.
 * @param {boolean} [includeHeader=false] - Include `thead` rows.
 * @param {boolean} [includeGroup=false] - Include group rows.
 */
function getTableRowElements(viewId, callback, includeHeader = false, includeGroup = false) {
    if (!viewId) return;
    const parts = ['tbody tr:not(.kn-table-group)', includeHeader && 'thead tr', includeGroup && 'tbody tr.kn-table-group'].filter(Boolean);
    document.querySelectorAll(parts.map((part) => `#${viewId} table ${part}`).join(', ')).forEach((row, index) => callback(index, row));
}

/**
 * Whole weeks (rounded up) between two dates.
 * @param {Date} date1 - First date.
 * @param {Date} date2 - Second date.
 * @returns {number}
 */
function weeksBetween(date1, date2) {
    return Math.ceil(Math.abs(date2 - date1) / (1000 * 60 * 60 * 24 * 7));
}

/**
 * Converts a UK date string to a Date.
 * @param {string} date - Date as `dd/mm/yyyy`.
 * @returns {Date}
 */
function convertToDateObj(date) {
    const [day, month, year] = date.split('/');
    return new Date(year, month - 1, day);
}

/**
 * Whether every input in a view is empty (text, number, email, textarea, select, radio, checkbox).
 * @param {string} viewId - View id.
 * @param {string[]} [fieldsToIgnore=[]] - Input ids (radio/checkbox: field id from the name) to skip.
 * @returns {boolean}
 */
function areAllInputsEmpty(viewId, fieldsToIgnore = []) {
    if (!viewId) return true;
    const view = document.getElementById(viewId);
    if (!view) return true;
    const ignored = (id) => fieldsToIgnore.includes(id);

    const hasText = Array.from(view.querySelectorAll('input[type="text"]:not(.search-field input[type="text"]), input[type="number"], input[type="email"], textarea'))
        .some((input) => !ignored(input.getAttribute('id')) && input.value.trim() !== '');
    if (hasText) return false;

    const hasSelection = Array.from(view.querySelectorAll('select'))
        .some((select) => !ignored(select.getAttribute('id')) && select.selectedOptions.length > 0 && select.selectedOptions[0].value !== '');
    if (hasSelection) return false;

    return !Array.from(view.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked'))
        .some((input) => !ignored((input.getAttribute('name') ?? '').split('-').pop()));
}

/**
 * Shows only the Chosen result items containing a text.
 * @param {string} viewId - View id.
 * @param {string|number} fieldTofilter - Field id number of the Chosen select.
 * @param {string} textToMatch - Text an item must contain to stay visible.
 */
function filterSelectByText(viewId, fieldTofilter, textToMatch) {
    document.querySelectorAll(`#${viewId}_field_${fieldTofilter}_chzn li`).forEach((item) => {
        item.style.display = item.textContent.includes(textToMatch) ? '' : 'none';
    });
}

/**
 * Selects the radio whose trimmed value equals `value`, firing native input and change events.
 * V1 also fired a second jQuery change event; the native event already reaches jQuery handlers.
 * @param {string|number} fieldId - Knack field id.
 * @param {string} value - Value to select.
 * @param {ParentNode} [root=document] - Where to look for the field.
 * @returns {boolean} True when a radio was selected.
 */
function setSelectedRadioValue(fieldId, value, root = document) {
    const radios = Array.from(getFieldWrapper(fieldId, root)?.querySelectorAll('input[type="radio"]') ?? []);
    const nextValue = String(value || '').trim();
    const target = nextValue && radios.find((radio) => String(radio.value || '').trim() === nextValue);
    if (!target) return false;
    radios.forEach((radio) => { radio.checked = radio === target; });
    fireEvent(target, 'input');
    fireEvent(target, 'change');
    return true;
}

/**
 * Regex-replaces the text of matching elements (children are flattened to text, as in V1).
 * @param {string|number} selectorOrFieldID - Selector, or a field id number meaning `td.field_N`.
 * @param {RegExp|string} regex - Pattern to replace.
 * @param {string} replaceTxt - Replacement.
 * @param {boolean} [replaceAll=false] - Use replaceAll instead of replace.
 */
function replaceTextRegex(selectorOrFieldID, regex, replaceTxt, replaceAll = false) {
    const selector = typeof selectorOrFieldID === 'number' ? `td.field_${selectorOrFieldID}` : selectorOrFieldID;
    resolveElements(selector).forEach((element) => {
        const oldText = element.textContent;
        element.textContent = replaceAll ? oldText.replaceAll(regex, replaceTxt) : oldText.replace(regex, replaceTxt);
    });
}

/**
 * Shows `selector` when the checked radio/checkbox in a field matches, and keeps it in sync on change.
 * @param {string|number} fieldID - Knack field id number.
 * @param {*} valuesToMatch - Value (loose equality) or, when `isMultiple`, array of values (strict).
 * @param {string} selector - Elements to show or hide.
 * @param {boolean} [isMultiple=false] - Treat `valuesToMatch` as an array.
 */
function showHideEleBasedOnRadios(fieldID, valuesToMatch, selector, isMultiple = false) {
    const field = document.getElementById(`kn-input-field_${fieldID}`);
    if (!field) return console.error(`Field with ID ${fieldID} not found on the page.`);
    if (!document.querySelector(selector)) return console.error(`Target selector "${selector}" not found on the page.`);

    const update = () => {
        const selected = field.querySelector(':checked')?.value;
        setVisibility(selector, isMultiple ? valuesToMatch.includes(selected) : selected == valuesToMatch);
    };
    field.addEventListener('change', update);
    update();
}

/**
 * Shows each selector whose key appears in `searchStr`, hides the rest.
 * @param {string} searchStr - String to search.
 * @param {Object<string, string>} selectorMap - Map of `{ key: selector }`.
 */
function showHideEleBasedOnString(searchStr, selectorMap) {
    Object.entries(selectorMap).forEach(([key, selector]) => setVisibility(selector, searchStr.includes(key)));
}
