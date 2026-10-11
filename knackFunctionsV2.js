/**
 * knackFunctionsV2.js
 *
 * Progressive rewrite of knackFunctions.js. Same contract: a classic <script> that defines page globals, loaded by
 * Knack apps after jQuery and KTL. Every global in eslint/knack-functions-globals.json keeps its name here, either
 * as the real implementation or as a compatibility shim (see the "Compatibility shims" section at the end).
 *
 * Rules for this file (see docs/v2-migration-plan.md):
 * - No jQuery in implementation code. The only exceptions are the three Knack forces: lifecycle events (bound via
 *   onKnackEvent because Knack triggers them through jQuery), the Chosen select plugin, and the jQuery UI date/time
 *   pickers. jQuery objects are accepted as inputs; a V1 function that returned a jQuery collection lives on as a shim
 *   wrapping the native result with toJQuery().
 * - A function that changes its calling signature (params, accepted types, return type, sync/async, DOM side
 *   effects) keeps its old name as a shim tagged @deprecated.
 * - Sections follow the order of knackFunctions.js so the two files can be diffed side by side.
 * - Items not yet ported are listed under "Not yet ported" at the end of the file.
 *
 * Not loaded by any app until the port is complete; see the plan for the release steps.
 */

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: foundation
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const CLASS_HIDDEN = 'ktlHidden';
const CLASS_DISPLAY_NONE = 'ktlDisplayNone';
const INPUT_CHECKBOX_SELECTOR = 'input[type="checkbox"]';
const INPUT_RADIO_SELECTOR = 'input[type="radio"]';
const INPUT_CHECKBOX_CHECKED_SELECTOR = `${INPUT_CHECKBOX_SELECTOR}:checked`;
const INPUT_RADIO_CHECKED_SELECTOR = `${INPUT_RADIO_SELECTOR}:checked`;
const HEADER_CHECKBOX_SELECTOR = 'th input[type="checkbox"]';
const CLASS_DISABLED = 'disabled';

/** Console fallback so apps without a global error handler still see the original error. */
if (typeof globalThis.errorHandler === 'undefined') {
    const handle = (error, additionalInfo = {}, errorSource = 'Unknown') => {
        console.error('[knackFunctions] Fallback error handler:', { error, additionalInfo, errorSource });
        return null;
    };
    globalThis.errorHandler = { handle, handleError: handle };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Foundation primitives (new in V2; everything below builds on these)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Deprecated globals already reported, so each warns once per page load. */
const deprecationsWarned = new Set();

/**
 * Warns once per deprecated global, and only for developers, so production consoles stay quiet.
 * @param {string} oldName - Global being called.
 * @param {string} replacement - What to call instead.
 */
function warnDeprecated(oldName, replacement) {
    if (!globalThis.isDeveloper || deprecationsWarned.has(oldName)) return;
    deprecationsWarned.add(oldName);
    console.warn(`[knackFunctions] ${oldName} is deprecated; use ${replacement}.`);
}

/**
 * Normalises a Knack id to its prefixed form: `12` or `'VIEW_12'` become `'view_12'`; anything else becomes `''`.
 * @param {string|number} value - Id with or without the prefix.
 * @param {'view_'|'field_'|'scene_'|'object_'} prefix - Expected prefix.
 * @returns {string}
 */
function normaliseKnackId(value, prefix) {
    const text = String(value ?? '').trim().toLowerCase();
    if (text.startsWith(prefix) && /^\d+$/.test(text.slice(prefix.length))) return text;
    return /^\d+$/.test(text) ? `${prefix}${text}` : '';
}

/** @param {string|number} value @returns {string} `view_N` or `''`. */
const toViewId = (value) => normaliseKnackId(value, 'view_');
/** @param {string|number} value @returns {string} `field_N` or `''`. */
const toFieldId = (value) => normaliseKnackId(value, 'field_');
/** @param {string|number} value @returns {string} `scene_N` or `''`. */
const toSceneId = (value) => normaliseKnackId(value, 'scene_');

/** @param {*} val @returns {boolean} True for a NodeList. */
const isNodeList = (val) => val instanceof NodeList;
/** @param {*} val @returns {boolean} True for a jQuery collection (when jQuery is loaded). */
const isjQueryInstance = (val) => Boolean(globalThis.jQuery) && val instanceof globalThis.jQuery;
/** @param {*} value @returns {boolean} True for an object literal or `Object.create(null)` object. */
const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]'
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * Resolves whatever a caller passes as "an element" to one Element, or null. V1 accepted a selector string or an
 * Element; V2 also accepts a Document/DocumentFragment root, a jQuery collection and arrays/NodeLists (first Element wins).
 * @param {Element|Document|DocumentFragment|string|JQuery|ArrayLike<Element>|null|undefined} input - Element reference.
 * @param {ParentNode} [root=document] - Where selector strings are searched.
 * @returns {Element|Document|DocumentFragment|null}
 */
