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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: navigator
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// KnackNavigator: V1 lines 36-797 ported as-is (analysis C02: no signature change). Every V2 function resolves view, field and scene ids through knackNavigator.
/**
 * Lightweight Knack metadata navigator.
 * Provides view and field metadata lookups with memoization.
 */
class KnackNavigator {
    /**
     * Creates a navigator with memoized view and field caches.
     */
    constructor() {
        this._viewCache = new Map();
        this._sceneInfoCache = new Map();
        this._fieldIdByViewLabelCache = new Map();
        this._fieldIdByViewHeaderCache = new Map();
        this._viewHeaderByFieldIdCache = new Map();
        this._viewColumnIndexCache = new Map();
        this._viewColumnSelectorCache = new Map();
        this._fieldMetaCache = new Map();
        this._fieldChoiceOptionsCache = new Map();
    }

    /**
     * Normalises an id to the expected prefixed Knack format.
     * @param {string|number} value - Id value with or without the prefix.
     * @param {string} prefix - Expected prefix, such as `view_` or `field_`.
     * @returns {string} Normalised id, or an empty string.
     */
    normalizePrefixedId(value, prefix) {
        const text = String(value ?? '').trim().toLowerCase();
        const digits = text.startsWith(prefix) ? text.slice(prefix.length) : text;
        return /^\d+$/.test(digits) ? `${prefix}${digits}` : '';
    }

    /**
     * Normalises a view id.
     * @param {string|number} viewId - View id with or without the `view_` prefix.
     * @returns {string} Normalised view id.
     */
    normalizeViewId(viewId) {
        return this.normalizePrefixedId(viewId, 'view_');
    }

    /**
     * Normalises a field id.
     * @param {string|number} fieldId - Field id with or without the `field_` prefix.
     * @returns {string} Normalised field id.
     */
    normalizeFieldId(fieldId) {
        return this.normalizePrefixedId(fieldId, 'field_');
    }

    /**
     * Normalises every field reference in a field map.
     * @param {Object} [fieldMap={}] - Field map keyed by logical names.
     * @returns {Object} Field map with normalised field ids.
     */
    normalizeFieldMap(fieldMap = {}) {
        return this.#mapValues(fieldMap, (fieldValue) => this.normalizeFieldId(fieldValue));
    }

    /**
     * Normalises every field reference in a field map to its `_raw` companion key.
     * @param {Object} [fieldMap={}] - Field map keyed by logical names.
     * @returns {Object} Field map with normalised raw field ids.
     */
    normalizeRawFieldMap(fieldMap = {}) {
        return this.#mapValues(fieldMap, (fieldValue) => this.normalizeRawFieldId(fieldValue));
    }

