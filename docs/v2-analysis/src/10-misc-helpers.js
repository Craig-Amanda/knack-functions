// Batch 3: V1 lines 9505-9518, 9596-9616, 9665-9670, 11516-11546, 12171-12351, 13202-13275, 13280-13329, 17409-17437.
// Native DOM only. Exceptions kept on jQuery: Chosen's `liszt:updated` refresh, and binding `change` on Chosen
// selects (Chosen announces changes with jQuery's trigger, which native listeners never see).

/** Injects the active-state style used by menu buttons (once). */
function ensureMenuButtonActiveStyles() {
    ensureStyle('kf-menu-button-active-style', `
        .kf-menu-button.is-active {
            border-color: rgba(0, 0, 0, 0.45) !important;
            filter: brightness(0.92);
            transform: translateY(1px);
        }
    `);
}

/**
 * Applies a numeric/comparison operator to two values. Unknown operators return `'Invalid operation'`.
 * @param {*} a - Left operand.
 * @param {string} operator - One of `+ - * / % > >= < <= == === != !==`.
 * @param {*} b - Right operand.
 * @returns {*}
 */
function applyOperator(a, operator, b) {
    const operations = {
        '+': () => a + b, '-': () => a - b, '/': () => a / b, '*': () => a * b, '%': () => a % b,
        '>': () => a > b, '>=': () => a >= b, '<': () => a < b, '<=': () => a <= b,
        '==': () => a == b, '===': () => a === b, '!=': () => a != b, '!==': () => a !== b,
    };
    return operations[operator]?.() ?? 'Invalid operation';
}

/**
 * Colours the buttons of forms listed as completed in a detail field.
 * @param {string} completedField - Field id read with {@link getValueFromDetail}; holds comma-separated form names.
 * @param {Object<string, string|number>} mappingObject - Map of form name to view number.
 * @param {string} buttonColour - CSS background colour.
 */
function updateButtonColourOnFormComplete(completedField, mappingObject, buttonColour) {
    const formsCompleted = getValueFromDetail(completedField);
    if (!formsCompleted?.length) return;

    for (const rawForm of formsCompleted.split(',')) {
        const viewId = mappingObject[rawForm.trim()];
        if (!viewId) continue;
        // Includes the hide/show button itself so its own background is updated.
        const selector = `#view_${viewId} .ktlHideShowButton, #view_${viewId} .view-header:has(.ktlHideShowButton), #view_${viewId} a.knViewLink`;
        ktl.core.waitSelector(selector)
            .then(() => document.querySelectorAll(selector).forEach((element) => { element.style.backgroundColor = buttonColour; }))
            .catch((error) => console.error(`Error waiting for selector in view_${viewId}:`, error));
    }
}

/**
 * Escapes `& < > " '` as numeric character references.
 * @param {*} text - Value to escape (null/undefined become an empty string).
 * @returns {string}
 */
