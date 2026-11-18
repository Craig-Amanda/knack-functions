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
    const directId = (typeof viewRef === 'string' || typeof viewRef === 'number') ? knackNavigator.normalizeViewId(viewRef) : '';
    const element = directId ? null : resolveElement(viewRef);
    const viewRoot = element?.closest('.kn-view, #connection-form-view');
    if (viewRoot instanceof HTMLElement) return viewRoot;

    const viewId = directId || knackNavigator.normalizeViewId(viewRef?.key || element?.id);
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
    const normalisedFieldId = knackNavigator.normalizeFieldId(fieldId);
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