    /**
     * Normalises every view reference in a view map.
     * @param {Object} [viewMap={}] - View map keyed by logical names where each value is a view id or array of view ids.
     * @returns {Object} View map with normalised view ids (string or array).
     */
    normaliseViewMap(viewMap = {}) {
        // Arrays collapse to their first valid id.
        return this.#mapValues(viewMap, (value) => (Array.isArray(value) ? value : [value])
            .map((item) => this.normalizeViewId(item)).find(Boolean) ?? '');
    }

    /**
     * Maps every value of a plain object, keeping the keys.
     * @param {Object} map - Source map (null/undefined become an empty map).
     * @param {Function} mapper - Receives each value.
     * @returns {Object}
     */
    #mapValues(map, mapper) {
        return Object.fromEntries(Object.entries(map || {}).map(([key, value]) => [key, mapper(value)]));
    }

    /**
     * Returns the DOM wrapper for a Knack field inside a view.
     * @param {Element} viewRoot - Root element for the view.
     * @param {string|number} fieldId - Field id to resolve.
     * @returns {Element|null} Field wrapper element.
     */
    getFieldWrapper(viewRoot, fieldId) {
        return viewRoot instanceof Element ? getFieldWrapper(fieldId, viewRoot) : null;
    }

    /**
     * Normalises a field id to its `_raw` companion key.
     * @param {string|number} fieldId - Field id to normalise.
     * @returns {string} Raw field id.
     */
    normalizeRawFieldId(fieldId) {
        const normalized = this.normalizeFieldId(fieldId);
        return normalized ? `${normalized}_raw` : '';
    }

    /**
     * Normalises a scene id.
     * @param {string|number} sceneId - Scene id with or without the `scene_` prefix.
     * @returns {string} Normalised scene id.
     */
    normalizeSceneId(sceneId) {
        return this.normalizePrefixedId(sceneId, 'scene_');
    }

    /**
     * Resolves the Knack view metadata object for a view id.
     * @param {string|number} viewId - View id to resolve.
     * @returns {Object|null} Knack view metadata.
     */
    getViewObject(viewId) {
        const vid = this.normalizeViewId(viewId);
        if (!vid) return null;
        if (this._viewCache.has(vid)) return this._viewCache.get(vid);

        const found = globalThis.Knack?.views?.[vid]?.model?.view
            || (globalThis.Knack?.scenes?.models || [])
                .flatMap((scene) => scene?.views?.models || [])
                .find((viewModel) => viewModel?.attributes?.key === vid)?.attributes;

        // Only hits are cached: a view asked for before it renders must still be found once it has.
        if (!found) return null;
        this._viewCache.set(vid, found);
        return found;
    }

    /**
     * Checks whether a Knack view uses an object, optionally requiring a view type and scene.
     * @param {string|number} viewId - View id to inspect.
     * @param {string|number} objectKey - Object key with or without the `object_` prefix.
     * @param {{viewType?: string, sceneId?: string|number}} [options={}] - Optional Knack view type and scene to require.
     * @returns {boolean} Whether the view uses the requested object, type, and scene.
     */
    isViewForObject(viewId, objectKey, options = {}) {
        const normalisedObjectKey = this.normalizePrefixedId(objectKey, 'object_');
        if (!normalisedObjectKey) return false;

        const viewObject = this.getViewObject(viewId);
        const requestedViewType = String(options?.viewType || '').trim().toLowerCase();
        const requestedSceneValue = String(options?.sceneId ?? '').trim();
        const requestedSceneId = this.normalizeSceneId(requestedSceneValue);
        if (requestedSceneValue && !requestedSceneId) return false;

        return viewObject?.source?.object === normalisedObjectKey
            && (!requestedViewType || String(viewObject?.type || '').toLowerCase() === requestedViewType)
            && (!requestedSceneId || this.getSceneInfoForView(viewId)?.key === requestedSceneId);
    }

    /**
     * Finds the first currently rendered view for an object, optionally filtered by view type and scene.
     * @param {string|number} objectKey - Object key with or without the `object_` prefix.
     * @param {{viewType?: string, sceneId?: string|number}} [options={}] - Optional Knack view type and scene to require.
     * @returns {string} Matching view id, or an empty string.
     */
    findRenderedViewIdForObject(objectKey, options = {}) {
        if (typeof document === 'undefined') return '';

        const requestedSceneValue = String(options?.sceneId ?? '').trim();
        const requestedSceneId = this.normalizeSceneId(requestedSceneValue);
        if (requestedSceneValue && !requestedSceneId) return '';

        const searchRoot = requestedSceneId
            ? document.getElementById(`kn-${requestedSceneId}`)
            : document;
        if (!searchRoot) return '';

        const renderedViewElements = searchRoot.querySelectorAll('[id^="view_"]');
        return Array.from(renderedViewElements)
            .map((viewElement) => this.normalizeViewId(viewElement.id))
            .find((viewId) => this.isViewForObject(viewId, objectKey, options)) || '';
    }

    /**
     * Returns normalised field ids declared on a view.
     * @param {string|number} viewId - View id to inspect.
     * @returns {Array<string>} View field ids.
     */
    getViewFieldIds(viewId) {
        const viewObject = this.getViewObject(viewId);
        const fields = Array.isArray(viewObject?.fields) ? viewObject.fields : [];

        return Array.from(new Set(
            fields
                .map((field) => this.normalizeFieldId(field?.key || ''))
                .filter(Boolean)
        ));
    }

    /**
     * Returns column metadata declared on a view.
     * @param {string|number} viewId - View id to inspect.
     * @returns {Array<Object>} View columns.
     */
    getViewColumns(viewId) {
        const viewObject = this.getViewObject(viewId);
        return Array.isArray(viewObject?.columns) ? viewObject.columns : [];
    }

    /**
     * Normalises a view column header for case-insensitive comparisons.
     * @param {string} headerText - Raw column header text, possibly containing HTML.
     * @returns {string} Normalised header text.
     */
    normalizeViewColumnHeader(headerText) {
        return String(headerText || '')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /**
     * Resolves a view column by field id, header text, or column-like object.
     * @param {string|number} viewId - View id to inspect.
     * @param {string|number|Object} columnRef - Field id, header text, or column metadata.
     * @returns {Object|null} Matching view column metadata.
     */
    getViewColumn(viewId, columnRef) {
        const columns = this.getViewColumns(viewId);
        if (!columns.length || !columnRef) return null;

        if (typeof columnRef === 'object') {
            const normalizedFieldId = this.normalizeFieldId(columnRef?.field?.key || columnRef?.id || '');
            const normalizedHeader = this.normalizeViewColumnHeader(columnRef?.header || '');

            return columns.find((column) => {
                const columnFieldId = this.normalizeFieldId(column?.field?.key || column?.id || '');
                const columnHeader = this.normalizeViewColumnHeader(column?.header || '');
                return (normalizedFieldId && columnFieldId === normalizedFieldId)
                    || (normalizedHeader && columnHeader === normalizedHeader);
            }) || null;
        }

        const normalizedFieldId = this.normalizeFieldId(columnRef);
        if (normalizedFieldId) {
            const fieldMatch = columns.find((column) => {
                return this.normalizeFieldId(column?.field?.key || column?.id || '') === normalizedFieldId;
            });
            if (fieldMatch) return fieldMatch;
        }

        const normalizedHeader = this.normalizeViewColumnHeader(columnRef);
        if (!normalizedHeader) return null;

        return columns.find((column) => {
            return this.normalizeViewColumnHeader(column?.header || '') === normalizedHeader;
        }) || null;
    }

    /**
     * Resolves a view column field id from column header text.
     * @param {string|number} viewId - View id to inspect.
     * @param {string} headerText - Column header text to resolve.
     * @returns {string} Matching field id, or an empty string.
     */
    getFieldIdFromHeader(viewId, headerText) {
        const normalizedViewId = this.normalizeViewId(viewId);
        const normalizedHeader = this.normalizeViewColumnHeader(headerText);
        if (!normalizedViewId || !normalizedHeader) return '';

        const cacheKey = `${normalizedViewId}::${normalizedHeader}`;
        if (this._fieldIdByViewHeaderCache.has(cacheKey)) {
            return this._fieldIdByViewHeaderCache.get(cacheKey);
        }

        const column = this.getViewColumn(normalizedViewId, normalizedHeader);
        const resolvedFieldId = this.normalizeFieldId(column?.field?.key || column?.id || '');
        this._fieldIdByViewHeaderCache.set(cacheKey, resolvedFieldId);
        return resolvedFieldId;
    }

    /**
     * Resolves the configured column header text for a field id on a view.
     * @param {string|number} viewId - View id to inspect.
     * @param {string|number} fieldId - Field id to resolve.
     * @param {{ normalized?: boolean }} [options={}] - When true, returns a normalised plain-text header.
     * @returns {string} Matching header text, or an empty string.
     */
    getHeaderFromFieldId(viewId, fieldId, options = {}) {
        const normalizedViewId = this.normalizeViewId(viewId);
        const normalizedFieldId = this.normalizeFieldId(fieldId);
        if (!normalizedViewId || !normalizedFieldId) return '';

        const useNormalizedHeader = Boolean(options?.normalized);
        const cacheKey = `${normalizedViewId}::${normalizedFieldId}::${useNormalizedHeader ? 'normalized' : 'raw'}`;
        if (this._viewHeaderByFieldIdCache.has(cacheKey)) {
            return this._viewHeaderByFieldIdCache.get(cacheKey);
        }

        const column = this.getViewColumn(normalizedViewId, normalizedFieldId);
        const rawHeader = String(column?.header || '').trim();
        const resolvedHeader = useNormalizedHeader
            ? this.normalizeViewColumnHeader(rawHeader)
            : rawHeader;

        this._viewHeaderByFieldIdCache.set(cacheKey, resolvedHeader);
        return resolvedHeader;
    }

    /**
     * Returns the 1-based visual column index for a view column.
     * Supports field-backed columns and header-only action columns such as Edit.
     * @param {string|number} viewId - View id to inspect.
     * @param {string|number|Object} columnRef - Field id, header text, or column metadata.
     * @returns {number} 1-based column index, or 0 when not found.
     */
    getViewColumnIndex(viewId, columnRef) {
        const normalizedViewId = this.normalizeViewId(viewId);
        if (!normalizedViewId || !columnRef) return 0;

        const renderedColumnIndex = this.getRenderedViewColumnIndex(normalizedViewId, columnRef);
        if (renderedColumnIndex > 0) {
            return renderedColumnIndex;
        }

        const cacheRef = typeof columnRef === 'object'
            ? `${this.normalizeFieldId(columnRef?.field?.key || columnRef?.id || '')}::${this.normalizeViewColumnHeader(columnRef?.header || '')}`
            : `${this.normalizeFieldId(columnRef)}::${this.normalizeViewColumnHeader(columnRef)}`;
        const cacheKey = `${normalizedViewId}::${cacheRef}`;
        if (this._viewColumnIndexCache.has(cacheKey)) {
            return this._viewColumnIndexCache.get(cacheKey);
        }

        const columns = this.getViewColumns(normalizedViewId);
        const column = this.getViewColumn(normalizedViewId, columnRef);
        const columnIndex = column ? columns.indexOf(column) + 1 : 0;

        this._viewColumnIndexCache.set(cacheKey, columnIndex);
        return columnIndex;
    }

    /**
     * Resolves the live rendered column index from the table DOM.
     * This accounts for runtime-injected columns such as selection checkboxes.
     * @param {string|number} viewId - View id to inspect.
     * @param {string|number|Object} columnRef - Field id, header text, or column metadata.
     * @returns {number} 1-based column index, or 0 when not found.
     */
    getRenderedViewColumnIndex(viewId, columnRef) {
        const normalizedViewId = this.normalizeViewId(viewId);
        if (!normalizedViewId || !columnRef) return 0;

        const viewElement = document.getElementById(normalizedViewId);
        if (!viewElement) return 0;

        const headerCells = Array.from(viewElement.querySelectorAll('thead tr:last-child > th'));
        if (!headerCells.length) return 0;

        const resolvedColumn = this.getViewColumn(normalizedViewId, columnRef);
        const resolvedFieldId = this.normalizeFieldId(resolvedColumn?.field?.key || resolvedColumn?.id || columnRef);
        const resolvedHeader = this.normalizeViewColumnHeader(resolvedColumn?.header || columnRef);

        const matchingIndex = headerCells.findIndex((headerCell) => {
            const headerFieldKey = this.normalizeFieldId(headerCell.getAttribute('data-field-key') || '');
            if (resolvedFieldId && headerFieldKey && headerFieldKey === resolvedFieldId) {
                return true;
            }

            if (resolvedFieldId && headerCell.classList.contains(resolvedFieldId)) {
                return true;
            }

            if (!resolvedHeader) {
                return false;
            }

            return this.normalizeViewColumnHeader(headerCell.innerHTML || headerCell.textContent || '') === resolvedHeader;
        });

        return matchingIndex >= 0 ? matchingIndex + 1 : 0;
    }

    /**
     * Returns DOM selectors for a view column.
     * Field-backed columns resolve to field selectors, while header-only columns fall back to nth-child selectors.
     * @param {string|number} viewId - View id to inspect.
     * @param {string|number|Object} columnRef - Field id, header text, or column metadata.
     * @returns {Array<string>} CSS selectors that target the column header and cells.
     */
    getViewColumnSelectors(viewId, columnRef) {
        const normalizedViewId = this.normalizeViewId(viewId);
        if (!normalizedViewId || !columnRef) return [];

        const cacheRef = typeof columnRef === 'object'
            ? `${this.normalizeFieldId(columnRef?.field?.key || columnRef?.id || '')}::${this.normalizeViewColumnHeader(columnRef?.header || '')}`
            : `${this.normalizeFieldId(columnRef)}::${this.normalizeViewColumnHeader(columnRef)}`;
        const cacheKey = `${normalizedViewId}::${cacheRef}`;
        if (this._viewColumnSelectorCache.has(cacheKey)) {
            return this._viewColumnSelectorCache.get(cacheKey);
        }

        const selectors = [];
        const column = this.getViewColumn(normalizedViewId, columnRef);
        const fieldId = this.normalizeFieldId(column?.field?.key || column?.id || columnRef);
        if (fieldId) {
            selectors.push(
                `th.${fieldId}`,
                `td.${fieldId}`,
                `th[data-field-key="${fieldId}"]`,
                `td[data-field-key="${fieldId}"]`
            );
        }

        const columnIndex = this.getViewColumnIndex(normalizedViewId, columnRef);
        if (columnIndex > 0) {
            selectors.push(
                `thead tr > th:nth-child(${columnIndex})`,
                `tbody tr > td:nth-child(${columnIndex})`,
                `colgroup col:nth-child(${columnIndex})`
            );
        }

        const uniqueSelectors = Array.from(new Set(selectors.filter(Boolean)));
        this._viewColumnSelectorCache.set(cacheKey, uniqueSelectors);
        return uniqueSelectors;
    }

    /**
     * Returns normalised Knack width metadata for a view column.
     * @param {string|number} viewId - View id to inspect.
     * @param {string|number|Object} columnRef - Field id, header text, or column metadata.
     * @returns {{type: string, units: string, amount: number|null, amountText: string, isCustom: boolean, column: Object}|null} Width metadata.
     */
    getViewColumnWidth(viewId, columnRef) {
        const column = this.getViewColumn(viewId, columnRef);
        if (!column) return null;

        const widthMeta = column?.width && typeof column.width === 'object' ? column.width : {};
        const widthType = String(widthMeta?.type || '').trim().toLowerCase();
        const widthUnits = String(widthMeta?.units || '').trim().toLowerCase();
        const amountText = String(widthMeta?.amount ?? '').trim();
        const parsedAmount = Number.parseFloat(amountText);

        return {
            type: widthType,
            units: widthUnits,
            amount: Number.isFinite(parsedAmount) ? parsedAmount : null,
            amountText,
            isCustom: widthType === 'custom',
            column,
        };
    }

    /**
     * Returns scene metadata for a view.
     * @param {string|number} viewId - View id to inspect.
     * @returns {{ key: string, slug: string }|null} Scene info or null.
     */
    getSceneInfoForView(viewId) {
        const normalizedViewId = this.normalizeViewId(viewId);
        if (!normalizedViewId) {
            return null;
        }
        if (this._sceneInfoCache.has(normalizedViewId)) return this._sceneInfoCache.get(normalizedViewId);

        let fallbackSceneKey = '';

        const directScene = Knack?.views?.[normalizedViewId]?.model?.view?.scene;
        const directSceneKey = this.normalizeSceneId(directScene?.key);
        if (directSceneKey) {
            const directSceneSlug = String(directScene?.slug || '').trim();
            if (directSceneSlug) {
                const sceneInfo = {
                    key: directSceneKey,
                    slug: directSceneSlug
                };
                this._sceneInfoCache.set(normalizedViewId, sceneInfo);
                return sceneInfo;
            }

            fallbackSceneKey = directSceneKey;
        }

        const viewObject = this.getViewObject(normalizedViewId);
        const sceneKey = this.normalizeSceneId(viewObject?.scene?.key);
        if (sceneKey) {
            const viewObjectSceneSlug = String(viewObject?.scene?.slug || '').trim();
            if (viewObjectSceneSlug) {
                const sceneInfo = {
                    key: sceneKey,
                    slug: viewObjectSceneSlug
                };
                this._sceneInfoCache.set(normalizedViewId, sceneInfo);
                return sceneInfo;
            }

            fallbackSceneKey = fallbackSceneKey || sceneKey;
        }

        const scenes = Knack?.scenes?.models || [];
        for (const scene of scenes) {
            const candidateSceneKey = this.normalizeSceneId(scene?.attributes?.key);
            const views = scene?.views?.models || [];
            for (const viewModel of views) {
                if (viewModel?.attributes?.key !== normalizedViewId) continue;

                const sceneInfo = {
                    key: candidateSceneKey,
                    slug: String(scene?.attributes?.slug || '').trim()
                };
                this._sceneInfoCache.set(normalizedViewId, sceneInfo);
                return sceneInfo;
            }

            if (!fallbackSceneKey || candidateSceneKey !== fallbackSceneKey) continue;

            const fallbackSceneSlug = String(scene?.attributes?.slug || '').trim();
            if (!fallbackSceneSlug) continue;

            const sceneInfo = {
                key: fallbackSceneKey,
                slug: fallbackSceneSlug
            };
            this._sceneInfoCache.set(normalizedViewId, sceneInfo);
            return sceneInfo;
        }

        return null;
    }

    /**
     * Returns the current Knack route scene trail for a view, oldest to newest.
     * Where Knack exposes a route key on a scene entry, treat it as the record id for
     * that slug. If the key is missing, fall back to the current URL hash.
     * @param {string|number} viewId - View id to inspect.
     * @param {{ maxScenes?: number }} [options={}] - Optional trail limit.
     * @returns {Array<{ sceneSlug: string, recordId: string, isCurrent: boolean, index: number }>} Scene trail.
     */
    getCurrentSceneTrail(viewId, options = {}) {
        const normalizedViewId = this.normalizeViewId(viewId);
        if (!normalizedViewId) {
            return [];
        }

        const directScene = Knack?.views?.[normalizedViewId]?.model?.view?.scene;
        if (!directScene) {
            return [];
        }

        const rawTrail = Array.isArray(directScene?.scenes) ? directScene.scenes : [];
        const normalizedTrail = rawTrail
            .map((sceneEntry, index, sourceTrail) => {
                const sceneSlug = String(sceneEntry?.slug || '').trim();
                const directRecordId = String(sceneEntry?.key || sceneEntry?.scene_id || '').trim();
                const recordId = directRecordId || (sceneSlug ? String(getIdBeforeSceneSlug(sceneSlug) || '').trim() : '');

                return {
                    sceneSlug,
                    recordId,
                    isCurrent: index === sourceTrail.length - 1,
                    index,
                };
            })
            .filter((sceneEntry) => sceneEntry.sceneSlug || sceneEntry.recordId);

        const maxScenes = Number(options?.maxScenes);
        if (Number.isFinite(maxScenes) && maxScenes > 0) {
            return normalizedTrail.slice(-maxScenes);
        }

        return normalizedTrail;
    }

    /**
     * Returns the currently rendered scene information for a view.
     * Unlike `getSceneInfoForView`, this includes the current scene record id.
     * When `historyIndex` is provided, returns the matching entry from the route trail,
     * where `0` means the current scene, `1` the previous scene, and so on.
     * @param {string|number} viewId - View id to inspect.
     * @param {number|{ historyIndex?: number }} [options={}] - Optional trail lookup.
     * @returns {{ recordId: string, sceneId: string, sceneSlug: string }|null} Current scene info or null.
     */
    getCurrentSceneInfo(viewId, options = {}) {
        const normalizedViewId = this.normalizeViewId(viewId);
        if (!normalizedViewId) {
            return null;
        }

        const historyIndex = typeof options === 'number'
            ? options
            : Number(options?.historyIndex || 0);
        if (Number.isInteger(historyIndex) && historyIndex > 0) {
            const trail = this.getCurrentSceneTrail(normalizedViewId);
            const targetIndex = trail.length - (historyIndex + 1);
            const targetEntry = targetIndex >= 0 ? trail[targetIndex] : null;
            if (!targetEntry) {
                return null;
            }

            return {
                recordId: targetEntry.recordId,
                sceneId: '',
                sceneSlug: targetEntry.sceneSlug,
            };
        }

        const directScene = Knack?.views?.[normalizedViewId]?.model?.view?.scene;
        if (!directScene) {
            return null;
        }

        return {
            recordId: String(directScene?.scene_id || '').trim(),
            sceneId: this.normalizeSceneId(directScene?.key),
            sceneSlug: String(directScene?.slug || '').trim(),
        };
    }

    /**
     * Resolves field metadata from Knack object definitions.
     * @param {string|number} fieldKey - Field id to resolve.
     * @returns {Object|null} Field metadata.
     */
    getFieldMeta(fieldKey) {
        const key = this.normalizeFieldId(fieldKey);
        if (!key) return null;
        if (this._fieldMetaCache.has(key)) return this._fieldMetaCache.get(key);

        const objects = Knack?.objects?.models || [];
        let fieldMeta = null;

        for (const objModel of objects) {
            const fields = objModel?.fields?.models || [];
            const match = fields.find((fieldModel) => {
                const attributes = fieldModel?.attributes || {};
                return attributes?.key === key;
            });

            const attributes = match?.attributes || null;
            if (attributes && typeof attributes === 'object') {
                fieldMeta = attributes;
                break;
            }
        }

        this._fieldMetaCache.set(key, fieldMeta);
        return fieldMeta;
    }

    /**
     * Resolves the normalised field type for a field id.
     * @param {string|number} fieldKey - Field id to inspect.
     * @returns {string} Lower-cased Knack field type.
     */
    getFieldType(fieldKey) {
        return String(this.getFieldMeta(fieldKey)?.type || '').trim().toLowerCase();
    }

    /**
     * Resolves choice labels for a select-style field from Knack object metadata.
     * @param {string|number} fieldKey - Field id to inspect.
     * @returns {Array<string>} Ordered choice labels from field metadata.
     */
    getFieldChoiceOptions(fieldKey) {
        const key = this.normalizeFieldId(fieldKey);
        if (!key) return [];

        // Return cached non-empty value to preserve performance
        if (this._fieldChoiceOptionsCache.has(key)) {
            const cached = this._fieldChoiceOptionsCache.get(key);
            if (Array.isArray(cached) && cached.length) return cached;
            // if cached is empty, fall through to rebuild from fresh metadata
        }

        const fieldMeta = this.getFieldMeta(key);
        const optionEntries = Array.isArray(fieldMeta?.format?.options) ? fieldMeta.format.options : [];

        // Assume optionEntries is a plain list of primitives
        const out = [];
        const seen = new Set();
        for (const e of optionEntries) {
            if (e == null) continue;
            const v = String(e).trim();
            if (v && !seen.has(v)) { seen.add(v); out.push(v); }
        }
        if (out.length) this._fieldChoiceOptionsCache.set(key, out);
        return out;
    }

    /**
     * Resolves a field id from a view-specific field label or name.
     * @param {string|number} viewId - View id containing the field.
     * @param {string} fieldLabel - Field label or name.
     * @returns {string} Matching field id, or an empty string.
     */
    getFieldIdFromLabel(viewId, fieldLabel) {
        const normalizedViewId = this.normalizeViewId(viewId);
        const normalizedLabel = String(fieldLabel || '').trim().toLowerCase();
        if (!normalizedViewId || !normalizedLabel) return '';

        const cacheKey = `${normalizedViewId}::${normalizedLabel}`;
        if (this._fieldIdByViewLabelCache.has(cacheKey)) {
            return this._fieldIdByViewLabelCache.get(cacheKey);
        }

        const viewObject = this.getViewObject(normalizedViewId);
        const fields = Array.isArray(viewObject?.fields) ? viewObject.fields : [];
        const match = fields.find((field) => {
            const fieldName = String(field?.name || '').trim().toLowerCase();
            const fieldLabelText = String(field?.label || '').trim().toLowerCase();
            return fieldName === normalizedLabel || fieldLabelText === normalizedLabel;
        });

        const resolvedFieldId = this.normalizeFieldId(match?.key || '');
        this._fieldIdByViewLabelCache.set(cacheKey, resolvedFieldId);
        return resolvedFieldId;
    }
}