function escapeHTML(text) {
    return String(text ?? '').replace(/[&<>"']/g, (match) => `&#${match.charCodeAt(0)};`);
}

/**
 * Refreshes a view at HH:mm each day (first at the next occurrence, then every 24 hours).
 * @param {string} viewId - View id.
 * @param {number} hours - Hour of day (0-23).
 * @param {number} minutes - Minute (0-59).
 */
function scheduleDailyRefresh(viewId, hours, minutes) {
    const now = new Date();
    const nextRefresh = new Date();
    nextRefresh.setHours(hours, minutes, 0, 0);
    if (now > nextRefresh) nextRefresh.setDate(nextRefresh.getDate() + 1);

    setTimeout(() => {
        ktl.views.refreshView(viewId);
        setInterval(() => ktl.views.refreshView(viewId), 24 * 60 * 60 * 1000);
    }, nextRefresh - now);
}

/** @returns {number} The current four-digit year. */
function getCurrentYear() {
    return new Date().getFullYear();
}

/**
 * Builds a Knack filter matching a connection field and a type field.
 * @param {{conxField: string, typeField: string}} sGrid - Field keys of the shared-area grid.
 * @param {string} recordId - Connected record id.
 * @param {*} value - Type value to match.
 * @returns {{match: string, rules: Object[]}}
 */
function createFilterForWeekObj(sGrid, recordId, value) {
    return {
        match: 'and',
        rules: [
            { field: sGrid.conxField, operator: 'is', value: [recordId] },
            { field: sGrid.typeField, operator: 'is', value },
        ],
    };
}

/**
 * Compares a person's age (from a UK date of birth) with a number.
 * @param {string} dob - Date of birth as `dd/mm/yyyy`.
 * @param {number} age - Age to compare with.
 * @param {string} operator - Operator accepted by {@link applyOperator}.
 * @returns {*} Result of `calculatedAge <operator> age`.
 */
function compareAge(dob, age, operator) {
    const ageDate = new Date(Date.now() - convertToDateObj(dob).getTime());
    return applyOperator(Math.abs(ageDate.getUTCFullYear() - 1970), operator, age);
}

/**
 * Fills a list with the values of a field shown in detail or list views (de-duplicated, empty ones skipped).
 * V1 parsed item text as HTML; V2 inserts it as text. `defaultText` is still inserted as HTML.
 * @param {string} listId - Selector of the `<ul>`/`<ol>` to populate.
 * @param {string} fieldId - Field class, e.g. `field_3473`.
 * @param {string} [defaultText=''] - Shown when no values are found.
 * @param {'detail'|'list'} [viewType='detail'] - View type to read from.
 * @param {number} [delay=20000] - Milliseconds to wait for the values to render.
 * @returns {Promise<void>}
 */
async function addConxDetailsToList(listId, fieldId, defaultText = '', viewType = 'detail', delay = 20000) {
    try {
        const list = document.querySelector(listId);
        if (!list) return;
        list.classList.add('custom-list');
        if (list.querySelector('li')) return;

        const itemSelector = viewType === 'list'
            ? `.kn-list-item-container .${fieldId} .kn-detail-body span`
            : `.${fieldId} .kn-detail-body span`;
        await ktl.core.waitSelector(itemSelector, delay);

        const items = Array.from(document.querySelectorAll(itemSelector))
            .filter((element) => !element.querySelector(':scope > span'))
            .map((element) => element.textContent.trim())
            .filter(Boolean);

        if (!items.length && defaultText) return list.insertAdjacentHTML('beforeend', `<li>${defaultText}</li>`);
        new Set(items).forEach((text) => {
            const item = document.createElement('li');
            item.textContent = text;
            list.append(item);
        });
    } catch (error) {
        throw new Error(`Failed to add details to list: ${error}`);
    }
}

/**
 * Mirrors fields of one view into another view with the same fields, hiding the target inputs.
 * @param {string[]} textFields - Textarea field ids (synced on blur).
 * @param {string[]} radioFields - Radio field ids (synced on change).
 * @param {string[]} selectFields - Select field ids (synced on change; Chosen refreshed).
 * @param {string} sourceViewId - View the user edits.
 * @param {string} targetViewId - View that receives the values.
 */
function mapFieldsToView(textFields, radioFields, selectFields, sourceViewId, targetViewId) {
    const mapField = (fieldId, fieldType, event) => {
        const sources = document.querySelectorAll(`#${sourceViewId} #kn-input-field_${fieldId} ${fieldType}`);
        const targets = document.querySelectorAll(`#${targetViewId} #kn-input-field_${fieldId} ${fieldType}`);
        if (!sources.length || !targets.length) {
            return console.error(`Element not found: #${sourceViewId} #kn-input-field_${fieldId} ${fieldType} or #${targetViewId} #kn-input-field_${fieldId} ${fieldType}`);
        }
        targets.forEach((target) => target.closest('.kn-input')?.classList.add(CLASS_HIDDEN));

        const sync = (source) => {
            if (fieldType === INPUT_RADIO_SELECTOR) {
                const value = document.querySelector(`#kn-input-field_${fieldId} ${INPUT_RADIO_CHECKED_SELECTOR}`)?.value;
                targets.forEach((target) => { if (target.getAttribute('value') === String(value)) target.click(); });
                return;
            }
            targets.forEach((target) => { target.value = source.value; });
            if (fieldType === 'select') globalThis.jQuery(targets).trigger('liszt:updated'); // Chosen refresh (jQuery plugin).
        };
        sources.forEach((source) => {
            if (fieldType === 'select') globalThis.jQuery(source).on(event, () => sync(source)); // Chosen fires change via jQuery.
            else source.addEventListener(event, () => sync(source));
        });
    };

    textFields.forEach((fieldId) => mapField(fieldId, 'textarea', 'blur'));
    radioFields.forEach((fieldId) => mapField(fieldId, INPUT_RADIO_SELECTOR, 'change'));
    selectFields.forEach((fieldId) => mapField(fieldId, 'select', 'change'));
}

/**
 * Adds the `disabled` class to every body cell of a column.
 * @param {string} viewId - View id.
 * @param {string|number} colHeadID - Field id number of the column.
 */
function disableCellsByColHead(viewId, colHeadID) {
    const headers = Array.from(document.getElementById(viewId)?.querySelector('table')?.querySelectorAll('thead th') ?? []);
    const colIndex = headers.findLastIndex((th) => th.classList.contains(`field_${colHeadID}`));
    if (colIndex === -1) return;
    getAllTableRows(viewId, (_index, row) => row.children[colIndex]?.classList.add(CLASS_DISABLED));
}

/**
 * Hides whole table columns (header, cells, colgroup entry) when no row has a value in them.
 * Call from the view's `knack-view-render` handler. Grids with no rows are left alone.
 * @param {string|number} viewId - View id.
 * @param {Array<string|number>} fieldIds - Field ids of the columns to hide when empty.
 */
function hideEmptyGridColumns(viewId, fieldIds) {
    const normalisedViewId = toViewId(viewId);
    const view = document.getElementById(normalisedViewId);
    if (!view || !Array.isArray(fieldIds) || !view.querySelector('tbody tr:not(.kn-table-group)')) return;

    fieldIds.forEach((fieldId) => {
        const field = toFieldId(fieldId);
        const cells = field ? Array.from(view.querySelectorAll(`tbody td.${field}`)) : [];
        if (!cells.length || cells.some((cell) => cell.textContent.trim() !== '')) return;

        const columnIndex = knackNavigator.getRenderedViewColumnIndex(normalisedViewId, field);
        const columns = [
            ...view.querySelectorAll(`th.${field}, td.${field}`),
            ...(columnIndex > 0 ? view.querySelectorAll(`colgroup col:nth-child(${columnIndex})`) : []),
        ];
        columns.forEach((element) => { element.style.display = 'none'; });
    });
}

/**
 * Saves meeting-minute fields to secure storage as they are edited, and restores them from a details link.
 * V2 waits for any `.kn-details-link a` and then picks the one containing `buttonText` (V1 used a jQuery `:contains` selector).
 * @param {string} storageKey - Secure storage key.
 * @param {string[]} viewsToAddLocalStorage - View ids holding the fields.
 * @param {string} buttonText - Text of the link that restores the saved minutes.
 */
function setupLocalStorageMinutes(storageKey, viewsToAddLocalStorage, buttonText) {
    const meetingId = getRecordID();
    initSecureStorage(storageKey);

    viewsToAddLocalStorage.forEach((view) => {
        getTextAreas(view).forEach((textarea) => {
            textarea.addEventListener('blur', () => setSecureStorage(storageKey, meetingId, getFieldId(textarea), textarea.value));
        });
        document.querySelectorAll(`#${view} .redactor-editor`).forEach((editor) => {
            editor.addEventListener('blur', () => setSecureStorage(storageKey, meetingId, getFieldId(editor.closest('.kn-input')), editor.innerHTML));
        });
    });

    ktl.core.waitSelector('.kn-details-link a', 5000).then(() => {
        document.querySelectorAll('.kn-details-link a').forEach((link) => {
            if (!link.textContent.includes(buttonText)) return;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                getSecureStorage(storageKey, meetingId).then((minutes) => {
                    if (minutes) reloadMinutes(viewsToAddLocalStorage, minutes);
                });
            });
        });
    });
}