function resolveElement(input, root = document) {
    if (!input) return null;
    if (input instanceof Element || input instanceof Document || input instanceof DocumentFragment) return input;
    if (typeof input === 'string') return root.querySelector(input);
    if (isjQueryInstance(input) || Array.isArray(input) || isNodeList(input) || input instanceof HTMLCollection) {
        return Array.from(input).find((item) => item instanceof Element) ?? null;
    }
    return null;
}

/**
 * Resolves whatever a caller passes as "some elements" to an array of Elements (possibly empty). V1 accepted a
 * selector string, Element, NodeList or array; V2 also accepts an HTMLCollection, a jQuery collection, and arrays
 * that mix elements with selector strings.
 * @param {Element|string|JQuery|ArrayLike<Element>|Array<Element|string>|null|undefined} input - Element reference(s).
 * @param {ParentNode} [root=document] - Where selector strings are searched.
 * @returns {Element[]}
 */
function resolveElements(input, root = document) {
    if (!input) return [];
    if (typeof input === 'string') return Array.from(root.querySelectorAll(input));
    if (input instanceof Element) return [input];
    if (Array.isArray(input)) return input.flatMap((item) => resolveElements(item, root));
    if (isjQueryInstance(input) || isNodeList(input) || input instanceof HTMLCollection) {
        return Array.from(input).filter((item) => item instanceof Element);
    }
    return [];
}

/**
 * Wraps elements in a jQuery collection when jQuery is loaded. For compatibility shims only: V2 implementations
 * return native elements, and the old names that returned jQuery collections wrap their result with this so existing
 * callers can keep chaining jQuery methods until V3 removes the shims.
 * @param {Element|string|JQuery|ArrayLike<Element>|Array<Element|string>|null|undefined} input - Element reference(s).
 * @returns {JQuery|Element[]}
 */
function toJQuery(input) {
    const elements = resolveElements(input);
    return globalThis.jQuery ? globalThis.jQuery(elements) : elements;
}

/**
 * Finds an element by id, optionally scoped to a context element.
 * @param {string|number} id - Element id, with or without a leading `#`.
 * @param {Object} [options={}]
 * @param {Element|string} [options.context] - Element (or selector) to search within instead of the document.
 * @returns {Element|null}
 */