const knackNavigator = new KnackNavigator();

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: value-resolver
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// KnackValueResolver: V1 lines 799-1787 ported as-is (analysis C03: no signature change). Value coercion and Knack record values go through knackValueResolver.
/**
 * Knack field value resolver for display/raw/typed/API output modes.
 * Handles per-field-type normalization using Knack object metadata.
 */
class KnackValueResolver {
    /** Field types Knack computes, so they cannot be written. */
    static READ_ONLY_FIELD_TYPES = new Set(['auto_increment', 'equation', 'concatenation', 'count', 'max', 'min', 'average']);

    /** Field types whose values are objects rather than strings. */
    static STRUCTURED_FIELD_TYPES = new Set(['date_time', 'name', 'address', 'phone', 'email', 'file', 'image', 'signature']);

    /**
     * Creates a value resolver backed by a navigator.
     * @param {KnackNavigator} navigator - Metadata navigator instance.
     */
    constructor(navigator) {
        this.navigator = navigator;
    }

    /**
     * Normalises a field id for value resolution.
     * @param {string|number} fieldId - Field id with or without the `field_` prefix.
     * @returns {string} Normalised field id.
     */
    normalizeFieldId(fieldId) {
        if (this.navigator?.normalizeFieldId) {
            return this.navigator.normalizeFieldId(fieldId);
        }

        const value = String(fieldId ?? '').trim().toLowerCase();
        if (!value) return '';
        if (/^field_\d+$/.test(value)) return value;
        if (/^\d+$/.test(value)) return `field_${value}`;
        return '';
    }