/**
 * Writes saved minutes back into the views' textareas and rich-text editors.
 * @param {string[]} viewsToAddLocalStorage - View ids holding the fields.
 * @param {Object<string, string>} minutes - Saved values keyed by field id.
 */
function reloadMinutes(viewsToAddLocalStorage, minutes) {
    viewsToAddLocalStorage.forEach((view) => {
        getTextAreas(view).forEach((textarea) => {
            const fieldId = getFieldId(textarea);
            if (minutes[fieldId]) document.getElementById(fieldId).value = minutes[fieldId];
        });
        document.querySelectorAll(`#${view} .redactor-editor`).forEach((editor) => {
            const fieldId = getFieldId(editor.closest('.kn-input'));
            const richText = minutes[fieldId];
            if (!richText) return;
            const target = document.querySelector(`#${fieldId} .redactor-editor`);
            if (target) target.innerHTML = richText;
            document.querySelectorAll(`#${fieldId} textarea`).forEach((textarea) => { textarea.value = richText; });
        });
    });
}

/**
 * Whether a Knack field wrapper holds a value (checked option, file, typed text/select, or meaningful hidden value).
 * @param {HTMLElement} fieldWrapper - Field wrapper, e.g. from {@link getFieldWrapper}.
 * @returns {boolean}
 */
function fieldWrapperHasValue(fieldWrapper) {
    if (!(fieldWrapper instanceof HTMLElement)) return false;
    if (fieldWrapper.querySelector('input[type="checkbox"]:checked, input[type="radio"]:checked')) return true;
    if (fieldWrapper.querySelector('input[type="file"]')?.files?.length) return true;
    const typedInputs = fieldWrapper.querySelectorAll('textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select');
    if (Array.from(typedInputs).some((input) => elementHasMeaningfulValue(input))) return true;
    return Array.from(fieldWrapper.querySelectorAll('input[type="hidden"]')).some((input) => hiddenInputHasMeaningfulValue(input.value));
}

/**
 * Whether the current local time is within office hours on a weekday.
 * @param {string} [startTime='08:30'] - Start as `HH:mm` (24-hour).
 * @param {string} [endTime='16:30'] - End as `HH:mm` (24-hour).
 * @returns {boolean}
 */
function isInOfficeHours(startTime = '08:30', endTime = '16:30') {
    const toMinutes = (time) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; };
    const date = new Date();
    const now = date.getHours() * 60 + date.getMinutes();
    return ![0, 6].includes(date.getDay()) && toMinutes(startTime) <= now && now <= toMinutes(endTime);
}
