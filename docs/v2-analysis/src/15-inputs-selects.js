// Batch 8: V1 lines 13955-14060 (isElementVisible, isInputEmpty), 14069-14085, 17664-17695, 18030-18254, 18972-19012.
// Native DOM only. Exception kept on jQuery: Chosen's `liszt:updated` refresh (see refreshChosen).

/**
 * Tells the Chosen plugin to redraw a select after its value changed in code.
 * @param {HTMLSelectElement} select - The select.
 * @param {boolean} [onlyIfChosen=false] - Skip selects Chosen has not enhanced.
 */
function refreshChosen(select, onlyIfChosen = false) {
    const $select = globalThis.jQuery?.(select);
    if ($select && (!onlyIfChosen || $select.data('chosen'))) $select.trigger('liszt:updated'); // Chosen plugin (jQuery).
}

/**
 * Whether an element is rendered and visible.
 * @param {Element|string} target - Element or selector.
 * @param {ParentNode} [root=document] - Where selectors are searched.
 * @returns {boolean}
 */
function isElementVisible(target, root = document) {
    const element = typeof target === 'string' ? (typeof root?.querySelector === 'function' ? root : document).querySelector(target) : target;
    if (!element?.isConnected) return false;
    const { display, visibility } = getComputedStyle(element);
    return display !== 'none' && visibility !== 'hidden' && element.getClientRects().length > 0;
}

/**
 * Whether a field container is empty.
 * @param {Element|string} fieldEleOrId - Container element or its id.
 * @param {'choice'|'textarea'|'dropdown'} type - Kind of field.
 * @returns {boolean|null} Null when the container is missing; false (with a warning) for an unknown type.
 */
const isInputEmpty = (fieldEleOrId, type) => {
    const field = typeof fieldEleOrId === 'string' ? document.getElementById(fieldEleOrId) : fieldEleOrId;
    if (!field) {
        console.warn('isInputEmpty: element not found for', fieldEleOrId);
        return null;
    }
    switch (type) {
        case 'choice': return field.querySelectorAll('input:checked').length === 0;
        case 'textarea': {
            const input = field.querySelector('textarea, input[type="text"], input[type="number"], input[type="email"]');
            return !input || input.value.trim() === '';
        }
        case 'dropdown': {
            const value = field.querySelector('select')?.value ?? '';
            return value === '' || value === null;
        }
        default:
            console.warn(`isInputEmpty: unknown field type "${type}"`);
            return false;
    }
};

/**
 * Replaces the text of cells in a column that contain some text.
 * @param {string} viewId - View id.
 * @param {string|number} colHeadID - Field id number of the column.
 * @param {string} matchTxt - Text a cell must contain.
 * @param {string} replaceTxt - Replacement text.
 */
function replaceValueInTD(viewId, colHeadID, matchTxt, replaceTxt) {
    const table = document.getElementById(viewId)?.querySelector('table');
    if (!table) return;
    const colIndex = getIndexOfColumnHeader(table, colHeadID);
    if (colIndex === -1) return;
    getAllTableRows(viewId, (_index, row) => {
        const cell = row.querySelectorAll('td')[colIndex];
        if (cell?.textContent.trim().includes(matchTxt)) cell.textContent = replaceTxt;
    });
}

/**
 * Shows a message while one of the select fields holds a matching value, and keeps it in sync.
 * @param {string} viewId - View id.
 * @param {string|number|Array<string|number>} fieldIds - Select field id(s).
 * @param {string|string[]} valuesToMatch - Value(s) that show the message.
 * @param {string} msgSelector - Selector inside the message block (see {@link toggleMessage}).
 * @param {boolean} [isConxSelect=false] - Read the selected text of a Chosen connection select.
 */
function showHideMsgBasedOnSelect(viewId, fieldIds, valuesToMatch, msgSelector, isConxSelect = false) {
    const fieldIdList = [fieldIds].flat();
    const matchValues = [valuesToMatch].flat();
    const readValue = (fieldId) => (isConxSelect
        ? document.querySelector(`#${viewId}_field_${fieldId}_chzn li.result-selected`)?.textContent.trim() ?? ''
        : document.getElementById(`${viewId}-field_${fieldId}`)?.value ?? '');
    const update = () => toggleMessage(fieldIdList.some((fieldId) => matchValues.includes(readValue(fieldId))), msgSelector);

    fieldIdList.forEach((fieldId) => {
        const select = document.getElementById(`${viewId}-field_${fieldId}`);
        if (!select) return console.error(`Select element not found: ${viewId}-field_${fieldId}`);
        addInputEventListener(select, update, { runOnInit: true });
    });
}

