// Batch 1: V1 lines 9618-9656, 11203-11353. Native DOM only; jQuery-returning helpers live on as shims below.

/**
 * Removes elements from the page.
 * @param {string|Element|NodeList|JQuery|Array} selector - Element reference(s) accepted by {@link resolveElements}.
 */
function removeElement(selector) {
    resolveElements(selector).forEach((element) => element.remove());
}

/**
 * Splits a class argument (string, array of strings) into individual class names.
 * @param {string|string[]} classes - Space-separated class string or array.
 * @returns {string[]}
 */
const toClassList = (classes) => [classes].flat().flatMap((name) => String(name ?? '').split(/\s+/)).filter(Boolean);

/**
 * Adds classes to elements.
 * @param {string|Element|NodeList|JQuery|Array} selector - Element reference(s).
 * @param {string|string[]} classes - Class names to add.
 * @returns {Element[]} The matched elements.
 */
function addClasses(selector, classes) {
    const elements = resolveElements(selector);
    elements.forEach((element) => element.classList.add(...toClassList(classes)));
    return elements;
}

/**
 * Removes classes from elements.
 * @param {string|Element|NodeList|JQuery|Array} selector - Element reference(s).
 * @param {string|string[]} classes - Class names to remove.
 * @returns {Element[]} The matched elements.
 */
function removeClasses(selector, classes) {
    const elements = resolveElements(selector);
    elements.forEach((element) => element.classList.remove(...toClassList(classes)));
    return elements;
}

/**
 * Returns the checked row checkboxes of a grid.
 * @param {string} viewId - View id, e.g. `view_12`.
 * @returns {HTMLInputElement[]}
 */
const getCheckedRowCheckboxes = (viewId) => Array.from(document.querySelectorAll(`#${viewId} tbody ${INPUT_CHECKBOX_CHECKED_SELECTOR}`));

/**
 * Gets the ids of the checked rows in a grid.
 * @param {string} viewId - View id, e.g. `view_12`.
 * @returns {string[]} Row ids (`undefined` entries for rows without an id, as in V1).
 */
function getCheckedRowIds(viewId) {
    return getCheckedRowCheckboxes(viewId).map((checkbox) => checkbox.closest('tr')?.id ?? undefined);
}

/**
 * Gets the checked rows of a grid.
 * @param {string} viewId - View id, e.g. `view_12`.
 * @returns {HTMLTableRowElement[]}
 */
function getCheckedRowElements(viewId) {
    return getCheckedRowCheckboxes(viewId).map((checkbox) => checkbox.closest('tr'));
}

/**
 * Shows a notification after an input's Knack field wrapper.
 * @param {Element|JQuery} inputElement - Input (or element inside the field) to attach the notification to.
 * @param {string} message - Text to display.
 * @param {string} backgroundColor - CSS background colour.
 * @param {number|null} [timeout=null] - Milliseconds before the notification removes itself.
 * @returns {string} Notification id for {@link updateInputNotification} / {@link removeInputNotification}.
 */
function showInputNotification(inputElement, message, backgroundColor, timeout = null) {
    const notificationId = `notif_${Date.now()}`;
    const notification = Object.assign(document.createElement('div'), {
        id: notificationId,
        className: 'input-notification',
        textContent: message,
    });
    notification.style.backgroundColor = backgroundColor;
    resolveElement(inputElement)?.closest('.kn-input')?.after(notification);
    if (timeout !== null) setTimeout(() => removeInputNotification(notificationId), timeout);
    return notificationId;
}

/**
 * Replaces the text of a notification.
 * @param {string} notificationId - Id returned by {@link showInputNotification}.
 * @param {string} newMessage - New text.
 */
function updateInputNotification(notificationId, newMessage) {
    const notification = document.getElementById(notificationId);
    if (notification) notification.textContent = newMessage;
}

/**
 * Removes a notification.
 * @param {string} notificationId - Id returned by {@link showInputNotification}.
 */
function removeInputNotification(notificationId) {
    document.getElementById(notificationId)?.remove();
}

/** Returns a Promise that resolves after `ms` milliseconds. */
const API_TIMER = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns the keys whose value equals the object's maximum value.
 * @param {Object<string, number>} object - Values to compare.
 * @returns {string[]}
 */
const getMax = (object) => {
    const max = Math.max(...Object.values(object));
    return Object.keys(object).filter((key) => object[key] == max);
};

/**
 * Gets the textareas in a view.
 * @param {string} viewId - View id, e.g. `view_12`.
 * @returns {HTMLTextAreaElement[]}
 */
const getTextAreas = (viewId) => Array.from(document.querySelectorAll(`#${viewId} textarea`));

/**
 * Gets the id of an input (not a select).
 * @param {Element|JQuery|string} input - Input element, jQuery collection or selector.
 * @returns {string|undefined} The id attribute, or undefined when absent.
 */
function getFieldId(input) {
    return resolveElement(input)?.getAttribute('id') ?? undefined;
}

/**
 * Fills the app's configured "logged-in user" and "current date" fields present in a view.
 * Needs the app globals FIELD_IDS_FOR_LOGGED_IN_USER and SET_CURRENT_DATE_FIELDS.
 * @param {string} viewId - View id, e.g. `view_12`.
 */
function updateFieldsInArrays(viewId) {
    const viewElement = getViewRootElement(viewId);
    if (!(viewElement instanceof HTMLElement)) return;
    const present = (fieldId) => viewElement.querySelector(`#kn-input-field_${fieldId}`);
    const userFieldIds = FIELD_IDS_FOR_LOGGED_IN_USER.filter(present);
    const dateFieldIds = SET_CURRENT_DATE_FIELDS.filter(present);
    if (userFieldIds.length) updateUserFields(viewId, userFieldIds);
    if (dateFieldIds.length) updateDateFields(viewId, dateFieldIds);
}

/**
 * Hides each given user field and fills its inputs with the logged-in user's name.
 * @param {string} viewId - View id (unused, kept for the V1 signature).
 * @param {Array<string|number>} fieldIds - Numeric field ids.
 */
function updateUserFields(viewId, fieldIds) {
    const { name } = Knack.getUserAttributes();
    fieldIds.forEach((fieldId) => {
        const userField = document.getElementById(`kn-input-field_${fieldId}`);
        if (!userField) return;
        userField.classList.add(CLASS_HIDDEN);
        userField.querySelectorAll('input').forEach((input) => { input.value = name; });
    });
}

/**
 * Fills empty date (and optionally time) inputs with the current date and time.
 * @param {string} viewId - View id, e.g. `view_12`.
 * @param {Array<number|{fieldId: number, insertTime?: boolean}>} fieldIds - Field ids or per-field configs.
 * @param {boolean} [includeTime=true] - Also fill the time input; a per-field `insertTime` overrides it.
 */
function updateDateFields(viewId, fieldIds, includeTime = true) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    fieldIds.forEach((entry) => {
        if (document.getElementById('view_3404')) return; // App-specific: Submit Support Request form (kept from V1).
        const config = entry && typeof entry === 'object' ? entry : {};
        const fieldId = Number(config.fieldId ?? entry);
        if (!Number.isFinite(fieldId) || fieldId <= 0) return;

        const dateInput = document.getElementById(`${viewId}-field_${fieldId}`);
        if (dateInput && !dateInput.value) dateInput.value = getDateUKFormat(now);
        const timeInput = document.getElementById(`${viewId}-field_${fieldId}-time`);
        if (timeInput && (typeof config.insertTime === 'boolean' ? config.insertTime : includeTime) && !timeInput.value) timeInput.value = time;
    });
}