function getById(id, { context } = {}) {
    if (!id && id !== 0) return null;
    const root = context ? resolveElement(context) : document;
    if (!root) return null;
    const idText = String(id).replace(/^#/, '');
    return root === document ? document.getElementById(idText) : root.querySelector(`#${CSS.escape(idText)}`);
}

/**
 * Resolves the root element of a rendered Knack view (`#view_N.kn-view`), including the connection-form view
 * Knack renders for "add new" connection pop-ups.
 * @param {string|number|{key: string}|Element|JQuery} viewRef - View id (`12`, `'view_12'`), view object, or an element inside the view.
 * @returns {HTMLElement|null}
 */
function getViewRootElement(viewRef) {
    const directId = (typeof viewRef === 'string' || typeof viewRef === 'number') ? toViewId(viewRef) : '';
    const element = directId ? null : resolveElement(viewRef);
    const viewRoot = element?.closest('.kn-view, #connection-form-view');
    if (viewRoot instanceof HTMLElement) return viewRoot;

    const viewId = directId || toViewId(viewRef?.key || element?.id);
    if (!viewId) return null;

    const rendered = document.getElementById(viewId);
    if (rendered instanceof HTMLElement) return rendered;

    const connectionForm = document.getElementById('connection-form-view');
    return connectionForm?.querySelector(`input[value="${viewId}"]`) ? connectionForm : null;
}

/**
 * Resolves a Knack form field wrapper (`#kn-input-field_N`).
 * @param {string|number} fieldId - Field id with or without the `field_` prefix.
 * @param {ParentNode} [root=document] - Element to search within (usually a view root).
 * @returns {HTMLElement|null}
 */
function getFieldWrapper(fieldId, root = document) {
    const normalisedFieldId = toFieldId(fieldId);
    if (!normalisedFieldId) return null;
    const wrapper = (root ?? document).querySelector(`#kn-input-${normalisedFieldId}`);
    return wrapper instanceof HTMLElement ? wrapper : null;
}

/**
 * Injects a `<style>` element once per id. Calling again with different CSS updates it in place.
 * @param {string} id - Style element id.
 * @param {string} cssText - Stylesheet text.
 * @returns {HTMLStyleElement}
 */
function ensureStyle(id, cssText) {
    let style = document.getElementById(id);
    if (!(style instanceof HTMLStyleElement)) {
        style = document.createElement('style');
        style.id = id;
        document.head.append(style);
    }
    if (style.textContent !== cssText) style.textContent = cssText;
    return style;
}

/**
 * Dispatches a bubbling DOM event. jQuery binds handlers with `addEventListener`, so native dispatch also reaches
 * Knack's and Chosen's jQuery handlers; use this instead of `$(el).trigger()` in new code.
 * @param {Element|string|JQuery} target - Element to dispatch on.
 * @param {string} type - Event type, e.g. `'change'`, `'input'`, `'chosen:updated'`.
 * @param {*} [detail] - Optional payload; when given a CustomEvent is dispatched.
 * @returns {boolean} False when a listener cancelled the event, or when the target was not found.
 */
function fireEvent(target, type, detail) {
    const element = resolveElement(target);
    if (!element) return false;
    const event = detail === undefined ? new Event(type, { bubbles: true }) : new CustomEvent(type, { bubbles: true, detail });
    return element.dispatchEvent(event);
}

/**
 * Listens for a Knack lifecycle event such as `knack-view-render.view_12` or `knack-scene-render.any`. Knack fires
 * these through jQuery's `trigger`, which only reaches jQuery handlers, so this binds with jQuery on purpose.
 * @param {string} eventName - Knack event name including the `.view_N` / `.scene_N` / `.any` suffix.
 * @param {(event: JQuery.Event, ...args: any[]) => void} handler - Handler; Knack passes `(event, view|scene, data)`.
 * @returns {() => void} Function that removes the listener.
 */
function onKnackEvent(eventName, handler) {
    const $document = globalThis.jQuery(document);
    $document.on(eventName, handler);
    return () => $document.off(eventName, handler);
}

/**
 * Delays `func` until `wait` ms have passed without another call. Only the last call's arguments are used.
 * @param {Function} func - Function to debounce.
 * @param {number} wait - Quiet period in milliseconds.
 * @returns {(...args: any[]) => void}
 */
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Escapes plain text for safe interpolation into HTML markup.
 * @param {string} value - Raw text value to escape.
 * @returns {string} Escaped HTML-safe text.
 */
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapes a string for safe use inside CSS selectors.
 * @param {string} value - Raw selector fragment.
 * @returns {string} Escaped selector fragment.
 */
const cssEscape = (value) => CSS.escape(String(value));

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Element helpers (V1 lines 6968-7142, 7879-7893)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Returns the primary submit button of a Knack form view.
 * @param {string|number|{key: string}|Element} viewId - View reference accepted by {@link getViewRootElement}.
 * @returns {HTMLButtonElement|null}
 */
function getSubmitButton(viewId) {
    const button = getViewRootElement(viewId)?.querySelector('.kn-submit button.kn-button.is-primary[type="submit"]');
    return button instanceof HTMLButtonElement ? button : null;
}

/**
 * Extracts `{id, identifier}` from a Knack connection value (`field_N_raw`).
 * @param {Array|Object|null|undefined} value - Connection field value.
 * @returns {{id: string, identifier: string}|null}
 */
const getConnectionRef = (value) => knackValueResolver.toConnectionRef(value);

/**
 * Reads a finite number from an input's value.
 * @param {string|Element|JQuery} selOrEl - Selector, element (anything with a `value` property) or jQuery collection.
 * @param {boolean} [stripNonNumeric=false] - Remove everything except digits, `.`, `+` and `-` before parsing.
 * @returns {number} The number, or NaN when the element is missing or the value is not finite.
 */
function getNumericValue(selOrEl, stripNonNumeric = false) {
    const element = typeof selOrEl === 'string' || isjQueryInstance(selOrEl) ? resolveElement(selOrEl) : selOrEl;
    if (!element || typeof element !== 'object' || !('value' in element)) return NaN;
    const raw = String(element.value ?? '').trim();
    const number = Number(stripNonNumeric ? raw.replace(/[^\d.+-]/g, '') : raw);
    return Number.isFinite(number) ? number : NaN;
}

/**
 * Shows or hides elements with inline `display: none`.
 * @param {Element|NodeList|string|Array|JQuery} elements - Element reference(s) accepted by {@link resolveElements}.
 * @param {boolean} show - True to show, false to hide.
 */
function setVisibility(elements, show) {
    for (const element of resolveElements(elements)) element.style.display = show ? '' : 'none';
}

/**
 * Shows elements when `condition` is (or returns) truthy, otherwise hides them.
 * @param {Element|NodeList|string|Array|JQuery} elements - Element reference(s).
 * @param {Function|boolean} condition - Boolean or a function returning one.
 */
function showIf(elements, condition) {
    setVisibility(elements, Boolean(typeof condition === 'function' ? condition() : condition));
}

/**
 * Toggles elements' visibility. Without a condition each element flips its current inline state.
 * @param {Element|NodeList|string|Array|JQuery} elements - Element reference(s).
 * @param {Function|boolean} [condition] - Forces the shown state when given.
 */
function toggleVisibility(elements, condition) {
    for (const element of resolveElements(elements)) {
        const show = condition === undefined
            ? element.style.display === 'none'
            : Boolean(typeof condition === 'function' ? condition() : condition);
        element.style.display = show ? '' : 'none';
    }
}

/**
 * Fades out and removes a Knack form confirmation block after a delay, once per block.
 * @param {Element|string|null} viewElement - Form view root (or selector) that may contain `.kn-form-confirmation`.
 * @param {Object} [options={}]
 * @param {number} [options.delayMs=7000] - Total time before the block is removed.
 * @param {number} [options.fadeDurationMs=500] - Length of the opacity transition.
 */
function fadeFormConfirmation(viewElement, options = {}) {
    const confirmation = resolveElement(viewElement)?.querySelector('.kn-form-confirmation');
    if (!confirmation || confirmation.dataset.formConfirmationFadeScheduled === 'true') return;
    confirmation.dataset.formConfirmationFadeScheduled = 'true';

    const delayMs = Math.max(0, Number(options.delayMs ?? 7000) || 7000);
    const fadeDurationMs = Math.max(100, Number(options.fadeDurationMs ?? 500) || 500);
    confirmation.style.opacity = '1';
    confirmation.style.transition = `opacity ${fadeDurationMs}ms ease`;

    setTimeout(() => {
        if (!confirmation.isConnected) return;
        confirmation.style.pointerEvents = 'none';
        confirmation.style.opacity = '0';
    }, Math.max(0, delayMs - fadeDurationMs));
    setTimeout(() => confirmation.isConnected && confirmation.remove(), delayMs);
}

/**
 * Finds the first element matching `selector` whose trimmed text equals (or contains) `text`.
 * @param {string} selector - CSS selector to search.
 * @param {string} text - Text to match.
 * @param {boolean} [exact=true] - Exact match when true, substring match when false.
 * @returns {Element|undefined}
 */
function getElementByText(selector, text, exact = true) {
    return resolveElements(selector).find((element) => {
        const content = element.textContent.trim();
        return exact ? content === text : content.includes(text);
    });
}

/**
 * Selects an input's whole value when it receives focus, for every matching input in a view.
 * @param {string|number|Element} viewId - View reference accepted by {@link getViewRootElement}.
 * @param {string} [selector='.kn-input-number input'] - Inputs to enhance, relative to the view root.
 */
function selectTextOnFocus(viewId, selector = '.kn-input-number input') {
    getViewRootElement(viewId)?.querySelectorAll(selector).forEach((input) => {
        input.addEventListener('focus', () => setTimeout(() => input.select(), 0));
    });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: form-field-utils
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: grid-form-helpers
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Compatibility shims (deprecated names kept for existing callers; remove in V3)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Curried operator helper from V1 (`evaluate(a)('<')(b)`).
 * @deprecated Use the JavaScript operator directly; kept so existing page code keeps working.
 * @param {*} a - Left operand.
 * @returns {(operator: string) => (b: *) => *} Applies `operator` to `a` and `b`; `'Invalid operation'` for unknown operators.
 */
const evaluate = (a) => (operator) => (b) => {
    warnDeprecated('evaluate', 'the JavaScript operator directly');
    const operations = {
        '+': () => a + b, '-': () => a - b, '/': () => a / b, '*': () => a * b, '%': () => a % b,
        '>': () => a > b, '>=': () => a >= b, '<': () => a < b, '<=': () => a <= b,
        '==': () => a == b, '===': () => a === b, '!=': () => a != b, '!==': () => a !== b,
    };
    return operations[operator] ? operations[operator]() : 'Invalid operation';
};

// jQuery pseudo-selector `:textEquals(text)` from V1: exact trimmed-text match ignoring Knack's required marker (*).
// Prefer getElementByText() in new code.
if (globalThis.jQuery?.expr?.[':']) {
    globalThis.jQuery.expr[':'].textEquals = (element, _index, match) => element.textContent.replace('*', '').trim() === match[3];
}

/**
 * @deprecated Use addClasses(), which returns native elements. Kept for callers that chain jQuery on the result.
 * @param {string|Element|NodeList|JQuery|Array} selector - Element reference(s).
 * @param {string|string[]} classes - Class names to add.
 * @returns {JQuery|undefined} jQuery collection (undefined when given an array, as in V1).
 */
function addClassToSelector(selector, classes) {
    warnDeprecated('addClassToSelector', 'addClasses()');
    const elements = addClasses(selector, classes);
    return Array.isArray(selector) ? undefined : toJQuery(elements);
}

/**
 * @deprecated Use removeClasses(), which returns native elements. Kept for callers that chain jQuery on the result.
 * @param {string|Element|NodeList|JQuery|Array} selector - Element reference(s).
 * @param {string|string[]} classes - Class names to remove.
 * @returns {JQuery|undefined} jQuery collection (undefined when given an array, as in V1).
 */
function removeClassFromSelector(selector, classes) {
    warnDeprecated('removeClassFromSelector', 'removeClasses()');
    const elements = removeClasses(selector, classes);
    return Array.isArray(selector) ? undefined : toJQuery(elements);
}

/**
 * @deprecated Use getCheckedRowElements(), which returns native rows.
 * @param {string} viewId - View id.
 * @returns {JQuery[]} One jQuery-wrapped row per checked checkbox.
 */
function getCheckedRows(viewId) {
    warnDeprecated('getCheckedRows', 'getCheckedRowElements()');
    return getCheckedRowElements(viewId).map((row) => toJQuery(row));
}

/**
 * @deprecated Use getTextAreas(), which returns native elements.
 * @param {string} viewId - View id.
 * @returns {JQuery} jQuery collection of the view's textareas.
 */
function getTextArea(viewId) {
    warnDeprecated('getTextArea', 'getTextAreas()');
    return toJQuery(getTextAreas(viewId));
}

/**
 * @deprecated Use getTableRowElements(), whose callback receives the native row.
 * @param {string} viewId - View id.
 * @param {(index: number, row: JQuery) => void} callback - Receives the index and the jQuery-wrapped row.
 * @param {boolean} [includeHeader=false] - Include `thead` rows.
 * @param {boolean} [includeGroup=false] - Include group rows.
 */
function getTableRows(viewId, callback, includeHeader = false, includeGroup = false) {
    warnDeprecated('getTableRows', 'getTableRowElements()');
    getTableRowElements(viewId, (index, row) => callback(index, toJQuery(row)), includeHeader, includeGroup);
}



// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Not yet ported (kept here so the globals list stays complete; each line is removed as its item lands)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Format: TODO(v2-wave-N): globalName  - tests/v2/v2-structure.test.cjs reads these lines.

// Wave 1
// TODO(v2-wave-1): KnackNavigator
// TODO(v2-wave-1): knackNavigator
// TODO(v2-wave-1): createBulkActionStorageAdapter
// TODO(v2-wave-1): renderVersionIndicator
// TODO(v2-wave-1): bulkActionResolveElement
// TODO(v2-wave-1): bulkActionFindViewRoot
// TODO(v2-wave-1): getViewMountElement
// TODO(v2-wave-1): bulkActionIsPlainObject
// TODO(v2-wave-1): bulkActionObjectOrEmpty
// TODO(v2-wave-1): disableCellsByColHead
// TODO(v2-wave-1): isInOfficeHours
// TODO(v2-wave-1): extractPostcode
// TODO(v2-wave-1): normaliseUkPostcode
// TODO(v2-wave-1): validateUkMobileNumber
// TODO(v2-wave-1): fileViewer
// TODO(v2-wave-1): showNotification
// TODO(v2-wave-1): normaliseInputs
// TODO(v2-wave-1): clearInput
// TODO(v2-wave-1): resetSelectToFirstOption
// TODO(v2-wave-1): toggleCheckboxOption
// TODO(v2-wave-1): changeRadioButtonLabel
// TODO(v2-wave-1): setupFieldStatus
// TODO(v2-wave-1): removeNull
// TODO(v2-wave-1): selectFromSelect
// TODO(v2-wave-1): selectFromConx
// TODO(v2-wave-1): addPlaceholderToInput
// TODO(v2-wave-1): waitGetValueFromDetail
// TODO(v2-wave-1): getValueFromDetail
// TODO(v2-wave-1): insertValFromDetail
// TODO(v2-wave-1): insertLoggedInUser
// TODO(v2-wave-1): borderRadiusLastVisible
// TODO(v2-wave-1): openFileFromBtn
// TODO(v2-wave-1): handleRedirect
// TODO(v2-wave-1): getNewURL
// TODO(v2-wave-1): getBackgroundSceneId
// TODO(v2-wave-1): isSceneToIgnore
// TODO(v2-wave-1): isUserRole
// TODO(v2-wave-1): isUserName
// TODO(v2-wave-1): replaceLargeNo
// TODO(v2-wave-1): normaliseToElement
// TODO(v2-wave-1): getCurrentSceneInfo
// TODO(v2-wave-1): getIdFromElement
// TODO(v2-wave-1): getConnectionIdFromHtml
// TODO(v2-wave-1): getRecordID
// TODO(v2-wave-1): getIdBeforeSceneSlug
// TODO(v2-wave-1): showPopUpNotification
// TODO(v2-wave-1): sanitiseURL
// TODO(v2-wave-1): initSecureStorage
// TODO(v2-wave-1): setSecureStorage
// TODO(v2-wave-1): getSecureStorage
// TODO(v2-wave-1): checkAllRadioAnswered
// TODO(v2-wave-1): changeCellTextBasedOnCellContent
// TODO(v2-wave-1): toggleElements
// TODO(v2-wave-1): getFormId
// TODO(v2-wave-1): splitAndTrimField
// TODO(v2-wave-1): syncTextInputs
// TODO(v2-wave-1): createButton
// TODO(v2-wave-1): capitaliseInput
// TODO(v2-wave-1): capitaliseString
// TODO(v2-wave-1): waitGetConxIdFromDetailId
// TODO(v2-wave-1): createDropdownHTML
// TODO(v2-wave-1): OFFICE_EXTENSIONS
// TODO(v2-wave-1): IMAGE_EXTENSIONS
// TODO(v2-wave-1): buildKnackAssetInfo
// TODO(v2-wave-1): updateLinksAndAssets
// TODO(v2-wave-1): insertStaffName
// TODO(v2-wave-1): copyViewBodyToClipboard
// TODO(v2-wave-1): updateLabelText
// TODO(v2-wave-1): idleWatchDogTimeout
// TODO(v2-wave-1): showConfirmationDialog
// TODO(v2-wave-1): setViewMaxWidth
// TODO(v2-wave-1): hideEmptyFields
// TODO(v2-wave-1): hideElementsByValue
// TODO(v2-wave-1): getRedirectToPopUpConfig
// TODO(v2-wave-1): bindRedirectToPopUpCloseButtons
// TODO(v2-wave-1): redirectToPopUp

// Wave 2
// TODO(v2-wave-2): KTL_BULK_EDIT_SELECTION_STYLE_ID
// TODO(v2-wave-2): KTL_BULK_EDIT_ROW_MARKER_CLASS
// TODO(v2-wave-2): ktlBulkEditRowColorObservers
// TODO(v2-wave-2): ktlBulkEditSelectionCssText
// TODO(v2-wave-2): ensureBulkEditSelectionStyles
// TODO(v2-wave-2): preserveBulkEditSelectedRowColors
// TODO(v2-wave-2): replicateBulkActionSubmittedRecord
// TODO(v2-wave-2): registerBulkActionFormReplicateWorkflow
// TODO(v2-wave-2): mountBulkActionGrid
// TODO(v2-wave-2): mountBulkActionKeyword
// TODO(v2-wave-2): processBulkActionsKeyword
// TODO(v2-wave-2): createKnackBulkActions
// TODO(v2-wave-2): KnackBulkActions
// TODO(v2-wave-2): QuillEditor
// TODO(v2-wave-2): initializeQuillIcons
// TODO(v2-wave-2): QuillModal
// TODO(v2-wave-2): createQuillModules
// TODO(v2-wave-2): replaceKnackRichTextWithQuillEditor
// TODO(v2-wave-2): preventKtlLongPressRefresh
// TODO(v2-wave-2): gridTruncationControllers
// TODO(v2-wave-2): gridTruncationCells
// TODO(v2-wave-2): truncateColumnsInGrid
// TODO(v2-wave-2): renderGridTruncation
// TODO(v2-wave-2): addInputEventListener
// TODO(v2-wave-2): attachNativeDateInputPicker
// TODO(v2-wave-2): attachTimePicker
// TODO(v2-wave-2): enhanceDateTimePicker
// TODO(v2-wave-2): waitSelector
// TODO(v2-wave-2): updateOptions
// TODO(v2-wave-2): getValueFromDetailBody
// TODO(v2-wave-2): getIndexOfColumnHeader
// TODO(v2-wave-2): getAllTableRows
// TODO(v2-wave-2): getSceneFromViewId
// TODO(v2-wave-2): normaliseText
// TODO(v2-wave-2): recordHasValue
// TODO(v2-wave-2): applyMenuLinkFilters
// TODO(v2-wave-2): ensureMenuButtonActiveStyles
// TODO(v2-wave-2): renderMenuButtons
// TODO(v2-wave-2): updateButtonColourOnFormComplete
// TODO(v2-wave-2): escapeHTML
// TODO(v2-wave-2): renderInteractiveTable
// TODO(v2-wave-2): copyTextToClipboard
// TODO(v2-wave-2): addCopyToDetails
// TODO(v2-wave-2): setupClickToCopy
// TODO(v2-wave-2): getWeekCommencingDate
// TODO(v2-wave-2): scheduleDailyRefresh
// TODO(v2-wave-2): getCurrentYear
// TODO(v2-wave-2): constructList
// TODO(v2-wave-2): csvToArray
// TODO(v2-wave-2): startsWithVowel
// TODO(v2-wave-2): onInputChange
// TODO(v2-wave-2): toggleMessage
// TODO(v2-wave-2): mapDateToRange
// TODO(v2-wave-2): parseDateObject
// TODO(v2-wave-2): getDateTimeParts
// TODO(v2-wave-2): setDateTimeParts
// TODO(v2-wave-2): getCalendarFromToParts
// TODO(v2-wave-2): setCalendarFromToParts
// TODO(v2-wave-2): parseDateTimeParts
// TODO(v2-wave-2): parseFromToDate
// TODO(v2-wave-2): formatDateTimeParts
// TODO(v2-wave-2): getOffsetDateUK
// TODO(v2-wave-2): getDateUKFormat
// TODO(v2-wave-2): formatTime
// TODO(v2-wave-2): getWeekdayName
// TODO(v2-wave-2): formatCurrency
// TODO(v2-wave-2): getEndOfDayIso
// TODO(v2-wave-2): getWeeksAgoDate
// TODO(v2-wave-2): getArrayOfWeekNumbersAndFields
// TODO(v2-wave-2): getWeekNumber
// TODO(v2-wave-2): updateWeekNumberObject
// TODO(v2-wave-2): createFilterForWeekObj
// TODO(v2-wave-2): showRelevantWeeks
// TODO(v2-wave-2): compareAge
// TODO(v2-wave-2): addConxDetailsToList
// TODO(v2-wave-2): mapFieldsToView
// TODO(v2-wave-2): MULTI_FORM_CONFIG
// TODO(v2-wave-2): MultiFormSubmissionCoordinator
// TODO(v2-wave-2): setupAutoFormSubmission
// TODO(v2-wave-2): addConnectionIdToRecord
// TODO(v2-wave-2): hideEmptyGridColumns
// TODO(v2-wave-2): setupLocalStorageMinutes
// TODO(v2-wave-2): reloadMinutes
// TODO(v2-wave-2): showHideGroup
// TODO(v2-wave-2): wrapContentForShowHideGroup
// TODO(v2-wave-2): showHideViewGroupContent
// TODO(v2-wave-2): addCheckboxes
// TODO(v2-wave-2): addCheckboxesToHeaders
// TODO(v2-wave-2): isElementVisible
// TODO(v2-wave-2): isInputEmpty
// TODO(v2-wave-2): replaceValueInTD
// TODO(v2-wave-2): triggerWebhook
// TODO(v2-wave-2): getNestedValue
// TODO(v2-wave-2): removeHtml
// TODO(v2-wave-2): removeHtmlWithFormatting
// TODO(v2-wave-2): findElementByText
// TODO(v2-wave-2): getSelectedRadioValue
// TODO(v2-wave-2): getSelectedValue
// TODO(v2-wave-2): getFormFieldDisplayValue
// TODO(v2-wave-2): getFormFieldCheckboxValues
// TODO(v2-wave-2): elementHasMeaningfulValue
// TODO(v2-wave-2): hiddenInputHasMeaningfulValue
// TODO(v2-wave-2): fieldWrapperHasValue
// TODO(v2-wave-2): initialiseConditionalRequiredFieldVisibility
// TODO(v2-wave-2): showHideMsgBasedOnSelect
// TODO(v2-wave-2): showHideMsgBasedOnRadios
// TODO(v2-wave-2): changeToSlider
// TODO(v2-wave-2): toggleShowHideViewContent
// TODO(v2-wave-2): shrinkContent
// TODO(v2-wave-2): showHideViewContent
// TODO(v2-wave-2): appendShrinkLink
// TODO(v2-wave-2): replaceTitleWithButton
// TODO(v2-wave-2): wrapContentForShowHide
// TODO(v2-wave-2): addModalNavigationButtons
// TODO(v2-wave-2): fileCarouselState
// TODO(v2-wave-2): ensureFileCarouselOverlay
// TODO(v2-wave-2): forceDownloadFile
// TODO(v2-wave-2): formatFileSizeBytes
// TODO(v2-wave-2): fetchFileSizeBytes
// TODO(v2-wave-2): preloadFileCarouselImage
// TODO(v2-wave-2): showFileCarouselFallback
// TODO(v2-wave-2): renderFileCarouselItem
// TODO(v2-wave-2): navigateFileCarousel
// TODO(v2-wave-2): onFileCarouselPopState
// TODO(v2-wave-2): openFileCarousel
// TODO(v2-wave-2): closeFileCarousel
// TODO(v2-wave-2): initFileCarousel
// TODO(v2-wave-2): buttonToUrl
// TODO(v2-wave-2): caQuickToggle
// TODO(v2-wave-2): caMultiChoiceQuickToggle
// TODO(v2-wave-2): CAQuickToggle
// TODO(v2-wave-2): CAMultiChoiceQuickToggle
// TODO(v2-wave-2): getBankHolidayWeekendRange
// TODO(v2-wave-2): getGovBankHolidays

// Wave 3
// TODO(v2-wave-3): KnackValueResolver
// TODO(v2-wave-3): knackValueResolver
// TODO(v2-wave-3): bulkActionUniqueStrings
// TODO(v2-wave-3): bulkActionResolveRegistryCallback
// TODO(v2-wave-3): classifyBulkActionFailure
// TODO(v2-wave-3): createBulkActionSessionStorageAdapter
// TODO(v2-wave-3): createVersionRefreshController
// TODO(v2-wave-3): resolveDefaultBulkActionAppId
// TODO(v2-wave-3): resolveBulkActionFieldId
// TODO(v2-wave-3): parseBulkActionDefinition
// TODO(v2-wave-3): normalizeBulkActionKeywordGroupsInput
// TODO(v2-wave-3): parseBulkActionKeywordGroups
// TODO(v2-wave-3): bulkActionNormaliseLabelText
// TODO(v2-wave-3): bulkActionNormalizeBasketItems
// TODO(v2-wave-3): BULK_ACTION_DEFAULT_CONFIG
// TODO(v2-wave-3): createBulkActionConfig
// TODO(v2-wave-3): mergeBulkActionConfig
// TODO(v2-wave-3): createBulkActionBasketStore
// TODO(v2-wave-3): createBulkActionRunner
// TODO(v2-wave-3): bulkActionControllerStore
// TODO(v2-wave-3): bulkActionWorkflowRegistry
// TODO(v2-wave-3): bulkActionControllerLifecycleBound
// TODO(v2-wave-3): bulkActionSyncControllerVisibility
// TODO(v2-wave-3): ensureBulkActionControllerLifecycleBinding
// TODO(v2-wave-3): bulkActionGetRowCheckboxRecordId
// TODO(v2-wave-3): bulkActionIsSelectableGridDataRow
// TODO(v2-wave-3): bulkActionGetSelectableRowCheckboxes
// TODO(v2-wave-3): bulkActionRemoveNonSelectableRowCheckboxes
// TODO(v2-wave-3): bulkActionBuildFormFlowSessionKey
// TODO(v2-wave-3): bulkActionReadFormFlowState
// TODO(v2-wave-3): bulkActionWriteFormFlowState
// TODO(v2-wave-3): bulkActionMergeFormFlowState
// TODO(v2-wave-3): bulkActionClearFormFlowState
// TODO(v2-wave-3): bulkActionResetPendingFormFlow
// TODO(v2-wave-3): handleModalClosed
// TODO(v2-wave-3): bulkActionCloseModalIfOpen
// TODO(v2-wave-3): bulkActionGetHashQueryParam
// TODO(v2-wave-3): bulkActionGetCurrentHashState
// TODO(v2-wave-3): bulkActionRestoreHashState
// TODO(v2-wave-3): bulkActionMakeToken
// TODO(v2-wave-3): bulkActionBuildHash
// TODO(v2-wave-3): bulkActionNavigateToSceneSlug
// TODO(v2-wave-3): bulkActionSetChosenSelectValue
// TODO(v2-wave-3): bulkActionRenderFormNotice
// TODO(v2-wave-3): bulkActionResolveViewContext
// TODO(v2-wave-3): bulkActionNormalizeFieldKeys
// TODO(v2-wave-3): bulkActionCreateRunState
// TODO(v2-wave-3): bulkActionSummarizeRunState
// TODO(v2-wave-3): bulkActionHasBatchWriteApi
// TODO(v2-wave-3): bulkActionResolveReplicationApi
// TODO(v2-wave-3): bulkActionPrepareReplicateOperations
// TODO(v2-wave-3): bulkActionInvokeSuccessCallback
// TODO(v2-wave-3): bulkActionReplicateFallback
// TODO(v2-wave-3): bulkActionGetFormFieldKeys
// TODO(v2-wave-3): bulkActionGetEmptyRequestValue
// TODO(v2-wave-3): bulkActionGetRenderedFormRecord
// TODO(v2-wave-3): bulkActionBuildSubmitEventRecordPayload
// TODO(v2-wave-3): bulkActionBuildDynamicRequestPayload
// TODO(v2-wave-3): bulkActionBuildReplicateBasePayload
// TODO(v2-wave-3): bulkActionResolveConnectionFieldRecordId
// TODO(v2-wave-3): bulkActionNotify
// TODO(v2-wave-3): bulkActionLog
// TODO(v2-wave-3): bulkActionReportError
// TODO(v2-wave-3): bulkActionMergeStyleMaps
// TODO(v2-wave-3): bulkActionGetBaseCssText
// TODO(v2-wave-3): ensureBulkActionBaseStyles
// TODO(v2-wave-3): bulkActionBuildButtonId
// TODO(v2-wave-3): bulkActionCreateButton
// TODO(v2-wave-3): BulkActionModal
// TODO(v2-wave-3): ensureBulkActionCheckboxes
// TODO(v2-wave-3): bulkActionMountToolbarGroup
// TODO(v2-wave-3): BulkActionGridController
// TODO(v2-wave-3): KnackAPI
// TODO(v2-wave-3): getKnackApiClient
// TODO(v2-wave-3): resolveKnackApiUsageClient
// TODO(v2-wave-3): KnackApiUsage
// TODO(v2-wave-3): KnackError