/**
 * Clears inputs, selects and textareas (radio groups as a whole), optionally firing input and change events for
 * those that held a value. Chosen selects are refreshed.
 * @param {Element|string|JQuery|Array} inputContainer - Inputs, or containers of them.
 * @param {boolean} [triggerChange=false] - Fire `input` and `change` for controls that had a value.
 */
function clearInput(inputContainer, triggerChange = false) {
    const clear = (control) => {
        const isChoice = control.type === 'checkbox' || control.type === 'radio';
        const hadValue = isChoice ? control.checked : control.value !== '';
        if (isChoice) control.checked = false;
        else if (control.tagName === 'SELECT') {
            if (control.multiple) Array.from(control.options).forEach((option) => { option.selected = false; });
            else control.selectedIndex = -1;
            refreshChosen(control, true);
        } else control.value = '';
        if (triggerChange && hadValue) {
            fireEvent(control, 'input');
            fireEvent(control, 'change');
        }
    };

    resolveElements(inputContainer).forEach((field) => {
        const controls = field.matches('input, select, textarea') ? [field] : Array.from(field.querySelectorAll('input, select, textarea'));
        const clearedGroups = new Set();
        controls.forEach((control) => {
            if (control.type !== 'radio' || !control.name) return clear(control);
            if (clearedGroups.has(control.name)) return;
            clearedGroups.add(control.name);
            const group = `${INPUT_RADIO_SELECTOR}[name="${cssEscape(control.name)}"]`;
            const members = [...field.querySelectorAll(group)];
            (members.length ? members : [...document.querySelectorAll(group)]).forEach(clear);
            if (!document.querySelector(group)) clear(control);
        });
    });
}

/**
 * Selects a select's first option, firing `change` unless silent.
 * @param {HTMLSelectElement} selectEl - The select.
 * @param {{silent?: boolean, updateChosen?: boolean}} [options={}] - `silent` skips the event; `updateChosen` (default true) refreshes Chosen.
 */
function resetSelectToFirstOption(selectEl, options = {}) {
    if (!(selectEl instanceof HTMLSelectElement)) return;
    const { silent = false, updateChosen = true } = options;
    const firstOption = selectEl.options[0] ?? null;
    const firstValue = firstOption?.value ?? '';
    const changed = selectEl.selectedIndex !== 0 || selectEl.value !== firstValue;

    Array.from(selectEl.options).forEach((option, index) => {
        option.selected = index === 0;
        if (index === 0) option.setAttribute('selected', 'selected');
        else option.removeAttribute('selected');
    });
    selectEl.selectedIndex = firstOption ? 0 : -1;
    selectEl.value = firstValue;
    if (updateChosen) refreshChosen(selectEl);
    if (changed && !silent) fireEvent(selectEl, 'change');
}

/**
 * Shows or hides one option of a checkbox field (matched by value, then by label text).
 * @param {string|number} fieldId - Field id.
 * @param {string} identifier - Checkbox value or label text.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleCheckboxOption(fieldId, identifier, show) {
    const container = getFieldWrapper(fieldId);
    if (!container) return console.warn(`toggleCheckboxOption: Field container not found for ${fieldId}`);
    const checkbox = container.querySelector(`input[type="checkbox"][value="${CSS.escape(identifier)}"]`)
        ?? Array.from(container.querySelectorAll('label.option, label.checkbox')).find((label) => label.textContent.trim() === identifier)?.querySelector('input[type="checkbox"]');
    if (!checkbox) return console.warn(`toggleCheckboxOption: No checkbox found for "${identifier}" in ${fieldId}`);
    checkbox.closest('label')?.classList.toggle(CLASS_DISPLAY_NONE, !show);
}

/**
 * Renames a radio option's visible label, keeping its input.
 * @param {string|number} fieldId - Field id.
 * @param {string} originalLabelText - Current label text.
 * @param {string} newLabelText - New label text.
 */
function changeRadioButtonLabel(fieldId, originalLabelText, newLabelText) {
    getFieldWrapper(fieldId)?.querySelectorAll('label.option.radio').forEach((label) => {
        if (label.textContent.trim() !== originalLabelText) return;
        label.replaceChildren(...label.querySelectorAll('input'), ` ${newLabelText}`);
    });
}