    /**
     * Returns field metadata for a field id.
     * @param {string|number} fieldKey - Field id to resolve.
     * @returns {Object|null} Field metadata.
     */
    getFieldMeta(fieldKey) {
        const key = this.normalizeFieldId(fieldKey);
        if (!key) return null;
        return this.navigator?.getFieldMeta ? this.navigator.getFieldMeta(key) : null;
    }

    /**
     * Returns the Knack field type for a field id.
     * @param {string|number} fieldKey - Field id to inspect.
     * @returns {string} Lower-cased field type.
     */
    getFieldType(fieldKey) {
        const key = this.normalizeFieldId(fieldKey);
        if (!key) return '';
        return this.navigator?.getFieldType ? this.navigator.getFieldType(key) : '';
    }

    /**
     * Returns the expected read/write shape for a field based on Knack metadata.
     * Write payloads always use the non-raw field key.
     * @param {string|number} fieldKey - Field key with or without `field_` prefix.
     * @returns {Object|null} Shape metadata for the field, or null when the field key is invalid.
     * @example
     * const shape = knackValueResolver.getFieldShape('field_6374');
     * console.log(shape.write.key); // field_6374
     */
    getFieldShape(fieldKey) {
        const key = this.normalizeFieldId(fieldKey);
        if (!key) return null;

        const fieldType = this.getFieldType(key) || 'unknown';
        return {
            fieldKey: key,
            rawKey: `${key}_raw`,
            fieldType,
            readOnly: this.isReadOnlyFieldType(fieldType),
            read: {
                displayKey: key,
                displayShape: this.getDisplayShapeForType(fieldType),
                rawKey: `${key}_raw`,
                rawShape: this.getRawShapeForType(fieldType)
            },
            write: {
                key,
                usesRawKey: false,
                supported: !this.isReadOnlyFieldType(fieldType),
                valueShape: this.getWriteShapeForType(fieldType)
            }
        };
    }

    /**
     * Describes the actual read/write values present on a record for a field.
     * This is useful when copying Knack data into a POST/PUT payload without guessing at field shapes.
     * @param {Object} record - Knack record returned by the API.
     * @param {string|number} fieldKey - Field key with or without `field_` prefix.
     * @param {Object} [options] - Optional settings.
     * @param {boolean} [options.preferRaw=true] - Whether typed resolution should prefer `_raw` values.
     * @returns {Object|null} Field shape and current values, or null when the field key is invalid.
     * @example
     * const fieldInfo = knackValueResolver.describeFieldValue(record, 'field_7587');
     * console.log(fieldInfo.write.value); // structured value safe to use under field_7587
     */
    describeFieldValue(record, fieldKey, { preferRaw = true } = {}) {
        const definition = this.getFieldShape(fieldKey);
        if (!definition) return null;

        const rawValue = record?.[definition.rawKey];
        const displayValue = record?.[definition.fieldKey];
        const typedValue = this.toTypedValue({
            rawValue,
            displayValue,
            fieldType: definition.fieldType,
            preferRaw
        });
        const requestValue = this.toRequestValue({
            rawValue,
            displayValue,
            fieldType: definition.fieldType
        });

        return {
            ...definition,
            read: {
                ...definition.read,
                displayValue,
                displayValueRuntimeShape: this.describeValueShape(displayValue),
                rawValue,
                rawValueRuntimeShape: this.describeValueShape(rawValue),
                typedValue,
                typedValueRuntimeShape: this.describeValueShape(typedValue)
            },
            write: {
                ...definition.write,
                value: requestValue,
                runtimeShape: this.describeValueShape(requestValue)
            }
        };
    }