/**
 * Colours status cells: with `isAmber`, cells containing "Not" turn amber; otherwise cells without "Not" turn green.
 * @param {string|number} fieldId - Field id number (`.field_N` elements).
 * @param {boolean} [isAmber=false] - Amber mode.
 */
function setupFieldStatus(fieldId, isAmber = false) {
    document.querySelectorAll(`.field_${fieldId}`).forEach((element) => {
        const isNot = element.textContent.trim().includes('Not');
        if (isAmber && isNot) element.style.backgroundColor = 'var(--warning)';
        else if (!isAmber && !isNot) element.style.backgroundColor = 'var(--success)';
    });
}

/**
 * Removes spans of a class whose text contains "null".
 * @param {string} spanID - Class name of the spans.
 */
function removeNull(spanID) {
    removeElement(Array.from(document.querySelectorAll(`span.${spanID}`)).filter((span) => span.textContent.includes('null')));
}

/**
 * Selects the option with a value in a select.
 * @param {string} fieldID - Selector of the select, e.g. `#view_1-field_2`.
 * @param {string|number} value - Option value.
 */
function selectFromSelect(fieldID, value) {
    const options = document.querySelectorAll(`${fieldID} option[value="${CSS.escape(String(value))}"]`);
    if (!options.length) return console.error(`Option "${value}" does not exist in the dropdown with ID "${fieldID}".`);
    options.forEach((option) => { option.selected = true; });
}

/**
 * Selects the option of a connection select whose text equals `txtVal`.
 * @param {string} viewId - View id.
 * @param {string|number} fieldID - Field id number.
 * @param {string} txtVal - Option text.
 */
function selectFromConx(viewId, fieldID, txtVal) {
    const selector = `#${viewId}-field_${fieldID}`;
    const option = Array.from(document.querySelectorAll(`${selector} option`)).find((candidate) => candidate.textContent === String(txtVal));
    if (option) selectFromSelect(selector, option.value);
}

/**
 * Sets the placeholder of the input with id `field_N`.
 * @param {string|number} fieldID - Field id number.
 * @param {string} placeholder - Placeholder text.
 */
function addPlaceholderToInput(fieldID, placeholder) {
    document.getElementById(`field_${fieldID}`)?.setAttribute('placeholder', placeholder);
}

/**
 * Whether every visible radio group in a view has an answer.
 * @param {string} viewId - View id.
 * @param {number[]} [fieldToExclude=[]] - Field id numbers to ignore.
 * @returns {boolean}
 */
function checkAllRadioAnswered(viewId, fieldToExclude = []) {
    const counted = Array.from(document.querySelectorAll(`#${viewId} input[type="radio"]`))
        .filter((radio) => radio.getClientRects().length > 0)
        .filter((radio) => !fieldToExclude.includes(parseInt(radio.closest('[id^="kn-input-field_"]').id.split('_')[1])));
    return counted.filter((radio) => radio.checked).length === new Set(counted.map((radio) => radio.name)).size;
}

/**
 * Highlights a column's cell (and rewrites its link label) for records whose other field contains some text.
 * @param {string} viewId - View id of the grid.
 * @param {Array<Object>} records - Knack records.
 * @param {string} fieldIdToMatch - Record key to search, e.g. `field_5`.
 * @param {string} fieldIdToChange - Column class to change, e.g. `field_9`.
 * @param {string} textToMatch - Text the record value must contain.
 * @param {string} newText - New link label text.
 * @param {string} [bkgColor='success'] - CSS variable name for the background (`var(--name)`).
 */
function changeCellTextBasedOnCellContent(viewId, records, fieldIdToMatch, fieldIdToChange, textToMatch, newText, bkgColor = 'success') {
    const header = document.querySelector(`#${viewId} th.${fieldIdToChange}`);
    const columnIndex = header ? Array.from(header.parentElement.children).indexOf(header) : -1;
    records.filter((record) => record[fieldIdToMatch].includes(textToMatch)).forEach((record) => {
        document.querySelectorAll(`tr[id="${CSS.escape(record.id)}"]`).forEach((row) => {
            const cell = Array.from(row.querySelectorAll('td')).at(columnIndex);
            if (!cell) return;
            Object.assign(cell.style, { backgroundColor: `var(--${bkgColor})`, fontWeight: '700', color: 'black' });
            cell.querySelectorAll('.knViewLink__label').forEach((label) => { label.textContent = newText; });
        });
    });
}