    /**
     * Returns a consistent display/raw pair for a field without callers needing to guess at raw shapes.
     * Useful for UI code that needs a human-readable label plus a stable raw value.
     * @param {Object} record - Knack record returned by the API.
     * @param {string|number} fieldKey - Field key with or without `field_` prefix.
     * @param {Object} [options] - Optional settings.
     * @param {boolean} [options.preferRaw=true] - Whether typed resolution should prefer `_raw` values.
     * @returns {{display: string, raw: string}} Display/raw metadata for the field.
     */
    getFieldValueMeta(record, fieldKey, { preferRaw = true } = {}) {
        const fieldInfo = this.describeFieldValue(record, fieldKey, { preferRaw });
        if (!fieldInfo) {
            return {
                display: '',
                raw: '',
            };
        }

        const rawValue = fieldInfo.read.rawValue;
        const displayValue = fieldInfo.read.displayValue;

        if (Array.isArray(rawValue)) {
            const refs = rawValue
                .map((value) => this.toConnectionRef(value))
                .filter(Boolean);

            if (refs.length) {
                return {
                    display: this.toJoinedString(refs.map((ref) => ref.identifier || ref.id)),
                    raw: this.toJoinedString(refs.map((ref) => ref.id), ','),
                };
            }

            const joinedValue = this.toJoinedString(rawValue);
            return {
                display: joinedValue,
                raw: joinedValue,
            };
        }

        const connectionRef = this.toConnectionRef(rawValue);
        if (connectionRef) {
            return {
                display: connectionRef.identifier || connectionRef.id,
                raw: connectionRef.id,
            };
        }

        if (rawValue && typeof rawValue === 'object') {
            const normalizedDisplay = this.toJoinedString(rawValue);
            const normalizedRaw = this.toStringSafe(rawValue.id ?? rawValue.value ?? normalizedDisplay);

            return {
                display: normalizedDisplay || normalizedRaw,
                raw: normalizedRaw || normalizedDisplay,
            };
        }

        const normalizedDisplay = this.toStringSafe(displayValue);
        return {
            display: normalizedDisplay,
            raw: rawValue !== undefined && rawValue !== null ? this.toStringSafe(rawValue) : normalizedDisplay,
        };
    }

    /**
     * Resolves a field to a normalised display string suitable for stable text comparisons.
     * @param {Object} record - Knack record returned by the API.
     * @param {string|number} fieldKey - Field key with or without `field_` prefix.
     * @returns {string} Normalised comparable display value.
     */
    getComparableFieldDisplay(record, fieldKey) {
        return this.normalizeComparableText(
            this.toDisplayString(this.extractResponseFieldValue(record, fieldKey))
        );
    }

    /**
     * Builds a POST/PUT payload using only non-raw field keys and type-aware values.
     * Source values can come from a full Knack record or a partial object containing field keys.
     * @param {Object} source - Record or payload-like object.
     * @param {Array<string|number>} [fieldKeys=[]] - Specific field keys to include. When omitted, all non-raw field keys in source are considered.
     * @returns {Object} Type-aware payload ready for Knack POST/PUT calls.
     * @example
     * const payload = knackValueResolver.buildRequestPayload(record, ['field_6374', 'field_7587']);
     * // payload uses field_6374 / field_7587 keys, never *_raw keys
     */
    buildRequestPayload(source, fieldKeys = []) {
        if (!source || typeof source !== 'object') return {};

        const keys = Array.isArray(fieldKeys) && fieldKeys.length
            ? fieldKeys
            : Object.keys(source).filter((key) => /^field_\d+$/.test(String(key)));

        return keys.reduce((payload, fieldKey) => {
            const normalizedKey = this.normalizeFieldId(fieldKey);
            if (!normalizedKey) return payload;

            const requestValue = this.toRequestValue({
                rawValue: source?.[`${normalizedKey}_raw`],
                displayValue: source?.[normalizedKey],
                fieldType: this.getFieldType(normalizedKey)
            });

            if (requestValue !== undefined) {
                payload[normalizedKey] = requestValue;
            }

            return payload;
        }, {});
    }

    /**
     * Resolves a field value in the requested output mode.
     * @param {Object} record - Knack record object.
     * @param {string|number} fieldKey - Field id to resolve.
     * @param {Object} [options={}] - Resolution options.
     * @returns {*} Resolved field value or fallback.
     */
    resolve(record, fieldKey, { mode = 'typed', preferRaw = true, fallback = undefined } = {}) {
        const key = this.normalizeFieldId(fieldKey);
        if (!record || !key) return fallback;

        const rawKey = `${key}_raw`;
        const rawValue = record?.[rawKey];
        const displayValue = record?.[key];
        const fieldType = this.getFieldType(key);

        if (mode === 'raw') return rawValue ?? fallback;
        if (mode === 'display') return displayValue ?? fallback;
        if (mode === 'api') {
            const apiValue = this.toApiValue({ rawValue, displayValue, fieldType });
            return apiValue === undefined ? fallback : apiValue;
        }
        if (mode === 'request') {
            const requestValue = this.toRequestValue({ rawValue, displayValue, fieldType });
            return requestValue === undefined ? fallback : requestValue;
        }

        const typedValue = this.toTypedValue({ rawValue, displayValue, fieldType, preferRaw });
        return typedValue === undefined ? fallback : typedValue;
    }

    /**
     * Converts raw/display field values into a typed runtime value.
     * @param {Object} input - Raw/display value inputs.
     * @param {*} input.rawValue - `_raw` field value.
     * @param {*} input.displayValue - Display field value.
     * @param {string} input.fieldType - Knack field type.
     * @param {boolean} input.preferRaw - Whether `_raw` values should win when present.
     * @returns {*} Typed value for runtime use.
     */
    toTypedValue({ rawValue, displayValue, fieldType, preferRaw }) {
        const sourceValue = preferRaw ? (rawValue ?? displayValue) : (displayValue ?? rawValue);
        if (sourceValue === undefined || sourceValue === null || sourceValue === '') return undefined;

        if (fieldType === 'connection') {
            const ids = this.toConnectionIds(rawValue ?? sourceValue);
            return ids.length <= 1 ? (ids[0] ?? '') : ids;
        }

        if (fieldType === 'multiple_choice') {
            if (Array.isArray(sourceValue)) {
                const choiceValues = this.toStringArray(sourceValue);
                return choiceValues.length <= 1 ? (choiceValues[0] ?? '') : choiceValues;
            }

            const singleChoiceValue = this.toStringSafe(sourceValue);
            return singleChoiceValue || undefined;
        }

        if (Array.isArray(sourceValue)) return this.toStringArray(sourceValue);
        return sourceValue;
    }

    /**
     * Converts raw/display field values into an API-friendly primitive or array.
     * @param {Object} input - Raw/display value inputs.
     * @param {*} input.rawValue - `_raw` field value.
     * @param {*} input.displayValue - Display field value.
     * @param {string} input.fieldType - Knack field type.
     * @returns {*} API-ready value, or undefined when no write should occur.
     */
    toApiValue({ rawValue, displayValue, fieldType }) {
        if (fieldType === 'connection') {
            const ids = this.toConnectionIds(rawValue);
            if (!ids.length) return undefined;
            return ids.length === 1 ? ids[0] : ids;
        }

        if (fieldType === 'multiple_choice') {
            const sourceValue = rawValue ?? displayValue;
            if (Array.isArray(sourceValue)) {
                const values = this.toStringArray(sourceValue);
                return values.length ? values : undefined;
            }

            const singleChoiceValue = this.toStringSafe(sourceValue);
            return singleChoiceValue || undefined;
        }

        const base = rawValue !== undefined ? rawValue : displayValue;
        if (base === undefined || base === null) return undefined;
        if (typeof base === 'string') {
            const trimmed = base.trim();
            return trimmed ? trimmed : undefined;
        }
        if (typeof base === 'number') return String(base);
        if (typeof base === 'boolean') return base ? 'true' : 'false';
        return undefined;
    }

    /**
     * Normalizes a field value into the non-raw value shape expected for Knack POST/PUT payloads.
     * @param {Object} input - Source values and field metadata.
     * @param {*} input.rawValue - `_raw` field value from a Knack record.
     * @param {*} input.displayValue - Non-raw/display field value from a Knack record.
     * @param {string} input.fieldType - Knack field type.
     * @param {string|number} [input.targetKey] - Field the value will be written to. When given, date/time
     *   values are formatted in that field's `date_format` / `time_format` instead of the source's display format.
     * @returns {*} A type-aware request value, or undefined when the field should not be written.
     */
    toRequestValue({ rawValue, displayValue, fieldType, targetKey }) {
        const sourceValue = rawValue !== undefined ? rawValue : displayValue;
        if (sourceValue === undefined || sourceValue === null || sourceValue === '') {
            return undefined;
        }

        if (this.isReadOnlyFieldType(fieldType)) {
            return undefined;
        }

        if (fieldType === 'connection') {
            const ids = this.toConnectionIds(sourceValue);
            if (!ids.length) return undefined;
            return Array.isArray(sourceValue) ? ids : (ids[0] ?? undefined);
        }

        if (fieldType === 'multiple_choice') {
            if (Array.isArray(sourceValue)) {
                const values = this.toStringArray(sourceValue);
                return values.length ? values : undefined;
            }

            const singleChoiceValue = this.toStringSafe(sourceValue);
            return singleChoiceValue || undefined;
        }

        if (fieldType === 'boolean') {
            return this.toBooleanValue(sourceValue);
        }

        if (fieldType === 'number' || fieldType === 'currency') {
            return this.toNumberValue(sourceValue);
        }

        if (fieldType === 'date_time') {
            if (targetKey !== undefined && targetKey !== null && targetKey !== '') {
                const targetFormat = this.getFieldMeta(targetKey)?.format;
                const formatted = this.toDateTimeRequestValueForFormat(rawValue, targetFormat);
                if (formatted !== undefined) return formatted;
            }
            return this.toDateTimeRequestValue(rawValue, displayValue);
        }

        if (this.isStructuredFieldType(fieldType)) {
            return this.toStructuredValue(sourceValue, displayValue);
        }

        if (typeof sourceValue === 'string') {
            const trimmed = sourceValue.trim();
            return trimmed ? trimmed : undefined;
        }

        return sourceValue;
    }

    /**
     * Normalizes a Knack date/time raw or display value into an API-safe request value.
     * Prefers formatted time strings and converts Knack raw minute counts when needed.
     * @param {*} rawValue - `_raw` value from a Knack record.
     * @param {*} displayValue - Display value from a Knack record.
     * @returns {string|undefined} Date/time request string when recognized.
     */
    toDateTimeRequestValue(rawValue, displayValue) {
        return this._normalizeDateTimeRequestValue(rawValue)
            ?? this._normalizeDateTimeRequestValue(displayValue);
    }

    /**
     * Formats a Knack date/time `_raw` value in a target field's date/time format.
     * `_raw.date` is always mm/dd/yyyy whatever the source field displays, but Knack parses a write
     * in the target field's format, so copying `date_formatted` between fields with different
     * formats is rejected (day > 12) or silently swaps day and month (day <= 12).
     * @param {Object} rawValue - Knack date `_raw` object ({date, hours, minutes, am_pm, ...}).
     * @param {Object} [targetFormat] - Target field's `format` metadata ({date_format, time_format}).
     * @returns {string|undefined} Formatted request string, or undefined when `rawValue` is not a
     *   single Knack date object (callers should fall back to toDateTimeRequestValue).
     * @example
     * knackValueResolver.toDateTimeRequestValueForFormat(
     *     { date: '09/23/2026', hours: '2', minutes: '05', am_pm: 'PM' },
     *     { date_format: 'dd/mm/yyyy', time_format: 'HH:MM military' }
     * ); // '23/09/2026 14:05'
     */
    toDateTimeRequestValueForFormat(rawValue, targetFormat) {
        if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return undefined;
        // Date ranges carry a `to` part that this single-value format can't express.
        if (rawValue.to) return undefined;

        const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(this.toStringSafe(rawValue.date));
        if (!match) return undefined;
        const mm = match[1].padStart(2, '0');
        const dd = match[2].padStart(2, '0');
        const yyyy = match[3];

        const dateFormat = this.toStringSafe(targetFormat?.date_format || 'mm/dd/yyyy').toLowerCase();
        const timeFormat = this.toStringSafe(targetFormat?.time_format).toLowerCase();

        let date = `${mm}/${dd}/${yyyy}`;
        if (dateFormat.startsWith('dd/')) date = `${dd}/${mm}/${yyyy}`;
        else if (dateFormat === 'yyyy-mm-dd') date = `${yyyy}-${mm}-${dd}`;
        else if (dateFormat.includes('ignore')) date = '';

        const hasTime = rawValue.hours !== undefined && rawValue.hours !== null && rawValue.hours !== '';
        if (timeFormat.includes('ignore') || !hasTime) return date || undefined;

        const rawHours = parseInt(rawValue.hours, 10);
        if (!Number.isFinite(rawHours)) return date || undefined;
        const minutes = String(parseInt(rawValue.minutes, 10) || 0).padStart(2, '0');
        const amPm = this.toStringSafe(rawValue.am_pm).toLowerCase();

        // Knack `_raw.hours` is 12-hour when `am_pm` is present; treat it as 24-hour otherwise.
        const hours24 = amPm ? (rawHours % 12) + (amPm === 'pm' ? 12 : 0) : rawHours;
        const time = timeFormat.includes('military')
            ? `${String(hours24).padStart(2, '0')}:${minutes}`
            : `${(hours24 % 12) || 12}:${minutes}${hours24 >= 12 ? 'pm' : 'am'}`;

        return date ? `${date} ${time}` : time;
    }

    /**
     * Converts a primitive or object-based date/time value into a normalized request string.
     * @param {*} value - Source date/time value.
     * @returns {string|undefined} Normalized request value.
     * @private
     */
    _normalizeDateTimeRequestValue(value) {
        if (value === undefined || value === null || value === '') return undefined;

        if (typeof value === 'number') {
            return this._normalizeDateTimeTimeSegment(value);
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return undefined;

            if (/^\d+$/.test(trimmed)) {
                return this._normalizeDateTimeTimeSegment(trimmed) || trimmed;
            }

            return trimmed;
        }

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }

        if (value.from || value.to) {
            return this.toDisplayString(value) || undefined;
        }

        const dateValue = this.toStringSafe(value.date_formatted || value.date || value.iso_date || value.date_time);
        const timeValue = this._normalizeDateTimeTimeSegment(
            value.time_formatted
            || value.time
            || this._buildTimeFromClockParts(value.hours, value.minutes, value.am_pm)
            || value.datetime_formatted
        );

        if (dateValue && timeValue) return `${dateValue} ${timeValue}`.trim();
        if (dateValue) return dateValue;
        if (timeValue) return timeValue;

        return this.toDisplayString(value) || undefined;
    }

    /**
     * Converts a Knack time fragment into `HH:mm` when possible.
     * Supports formatted time strings and raw minute counts.
     * @param {*} value - Time fragment.
     * @returns {string} Normalized time or an empty string.
     * @private
     */
    _normalizeDateTimeTimeSegment(value) {
        if (value === undefined || value === null || value === '') return '';

        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1440) {
            const hours = Math.floor(value / 60);
            const minutes = value % 60;
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }

        const normalized = this.toStringSafe(value);
        if (!normalized) return '';

        if (/^\d+$/.test(normalized)) {
            const totalMinutes = Number(normalized);
            if (Number.isFinite(totalMinutes) && totalMinutes >= 0 && totalMinutes < 1440) {
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;
                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            }
        }

        const amPmMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
        if (amPmMatch) {
            return this._buildTimeFromClockParts(amPmMatch[1], amPmMatch[2], amPmMatch[3]);
        }

        const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
        if (twentyFourHourMatch) {
            const hours = Number(twentyFourHourMatch[1]);
            const minutes = Number(twentyFourHourMatch[2]);
            if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            }
        }

        return normalized;
    }

    /**
     * Builds a 24-hour time string from clock parts.
     * @param {*} hoursValue - Hour component.
     * @param {*} minutesValue - Minute component.
     * @param {*} amPmValue - AM/PM marker.
     * @returns {string} 24-hour time or an empty string.
     * @private
     */
    _buildTimeFromClockParts(hoursValue, minutesValue, amPmValue) {
        const hoursText = this.toStringSafe(hoursValue);
        const minutesText = this.toStringSafe(minutesValue);
        if (!hoursText && !minutesText) return '';

        let hours = Number(hoursText || '0');
        const minutes = Number(minutesText || '0');
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
            return '';
        }

        const amPm = this.toStringSafe(amPmValue).toUpperCase();
        if (amPm === 'PM' && hours < 12) hours += 12;
        if (amPm === 'AM' && hours === 12) hours = 0;
        if (hours < 0 || hours > 23) return '';

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /**
     * Extracts one or more connected record ids from a Knack connection value.
     * @param {*} value - Connection value in array, object, or primitive form.
     * @returns {Array<string>} Connected record ids.
     */
    toConnectionIds(value) {
        if (!value) return [];
        return (Array.isArray(value) ? value : [value])
            .map((item) => String((item && typeof item === 'object' ? item.id : item) || '').trim())
            .filter(Boolean);
    }

    /**
     * Returns true when the field type is calculated or otherwise not suitable for direct writes.
     * @param {string} fieldType - Knack field type.
     * @returns {boolean} Whether the field should be omitted from POST/PUT payloads.
     */
    isReadOnlyFieldType(fieldType) {
        return KnackValueResolver.READ_ONLY_FIELD_TYPES.has(String(fieldType || '').trim().toLowerCase());
    }

    /**
     * Returns true when the field uses a structured object value in `_raw` form.
     * @param {string} fieldType - Knack field type.
     * @returns {boolean} Whether the request should preserve object-like structure.
     */
    isStructuredFieldType(fieldType) {
        return KnackValueResolver.STRUCTURED_FIELD_TYPES.has(String(fieldType || '').trim().toLowerCase());
    }

    /**
     * Returns the expected display shape for a field type.
     * @param {string} fieldType - Knack field type.
     * @returns {string} Human-readable shape description.
     */
    getDisplayShapeForType(fieldType) {
        return ['connection', 'email', 'phone'].includes(fieldType) ? 'string-html' : 'string';
    }

    /**
     * Returns the expected `_raw` shape for a field type.
     * @param {string} fieldType - Knack field type.
     * @returns {string} Human-readable shape description.
     */
    getRawShapeForType(fieldType) {
        if (fieldType === 'short_text' || fieldType === 'paragraph_text' || fieldType === 'password') return 'string';
        if (fieldType === 'link') return 'string|object{url,label}';
        if (fieldType === 'connection') return 'array<object{id,identifier}>';
        if (fieldType === 'multiple_choice') return 'string|array<string>';
        if (fieldType === 'user_roles') return 'string|array<string>';
        if (fieldType === 'boolean') return 'boolean';
        if (fieldType === 'number') return 'number';
        if (fieldType === 'currency') return 'number|string';
        if (fieldType === 'date_time') return 'object{date,timestamp,iso_timestamp,...}';
        if (fieldType === 'name') return 'object{first,middle,last,title,full}';
        if (fieldType === 'email') return 'object{email,label}|string';
        if (fieldType === 'address') return 'object|string';
        if (fieldType === 'phone') return 'object{number,formatted,...}|string';
        if (fieldType === 'signature') return 'object|string';
        if (fieldType === 'file' || fieldType === 'image') return 'object|string';
        return 'string|number|boolean';
    }

    /**
     * Returns the expected request payload shape for a field type.
     * @param {string} fieldType - Knack field type.
     * @returns {string} Human-readable shape description.
     */
    getWriteShapeForType(fieldType) {
        if (this.isReadOnlyFieldType(fieldType)) return 'unsupported';
        if (fieldType === 'short_text' || fieldType === 'paragraph_text' || fieldType === 'password') return 'string';
        if (fieldType === 'link') return 'string|object{url,label}';
        if (fieldType === 'connection') return 'recordId|array<recordId>';
        if (fieldType === 'multiple_choice') return 'string|array<string>';
        if (fieldType === 'user_roles') return 'string|array<string>';
        if (fieldType === 'boolean') return 'boolean';
        if (fieldType === 'number' || fieldType === 'currency') return 'number';
        if (fieldType === 'date_time') return 'object|string';
        if (fieldType === 'name') return 'object{first,middle,last,title}|string';
        if (fieldType === 'email') return 'object{email,label}|string';
        if (fieldType === 'address') return 'object|string';
        if (fieldType === 'phone') return 'object{number,formatted,...}|string';
        if (fieldType === 'signature') return 'object|string';
        if (fieldType === 'file' || fieldType === 'image') return 'object|string';
        return 'string';
    }

    /**
     * Returns a simple runtime shape label for a value.
     * @param {*} value - Value to inspect.
     * @returns {string} Runtime shape label.
     */
    describeValueShape(value) {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (Array.isArray(value)) {
            if (!value.length) return 'array<empty>';
            const firstShape = this.describeValueShape(value[0]);
            return `array<${firstShape}>`;
        }
        if (typeof value === 'string') return value === '' ? 'empty-string' : 'string';
        if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'number-non-finite';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            return keys.length ? `object{${keys.slice(0, 5).join(',')}}` : 'object{}';
        }
        return typeof value;
    }

    /**
     * Preserves structured raw objects when present, otherwise falls back to a trimmed display string.
     * @param {*} primaryValue - Usually the `_raw` value.
     * @param {*} fallbackValue - Usually the non-raw/display value.
     * @returns {*} Structured or primitive value suitable for request payloads.
     */
    toStructuredValue(primaryValue, fallbackValue) {
        if (primaryValue && typeof primaryValue === 'object') return primaryValue;
        if (typeof primaryValue === 'string') {
            const trimmed = primaryValue.trim();
            if (trimmed) return trimmed;
        }
        if (fallbackValue && typeof fallbackValue === 'object') return fallbackValue;
        if (typeof fallbackValue === 'string') {
            const trimmed = fallbackValue.trim();
            return trimmed ? trimmed : undefined;
        }
        return fallbackValue === '' ? undefined : fallbackValue;
    }

    /**
     * Converts Knack display/raw boolean values into a boolean.
     * @param {*} value - Raw or display value.
     * @returns {boolean|undefined} Parsed boolean when recognized.
     */
    toBooleanValue(value) {
        if (typeof value === 'boolean') return value;
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized) return undefined;
        if (['true', 'yes', '1'].includes(normalized)) return true;
        if (['false', 'no', '0'].includes(normalized)) return false;
        return undefined;
    }

    /**
     * Converts numeric-like Knack values into finite numbers where possible.
     * @param {*} value - Raw or display value.
     * @returns {number|undefined} Parsed number when recognized.
     */
    toNumberValue(value) {
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : undefined;
        }

        const normalized = String(value || '').replace(/,/g, '').replace(/[^0-9.+-]/g, '').trim();
        if (!normalized) return undefined;

        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    /**
     * Extracts a single connection reference from a Knack connection value.
     * @param {Array|Object|null|undefined} value - Connection field value
     * @returns {{id: string, identifier: string}|null} First valid reference or null
     */
    toConnectionRef(value) {
        const item = Array.isArray(value) ? value[0] : value;
        if (!item || typeof item !== 'object') return null;
        const id = String(item.id || '').trim();
        return id ? { id, identifier: String(item.identifier || '').trim() } : null;
    }

    /**
     * Extracts a field value from a Knack record response.
     * Checks display key first, then `_raw` key.
     * @param {Object} recordObj - Knack record object
     * @param {string|number} fieldKey - Field key (with or without `field_` prefix)
     * @returns {*} Field value if found, otherwise undefined
     */
    extractResponseFieldValue(recordObj, fieldKey) {
        if (!recordObj || typeof recordObj !== 'object') return undefined;

        const fieldId = this.normalizeFieldId(fieldKey);

        if (!fieldId) return undefined;

        if (Object.prototype.hasOwnProperty.call(recordObj, fieldId)) {
            return recordObj[fieldId];
        }

        const rawKey = `${fieldId}_raw`;
        if (Object.prototype.hasOwnProperty.call(recordObj, rawKey)) {
            return recordObj[rawKey];
        }

        return undefined;
    }

    /**
     * Converts a value to an array of display strings.
     * @param {*} value - Value to flatten.
     * @returns {Array<string>} String values.
     */
    toStringArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) {
            return value
                .map((item) => this.toDisplayString(item))
                .filter(Boolean);
        }
        if (typeof value === 'string' && value.includes(',')) {
            return value.split(',').map((entry) => entry.trim()).filter(Boolean);
        }
        const single = this.toDisplayString(value);
        return single ? [single] : [];
    }

    /**
     * Converts a Knack value into a human-readable string.
     * @param {*} value - Value to convert.
     * @param {Set<Object>} [seen=new Set()] - Tracks visited objects to avoid cycles.
     * @returns {string} Display string.
     */
    toDisplayString(value, seen = new Set()) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return this.toStringSafe(value);
        }

        if (Array.isArray(value)) {
            return value
                .map((item) => this.toDisplayString(item, seen))
                .filter(Boolean)
                .join(', ');
        }

        if (typeof value !== 'object') {
            return this.toStringSafe(value);
        }

        if (seen.has(value)) return '';
        seen.add(value);

        const directKeys = [
            'identifier', 'display', 'label', 'title', 'name', 'full', 'formatted',
            'date_formatted', 'datetime_formatted', 'time_formatted', 'email',
            'address', 'number', 'phone', 'filename', 'file_name', 'value', 'id'
        ];
        for (const key of directKeys) {
            const directValue = this.toStringSafe(value?.[key]);
            if (directValue) return directValue;
        }

        const nameParts = ['title', 'first', 'middle', 'last']
            .map((key) => this.toStringSafe(value?.[key]))
            .filter(Boolean);
        if (nameParts.length) return nameParts.join(' ');

        const dateValue = this.toStringSafe(value?.date || value?.iso_date || value?.date_time);
        const timeValue = this.toStringSafe(value?.time);
        const hourValue = this.toStringSafe(value?.hours);
        const minuteValue = this.toStringSafe(value?.minutes);
        const amPmValue = this.toStringSafe(value?.am_pm);
        const timeParts = [timeValue || [hourValue, minuteValue].filter(Boolean).join(':'), amPmValue]
            .filter(Boolean)
            .join(' ')
            .trim();
        if (dateValue && timeParts) return `${dateValue} ${timeParts}`.trim();
        if (dateValue) return dateValue;
        if (timeParts) return timeParts;

        const addressParts = ['street', 'street2', 'city', 'state', 'zip', 'country']
            .map((key) => this.toStringSafe(value?.[key]))
            .filter(Boolean);
        if (addressParts.length) return addressParts.join(', ');

        const fallback = Object.values(value)
            .map((entry) => this.toDisplayString(entry, seen))
            .filter(Boolean);
        return fallback.length ? fallback.join(', ') : '';
    }

    /**
     * Safely converts a value to a trimmed string.
     * @param {*} value - Value to convert.
     * @returns {string} Trimmed string value.
     */
    toStringSafe(value) {
        if (value === undefined || value === null) return '';
        try {
            return String(value).trim();
        } catch (_) {
            return '';
        }
    }

    /**
     * Normalises text for stable comparisons by collapsing repeated whitespace.
     * @param {*} value - Value to normalise.
     * @returns {string} Comparable text value.
     */
    normalizeComparableText(value) {
        return this.toStringSafe(value).replace(/\s+/g, ' ');
    }

    /**
     * Joins a value into a separator-delimited string.
     * @param {*} value - Value to join.
     * @param {string} [separator=', '] - Separator to use.
     * @returns {string} Joined string.
     */
    toJoinedString(value, separator = ', ') {
        return this.toStringArray(value).join(separator);
    }

    /**
     * Extracts a human-readable label for a field from a record.
     * @param {Object} recordObj - Knack record object.
     * @param {string|number} fieldKey - Field id to inspect.
     * @returns {string} Field label.
     */
    extractFieldLabel(recordObj, fieldKey) {
        const normalizedKey = this.normalizeFieldId(fieldKey);
        if (!normalizedKey) return '';

        const rawLabel = this.toJoinedString(recordObj?.[`${normalizedKey}_raw`]);
        if (rawLabel) return rawLabel;

        return this.toDisplayString(
            this.extractResponseFieldValue(recordObj, normalizedKey)
        );
    }

    /**
     * Builds a combined label for a record from one or more field ids.
     * @param {Object} recordObj - Knack record object.
     * @param {string|number|Array<string|number>} fieldKeys - Field ids to use for the label.
     * @returns {string} Joined record label.
     */
    getRecordLabel(recordObj, fieldKeys) {
        const keys = Array.isArray(fieldKeys) ? fieldKeys : [fieldKeys];

        if (recordObj && typeof recordObj === 'object' && keys.length) {
            const seen = new Set();
            const parts = [];

            for (const value of keys) {
                const fieldId = this.normalizeFieldId(value);
                if (!fieldId || seen.has(fieldId)) continue;
                seen.add(fieldId);

                const label = this.extractFieldLabel(recordObj, fieldId);
                if (label) parts.push(label);
            }

            if (parts.length) return parts.join(' - ');
        }

        return this.toStringSafe(recordObj?.id);
    }
}

const knackValueResolver = new KnackValueResolver(knackNavigator);

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
// Section: misc-helpers
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

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
    const normalisedViewId = knackNavigator.normalizeViewId(viewId);
    const view = document.getElementById(normalisedViewId);
    if (!view || !Array.isArray(fieldIds) || !view.querySelector('tbody tr:not(.kn-table-group)')) return;

    fieldIds.forEach((fieldId) => {
        const field = knackNavigator.normalizeFieldId(fieldId);
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: detail-text-url
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Compatibility shims (deprecated names kept for existing callers; remove in V3)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Curried operator helper from V1 (`evaluate(a)('<')(b)`).
 * @deprecated Use the JavaScript operator directly (or applyOperator()); kept so existing page code keeps working.
 * @param {*} a - Left operand.
 * @returns {(operator: string) => (b: *) => *} Applies `operator` to `a` and `b`; `'Invalid operation'` for unknown operators.
 */
const evaluate = (a) => (operator) => (b) => {
    warnDeprecated('evaluate', 'the JavaScript operator directly');
    return applyOperator(a, operator, b);
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

/**
 * @deprecated Use getValueFromDetail(), which does the same.
 * @param {string|number} fieldID - Field id number.
 * @param {boolean} [returnHtml=false] - Return the inner HTML instead of the text.
 * @returns {string|null}
 */
function getValueFromDetailBody(fieldID, returnHtml = false) {
    warnDeprecated('getValueFromDetailBody', 'getValueFromDetail()');
    return getValueFromDetail(fieldID, returnHtml);
}

/**
 * @deprecated Use knackNavigator.getSceneInfoForView(), which also falls back to the scene scan for the slug.
 * @param {string|number} viewId - View id.
 * @returns {{key: string, slug: string|null}|null}
 */
function getSceneFromViewId(viewId) {
    warnDeprecated('getSceneFromViewId', 'knackNavigator.getSceneInfoForView()');
    const info = viewId ? knackNavigator.getSceneInfoForView(viewId) : null;
    return info?.key ? { key: info.key, slug: info.slug || null } : null;
}



// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Not yet ported (kept here so the globals list stays complete; each line is removed as its item lands)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Format: TODO(v2-wave-N): globalName  - tests/v2/v2-structure.test.cjs reads these lines.

// Wave 1
// TODO(v2-wave-1): createBulkActionStorageAdapter
// TODO(v2-wave-1): renderVersionIndicator
// TODO(v2-wave-1): bulkActionResolveElement
// TODO(v2-wave-1): bulkActionFindViewRoot
// TODO(v2-wave-1): getViewMountElement
// TODO(v2-wave-1): bulkActionIsPlainObject
// TODO(v2-wave-1): bulkActionObjectOrEmpty
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
// TODO(v2-wave-1): insertLoggedInUser
// TODO(v2-wave-1): borderRadiusLastVisible
// TODO(v2-wave-1): openFileFromBtn
// TODO(v2-wave-1): handleRedirect
// TODO(v2-wave-1): getBackgroundSceneId
// TODO(v2-wave-1): isSceneToIgnore
// TODO(v2-wave-1): isUserRole
// TODO(v2-wave-1): isUserName
// TODO(v2-wave-1): replaceLargeNo
// TODO(v2-wave-1): normaliseToElement
// TODO(v2-wave-1): getCurrentSceneInfo
// TODO(v2-wave-1): getIdFromElement
// TODO(v2-wave-1): getConnectionIdFromHtml
// TODO(v2-wave-1): showPopUpNotification
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
// TODO(v2-wave-2): getAllTableRows
// TODO(v2-wave-2): applyMenuLinkFilters
// TODO(v2-wave-2): renderMenuButtons
// TODO(v2-wave-2): renderInteractiveTable
// TODO(v2-wave-2): copyTextToClipboard
// TODO(v2-wave-2): addCopyToDetails
// TODO(v2-wave-2): setupClickToCopy
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
// TODO(v2-wave-2): showRelevantWeeks
// TODO(v2-wave-2): MULTI_FORM_CONFIG
// TODO(v2-wave-2): MultiFormSubmissionCoordinator
// TODO(v2-wave-2): setupAutoFormSubmission
// TODO(v2-wave-2): addConnectionIdToRecord
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
