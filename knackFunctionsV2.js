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

    /**
     * Gets the Knack application id.
     * @returns {string|undefined}
     */
    getApplicationId() {
        return globalThis.Knack?.application_id;
    }

    /**
     * Gets the logged-in user's API token.
     * @returns {string|undefined}
     */
    getUserToken() {
        return globalThis.Knack?.getUserToken?.();
    }

    /**
     * Gets the logged-in user's attributes (id, name, email...).
     * @returns {Object} The attributes, or an empty object when nobody is logged in.
     */
    getUserAttributes() {
        return globalThis.Knack?.getUserAttributes?.() || {};
    }

    /**
     * Gets the logged-in user's role names.
     * @returns {Array<string>}
     */
    getUserRoleNames() {
        return globalThis.Knack?.getUserRoleNames?.() || [];
    }

    /**
     * Logs the current user out. Throws when Knack is unavailable, so callers decide how to recover.
     * @returns {void}
     */
    logout() {
        globalThis.Knack.user.destroy();
    }

    /**
     * Gets the rendered Knack view (the Backbone view, with `.model`) for a view id.
     * @param {string|number} viewId - View id to resolve.
     * @returns {Object|undefined}
     */
    getRenderedView(viewId) {
        const vid = this.normalizeViewId(viewId);
        return vid ? globalThis.Knack?.views?.[vid] : undefined;
    }

    /**
     * Gets the model behind a view: the rendered view's model, else Knack's global model registry.
     * @param {string|number} viewId - View id to resolve.
     * @returns {Object|undefined}
     */
    getViewModel(viewId) {
        const vid = this.normalizeViewId(viewId);
        return vid ? (this.getRenderedView(vid)?.model || globalThis.Knack?.models?.[vid]) : undefined;
    }

    /**
     * Gets the current scene's model for a view (`attributes` holds its columns, type and options).
     * @param {string|number} viewId - View id to resolve.
     * @returns {Object|undefined}
     */
    getSceneViewModel(viewId) {
        return globalThis.Knack.router.scene_view.model.views._byId[this.normalizeViewId(viewId)];
    }

    /**
     * Returns the raw field definitions of a view (not normalised), wherever Knack keeps them for its model.
     * @param {string|number} viewId - View id to inspect.
     * @returns {Array<Object>}
     */
    getViewFieldDefinitions(viewId) {
        const model = this.getRenderedView(viewId)?.model;
        return [model?.view?.fields, model?.fields, model?.attributes?.fields].find(Array.isArray) || [];
    }

    /**
     * Gets the key of the scene currently displayed.
     * @returns {string|undefined}
     */
    getCurrentSceneKey() {
        return globalThis.Knack?.router?.current_scene_key;
    }

    /**
     * Gets the current scene's hash (e.g. `#home/`).
     * @returns {string}
     */
    getSceneHash() {
        return globalThis.Knack.getSceneHash();
    }

    /**
     * Whether Knack is showing a modal for the current scene.
     * @returns {boolean}
     */
    isModalActive() {
        return Boolean(globalThis.Knack?.router?.scene_view?.model?.attributes?.modal);
    }

    /**
     * Navigates with Knack's router (no page reload).
     * @param {string} hash - Route without the leading `#`.
     * @param {{trigger?: boolean, syncVars?: boolean}} [options] - `trigger` runs the route's handlers; `syncVars` refreshes Knack's hash variables.
     * @returns {boolean} False when the router isn't available, so the caller can fall back to `location.hash`.
     */
    navigateToHash(hash, { trigger = false, syncVars = false } = {}) {
        const { router } = globalThis.Knack || {};
        if (typeof router?.navigate !== 'function') return false;
        router.navigate(hash, trigger);
        if (syncVars) globalThis.Knack.setHashVars?.();
        return true;
    }

    /**
     * Gets the logged-in user's name.
     * @returns {string|undefined} The name, or undefined when nobody is logged in.
     */
    getUserName() {
        return globalThis.Knack?.getUserAttributes?.()?.name;
    }

    /**
     * Whether the logged-in user's name equals a value.
     * @param {string} nameToMatch - Name to compare.
     * @returns {boolean}
     */
    isUserName(nameToMatch) {
        return this.getUserName() === nameToMatch;
    }

    /**
     * Whether the logged-in user has any of the given roles.
     * @param {string|string[]} roles - Role id(s) or name(s) accepted by `Knack.getUserRoles`.
     * @returns {boolean}
     */
    isUserRole(roles) {
        return [roles].flat().filter((role) => role != null).some((role) => Boolean(globalThis.Knack.getUserRoles(role)));
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
    const name = knackNavigator.getUserName();
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
// Section: clipboard-user-scene
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Batch 5: V1 lines 11361-11503, 11609-11642, 18359-18429, 18641-18686, 18865-18873, 19119-19144.
// Native DOM only. Exceptions kept on jQuery: Chosen selects in onInputChange (Chosen announces changes via jQuery trigger).

/**
 * Copies text to the clipboard and flashes a "copied" notification next to the element.
 * @param {HTMLElement} element - Element the notification attaches to.
 * @param {string} text - Text to copy.
 * @param {string} message - Notification text.
 */
function copyTextToClipboard(element, text, message) {
    const legacyCopy = () => {
        const textarea = Object.assign(document.createElement('textarea'), { value: text });
        document.body.append(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch { /* copy unsupported */ }
        textarea.remove();
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(legacyCopy);
    else legacyCopy();

    const parent = element.closest('td, .kn-detail-body');
    if (parent) {
        parent.style.position = 'relative';
        parent.style.overflow = 'visible';
    }
    showNotification({
        target: parent || element,
        message,
        backgroundColor: 'var(--success)',
        className: 'ca-notification ca-notification-copy',
        delay: 1000,
    });

    // Non-table views place the notification differently.
    const notification = parent && !parent.closest('table') && parent.querySelector('.ca-notification-copy');
    if (notification) {
        notification.style.left = '120px';
        notification.style.opacity = '0.85';
    }
}

/**
 * Makes each detail value in a view click-to-copy.
 * @param {Element} viewEle - View root.
 * @param {Object} [options={}]
 * @param {boolean} [options.addIcon=true] - Append a clipboard icon.
 * @param {string} [options.message='Text Copied'] - Notification text.
 * @param {string[]} [options.excludeFieldIds=[]] - `field_N` classes to skip.
 * @param {boolean} [options.includeLabels=false] - Copy `Label: value`.
 */
function addCopyToDetails(viewEle, options = {}) {
    if (!viewEle) return;
    const { addIcon = true, message = 'Text Copied', excludeFieldIds = [], includeLabels = false } = options;

    viewEle.querySelectorAll('.kn-detail-body').forEach((detail) => {
        if (detail.closest('.kn-details-link')) return;
        const fieldWrapper = detail.closest('[class*="field_"]');
        if (fieldWrapper && Array.from(fieldWrapper.classList).some((name) => excludeFieldIds.includes(name))) return;

        const originalText = detail.textContent.trim();
        if (!originalText || detail.dataset.copyEnabled === 'true') return;
        detail.dataset.copyEnabled = 'true';

        let finalText = originalText;
        const fieldClass = includeLabels && fieldWrapper && Array.from(fieldWrapper.classList).find((name) => name.startsWith('field_'));
        const labelText = fieldClass
            ? viewEle.querySelector(`.kn-label-top.${fieldClass}, .kn-detail.${fieldClass}`)?.querySelector('.kn-detail-label')?.textContent.trim()
            : '';
        if (labelText) finalText = `${labelText}: ${originalText}`;

        if (addIcon) {
            const icon = Object.assign(document.createElement('span'), { textContent: ' 📋' });
            icon.style.userSelect = 'none';
            detail.append(icon);
        }
        detail.style.cursor = 'pointer';
        detail.addEventListener('click', () => copyTextToClipboard(detail, finalText, message));
    });
}

/**
 * Makes `.ca-click-to-copy` elements in a view click-to-copy (with a clipboard icon, and a message per contact type).
 * @param {string} viewId - View id.
 */
function setupClickToCopy(viewId) {
    const messages = {
        'client-contact-num': 'Client Number Copied',
        'funder-email': 'Funder Email Copied',
        'funder-contact-num': 'Funder Number Copied',
        'funder-office-num': 'Funder Office Number Copied',
        'client-email': 'Client Email Copied',
    };
    document.querySelectorAll(`#${viewId} .ca-click-to-copy`).forEach((element) => {
        let text = element.textContent.trim();
        if (text === '📋' || text === '') {
            element.style.display = 'none';
            return;
        }
        text = text.replace(' 📋', '');
        if (!element.textContent.includes('📋')) element.textContent = `${text} 📋`;

        const message = messages[Object.keys(messages).find((name) => element.classList.contains(name))] ?? 'Text Copied';
        element.addEventListener('click', () => copyTextToClipboard(element, text, message));
    });
}

/**
 * Calls `callback(element)` whenever an input changes, and once now unless `onload` is false.
 * Chosen selects are bound through jQuery because Chosen announces changes with jQuery's trigger.
 * @param {Element|JQuery|string|Array} inputElement - Input(s) to watch.
 * @param {(element: Element) => void} callback - Receives the changed element.
 * @param {boolean} [onload=true] - Fire a change event straight away.
 */
function onInputChange(inputElement, callback, onload = true) {
    resolveElements(inputElement).forEach((element) => {
        const handler = () => callback(element);
        if (element.classList.contains('chzn-done')) globalThis.jQuery(element).on('change', handler); // Chosen select.
        else element.addEventListener('change', handler);
        if (onload) fireEvent(element, 'change');
    });
}

/**
 * Shows or hides the Knack input or title block containing an element.
 * @param {boolean} shouldShow - True to show, false to hide.
 * @param {string} eleSelector - Selector of an element inside the block.
 */
function toggleMessage(shouldShow, eleSelector) {
    document.querySelectorAll('.kn-input, .kn-special-title').forEach((container) => {
        if (container.querySelector(eleSelector)) container.style.display = shouldShow ? 'block' : 'none';
    });
}

/**
 * Gets the DOM id of the page's background scene, ignoring scenes inside a modal.
 * @returns {string|null} e.g. `kn-scene_1151`, or null.
 */
function getBackgroundSceneId() {
    const scene = Array.from(document.querySelectorAll('#knack-body .kn-scenes .kn-scene')).find((candidate) => !candidate.closest('.kn-modal'));
    return scene?.id || null;
}

/**
 * Whether the background scene is one of the given scene numbers.
 * @param {Array<string|number>} scenes - Scene numbers, e.g. `[1151]`.
 * @returns {boolean}
 */
function isSceneToIgnore(scenes) {
    const backgroundSceneId = getBackgroundSceneId();
    if (!backgroundSceneId || !scenes.length) return false;
    return scenes.map(Number).includes(Number(backgroundSceneId.replace('kn-scene_', '')));
}

/**
 * Shows a temporary notification after an element (HTML text, as in V1) and fades it out.
 * V1 also called `Knack.showSpinner()` and never hid it; that call is kept.
 * @param {string|Element|JQuery} insertNotificationAfter - Element(s) to place the notification after.
 * @param {string} notificationTxt - Notification HTML.
 * @param {string} notificationCol - Background colour.
 * @param {string} ca_class - Class for the notification.
 * @param {number} delay - Milliseconds before it fades out.
 */
function showPopUpNotification(insertNotificationAfter, notificationTxt, notificationCol, ca_class, delay) {
    Knack.showSpinner();
    resolveElements(insertNotificationAfter).forEach((target) => {
        const notification = Object.assign(document.createElement('div'), { className: ca_class, innerHTML: notificationTxt });
        notification.style.backgroundColor = notificationCol;
        target.after(notification);
        setTimeout(() => notification.animate({ opacity: [1, 0] }, { duration: 400, fill: 'forwards' }).finished.then(() => notification.remove()), delay || 0);
    });
}

/**
 * Writes the logged-in user's name into elements.
 * @param {string|Element|NodeList} selector - Selector, element or NodeList to fill.
 * @param {(userName: string) => void} [callback] - Called with the name after filling.
 * @returns {string} The user's name (`Unknown User` when absent, `User Unknown` on error).
 */
function insertLoggedInUser(selector, callback) {
    try {
        const userName = knackNavigator.getUserName() || 'Unknown User';
        if (typeof selector !== 'string' && !(selector instanceof Element) && !(selector instanceof NodeList)) {
            console.error('Invalid selector type provided to insertLoggedInUser');
            return userName;
        }
        const elements = resolveElements(selector);
        if (typeof selector === 'string' && !elements.length) {
            console.warn(`No elements found matching selector: ${selector}`);
            return userName;
        }
        elements.forEach((element) => { element.textContent = userName; });
        if (typeof callback === 'function') callback(userName);
        return userName;
    } catch (error) {
        console.error('Error inserting logged in user:', error);
        return 'User Unknown';
    }
}

/**
 * Rounds the right corners of the last visible menu link in a view.
 * @param {string} viewId - View id.
 * @param {number} [delay] - If given, runs again after this many milliseconds.
 */
function borderRadiusLastVisible(viewId, delay) {
    const menuList = document.getElementById(viewId)?.querySelector('.menu-links__list');
    const visible = Array.from(menuList?.children ?? []).filter((li) => getComputedStyle(li).display !== 'none' && li.offsetParent !== null);
    if (!visible.length) return;

    visible.forEach((li) => { if (li.querySelector('a')) li.querySelector('a').style.borderRadius = ''; });
    const lastLink = visible.at(-1).querySelector('a');
    if (lastLink) lastLink.style.borderRadius = '0 .35em .35em 0';
    if (delay) setTimeout(() => borderRadiusLastVisible(viewId), delay);
}

/**
 * Gets the record id of a form view's submit area.
 * @param {string} viewId - View id.
 * @returns {string|undefined}
 */
function getFormId(viewId) {
    return document.querySelector(`#${viewId} .kn-submit input[name="id"]`)?.value;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: dates-postcodes
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Batch 6: V1 lines 11702-11762, 11996-12150, 13820-13923. Native; same signatures and results as V1.

/**
 * Maps a UK date to the first range whose `max` (months ago) it is under.
 * @param {string} dateStr - Date as `dd/mm/yyyy`.
 * @param {Array<{max: number, label: *}>} ranges - Ranges in ascending order.
 * @returns {*} The matching label, or false (with a console error) when none match.
 */
function mapDateToRange(dateStr, ranges) {
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();
    const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    const match = ranges.find((range) => monthsAgo < range.max);
    if (!match) console.error(`No match found in range "${ranges}" for date "${dateStr}".`);
    return match ? match.label : false;
}

/**
 * Parses a Date, timestamp or string (`dd/mm/yyyy`, `dd/mm/yy`, or anything `Date` accepts; HTML is stripped).
 * @param {Date|number|string} input - Value to parse.
 * @returns {Date|null} A new Date, or null when invalid.
 */
function parseDateObject(input) {
    const validOrNull = (date) => (Number.isNaN(date.getTime()) ? null : date);
    if (input instanceof Date) return validOrNull(new Date(input.getTime()));
    if (typeof input === 'number') return validOrNull(new Date(input));
    if (typeof input !== 'string') return null;

    const cleanDate = removeHtml(input).trim();
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(cleanDate);
    if (!dmy) return validOrNull(new Date(cleanDate));

    const [day, month] = [parseInt(dmy[1], 10), parseInt(dmy[2], 10)];
    const year = parseInt(dmy[3], 10) + (dmy[3].length === 2 ? 2000 : 0); // Two-digit years mean 2000-2099.
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/**
 * Resolves a date argument (Date or anything {@link parseDateObject} takes), warning when it cannot be parsed.
 * A Date is returned as given, even an invalid one.
 * @param {*} inputDate - Value to resolve.
 * @param {string} caller - Function name for the warning.
 * @returns {Date|null}
 */
function resolveDateInput(inputDate, caller) {
    const date = inputDate instanceof Date ? inputDate : parseDateObject(inputDate);
    if (!date) console.warn(`${caller}: cannot parse date:`, inputDate);
    return date;
}

/**
 * Splits a Date into UK date and 24-hour time strings.
 * @param {Date} dateObj - Date to format.
 * @returns {{date: string, time: string}} `dd/mm/yyyy` and `HH:mm`.
 */
function formatDateTimeParts(dateObj) {
    const two = (number) => String(number).padStart(2, '0');
    return {
        date: `${two(dateObj.getDate())}/${two(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`,
        time: `${two(dateObj.getHours())}:${two(dateObj.getMinutes())}`,
    };
}

/**
 * Formats a date as `dd/mm/yyyy`.
 * @param {Date|number|string} inputDate - Date to format.
 * @returns {string} Empty string when unparseable.
 */
function getDateUKFormat(inputDate) {
    return resolveDateInput(inputDate, 'getDateUKFormat')?.toLocaleDateString('en-GB') ?? '';
}

/**
 * Adds days to a date and formats it as `dd/mm/yyyy`.
 * @param {Date|number|string} inputDate - Start date.
 * @param {number} [daysOffset=0] - Days to add (negative to subtract).
 * @returns {string} Empty string when unparseable.
 */
function getOffsetDateUK(inputDate, daysOffset = 0) {
    const date = parseDateObject(inputDate);
    if (!date) {
        console.warn('getOffsetDateUK: cannot parse date:', inputDate);
        return '';
    }
    date.setDate(date.getDate() + daysOffset);
    return getDateUKFormat(date);
}

/**
 * Formats the time of a date.
 * @param {Date|number|string} inputDate - Date to format.
 * @param {number|string} [timeFormat=24] - `12` (`3:05pm`) or `24` (`15:05`).
 * @returns {string} Empty string when unparseable.
 */
function formatTime(inputDate, timeFormat = 24) {
    const date = resolveDateInput(inputDate, 'formatTime');
    if (!date) return '';
    const format = String(timeFormat || 24).trim();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    if (format === '12') return `${date.getHours() % 12 || 12}:${minutes}${date.getHours() >= 12 ? 'pm' : 'am'}`;
    if (format !== '24') console.warn('formatTime: unsupported time format, falling back to 24:', timeFormat);
    return `${String(date.getHours()).padStart(2, '0')}:${minutes}`;
}

/**
 * Gets the weekday name of a date.
 * @param {Date|number|string} inputDate - Date.
 * @param {string} [locale='en-GB'] - Locale for the name.
 * @returns {string} Empty string when unparseable.
 */
function getWeekdayName(inputDate, locale = 'en-GB') {
    return resolveDateInput(inputDate, 'getWeekdayName')?.toLocaleDateString(locale, { weekday: 'long' }) ?? '';
}

/**
 * Formats a number or numeric text as currency.
 * @param {*} value - Value; everything except digits, `.` and `-` is ignored.
 * @param {{locale?: string, currency?: string}} [options={}] - Defaults `en-GB` and `GBP`.
 * @returns {string} Empty string when not numeric or the currency is invalid.
 */
function formatCurrency(value, options = {}) {
    const amount = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(amount)) return '';
    const locale = String(options.locale || 'en-GB').trim() || 'en-GB';
    const currency = String(options.currency || 'GBP').trim().toUpperCase() || 'GBP';
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch (error) {
        console.warn('formatCurrency: unable to format currency.', { value, options, error });
        return '';
    }
}

/**
 * Gets the last millisecond of a date's day (local time) as an ISO string.
 * @param {Date|number|string} inputDate - Date.
 * @returns {string} Empty string when unparseable.
 */
function getEndOfDayIso(inputDate) {
    const date = parseDateObject(inputDate);
    if (!date) return '';
    date.setHours(23, 59, 59, 999);
    return date.toISOString();
}

/**
 * Gets today's date minus a number of weeks, as `dd/mm/yyyy`.
 * @param {number} weeksAgo - Weeks to go back.
 * @returns {string}
 */
function getWeeksAgoDate(weeksAgo) {
    return getDateUKFormat(new Date(Date.now() - weeksAgo * 7 * 24 * 60 * 60 * 1000));
}

/**
 * Lists the 52 consecutive week field ids starting at a field number.
 * @param {number} startFieldNum - First field number.
 * @returns {string[]} `field_N` ids.
 */
function getArrayOfWeekNumbersAndFields(startFieldNum) {
    return Array.from({ length: 52 }, (_, index) => `field_${startFieldNum + index}`);
}

/**
 * Gets the ISO-8601 week number of a date.
 * @param {Date} date - Date.
 * @returns {number}
 */
function getWeekNumber(date) {
    const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7)); // Nearest Thursday decides the year.
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    return Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
}

/**
 * Extracts a UK postcode from the end of an address (HTML stripped).
 * @param {string} address - Address text.
 * @returns {string} Upper-cased postcode, or `''`.
 */
function extractPostcode(address) {
    if (!address) return '';
    return removeHtml(address).trim().match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i)?.[0].toUpperCase() ?? '';
}

/**
 * Breaks a UK postcode (full, or just an outcode plus sector digit) into its parts.
 * @param {*} value - Postcode text.
 * @returns {{formatted: string, compact: string, sector: string, sectorCompact: string, outcode: string, inward: string, unit: string, isFullPostcode: boolean}}
 */
function normaliseUkPostcode(value) {
    const result = (parts = {}) => ({ formatted: '', compact: '', sector: '', sectorCompact: '', outcode: '', inward: '', unit: '', isFullPostcode: false, ...parts });
    const raw = String(value ?? '').trim().toUpperCase();
    const full = extractPostcode(raw).replace(/\s+/g, '');
    if (full) {
        const formatted = `${full.slice(0, -3)} ${full.slice(-3)}`.trim();
        const sector = formatted.replace(/[A-Z]{2}$/i, '').trim();
        const inward = formatted.slice(-3).trim();
        return result({ formatted, compact: full, sector, sectorCompact: sector.replace(/\s+/g, ''), outcode: formatted.slice(0, -4).trim(), inward, unit: inward.slice(-2), isFullPostcode: true });
    }
    const compact = raw.replace(/\s+/g, '');
    const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d)$/i);
    if (!match) return result();
    const sector = `${match[1].toUpperCase()} ${match[2]}`;
    return result({ formatted: sector, compact: compact.toUpperCase(), sector, sectorCompact: compact.toUpperCase(), outcode: match[1].toUpperCase() });
}

/**
 * Validates a UK mobile number (11 digits starting 07; brackets, dashes and spaces ignored).
 * @param {*} value - Number as typed.
 * @param {{allowIncomplete?: boolean}} [options={}] - Accept a valid prefix of up to 11 digits.
 * @returns {{isValid: boolean, message: string}}
 */
function validateUkMobileNumber(value, options = {}) {
    const message = 'Enter an 11-digit mobile number starting with 07.';
    const valid = () => ({ isValid: true, message: '' });
    const invalid = (text = message) => ({ isValid: false, message: text });
    const number = knackValueResolver.normalizeComparableText(value).replace(/[()\-\s]+/g, '');

    if (!number) return valid();
    if (number.startsWith('+44') || number.startsWith('0044')) return invalid(`${message} Do not use +44 or 0044.`);
    if (!/^\d+$/.test(number) || !number.startsWith('0')) return invalid();
    if (number.length > 1 && !number.startsWith('07')) return invalid();
    if (options?.allowIncomplete && number.length <= 11) return valid();
    return /^07\d{9}$/.test(number) ? valid() : invalid();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: field-values
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: inputs-selects
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: showhide-keywords
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Batch 9: V1 lines 7661-7669, 13333-13423, 19020-19113, 20717-20903. Native DOM; the jQuery slide animation is
// replaced by the Web Animations API. Exception kept on jQuery: Knack form-submit events (bound through jQuery).

/**
 * Slides elements open or closed (height animation), like jQuery's slideDown/slideUp/slideToggle.
 * @param {Element|string|JQuery|Array} elements - Element reference(s).
 * @param {boolean|undefined} show - True to open, false to close, undefined to toggle each element.
 * @param {number|'fast'|'slow'} [duration=400] - Milliseconds, or jQuery's `fast` / `slow`.
 * @returns {Promise<void>} Resolves when every animation has finished.
 */
async function slideElements(elements, show, duration = 400) {
    const ms = { fast: 200, slow: 600 }[duration] ?? (Number.isFinite(Number(duration)) ? Number(duration) : 400);
    await Promise.all(resolveElements(elements).map(async (element) => {
        const opening = show ?? getComputedStyle(element).display === 'none';
        if (opening) element.style.display = '';
        if (opening && getComputedStyle(element).display === 'none') element.style.display = 'block';
        const open = `${element.scrollHeight}px`;
        const keyframes = opening ? [{ height: '0px' }, { height: open }] : [{ height: open }, { height: '0px' }];
        element.style.overflow = 'hidden';
        await element.animate(keyframes, { duration: ms || 0 }).finished;
        element.style.overflow = '';
        if (!opening) element.style.display = 'none';
    }));
}

/**
 * Binds one click handler per element and namespace, replacing any earlier one (like jQuery's `off('click.ns').on(...)`).
 * @param {Element} element - Element to bind.
 * @param {string} namespace - Handler name, e.g. `showHide`.
 * @param {(event: MouseEvent) => void} handler - New click handler.
 */
function bindClick(element, namespace, handler) {
    const registry = (bindClick.registry ??= new WeakMap()); // Handlers per element and namespace.
    const handlers = registry.get(element) ?? new Map();
    if (handlers.has(namespace)) element.removeEventListener('click', handlers.get(namespace));
    handlers.set(namespace, handler);
    registry.set(element, handlers);
    element.addEventListener('click', handler);
}

/**
 * Makes a button toggle content open and closed (slide), flipping the arrow (`down`/`up`) and the button's `active` class.
 * @param {Element|string|JQuery} buttonSelector - Button(s).
 * @param {Element|string|JQuery} hiddenSelector - Content to slide.
 * @param {Element|string|JQuery} arrowSelector - Arrow(s) whose `down`/`up` classes flip.
 * @param {number|string} delay - Slide duration.
 * @param {boolean} [flexOn=false] - Show the content as `display: flex`.
 */
function toggleShowHideViewContent(buttonSelector, hiddenSelector, arrowSelector, delay, flexOn = false) {
    resolveElements(buttonSelector).forEach((button) => bindClick(button, 'showHide', () => {
        slideElements(hiddenSelector, undefined, delay);
        resolveElements(arrowSelector).forEach((arrow) => { arrow.classList.toggle('down'); arrow.classList.toggle('up'); });
        resolveElements(buttonSelector).forEach((element) => element.classList.toggle('active'));
        if (flexOn) resolveElements(hiddenSelector).forEach((element) => { element.style.display = 'flex'; });
    }));
}

/**
 * Makes a "shrink" link close the content again.
 * @param {Element|string|JQuery} shrinkLinkSelector - Shrink link(s).
 * @param {Element|string|JQuery} hiddenSelector - Content to close.
 * @param {Element|string|JQuery} arrowSelector - Arrow(s) set back to `down`.
 * @param {number|string} delay - Slide duration.
 * @param {Element|string|JQuery} buttonSelector - Button(s) whose `active` class is removed.
 */
function shrinkContent(shrinkLinkSelector, hiddenSelector, arrowSelector, delay, buttonSelector) {
    resolveElements(shrinkLinkSelector).forEach((link) => bindClick(link, 'shrinkLink', () => {
        slideElements(hiddenSelector, false, delay);
        resolveElements(arrowSelector).forEach((arrow) => { arrow.classList.remove('up'); arrow.classList.add('down'); });
        resolveElements(buttonSelector).forEach((button) => button.classList.remove('active'));
    }));
}

/**
 * Wires the button and shrink link of a single-view show/hide section.
 * @param {string} showHideId - Section id used in the element ids and classes.
 * @param {number|string} delay - Slide duration.
 * @param {boolean} [flexOn=false] - Show the content as `display: flex`.
 */
function showHideViewContent(showHideId, delay, flexOn = false) {
    const button = `#show-hide_${showHideId}`;
    const arrow = `#arrow_${showHideId}`;
    const content = `.${showHideId}`;
    toggleShowHideViewContent(button, content, arrow, delay, flexOn);
    shrinkContent(`#shrink-link_${showHideId}`, content, arrow, delay, button);
}

/**
 * Adds the shrink link to a show/hide section (once).
 * @param {string} wrapperId - Id of the element holding the section.
 * @param {string} showHideId - Section id.
 * @param {boolean} [showHideGroup=false] - Append to the wrapper itself instead of its `.show-hide-section`.
 */
function appendShrinkLink(wrapperId, showHideId, showHideGroup = false) {
    if (document.getElementById(`shrink-link_${showHideId}`)) return;
    const html = `<a class="show-hide-btn shrink-link" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="arrow up" id="arrow_${showHideId}">◀</span></a>`;
    const wrapper = document.getElementById(wrapperId);
    const targets = showHideGroup ? [wrapper] : Array.from(wrapper?.querySelectorAll('.show-hide-section') ?? []);
    targets.filter(Boolean).forEach((target) => target.insertAdjacentHTML('beforeend', html));
}

/**
 * Replaces a view's title with a show/hide button (once).
 * @param {string} viewId - View id.
 * @param {string} showHideId - Section id.
 */
function replaceTitleWithButton(viewId, showHideId) {
    const titles = document.querySelectorAll(`#${viewId} h2.kn-title`);
    if (document.getElementById(`show-hide_${showHideId}`)) return;
    const titleText = Array.from(titles, (title) => title.textContent).join('');
    const html = `<div class="show-hide-btn" id="show-hide_${showHideId}">${escapeHtml(titleText)} &nbsp;<span class="arrow down" id="arrow_${showHideId}">◀</span></div>`;
    titles.forEach((title) => { title.innerHTML = html; });
}

/**
 * Wraps a view's content in a show/hide section.
 * @param {string} viewId - View id.
 * @param {'table'|'form'|'list'|string} viewType - View type; other types reuse an existing `section`.
 * @param {string} showHideId - Section id (also its class).
 */
function wrapContentForShowHide(viewId, viewType, showHideId) {
    const wrappers = { table: '.kn-table-wrapper, .kn-records-nav', form: 'form, .kn-form-confirmation', list: '.kn-list-content, .kn-records-nav' };
    const view = document.getElementById(viewId);
    const classes = `${showHideId} show-hide-section box-with-border`;
    if (wrappers[viewType]) {
        const content = Array.from(view?.querySelectorAll(wrappers[viewType]) ?? []);
        if (!content.length || content.some((element) => element.parentElement?.matches('section'))) return;
        const section = Object.assign(document.createElement('section'), { className: classes });
        content[0].before(section);
        section.append(...content);
        return;
    }
    const sections = Array.from(view?.querySelectorAll('section') ?? []);
    if (!sections.some((section) => ` ${section.className} `.includes(` ${classes} `))) sections.forEach((section) => section.classList.add(...classes.split(' ')));
}

/**
 * Collapses a group of views into one show/hide section headed by the first view's title.
 * @param {Array<string|number>} viewsToInclude - View numbers; the first is the main view.
 * @param {boolean} flexOn - Show the content as `display: flex`.
 */
function showHideGroup(viewsToInclude, flexOn) {
    const mainViewId = `view_${viewsToInclude[0]}`;
    const showHideId = `showHide_${mainViewId}`;
    const build = async () => {
        await Promise.all(viewsToInclude.map((view) => waitSelector({ selector: `#view_${view}` })));
        const viewTitle = await waitSelector({ selector: `#${mainViewId} h2.kn-title` });
        const mainView = document.getElementById(mainViewId);
        let wrapper = document.getElementById(`${mainViewId}_wrapper`);

        if (!document.getElementById(showHideId)) {
            viewTitle.style.display = 'none';
            mainView?.insertAdjacentHTML('beforebegin', `<div class="ktlHideShowButton" id="${showHideId}">${escapeHtml(viewTitle.textContent.trim())} &nbsp;<span class="ktlArrow ktlDown" id="arrow_${showHideId}">◀</span></div>`);
            wrapContentForShowHideGroup(viewsToInclude, showHideId);
            wrapper = document.getElementById(`${mainViewId}_wrapper`);
            if (wrapper && !document.getElementById(`shrink-link_${showHideId}`)) {
                wrapper.insertAdjacentHTML('beforeend', `<a class="ktlShrinkLink" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="ktlArrow ktlUp" id="arrow_${showHideId}">◀</span></a>`);
            }
        }

        const description = mainView?.querySelector('.kn-description');
        const section = document.querySelector(`.${showHideId}`);
        if (description?.textContent.trim() && section && !section.querySelector('.kn-description')) {
            section.prepend(description);
            description.style.display = '';
        }
        showHideViewGroupContent(showHideId, 1000, flexOn);
        if (wrapper) wrapper.style.marginTop = '13px';
    };
    build().catch((error) => {
        if (isDeveloper) console.warn('view/s missing from page', viewsToInclude, error);
    });
}

/**
 * Wraps a group of views in one hidden section (first view's wrapper), once.
 * @param {Array<string|number>} viewsArr - View numbers; the first is the main view.
 * @param {string} showHideId - Section class.
 */
function wrapContentForShowHideGroup(viewsArr, showHideId) {
    const mainViewId = `view_${viewsArr[0]}`;
    const mainView = document.getElementById(mainViewId);
    if (document.getElementById(`${mainViewId}_wrapper`)) return;

    const wrapper = Object.assign(document.createElement('section'), { className: `${showHideId} ktlBoxWithBorder ktlHideShowSection`, id: `${mainViewId}_wrapper` });
    wrapper.style.display = 'none';
    const viewWrapper = Object.assign(document.createElement('div'), { className: 'view-wrapper' });
    mainView.before(wrapper);
    wrapper.append(viewWrapper);
    viewWrapper.append(mainView, ...viewsArr.slice(1).map((view) => document.getElementById(`view_${view}`)).filter(Boolean));
}

/**
 * Stops mouse events on an element reaching KTL's long-press-refresh handlers.
 * @param {HTMLElement} element - Element to protect.
 */
function preventKtlLongPressRefresh(element) {
    if (!(element instanceof HTMLElement)) return;
    ['click', 'mousedown', 'mousemove', 'mouseup'].forEach((name) => element.addEventListener(name, (event) => event.stopPropagation()));
}

/**
 * `_vmxw` keyword: sets a view's max width (a bare number means px).
 * @param {{key: string}} view - Knack view.
 */
function setViewMaxWidth({ key: viewId }) {
    const viewElement = document.getElementById(viewId);
    ktl.core.getKeywordsByType(viewId, '_vmxw').forEach(({ options, params }) => {
        if (!ktl.core.hasRoleAccess(options) || !viewElement) return;
        const width = params[0][0];
        const parsed = parseFloat(width);
        viewElement.style.maxWidth = width.includes('%') || width.includes('px') || Number.isNaN(parsed) ? width : `${parsed}px`;
    });
}

/**
 * Removes empty detail values from a view (keeps the labels but drops the extra space).
 * @param {{key: string}} view - Knack view.
 */
function hideEmptyFields(view) {
    document.querySelectorAll(`#${view.key} .kn-detail-body`).forEach((detail) => {
        if (detail.textContent.trim() === '') detail.remove();
    });
}

/**
 * `_hebv` keyword: hides elements depending on a detail field's value
 * (`params[0]` field id, `params[1]` value, `!value` to invert, the rest are selectors to hide).
 * V1 also called borderRadiusLastVisible() with no view id, which did nothing; that call is dropped.
 * @param {{key: string}} view - Knack view.
 * @param {Object} keywords - Parsed view keywords.
 */
function hideElementsByValue(view, keywords) {
    const keyword = '_hebv';
    const { key: viewId } = view;
    if (!viewId || !keywords[keyword]) return;
    ktl.core.getKeywordsByType(viewId, keyword).forEach(({ options, params: paramGroups }) => {
        if (!ktl.core.hasRoleAccess(options)) return;
        paramGroups.filter((params) => params.length >= 3).forEach(([fieldId, valueToMatch, ...elementsToHide]) => {
            const fieldValue = Array.from(document.querySelectorAll(`.${fieldId} .kn-detail-body`), (element) => element.textContent).join('').trim();
            const shouldHide = valueToMatch.startsWith('!') ? fieldValue !== valueToMatch.slice(1) : fieldValue === valueToMatch;
            if (shouldHide) resolveElements(elementsToHide.join()).forEach((element) => { element.style.display = 'none'; });
        });
    });
}

/**
 * Reads `_rtp` keyword settings: `false` stops redirecting on close; a `scene_N` entry names a scene that cancels it.
 * @param {Array<{params?: Array}>} [keywordEntries=[]] - Keyword entries.
 * @returns {{redirectOnClose: boolean, sceneToIgnore: string}}
 */
function getRedirectToPopUpConfig(keywordEntries = []) {
    const config = { redirectOnClose: true, sceneToIgnore: '' };
    keywordEntries.forEach(({ params = [] } = {}) => {
        params.flat().map((param) => String(param || '').trim()).filter(Boolean).forEach((param) => {
            const lower = param.toLowerCase();
            if (lower === 'false') config.redirectOnClose = false;
            else if (lower.startsWith('scene_')) config.sceneToIgnore = param;
        });
    });
    return config;
}

/**
 * Makes modal close buttons redirect to the parent page instead of just closing (bound once per view).
 * @param {Object} options
 * @param {string} options.viewId - View id.
 * @param {string} options.parentUrl - Where to go.
 * @param {string} options.closeRedirectSelector - Close button selector.
 * @param {() => boolean} options.shouldSkipRedirect - Return true to leave the click alone.
 */
function bindRedirectToPopUpCloseButtons({ viewId, parentUrl, closeRedirectSelector, shouldSkipRedirect }) {
    document.querySelectorAll(closeRedirectSelector).forEach((button) => {
        if (button.dataset.rtpCloseBound === viewId) return;
        button.dataset.rtpCloseBound = viewId;
        button.addEventListener('click', (event) => {
            if (shouldSkipRedirect()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            handleRedirect(event, parentUrl);
        }, { capture: true });
    });
}

/**
 * `_rtp` keyword: when a view is shown in a modal, redirect to the parent page on close and after a form submit.
 * @param {{key: string}} view - Knack view.
 * @param {Object} keywords - Parsed view keywords.
 */
function redirectToPopUp(view, keywords) {
    const keyword = '_rtp';
    if (!keywords?.[keyword]) return;
    const viewId = view.key;
    const submitEvent = `knack-form-submit.${viewId}.rtp`;
    const $document = globalThis.jQuery(document); // Knack fires its events through jQuery.
    $document.off(submitEvent);
    if (!document.querySelector('.kn-modal')) return;

    const parentUrl = ktl.core.findParentURL(sanitiseURL(window.location.href), 1);
    if (!parentUrl) return;
    const { redirectOnClose, sceneToIgnore } = getRedirectToPopUpConfig(keywords[keyword]);
    const shouldSkipRedirect = () => sceneToIgnore && document.getElementById(`kn-${sceneToIgnore}`);
    if (shouldSkipRedirect()) return;

    if (redirectOnClose) {
        bindRedirectToPopUpCloseButtons({ viewId, parentUrl, closeRedirectSelector: '.kn-modal button.close-modal, .kn-modal .close-modal', shouldSkipRedirect });
    }
    if (ktl.views.getViewType(viewId) !== 'form') return;
    $document.on(submitEvent, (event) => {
        if (!shouldSkipRedirect()) handleRedirect(event, parentUrl);
    });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: detail-async-text
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: knack-api
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// KnackAPI and its access helpers: V1 lines 14153-17119 ported as-is (analysis C20: wave 3, no signature change).
/**
 * KnackAPI Class
 * Handles CRUD operations, filtering, sorting, pagination, and formatting
 * Does not require API keys (uses view-based methods only)
 *
 * @author Amanda Mower & Craig Winnall
 * @version 1.0.1
 */
class KnackAPI {
    static get DEFAULT_WRITE_CONCURRENCY() {
        return 6;
    }

    /**
     * Creates a new KnackAPI instance
     * @param {Object} options - Configuration options
     * @param {boolean} [options.showSpinner=false] - Whether to show the Knack spinner during API calls
     * @param {number} [options.timeout=60000] - Timeout for API requests in milliseconds
     * @param {boolean} [options.debug=false] - Whether to log debug information to console
     * @param {boolean} [options.developerOnly=true] - Whether to restrict logs to developers only
     * @param {Array<string>} [options.developerRoles=['Developer']] - User roles considered as developers
    * @param {number} [options.writeConcurrency=6] - Max concurrent create/update/delete requests (use Infinity for no limit)
     * @param {number} [options.retry429MaxAttempts=4] - Max attempts for 429 responses (initial + retries)
     * @param {number} [options.retry429BaseDelayMs=500] - Base delay in ms for exponential 429 backoff
     * @param {number} [options.retry429MaxDelayMs=10000] - Max delay in ms for 429 backoff
     */
    constructor(options = {}) {
        this.options = {
            showSpinner: options.showSpinner === true,
            timeout: Number.isFinite(options.timeout) ? options.timeout : 60000,
            debug: options.debug === true,
            developerOnly: options.developerOnly !== undefined ? options.developerOnly : true,
            developerRoles: options.developerRoles || ['Developer'],
            maxRetries: Number.isFinite(options.maxRetries)
                ? options.maxRetries
                : (Number.isInteger(options.retry429MaxAttempts) && options.retry429MaxAttempts > 0
                    ? Math.max(0, options.retry429MaxAttempts - 1)
                    : 2),
            retryDelayBase: Number.isFinite(options.retryDelayBase)
                ? options.retryDelayBase
                : (Number.isFinite(options.retry429BaseDelayMs) && options.retry429BaseDelayMs >= 0
                    ? options.retry429BaseDelayMs
                    : 300),
            retryDelayMax: Number.isFinite(options.retryDelayMax)
                ? options.retryDelayMax
                : (Number.isFinite(options.retry429MaxDelayMs) && options.retry429MaxDelayMs >= 0
                    ? options.retry429MaxDelayMs
                    : 20000),
            retryDelayMin429: Number.isFinite(options.retryDelayMin429) ? options.retryDelayMin429 : 1000,
            retryOnStatus: Array.isArray(options.retryOnStatus)
                ? options.retryOnStatus
                : [429, 500, 502, 503, 504],
            writeConcurrency: options.writeConcurrency,
            writeRatePerSecond: Number.isFinite(options.writeRatePerSecond) ? options.writeRatePerSecond : 9,
            writeMinConcurrency: Number.isFinite(options.writeMinConcurrency) ? options.writeMinConcurrency : 1,
            writeMaxConcurrency: Number.isFinite(options.writeMaxConcurrency) ? options.writeMaxConcurrency : options.writeConcurrency,
            writeRampDelayMs: Number.isFinite(options.writeRampDelayMs) ? options.writeRampDelayMs : 2000,
        };
        this.options.writeConcurrency = this._resolveWriteConcurrency(this.options.writeConcurrency);

        this._activeRequests = 0;
        this._inflightGets = new Map();
        this._initApiUsageState();
        this._initLogSettings();
        this._initWriteQueue();
    }

    /**
     * Retrieves records from a Knack view
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Object} [options] - Request options
     * @param {Array<Object>|Object} [options.filters] - Filter specifications
     * @param {Array<Object>|Object} [options.sorters] - Sort specifications
     * @param {number} [options.page] - Page number for pagination
     * @param {number} [options.rows] - Number of rows per page
     * @param {boolean} [options.rawResponse=false] - Return raw response instead of just records
     * @returns {Promise<Array<Object>|Object>} - Retrieved records or raw response
     * @public
     */
    async getRecords(sceneId, viewId, options = {}) {
        const opts = options || {};
        const params = this._buildQueryParams(opts);

        const url = this._formatApiUrl(sceneId, viewId) + this._formatParams(params);
        this._log('Getting records', url);

        const responseData = await this._request(url, { method: 'GET' }, opts.timeout);
        return opts.rawResponse ? responseData : responseData?.records;
    }

    /**
     * Fetches all records across multiple pages
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Object} [options] - Request options
     * @param {Array<Object>|Object} [options.filters] - Filter specifications
     * @param {Array<Object>|Object} [options.sorters] - Sort specifications
     * @param {number} [options.rows=1000] - Number of rows per page
     * @param {Function} [options.onProgress] - Callback function for progress updates
     * @returns {Promise<Array<Object>>} - All records
     * @public
     */
    async getAllRecords(sceneId, viewId, options = {}) {
        return this._fetchAllPages(
            (pageOpts) => this.getRecords(sceneId, viewId, pageOpts),
            options || {},
            { fetchingMessage: 'Fetching all records', failedMessage: 'Page fetch failed', logContext: { sceneId, viewId } }
        );
    }

    /**
     * Retrieves child records connected to a parent record
     * @param {string} sceneId - The scene ID/key/slug where the parent record is displayed
     * @param {string} viewId - The view ID/key where the parent record is displayed
    * @param {string} recordId - The ID of the parent record
    * @param {string} parentSceneSlug - The slug used by the parent scene route, e.g. `id`.
     * @param {Object} [options] - Request options
     * @param {Array<Object>|Object} [options.filters] - Filter specifications
     * @param {Array<Object>|Object} [options.sorters] - Sort specifications
     * @param {number} [options.page] - Page number for pagination
     * @param {number} [options.rows] - Number of rows per page
     * @param {boolean} [options.rawResponse=false] - Return raw response instead of just records
     * @param {number} [options.timeout] - Optional timeout override
     * @returns {Promise<Array<Object>|Object>} - Retrieved child records or raw response
     * @public
     */
    async getRecordChildren(sceneId, viewId, recordId, parentSceneSlug, options = {}) {
        const opts = options || {};
        const params = this._buildQueryParams(opts);
        const normalizedSceneSlug = String(parentSceneSlug || '').trim().replace(/^#/, '');

        if (!normalizedSceneSlug) {
            throw new Error('KnackAPI getRecordChildren requires a parentSceneSlug.');
        }

        // Format URL for child records
        // For view-based API, we use the pattern:
        // /pages/{scene_slug}/views/{view_key}/records?{scene_slug}_id={recordId}
        const url = this._formatApiUrl(sceneId, viewId);

        // Add the parent record ID as a parameter
        params[`${normalizedSceneSlug}_id`] = recordId;

        const formattedUrl = url + this._formatParams(params);
        this._log('Getting child records', formattedUrl);

        const responseData = await this._request(formattedUrl, { method: 'GET' }, opts.timeout);
        return opts.rawResponse ? responseData : responseData?.records;
    }

    /**
     * Retrieves all child records connected to a parent record across multiple pages.
     * @param {string} sceneId - The scene ID/key/slug where the parent record is displayed
     * @param {string} viewId - The view ID/key where the child records are displayed
    * @param {string} recordId - The ID of the parent record
    * @param {string} parentSceneSlug - The slug used by the parent scene route, e.g. `id`.
     * @param {Object} [options] - Optional parameters
     * @param {number} [options.rows=1000] - Number of rows per page
     * @param {Function} [options.onProgress] - Optional progress callback
     * @returns {Promise<Array<Object>>} - All connected child records
     * @public
     */
    async getAllRecordChildren(sceneId, viewId, recordId, parentSceneSlug, options = {}) {
        return this._fetchAllPages(
            (pageOpts) => this.getRecordChildren(sceneId, viewId, recordId, parentSceneSlug, pageOpts),
            options || {},
            { fetchingMessage: 'Fetching all child records', failedMessage: 'Child page fetch failed', logContext: { sceneId, viewId, recordId, parentSceneSlug } }
        );
    }

    /**
     * Fetches every page of a paged view request: page 1 first, then the rest in concurrent batches.
     * @param {(pageOpts: Object) => Promise<Object>} fetchPage - Fetches one page with `rawResponse: true`.
     * @param {Object} opts - `rows`, `pageConcurrency`, `filters`, `sorters`, `timeout`, `failOnPageError`, `onProgress`.
     * @param {{fetchingMessage: string, failedMessage: string, logContext: Object}} labels - Log wording and context.
     * @returns {Promise<Array>} All records.
     * @private
     */
    async _fetchAllPages(fetchPage, opts, { fetchingMessage, failedMessage, logContext }) {
        const rows = Number.isFinite(opts.rows) ? opts.rows : 1000;
        const pageConcurrency = Number.isFinite(opts.pageConcurrency) && opts.pageConcurrency > 0 ? Math.floor(opts.pageConcurrency) : 5;
        const pageOpts = { filters: opts.filters, sorters: opts.sorters, rows, rawResponse: true, timeout: opts.timeout };

        const firstPage = await fetchPage({ ...pageOpts, page: 1 });
        const totalPages = Number(firstPage?.total_pages || 0);
        const totalRecords = Number(firstPage?.total_records || 0);
        const allRecords = Array.isArray(firstPage?.records) ? [...firstPage.records] : [];
        this._log(fetchingMessage, { totalPages, totalRecords });
        if (totalRecords === 0 || totalPages <= 1) return allRecords;

        for (let batchStart = 2; batchStart <= totalPages; batchStart += pageConcurrency) {
            const batchEnd = Math.min(totalPages, batchStart + pageConcurrency - 1);
            const pageNumbers = Array.from({ length: batchEnd - batchStart + 1 }, (_, index) => batchStart + index);
            const results = await Promise.allSettled(pageNumbers.map((page) => fetchPage({ ...pageOpts, page })));
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    if (Array.isArray(result.value?.records)) allRecords.push(...result.value.records);
                    return;
                }
                this._log(failedMessage, { ...logContext, page: pageNumbers[index], error: result.reason?.message || result.reason }, 'warn');
                if (opts.failOnPageError) throw result.reason;
            });
            if (typeof opts.onProgress === 'function') {
                opts.onProgress({ page: batchEnd, totalPages, recordsLoaded: allRecords.length, totalRecords, percentage: Math.round((batchEnd / totalPages) * 100) });
            }
        }
        return allRecords;
    }

    /**
     * Creates a new record in a Knack view
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Object} recordData - The record data to create
     * @param {Object} [options]
     * @param {string|Array<string>} [options.refreshViews] - The view ID/key(s) to refresh after creation
     * @param {number} [options.timeout] - Optional timeout override
     * @param {boolean} [options.autoUploadAssets=false] - Upload File/Blob values and replace with Knack asset IDs before create.
     * @param {string[]} [options.assetFieldIds] - Optional allow-list of asset field keys.
     * @param {Object<string, 'file'|'image'>} [options.assetTypesByField] - Optional per-field upload type override.
     * @param {Function} [options.onAssetProgress] - Receives upload progress for auto-uploaded assets before record create.
    * @example
    * const fileInput = document.querySelector('#upload');
    * const file = fileInput?.files?.[0];
    * await api.createRecord('scene_1', 'view_2', {
    *   field_123: file,
    *   field_456: 'Notes'
    * }, {
    *   autoUploadAssets: true,
    *   assetFieldIds: ['field_123']
    * });
     * @returns {Promise<Object>} - The created record
     * @public
     */
    async createRecord(sceneId, viewId, recordData, options = {}) {
        this._assertWriteOptions(options, 'createRecord');
        const opts = options || {};
        const url = this._formatApiUrl(sceneId, viewId);
        this._log('Creating record', { url, data: recordData });
        const preparedRecordData = await this._prepareRecordData(recordData, opts);
        const effectiveRefresh = this._normalizeRefreshViews(opts.refreshViews);

        return this._enqueueWrite(async () => {
            const result = await this._request(
                url,
                {
                    method: 'POST',
                    body: this._prepareBody(preparedRecordData),
                    rateLimitHandler: (delayMs) => this._notifyWriteRateLimit(delayMs),
                    onRateLimit429: typeof opts._on429 === 'function' ? opts._on429 : null
                },
                opts.timeout
            );

            await this._refreshAfterWrite(effectiveRefresh);
            return result;
        });
    }

    /**
     * Creates multiple records with concurrency control.
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Array<Object>} recordsData - Array of record data objects to create
     * @param {Object} [options]
     * @param {string|Array<string>} [options.refreshViews] - The view ID/key(s) to refresh after creation
     * @param {number} [options.timeout] - Optional timeout override
     * @param {Function} [options.onProgress] - Receives {created, failed, total, index, record|error}
     * @param {number} [options.staggerMs=0] - Delay in ms between requests
     * @param {boolean} [options.continueOnError=false] - Continue processing remaining records when one fails
     * @param {boolean} [options.requireRecordId=false] - Treat a create response without a record id as a failure.
    * @param {boolean} [options.autoUploadAssets=false] - Upload File/Blob values and replace with Knack asset IDs before create.
    * @param {string[]} [options.assetFieldIds] - Optional allow-list of asset field keys.
    * @param {Object<string, 'file'|'image'>} [options.assetTypesByField] - Optional per-field upload type override.
    * @param {Function} [options.onAssetProgress] - Receives upload progress for auto-uploaded assets before record create.
     * @returns {Promise<{ total: number, created: number, failed: number, records: Array<Object> }>}
     * @public
     */
    async createRecords(sceneId, viewId, recordsData, options = {}) {
        this._assertWriteOptions(options, 'createRecords');
        if (!Array.isArray(recordsData)) {
            throw new Error('recordsData must be an array');
        }

        const payloads = recordsData.filter(Boolean);
        const total = payloads.length;
        if (!total) return { total: 0, created: 0, failed: 0, records: [] };

        const createdRecords = [];
        const { created, failed } = await this._runBatchWrite({
            operation: 'create',
            code: 'KNF_1028',
            target: `${sceneId}/${viewId}`,
            total,
            options,
            successKey: 'created',
            identify: (index) => ({ index }),
            failureDetail: (failedIndices) => `at indices: ${failedIndices.join(', ')}`,
            perform: async (index, requestOptions, opts) => {
                const record = await this.createRecord(sceneId, viewId, payloads[index], requestOptions);
                if (opts.requireRecordId && !this._extractRecordId(record)) {
                    throw new Error(`Create response did not include a record id at index ${index}.`);
                }
                createdRecords[index] = record;
                return { record };
            }
        });
        return { total, created, failed, records: createdRecords.filter(Boolean) };
    }

    /**
     * Uploads a File/Blob as a Knack asset and returns the uploaded asset payload.
     * @param {File|Blob} file
     * @param {Object} [options]
     * @param {'file'|'image'} [options.assetType] - Optional override. Auto-detected from mime type when omitted.
     * @param {number} [options.timeout] - Optional timeout override.
     * @param {Function} [options.onProgress] - Receives { loaded, total, percent, file, assetType } during upload.
     * @returns {Promise<Object>} Uploaded asset payload (must include id).
     * @public
     */
    async uploadAsset(file, options = {}) {
        if (!(file instanceof Blob)) {
            throw new Error('KnackAPI uploadAsset requires a File/Blob.');
        }

        const opts = options || {};
        const appId = knackNavigator.getApplicationId();
        if (!appId) {
            throw new Error('KnackAPI uploadAsset missing Knack application id.');
        }

        const inferredType = (file?.type || '').startsWith('image/') ? 'image' : 'file';
        const assetType = opts.assetType === 'image' || opts.assetType === 'file' ? opts.assetType : inferredType;
        const base = this._getApiBaseUrl().replace(/\/$/, '');
        const url = `${base}/applications/${appId}/assets/${assetType}/upload`;
        const uploadFileName = typeof file?.name === 'string' && file.name.length ? file.name : 'upload.bin';

        const formData = new FormData();
        formData.append('files', file, uploadFileName);

        return this._enqueueWrite(async () => {
            const result = await this._uploadAssetRequest(url, formData, {
                timeout: opts.timeout,
                headers: this._buildHeaders(true, { json: false }),
                onProgress: typeof opts.onProgress === 'function'
                    ? ({ loaded, total, percent }) => {
                        opts.onProgress({ loaded, total, percent, file, assetType });
                    }
                    : null,
                rateLimitHandler: (delayMs) => this._notifyWriteRateLimit(delayMs),
                onRateLimit429: typeof opts._on429 === 'function' ? opts._on429 : null
            });

            const asset = Array.isArray(result) ? result[0] : result;
            if (!asset || !asset.id) {
                throw new Error('KnackAPI uploadAsset succeeded but no asset id was returned.');
            }

            return asset;
        });
    }

    /**
     * Performs a multipart asset upload with retries and progress callbacks.
     * @param {string} url
     * @param {FormData} formData
     * @param {Object} [options]
     * @param {number} [options.timeout]
     * @param {Object} [options.headers]
     * @param {Function} [options.onProgress]
     * @param {Function} [options.rateLimitHandler]
     * @param {Function} [options.onRateLimit429]
     * @returns {Promise<Object>}
     * @private
     */
    async _uploadAssetRequest(url, formData, options = {}) {
        this._checkKnack();

        const opts = options || {};
        const timeoutMs = Number.isFinite(opts.timeout) ? opts.timeout : this.options.timeout;
        return this._runRetriedRequest(url, {
            method: 'POST',
            rateLimitHandler: opts.rateLimitHandler,
            onRateLimit429: opts.onRateLimit429,
            execute: async () => {
                const result = await this._uploadAssetRequestOnce(url, formData, {
                    headers: opts.headers,
                    timeout: timeoutMs,
                    onProgress: opts.onProgress
                });
                return { result, status: 200, headers: null };
            }
        });
    }

    /**
     * Performs one multipart asset upload attempt with XMLHttpRequest so progress can be tracked.
     * @param {string} url
     * @param {FormData} formData
     * @param {Object} [options]
     * @param {Object} [options.headers]
     * @param {number} [options.timeout]
     * @param {Function} [options.onProgress]
     * @returns {Promise<Object>}
     * @private
     */
    _uploadAssetRequestOnce(url, formData, options = {}) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.timeout = Number.isFinite(options.timeout) ? options.timeout : this.options.timeout;

            Object.entries(options.headers || {}).forEach(([headerName, headerValue]) => {
                if (headerValue != null && headerValue !== '') {
                    xhr.setRequestHeader(headerName, headerValue);
                }
            });

            xhr.upload.addEventListener('progress', (event) => {
                const total = event.lengthComputable ? event.total : 0;
                const loaded = Number(event.loaded) || 0;
                const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
                if (typeof options.onProgress === 'function') {
                    options.onProgress({ loaded, total, percent });
                }
            });

            xhr.addEventListener('load', () => {
                const responseText = typeof xhr.responseText === 'string' ? xhr.responseText : '';
                if (xhr.status >= 200 && xhr.status < 300) {
                    const result = responseText ? (() => {
                        try {
                            return JSON.parse(responseText);
                        } catch (error) {
                            return responseText;
                        }
                    })() : {};
                    resolve(result);
                    return;
                }

                reject({
                    status: xhr.status,
                    statusText: xhr.statusText,
                    responseText,
                    headers: this._createHeaderReader(xhr.getAllResponseHeaders())
                });
            });

            xhr.addEventListener('error', () => {
                reject({
                    status: xhr.status || 0,
                    statusText: 'Network error',
                    responseText: typeof xhr.responseText === 'string' ? xhr.responseText : '',
                    headers: this._createHeaderReader(xhr.getAllResponseHeaders())
                });
            });

            xhr.addEventListener('timeout', () => {
                reject({
                    status: 0,
                    statusText: 'Request timeout',
                    responseText: '',
                    headers: this._createHeaderReader(xhr.getAllResponseHeaders())
                });
            });

            xhr.addEventListener('abort', () => {
                reject({
                    status: 0,
                    statusText: 'Request aborted',
                    responseText: '',
                    headers: this._createHeaderReader(xhr.getAllResponseHeaders())
                });
            });

            xhr.send(formData);
        });
    }

    /**
     * Replaces File/Blob field values with uploaded Knack asset IDs when autoUploadAssets is enabled.
     * @param {Object} recordData
     * @param {Object} [options]
     * @param {Function} [options.onAssetProgress] - Receives { fieldKey, assetType, assetIndex, assetCount, loaded, total, percent, file }.
     * @returns {Promise<Object>}
     * @private
     */
    async _prepareRecordData(recordData, options = {}) {
        const data = recordData && typeof recordData === 'object' ? { ...recordData } : recordData;
        if (!options?.autoUploadAssets || !data || typeof data !== 'object') {
            return data;
        }

        const allowList = Array.isArray(options.assetFieldIds)
            ? new Set(options.assetFieldIds)
            : null;
        const typesByField = options.assetTypesByField || {};
        const assetEntries = Object.entries(data).filter(([fieldKey, value]) => {
            if (!(value instanceof Blob)) return false;
            if (allowList && !allowList.has(fieldKey)) return false;
            if (!allowList && !this._isAssetField(fieldKey)) return false;
            return true;
        });
        const assetCount = assetEntries.length;

        for (const [assetIndex, [fieldKey, value]] of assetEntries.entries()) {
            const resolvedAssetType = typesByField[fieldKey];
            const inferredAssetType = (value?.type || '').startsWith('image/') ? 'image' : 'file';

            const asset = await this.uploadAsset(value, {
                timeout: options.timeout,
                assetType: resolvedAssetType,
                onProgress: typeof options.onAssetProgress === 'function'
                    ? ({ loaded, total, percent, file, assetType }) => {
                        options.onAssetProgress({
                            fieldKey,
                            assetType: assetType || resolvedAssetType || inferredAssetType,
                            assetIndex,
                            assetCount,
                            loaded,
                            total,
                            percent,
                            file
                        });
                    }
                    : null
            });
            data[fieldKey] = asset.id;
        }

        return data;
    }

    /**
     * Determines whether a field key maps to a Knack file/image field.
     * @param {string} fieldKey
     * @returns {boolean}
     * @private
     */
    _isAssetField(fieldKey = '') {
        if (!fieldKey || typeof fieldKey !== 'string') return false;

        return ['file', 'image'].includes(knackNavigator.getFieldType(fieldKey));
    }

    /**
     * Updates a record in a Knack view with verification of updated fields
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {string} recordId - The record ID to update
     * @param {Object} recordData - The updated record data
     * @param {Object} [options]
     * @param {string|Array<string>} [options.refreshViews] - The view ID/key(s) to refresh after update
     * @param {number} [options.timeout] - Optional timeout override
     * @param {boolean} [options.autoUploadAssets=false] - Upload File/Blob values and replace with Knack asset IDs before update.
     * @param {string[]} [options.assetFieldIds] - Optional allow-list of asset field keys.
     * @param {Object<string, 'file'|'image'>} [options.assetTypesByField] - Optional per-field upload type override.
    * @example
    * const replacementFile = document.querySelector('#replace')?.files?.[0];
    * await api.updateRecord('scene_1', 'view_2', 'rec_abc', {
    *   field_123: replacementFile
    * }, {
    *   autoUploadAssets: true,
    *   assetTypesByField: { field_123: 'file' }
    * });
     * @returns {Promise<Object>} - The updated record
     * @public
     */
    async updateRecord(sceneId, viewId, recordId, recordData, options = {}) {
        this._assertWriteOptions(options, 'updateRecord');
        const opts = options || {};
        const preparedRecordData = await this._prepareRecordData(recordData, opts);
        const effectiveRefresh = this._normalizeRefreshViews(opts.refreshViews);

        return this._enqueueWrite(async () => {
            const url = this._formatApiUrl(sceneId, viewId, recordId);
            this._log('Updating record', { url, data: recordData });

            const result = await this._request(
                url,
                {
                    method: 'PUT',
                    body: this._prepareBody(preparedRecordData),
                    rateLimitHandler: (delayMs) => this._notifyWriteRateLimit(delayMs),
                    onRateLimit429: typeof opts._on429 === 'function' ? opts._on429 : null
                },
                opts.timeout
            );

            try {
                const recordObj = result?.record ?? result;
                const requestedKeys = Object.keys(preparedRecordData || {});
                const failed = [];
                for (const key of requestedKeys) {
                    const sentVal = preparedRecordData[key]; // What was actually sent (assets are uploaded and replaced first).
                    const gotVal = this._extractResponseValueFromRecord(recordObj, key, sentVal);

                    if (gotVal === undefined || !this._valuesEffectivelyEqualForField(key, gotVal, sentVal)) {
                        failed.push({
                            field: key,
                            sent: sentVal,
                            received: gotVal
                        });
                    }
                }

                if (failed.length > 0) {
                    const failedFields = failed.map(f => f.field).join(', ');
                    this._log('Field update verification: failures detected', {
                        sceneId,
                        viewId,
                        recordId,
                        failedFields,
                        failedCount: failed.length
                    }, 'warn');
                }
            } catch (verifyErr) {
                this._log('Field update verification error', verifyErr, 'error');
            }

            await this._refreshAfterWrite(effectiveRefresh);
            return result;
        });
    }

    /**
     * Updates multiple records with concurrency control.
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Array<string>|Array<Object>} recordIds - Array of record IDs, or array of per-record objects
     * @param {Object|Array|string} recordData - Shared record data, or options when using per-record objects
     * @param {Object} [options]
     * @param {string|Array<string>} [options.refreshViews] - The view ID/key(s) to refresh after updates
     * @param {number} [options.timeout] - Optional timeout override
     * @param {Function} [options.onProgress] - Receives {updated, failed, total, recordId, error?}
     * @param {number} [options.staggerMs=0] - Delay in ms between requests
     * @param {boolean} [options.continueOnError=false] - Continue processing remaining records when one fails
    * @param {boolean} [options.autoUploadAssets=false] - Upload File/Blob values and replace with Knack asset IDs before update.
    * @param {string[]} [options.assetFieldIds] - Optional allow-list of asset field keys.
    * @param {Object<string, 'file'|'image'>} [options.assetTypesByField] - Optional per-field upload type override.
     * @returns {Promise<{ total: number, updated: number, failed: number }>}
     * @public
     */
    async updateRecords(sceneId, viewId, recordIds, recordData, options = {}) {
        this._assertWriteOptions(options, 'updateRecords');
        if (!Array.isArray(recordIds)) {
            throw new Error('recordIds must be an array');
        }

        const isPerRecord = recordIds.length > 0 && recordIds.every(record => {
            if (record === null || typeof record !== 'object') return false;
            const hasIdShape = 'id' in record && 'data' in record;
            const hasLegacyShape = 'recordId' in record && 'recordData' in record;
            return hasIdShape || hasLegacyShape;
        });

        const hasMixedPerRecordShape = recordIds.some(record => record !== null && typeof record === 'object') && !isPerRecord;
        if (hasMixedPerRecordShape) {
            throw new Error('recordIds contains mixed shapes. Use all IDs with shared data, or all objects with {id, data}.');
        }

        const opts = isPerRecord
            ? ((recordData && typeof recordData === 'object' && !Array.isArray(recordData)) ? recordData : {})
            : (options || {});

        const records = isPerRecord
            ? recordIds
                .filter(record => record)
                .map(record => ('id' in record ? { id: record.id, data: record.data } : { id: record.recordId, data: record.recordData }))
                .filter(record => record.id)
            : recordIds.filter(Boolean).map(id => ({ id, data: recordData }));

        const total = records.length;
        if (!total) return { total: 0, updated: 0, failed: 0 };

        const { updated, failed } = await this._runBatchWrite({
            operation: 'update',
            code: 'KNF_1029',
            target: `${sceneId}/${viewId}`,
            total,
            options: opts,
            successKey: 'updated',
            identify: (index) => ({ recordId: records[index].id }),
            failureDetail: (failedIds) => `: ${failedIds.join(', ')}`,
            perform: async (index, requestOptions) => {
                await this.updateRecord(sceneId, viewId, records[index].id, records[index].data, requestOptions);
            }
        });
        return { total, updated, failed };
    }


    /**
     * Updates multiple records with the same data, with a delay between each request
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Array<string>} recordIds - Array of record IDs to update
     * @param {Object} recordData - The data to update each record with
     * @param {Object} [options]
     * @param {string|Array<string>} [options.refreshViews] - The view ID/key(s) to refresh after update
     * @param {number} [options.delay=300] - Delay in milliseconds between requests
     * @param {number} [options.timeout] - Optional timeout
     * @returns {Promise<Array<Object>>} - Array of responses from each update
     * @public
     */
    async updateRecordsWithDelay(sceneId, viewId, recordIds, recordData, options = {}) {
        const opts = options || {};
        const delay = Number.isFinite(opts.delay) ? Math.max(0, Number(opts.delay)) : 300;
        const results = [];

        for (let i = 0; i < recordIds.length; i++) {
            try {
                const result = await this.updateRecord(sceneId, viewId, recordIds[i], recordData, { timeout: opts.timeout });
                results.push(result);

                // Don't add delay after the last request
                if (i < recordIds.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (error) {
                results.push({ error, recordId: recordIds[i] });
            }
        }

        const effectiveRefresh = this._normalizeRefreshViews(opts.refreshViews);
        if (effectiveRefresh) await this.refreshView(effectiveRefresh);

        return results;
    }

    /**
     * Deletes a record in a Knack view
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {string} recordId - The record ID to delete
     * @param {Object} [options]
     * @param {string|Array<string>} [options.refreshViews] - The view ID/key(s) to refresh after deletion
     * @param {number} [options.timeout] - Optional timeout override
     * @returns {Promise<Object>} - Response data
     * @public
     */
    async deleteRecord(sceneId, viewId, recordId, options = {}) {
        this._assertWriteOptions(options, 'deleteRecord');
        const opts = options || {};
        const effectiveRefresh = this._normalizeRefreshViews(opts.refreshViews);
        return this._enqueueWrite(async () => {
            const url = this._formatApiUrl(sceneId, viewId, recordId);
            this._log('Deleting record', url);
            const result = await this._request(
                url,
                {
                    method: 'DELETE',
                    rateLimitHandler: (delayMs) => this._notifyWriteRateLimit(delayMs),
                    onRateLimit429: typeof opts._on429 === 'function' ? opts._on429 : null
                },
                opts.timeout
            );
            await this._refreshAfterWrite(effectiveRefresh);
            return result;
        });
    }

    /**
     * Deletes multiple records with concurrency control.
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Array<string>} recordIds - Array of record IDs to delete
     * @param {Object} [options]
     * @param {string|Array<string>} [options.refreshViews] - The view ID/key(s) to refresh after deletions
     * @param {number} [options.timeout] - Optional timeout override
     * @param {Function} [options.onProgress] - Receives {deleted, failed, total, recordId, error?}
     * @param {number} [options.staggerMs=0] - Delay in ms between requests
     * @param {boolean} [options.continueOnError=false] - Continue processing remaining records when one fails
     * @returns {Promise<{ total: number, deleted: number, failed: number }>}
     * @public
     */
    async deleteRecords(sceneId, viewId, recordIds, options = {}) {
        this._assertWriteOptions(options, 'deleteRecords');
        if (!Array.isArray(recordIds)) {
            throw new Error('recordIds must be an array');
        }

        const opts = options || {};
        const ids = recordIds.filter(Boolean);
        const total = ids.length;
        if (!total) return { total: 0, deleted: 0, failed: 0 };

        const { deleted, failed } = await this._runBatchWrite({
            operation: 'delete',
            code: 'KNF_1030',
            target: `${sceneId}/${viewId}`,
            total,
            options: opts,
            successKey: 'deleted',
            identify: (index) => ({ recordId: ids[index] }),
            failureDetail: (failedIds) => `: ${failedIds.join(', ')}`,
            perform: async (index, requestOptions) => {
                await this.deleteRecord(sceneId, viewId, ids[index], requestOptions);
            }
        });
        return { total, deleted, failed };
    }

    /**
     * Runs a batch of writes with bounded concurrency, progress callbacks, one refresh at the end, and failure and
     * summary logging. Shared by createRecords, updateRecords and deleteRecords.
     * @param {Object} config
     * @param {string} config.operation - `create`, `update` or `delete` (log wording).
     * @param {string} config.code - Failure log code.
     * @param {string} config.target - `scene/view` for the logs.
     * @param {number} config.total - Number of items.
     * @param {Object} config.options - Batch options (`refreshViews`, `continueOnError`, `staggerMs`, `onProgress`, ...).
     * @param {'created'|'updated'|'deleted'} config.successKey - Counter name for successes.
     * @param {(index: number) => Object} config.identify - Progress fields identifying an item (`{index}` or `{recordId}`).
     * @param {(failedIds: Array) => string} config.failureDetail - Suffix for the failure log.
     * @param {(index: number, requestOptions: Object, opts: Object) => Promise<Object|void>} config.perform - Does one write;
     *   its returned fields are added to the success progress event; throw to mark the item failed.
     * @returns {Promise<{failed: number}>} Counters keyed by `successKey` and `failed`.
     * @throws The first error when `continueOnError` is false.
     * @private
     */
    async _runBatchWrite({ operation, code, target, total, options, successKey, identify, failureDetail, perform }) {
        const effectiveRefresh = this._normalizeRefreshViews(options?.refreshViews);
        const batchOptions = { ...(options || {}) };
        delete batchOptions.refreshViews;

        const counts = { [successKey]: 0, failed: 0 };
        const failedIds = [];
        let rateLimit429Count = 0;
        const { opts, staggerMs, workerCount, requestOptions } = this._buildBatchContext(total, batchOptions, () => {
            rateLimit429Count += 1;
        });

        try {
            const { firstError } = await this._runBatchWorkers({
                total,
                workerCount,
                staggerMs,
                continueOnError: opts.continueOnError,
                execute: async (index) => {
                    const identity = identify(index);
                    try {
                        const extra = await perform(index, requestOptions, opts);
                        counts[successKey] += 1;
                        if (typeof opts.onProgress === 'function') opts.onProgress({ ...counts, total, ...identity, ...extra });
                    } catch (error) {
                        counts.failed += 1;
                        failedIds.push(identity.recordId ?? identity.index);
                        if (typeof opts.onProgress === 'function') opts.onProgress({ ...counts, total, ...identity, error });
                        if (!opts.continueOnError) throw error;
                    }
                }
            });
            await this._refreshAfterWrite(effectiveRefresh);
            this._logBatchFailures(code, operation, target, failedIds.length, total, failureDetail(failedIds));
            if (firstError && !opts.continueOnError) throw firstError;
            return counts;
        } finally {
            this._logBatchSummary(operation, target, counts[successKey] + counts.failed, total, rateLimit429Count);
        }
    }

    /**
     * Normalizes refreshViews input into a string, array of strings, or null.
     * @param {string|string[]|*} refreshViews
     * @returns {string|string[]|null}
     * @private
     */
    _normalizeRefreshViews(refreshViews) {
        if (typeof refreshViews === 'string') {
            return refreshViews;
        }

        if (Array.isArray(refreshViews)) {
            const normalized = refreshViews.filter(viewId => typeof viewId === 'string' && viewId.length);
            return normalized.length ? normalized : null;
        }

        return null;
    }

    /**
     * Refreshes one or more Knack views
     * @param {string|string[]} viewId - The view ID/key to refresh (format: "view_XX") or an array of view IDs
     * @returns {Promise<void|void[]>} - Promise that resolves when all views have been refreshed
     * @public
    */
    async refreshView(viewId) {
        // If viewId is an array, refresh each view in sequence
        if (Array.isArray(viewId)) {
            //this._log('Refreshing multiple views', viewId);
            const refreshPromises = viewId.map(id => this._refreshSingleView(id));
            return Promise.all(refreshPromises);
        }

        // Otherwise, refresh a single view
        return this._refreshSingleView(viewId);
    }

    /**
     * Fetches a specific record by its record ID.
     * @param {string} sceneId - The scene ID/key where the record is displayed.
     * @param {string} viewId - The ID of the view containing the record.
     * @param {string} recordId - The ID of the record to fetch.
     * @returns {Promise<Object>} - A promise that resolves to the record data.
     */
    async getRecord(sceneId, viewId, recordId) {
        if (!sceneId || !viewId || !recordId) {
            throw new Error('sceneId, viewId, and recordId are required to fetch a record.');
        }

        const apiUrl = this._formatApiUrl(sceneId, viewId, recordId);

        this._log('Fetching record by ID', apiUrl);

        try {
            return await this._request(apiUrl, { method: 'GET' });
        } catch (error) {
            console.error('Error fetching record by ID:', error);
            throw error;
        }
    }

    /**
     * Force logging a message regardless of developer status
     * @param {string} message - The message to log
     * @param {*} data - Optional data to log
     * @public
     */
    forceLog(message, data) {
        this._log(message, data, 'info', true);
    }

    /**
     * Check if the current user is considered a developer
     * @returns {boolean} - Whether the current user is a developer
     * @public
     */
    isDeveloper() {
        return this._canShowLogs;
    }

    /**
     * Set debug mode
     * @param {boolean} enabled - Whether to enable debug mode
     * @public
     */
    setDebug(enabled) {
        this.options.debug = enabled;
        this._log('Debug mode set to', enabled);
    }

    /**
     * Update the write concurrency limit. Updates apply to queued operations immediately.
     * @param {number} writeConcurrency - Max concurrent create/update/delete requests
     * @public
     */
    setWriteConcurrency(writeConcurrency) {
        this.options.writeConcurrency = this._resolveWriteConcurrency(writeConcurrency);
        this._log('Write concurrency set to', this.options.writeConcurrency);
        this._initWriteQueue();
        this._drainWriteQueue();
    }

    /**
     * Returns the latest API usage snapshot for this client instance.
     * Run counters only include requests made by this KnackAPI instance.
     * Daily rate-limit values reflect the most recent response headers observed.
     * @returns {{run: Object, daily: Object}}
     * @public
     */
    getApiUsageStats() {
        const usage = this._apiUsage || {};
        const rateLimit = usage.rateLimit || this._createEmptyRateLimitSnapshot();

        return {
            run: {
                startedAt: this._formatUsageTimestamp(usage.startedAt),
                totalCalls: usage.totalCalls || 0,
                successfulCalls: usage.successfulCalls || 0,
                failedCalls: usage.failedCalls || 0,
                rateLimitedCalls: usage.rateLimitedCalls || 0,
                byMethod: { ...(usage.byMethod || {}) },
                lastRequestAt: this._formatUsageTimestamp(usage.lastRequestAt),
                lastResponseAt: this._formatUsageTimestamp(usage.lastResponseAt),
                lastRequest: usage.lastRequest
                    ? {
                        ...usage.lastRequest,
                        requestedAt: this._formatUsageTimestamp(usage.lastRequest.requestedAt),
                        respondedAt: this._formatUsageTimestamp(usage.lastRequest.respondedAt)
                    }
                    : null
            },
            daily: {
                available: rateLimit.available === true,
                reason: rateLimit.reason || null,
                limit: rateLimit.limit,
                remaining: rateLimit.remaining,
                used: rateLimit.used,
                reset: rateLimit.reset,
                status: rateLimit.status,
                observedAt: this._formatUsageTimestamp(rateLimit.observedAt),
                headerNames: Array.isArray(rateLimit.headerNames) ? [...rateLimit.headerNames] : [],
                headers: { ...(rateLimit.headers || {}) }
            }
        };
    }

    /**
     * Returns the number of actual HTTP requests made by this client instance.
     * Retries count because they are real network calls.
     * @returns {number}
     * @public
     */
    getRunApiCallCount() {
        return this._apiUsage?.totalCalls || 0;
    }

    /**
     * Returns the latest observed daily rate-limit snapshot.
     * @returns {{limit: number|null, remaining: number|null, used: number|null, reset: number|null, status: number|null, observedAt: string|null, headers: Object}}
     * @public
     */
    getRateLimitStatus() {
        return this.getApiUsageStats().daily;
    }

    /**
     * Clears per-run API usage counters for this client instance.
     * By default the latest daily rate-limit snapshot is retained.
     * @param {Object} [options={}] - Reset options.
     * @param {boolean} [options.preserveRateLimitSnapshot=true] - Keep the latest observed daily rate-limit values.
     * @returns {{run: Object, daily: Object}}
     * @public
     */
    resetApiUsageStats(options = {}) {
        const preserveRateLimitSnapshot = options.preserveRateLimitSnapshot !== false;
        this._initApiUsageState(preserveRateLimitSnapshot);
        return this.getApiUsageStats();
    }

    /**
     * Performs a minimal view request to refresh the latest rate-limit headers.
     * This probe counts as one real API call.
     * @param {string} sceneId - The scene ID/key.
     * @param {string} viewId - The view ID/key.
     * @param {Object} [options={}] - Optional getRecords options such as filters, sorters, or timeout.
     * @returns {Promise<{run: Object, daily: Object}>}
     * @public
     */
    async refreshApiUsageStats(sceneId, viewId, options = {}) {
        const opts = options || {};
        const { useDevServerProxy, devServerTimeout, ...requestOptions } = opts;

        await this.getRecords(sceneId, viewId, {
            ...requestOptions,
            page: 1,
            rows: 1,
            rawResponse: true
        });

        if (useDevServerProxy !== false) {
            await this._refreshRateLimitFromDevServer(sceneId, viewId, {
                timeout: devServerTimeout
            });
        }

        return this.getApiUsageStats();
    }

    /**
     * Logs a compact API usage summary to the console.
     * @param {Object} [options={}] - Logging options.
     * @param {string} [options.label='KnackAPI usage'] - Group label shown in the console.
     * @param {boolean} [options.includeHeaders=false] - Include the latest observed rate-limit headers.
     * @returns {{run: Object, daily: Object}}
     * @public
     */
    logApiUsageStats(options = {}) {
        const stats = this.getApiUsageStats();
        const label = typeof options.label === 'string' && options.label.trim()
            ? options.label.trim()
            : 'KnackAPI usage';
        const includeHeaders = options.includeHeaders === true;
        const summaryRows = [
            { metric: 'Run started', value: stats.run.startedAt || 'Unknown' },
            { metric: 'Actual HTTP calls', value: stats.run.totalCalls },
            { metric: 'Successful calls', value: stats.run.successfulCalls },
            { metric: 'Failed calls', value: stats.run.failedCalls },
            { metric: '429 responses', value: stats.run.rateLimitedCalls },
            { metric: 'Daily headers available', value: stats.daily.available ? 'Yes' : 'No' },
            { metric: 'Daily limit', value: stats.daily.limit ?? 'Unknown' },
            { metric: 'Daily used', value: stats.daily.used ?? 'Unknown' },
            { metric: 'Daily remaining', value: stats.daily.remaining ?? 'Unknown' },
            { metric: 'Rate-limit reset', value: stats.daily.reset ?? 'Unknown' },
            { metric: 'Last response', value: stats.run.lastResponseAt || 'Unknown' }
        ];
        const methodRows = Object.entries(stats.run.byMethod || {}).map(([method, count]) => ({ method, count }));
        const headerRows = includeHeaders
            ? Object.entries(stats.daily.headers || {}).map(([header, value]) => ({ header, value }))
            : [];
        const canGroup = typeof console.groupCollapsed === 'function' && typeof console.groupEnd === 'function';

        if (canGroup) {
            console.groupCollapsed(`[KnackAPI] ${label}`);
        }

        if (typeof console.table === 'function') {
            console.table(summaryRows);
            if (methodRows.length) {
                console.table(methodRows);
            }
            if (stats.daily.reason) {
                console.info(`[KnackAPI] ${stats.daily.reason}`);
            }
            if (headerRows.length) {
                console.table(headerRows);
            }
        } else {
            console.log(`[KnackAPI] ${label}`, stats);
        }

        if (canGroup) {
            console.groupEnd();
        }

        return stats;
    }

    /**
     * Initializes or resets API usage tracking state.
     * @param {boolean} [preserveRateLimitSnapshot=false] - Retain the latest observed daily rate-limit snapshot.
     * @private
     */
    _initApiUsageState(preserveRateLimitSnapshot = false) {
        const previousRateLimit = preserveRateLimitSnapshot && this._apiUsage?.rateLimit
            ? {
                ...this._apiUsage.rateLimit,
                headers: { ...(this._apiUsage.rateLimit.headers || {}) }
            }
            : this._createEmptyRateLimitSnapshot();

        this._apiUsage = {
            startedAt: Date.now(),
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            rateLimitedCalls: 0,
            byMethod: {},
            lastRequestAt: null,
            lastResponseAt: null,
            lastRequest: null,
            rateLimit: previousRateLimit
        };
    }

    /**
     * Builds a rate-limit snapshot; anything not supplied is "unknown" (null / empty).
     * @param {Object} [fields={}] - Values to set on top of the unavailable defaults.
     * @returns {{available: boolean, reason: string|null, limit: number|null, remaining: number|null, used: number|null, reset: number|null, status: number|null, observedAt: number|null, headerNames: Array<string>, headers: Object}}
     * @private
     */
    _buildRateLimitSnapshot(fields = {}) {
        return {
            available: false, reason: null, limit: null, remaining: null, used: null, reset: null,
            status: null, observedAt: null, headerNames: [], headers: {}, ...fields
        };
    }

    /**
     * Creates an empty rate-limit snapshot.
     * @returns {{available: boolean, reason: string|null, limit: number|null, remaining: number|null, used: number|null, reset: number|null, status: number|null, observedAt: number|null, headerNames: Array<string>, headers: Object}}
     * @private
     */
    _createEmptyRateLimitSnapshot() {
        return this._buildRateLimitSnapshot({ reason: 'No rate-limit headers observed yet.' });
    }

    /**
     * Creates a standardized unavailable rate-limit snapshot.
     * @param {string} reason - Human-readable reason for the missing data.
     * @param {number|null} [status=null] - Optional related HTTP status.
     * @param {Object} [headers={}] - Optional response headers.
     * @returns {{available: boolean, reason: string|null, limit: number|null, remaining: number|null, used: number|null, reset: number|null, status: number|null, observedAt: number, headerNames: Array<string>, headers: Object}}
     * @private
     */
    _createUnavailableRateLimitSnapshot(reason, status = null, headers = {}) {
        const normalizedHeaders = this._normalizeResponseHeaders(headers);
        return this._buildRateLimitSnapshot({
            reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'Rate-limit data is unavailable.',
            status: Number.isFinite(status) ? status : null,
            observedAt: Date.now(),
            headerNames: Object.keys(normalizedHeaders).sort(),
            headers: normalizedHeaders
        });
    }

    /**
     * Formats a timestamp for external usage snapshots.
     * @param {number|null} timestampMs - Unix timestamp in milliseconds.
     * @returns {string|null}
     * @private
     */
    _formatUsageTimestamp(timestampMs) {
        return Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : null;
    }

    /**
     * Resolves candidate localhost development server URLs for rate-limit proxy checks.
     * @returns {Array<string>}
     * @private
     */
    _getDevServerUrls() {
        const urls = [];
        const configured = typeof globalThis !== 'undefined' ? globalThis.__knackFunctionsDevServerUrl : '';

        if (typeof configured === 'string' && /^https?:\/\//i.test(configured)) {
            urls.push(configured.replace(/\/$/, ''));
        }

        urls.push('http://localhost:3001');

        return Array.from(new Set(urls));
    }

    /**
     * Converts response headers into a lowercase-key object.
     * @param {Headers|Object|null} headersLike - Fetch headers or a plain object.
     * @returns {Object}
     * @private
     */
    _normalizeResponseHeaders(headersLike) {
        if (!headersLike) return {};
        const entries = typeof headersLike.forEach === 'function' ? [] : Object.entries(headersLike);
        if (typeof headersLike.forEach === 'function') headersLike.forEach((value, key) => entries.push([key, value]));
        return Object.fromEntries(entries.map(([key, value]) => [String(key).toLowerCase(), value]));
    }

    /**
     * Parses an integer header value.
     * @param {*} value - Header value.
     * @returns {number|null}
     * @private
     */
    _parseRateLimitHeaderInt(value) {
        if (value === undefined || value === null || value === '') return null;
        const parsed = parseInt(String(value), 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    /**
     * Normalizes a rate-limit snapshot returned by the development server.
     * @param {Object|null} snapshot - Server-provided snapshot.
     * @param {number|null} [fallbackStatus=null] - Fallback status code.
     * @returns {{available: boolean, reason: string|null, limit: number|null, remaining: number|null, used: number|null, reset: number|null, status: number|null, observedAt: number, headerNames: Array<string>, headers: Object}|null}
     * @private
     */
    _normalizeExternalRateLimitSnapshot(snapshot, fallbackStatus = null) {
        if (!snapshot || typeof snapshot !== 'object') return null;

        const headers = this._normalizeResponseHeaders(snapshot.headers);
        const limit = this._parseRateLimitHeaderInt(snapshot.limit);
        const remaining = this._parseRateLimitHeaderInt(snapshot.remaining);
        const reset = this._parseRateLimitHeaderInt(snapshot.reset);
        const used = this._parseRateLimitHeaderInt(snapshot.used);
        const observedAt = Number.isFinite(snapshot.observedAt)
            ? snapshot.observedAt
            : (() => {
                const parsed = Date.parse(snapshot.observedAt);
                return Number.isNaN(parsed) ? Date.now() : parsed;
            })();
        const status = this._parseRateLimitHeaderInt(snapshot.status);
        const available = snapshot.available === true || limit !== null || remaining !== null || reset !== null;

        return {
            available,
            reason: available
                ? null
                : (typeof snapshot.reason === 'string' && snapshot.reason.trim()
                    ? snapshot.reason.trim()
                    : 'Rate-limit data is unavailable.'),
            limit,
            remaining,
            used: used !== null
                ? used
                : (Number.isFinite(limit) && Number.isFinite(remaining) ? Math.max(0, limit - remaining) : null),
            reset,
            status: Number.isFinite(status) ? status : (Number.isFinite(fallbackStatus) ? fallbackStatus : null),
            observedAt,
            headerNames: Array.isArray(snapshot.headerNames) && snapshot.headerNames.length
                ? snapshot.headerNames.map(name => String(name).toLowerCase())
                : Object.keys(headers).sort(),
            headers
        };
    }

    /**
     * Extracts Knack daily rate-limit values from response headers.
     * @param {Headers|Object|null} headersLike - Response headers.
     * @param {number|null} [status=null] - HTTP status code.
     * @returns {{available: boolean, reason: string|null, limit: number|null, remaining: number|null, used: number|null, reset: number|null, status: number|null, observedAt: number, headerNames: Array<string>, headers: Object}}
     * @private
     */
    _extractRateLimitSnapshot(headersLike, status = null) {
        const headers = this._normalizeResponseHeaders(headersLike);
        const headerNames = Object.keys(headers).sort();
        const read = (name) => this._parseRateLimitHeaderInt(headers[`x-planlimit-${name}`] || headers[`x-rate-limit-${name}`]);
        const [remaining, limit, reset] = [read('remaining'), read('limit'), read('reset')];
        const available = remaining !== null || limit !== null || reset !== null;

        return this._buildRateLimitSnapshot({
            available,
            reason: available ? null : (headerNames.length
                ? 'The browser can read response headers, but Knack did not expose any rate-limit headers on this response.'
                : 'The browser could not read any response headers for this request. Knack may not expose rate-limit headers to browser JavaScript for this endpoint.'),
            limit,
            remaining,
            used: available && Number.isFinite(limit) && Number.isFinite(remaining) ? Math.max(0, limit - remaining) : null,
            reset,
            status: Number.isFinite(status) ? status : null,
            observedAt: Date.now(),
            headerNames,
            headers
        });
    }

    /**
     * Attempts to read rate-limit headers through the local development server.
     * This only succeeds when the local knack-functions dev server is actually running.
     * @param {string} sceneId - The scene ID/key.
     * @param {string} viewId - The view ID/key.
     * @param {Object} [options={}] - Proxy options.
     * @param {number} [options.timeout] - Proxy timeout in milliseconds.
     * @returns {Promise<boolean>}
     * @private
     */
    async _refreshRateLimitFromDevServer(sceneId, viewId, options = {}) {
        const applicationId = String(knackNavigator.getApplicationId() || '').trim();
        const authToken = String(this._getAuthToken() || '').trim();
        if (!applicationId || !authToken) {
            return false;
        }

        const timeoutMs = Number.isFinite(options.timeout) ? Math.max(1000, Math.floor(options.timeout)) : 15000;
        const devServerUrls = this._getDevServerUrls();
        let lastFailureReason = 'The local knack-functions development server is unavailable. Start it to read daily limit headers during testing.';

        for (const devServerUrl of devServerUrls) {
            const controller = new AbortController();
            const timerId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(`${devServerUrl}/api/knack/rate-limit`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sceneId,
                        viewId,
                        apiBaseUrl: this._getApiBaseUrl(),
                        applicationId,
                        authToken,
                        timeoutMs
                    }),
                    signal: controller.signal
                });

                const payload = await response.json().catch(() => null);
                const snapshot = this._normalizeExternalRateLimitSnapshot(payload?.daily, payload?.status || response.status);

                if (snapshot) {
                    this._apiUsage.rateLimit = snapshot;
                } else if (this._apiUsage?.rateLimit?.available !== true) {
                    this._apiUsage.rateLimit = this._createUnavailableRateLimitSnapshot(
                        'The development server returned an invalid rate-limit response.',
                        response.status
                    );
                }

                return response.ok && snapshot?.available === true;
            } catch (error) {
                lastFailureReason = error?.name === 'AbortError'
                    ? 'The local knack-functions development server timed out while reading Knack rate-limit headers.'
                    : `The local knack-functions development server is unavailable at ${devServerUrl}.`;
            } finally {
                clearTimeout(timerId);
            }
        }

        if (this._apiUsage?.rateLimit?.available !== true) {
            this._apiUsage.rateLimit = this._createUnavailableRateLimitSnapshot(lastFailureReason);
        }

        return false;
    }

    /**
     * Records one actual HTTP request attempt in the usage snapshot.
     * @param {Object} details - Request details.
     * @param {string} details.method - HTTP method.
     * @param {string} details.url - Request URL.
     * @param {number} details.attempt - Attempt number within the retry loop.
     * @param {boolean} details.ok - Whether the response succeeded.
     * @param {number|null} details.status - HTTP status when known.
     * @param {Headers|Object|null} [details.headers] - Response headers when available.
     * @param {number} details.requestedAt - Request start timestamp.
     * @param {number} details.respondedAt - Response or failure timestamp.
     * @private
     */
    _recordApiUsage(details) {
        if (!this._apiUsage) {
            this._initApiUsageState();
        }

        const method = String(details?.method || 'GET').toUpperCase();
        const status = Number.isFinite(details?.status) ? details.status : null;
        const ok = details?.ok === true;
        const usage = this._apiUsage;

        usage.totalCalls += 1;
        usage.byMethod[method] = (usage.byMethod[method] || 0) + 1;
        usage.lastRequestAt = Number.isFinite(details?.requestedAt) ? details.requestedAt : Date.now();
        usage.lastResponseAt = Number.isFinite(details?.respondedAt) ? details.respondedAt : Date.now();

        if (ok) {
            usage.successfulCalls += 1;
        } else {
            usage.failedCalls += 1;
        }

        if (status === 429) {
            usage.rateLimitedCalls += 1;
        }

        usage.lastRequest = {
            method,
            url: details?.url || '',
            attempt: Number.isFinite(details?.attempt) ? details.attempt : 1,
            status,
            ok,
            requestedAt: usage.lastRequestAt,
            respondedAt: usage.lastResponseAt
        };

        usage.rateLimit = this._extractRateLimitSnapshot(details?.headers, status);
    }

    /**
     * Log messages with levels (info, warn, error). Defaults to info.
     * @param {string} message - The message to log
     * @param {*} data - Optional data to log
     * @param {'info'|'warn'|'error'} [level='info'] - Log level
        * @param {boolean} [forceLog=false] - Force logging regardless of developer status
     * @private
     */
    _log(message, data, level = 'info', forceLog = false) {
        if ((this.options.debug && (this._canShowLogs || forceLog))) {
            const prefix = `[KnackAPI] ${message}`;
            switch (level) {
                case 'warn':
                    console.warn(prefix, data || '');
                    break;
                case 'error':
                    console.error(prefix, data || '');
                    break;
                default:
                    console.log(prefix, data || '');
            }
        }
    }

    /**
     * Shows or hides the Knack spinner
     * @param {boolean} show - Whether to show or hide the spinner
     * @private
     */
    _toggleSpinner(show) {
        if (this.options.showSpinner) {
            if (show) {
                this._activeRequests += 1;
                if (this._activeRequests === 1) {
                    Knack.showSpinner();
                }
            } else {
                this._activeRequests = Math.max(0, this._activeRequests - 1);
                if (this._activeRequests === 0) {
                    Knack.hideSpinner();
                }
            }
        }
    }

    /**
     * Checks if Knack is available
     * @throws {Error} If Knack is not available
     * @private
     */
    _checkKnack() {
        if (typeof Knack === 'undefined') {
            throw new Error('Knack is not available');
        }
    }

    /**
     * Get the authorization token for API requests
     * @returns {string} - Knack authorization token
     * @private
     */
    _getAuthToken() {
        return knackNavigator.getUserToken();
    }

    /**
     * Formats an API URL for Knack view operations
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {string} [recordId] - Optional record ID for single record operations
     * @returns {string} - The formatted API URL
     * @private
     */
    _formatApiUrl(sceneId, viewId, recordId = null) {
        let url = `${this._getApiBaseUrl()}/pages/${sceneId}/views/${viewId}`;

        if (recordId) {
            url += `/records/${recordId}`;
        } else {
            url += '/records';
        }

        return url;
    }

    /**
     * Build query params from common options.
     * @param {Object} options
     * @returns {Object}
     * @private
     */
    _buildQueryParams(options = {}) {
        let params = {};
        if (options.filters) params = { ...params, ...this.buildFilters(options.filters) };
        if (options.sorters) params = { ...params, ...this.buildSorters(options.sorters) };
        if (Number.isFinite(options.page)) params.page = options.page;
        if (Number.isFinite(options.rows)) params.rows_per_page = options.rows;
        return params;
    }

    /**
     * Refresh views after write operations.
     * @param {string|string[]} refreshViews
     * @returns {Promise<void|void[]>}
     * @private
     */
    async _refreshAfterWrite(refreshViews) {
        if (!refreshViews) return;
        await this.refreshView(refreshViews);
    }

    /**
     * Builds headers for API requests.
     * @param {boolean} [withAuth=true] - Whether to include the authorization header.
     * @param {Object} [options]
     * @param {boolean} [options.json=true] - Send `Content-Type: application/json`; false for multipart uploads, where
     *   the browser must set the content type (and boundary) itself.
     * @returns {Object} - Headers object
     * @private
     */
    _buildHeaders(withAuth = true, { json = true } = {}) {
        const headers = {
            ...(json && { 'Content-Type': 'application/json' }),
            'X-Knack-Application-ID': knackNavigator.getApplicationId(),
            'X-Knack-REST-API-Key': 'knack'
        };
        const token = withAuth && this._getAuthToken();
        if (token) headers['Authorization'] = token;
        return headers;
    }

        /**
     * Initialize logging settings based on user role
     * @private
     */
    _initLogSettings() {
        this._canShowLogs = false;

        // If developer-only mode is disabled, allow logs for everyone
        if (!this.options.developerOnly) {
            this._canShowLogs = true;
            return;
        }

        try {
            // Check if user has a developer role
            const userRoles = Knack.getUserRoleNames();
            this._canShowLogs = this.options.developerRoles.some(role =>
                userRoles.includes(role)
            );
        } catch (error) {
            // If we can't determine the user role, default to false
            this._canShowLogs = false;
            console.warn('KnackAPI: Could not determine user role, defaulting to no logs');
        }
    }

    /**
     * Builds filter parameters for API requests
     * @param {Array<Object>|Object} filters - Filter specifications
     * @returns {Object} - Formatted filter parameters
     * @public
     */
    buildFilters(filters) {
        if (!filters) return {};

        // Check if this is a JSON filter with 'match' property (Knack filter format)
        if (filters.match && filters.rules) {
            // Convert match property (e.g., 'and', 'or') and rules to URL parameters
            return {
                'filters': JSON.stringify(filters)
            };
        }

        // Handle single filter object case (not in the array)
        if (!Array.isArray(filters)) {
            filters = [filters];
        }

        const formattedFilters = {};

        filters.forEach((filter, index) => {
            const filterKey = `filters[${index}]`;

            if (filter.field) {
                formattedFilters[`${filterKey}[field]`] = filter.field;
            }

            if (filter.operator) {
                formattedFilters[`${filterKey}[operator]`] = filter.operator;
            }

            // Handle various value types
            if (filter.value !== undefined) {
                if (Array.isArray(filter.value)) {
                    filter.value.forEach((val, valIndex) => {
                        formattedFilters[`${filterKey}[value][${valIndex}]`] = val;
                    });
                } else {
                    formattedFilters[`${filterKey}[value]`] = filter.value;
                }
            }

            // Match type (exact/any/all)
            if (filter.type) {
                formattedFilters[`${filterKey}[type]`] = filter.type;
            }
        });

        return formattedFilters;
    }
    /**
     * Builds sort parameters for API requests.
     *
     * Knack's records API takes a single sort, as `sort_field` + `sort_order`
     * (https://docs.knack.com/reference/sorting). The previous `sort[0][field]` /
     * `sort[0][direction]` form was silently ignored, so the view's own sort applied instead.
     * Only the first sorter with a field is sent; any others are ignored with a warning.
     *
     * @param {Array<{field: string, direction?: 'asc'|'desc', order?: 'asc'|'desc'}>|Object} sorters
     *   Sort specification(s). `order` is accepted as an alias for `direction`.
     * @returns {{sort_field?: string, sort_order?: 'asc'|'desc'}} - Formatted sort parameters
     * @public
     */
    buildSorters(sorters) {
        if (!sorters) return {};

        const list = (Array.isArray(sorters) ? sorters : [sorters]).filter(s => s && s.field);
        if (!list.length) return {};
        if (list.length > 1) {
            console.warn('[KnackAPI] Knack sorts by one field only; using the first sorter and ignoring the rest.', list);
        }

        const [sorter] = list;
        const requested = String(sorter.direction ?? sorter.order ?? 'asc').toLowerCase();
        if (requested !== 'asc' && requested !== 'desc') {
            console.warn(`[KnackAPI] Unknown sort direction "${requested}" for ${sorter.field}; using "asc".`);
        }

        return {
            sort_field: sorter.field,
            sort_order: requested === 'desc' ? 'desc' : 'asc'
        };
    }

    /**
     * Formats URL parameters for API requests
     * @param {Object} params - URL parameters
     * @returns {string} - Formatted URL parameters string
     * @private
     */
    _formatParams(params) {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }

        const urlParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            urlParams.append(key, value);
        });

        return `?${urlParams.toString()}`;
    }

    /**
     * Refreshes a single Knack view (internal helper method)
     * @param {string} viewId - The view ID/key to refresh (format: "view_XX")
     * @returns {Promise<void>}
     * @private
     */
    _refreshSingleView(viewId) {
        return new Promise((resolve, reject) => {
            try {
                const view = knackNavigator.getRenderedView(viewId);

                if (!view || !view.model || !view.model.view) {
                    this._log('View not found or invalid', viewId);
                    return reject(new Error('View not found or invalid'));
                }

                const viewType = view.model.view.type;

                // Form views: use reloadForm
                if (viewType === 'form') {
                    if (typeof view.reloadForm === 'function') {
                        view.reloadForm();
                        view.render(); // Optional UI rebind
                        this._log('Form view reloaded successfully', viewId);
                        return resolve();
                    } else {
                        this._log('reloadForm not available on form view', viewId);
                        return reject(new Error('reloadForm not available'));
                    }
                }

                // Calendar views: use renderRecords()
                if (viewType === 'calendar') {
                    if (typeof view.renderRecords === 'function') {
                        view.renderRecords();
                        Knack.hideSpinner?.();
                        this._log('Calendar view refreshed via renderRecords', viewId);
                        return resolve();
                    } else {
                        this._log('renderRecords not available on calendar view', viewId);
                        return reject(new Error('renderRecords not available'));
                    }
                }

                // Search views: follow the fuller KTL refresh path so the search form and results stay in sync.
                if (viewType === 'search') {
                    if (typeof view.renderResults === 'function') {
                        view.model.trigger?.('change');
                        view.renderForm?.();
                        view.renderView?.();
                        view.renderResults();
                        this._log('Search view refreshed via renderResults', viewId);
                        return resolve();
                    } else {
                        this._log('renderResults not available on search view', viewId);
                        return reject(new Error('renderResults not available'));
                    }
                }

                // Menu views: use postRender
                if (viewType === 'menu') {
                    if (typeof view.postRender=== 'function') {
                        view.postRender();
                        this._log('Menu view refreshed via postRender', viewId);
                        return resolve();
                    } else {
                        this._log('postRender not available on menu view', viewId);
                        return reject(new Error('postRender not available'));
                    }
                }

                // All others: fetch first, then render
                view.model.fetch({
                    success: () => {
                        if (viewType === 'details') {
                            view.render();
                            view.postRender?.();
                            this._log('Details view refreshed after fetch', viewId);
                        }

                        if (viewType === 'table') {
                            view.renderResults?.();
                            this._log('Table view refreshed via renderResults', viewId);
                        }

                        resolve();
                    },
                    error: (model, error) => {
                        this._log('Error fetching view model', { viewId, error });
                        reject(error);
                    }
                });

            } catch (error) {
                this._log('Error in _refreshSingleView()', { viewId, error });
                reject(error);
            }
        });
    }

    /**
     * Formats data from connected fields in Knack records
     * @param {Array<Object>} records - The records to format
     * @param {Array<string>} connectedFields - The connected field keys to format
     * @returns {Array<Object>} - The formatted records
     * @public
     */
    formatConnectedFields(records, connectedFields) {
        if (!Array.isArray(records)) {
            records = [records];
        }

        return records.map(record => {
            const formattedRecord = { ...record };

            connectedFields.forEach(field => {
                if (record[`${field}_raw`]) {
                    formattedRecord[field] = Array.isArray(record[`${field}_raw`])
                        ? record[`${field}_raw`].map(item => ({ ...item }))
                        : { ...record[`${field}_raw`] };
                }
            });

            return formattedRecord;
        });
    }

    //*************** Helpers for comparing request and response data *************************/
    /**
     * Extracts the value of a field from a Knack record response. Checks both the plain field key and its `_raw` variant.
     * @param {Object} recordObj - The record object returned by Knack
     * @param {string} fieldKey - The field key to extract (e.g. "field_1567").
     * @returns {*} - The field value if found, otherwise undefined.
     * @private
     */
    _extractResponseValueFromRecord(recordObj, fieldKey, requestedValue = undefined) {
        if (!recordObj || typeof recordObj !== 'object') return undefined;

        const normalizedFieldId = knackValueResolver.normalizeFieldId(fieldKey);
        const fieldType = knackValueResolver.getFieldType(normalizedFieldId);
        const rawKey = normalizedFieldId ? `${normalizedFieldId}_raw` : '';
        const shouldPreferRaw = fieldType === 'date_time'
            || (requestedValue && typeof requestedValue === 'object' && !Array.isArray(requestedValue));

        if (shouldPreferRaw && rawKey && Object.prototype.hasOwnProperty.call(recordObj, rawKey)) {
            return recordObj[rawKey];
        }

        return knackValueResolver.extractResponseFieldValue(recordObj, fieldKey);
    }

    /**
     * Extracts a record ID from an API response object.
     * @param {Object} responseData - API response data
     * @returns {string|null} - Record ID if found
     * @private
     */
    _extractRecordId(responseData) {
        if (!responseData || typeof responseData !== 'object') return null;
        if (responseData.record?.id) return responseData.record.id;
        if (responseData.id) return responseData.id;
        return null;
    }

    /**
     * Normalises values for loose comparison between request and response.
     * Handles strings, numbers, booleans, arrays (order-insensitive), and simple objects.
     * @param {*} val - The value to normalise.
     * @returns {string|null} - A normalised string suitable for comparison, or null if no value.
     * @private
     */
    _normaliseForCompare(val) {
        if (val === null || val === undefined) return null;

        // Arrays (order-insensitive, common for connections / multiselects)
        if (Array.isArray(val)) {
            const mapped = val.map(v => {
                if (v && typeof v === 'object') return v.id ?? v.value ?? JSON.stringify(v);
                return String(v);
            });
            return mapped.sort().join('|');
        }

        // Objects (shallow stable string)
        if (typeof val === 'object') {
            const keys = Object.keys(val).sort();
            return keys.map(k => `${k}:${this._normaliseForCompare(val[k])}`).join('|');
        }

        // Primitives
        return String(val).trim();
    }

    _normaliseDateTimeForCompare(val) {
        if (val === null || val === undefined) return null;

        const pad2 = (value) => String(value || '').trim().padStart(2, '0');
        const normaliseAmPm = (value) => {
            const normalized = String(value || '').trim().toUpperCase();
            return normalized === 'AM' || normalized === 'PM' ? normalized : '';
        };

        const parseTimeString = (value) => {
            const normalized = String(value || '').trim();
            if (!normalized) return null;

            const match = normalized.match(/(?:(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+)?(\d{1,2}):(\d{2})\s*([AP]M)/i);
            if (!match) return null;

            return {
                date: String(match[1] || '').trim(),
                hours: pad2(match[2]),
                minutes: pad2(match[3]),
                amPm: normaliseAmPm(match[4])
            };
        };

        if (typeof val === 'object' && !Array.isArray(val)) {
            const parsed = parseTimeString(val.time || val.time_formatted || val.datetime_formatted || '');
            const date = String(val.date || val.iso_date || val.date_formatted || parsed?.date || '').trim();
            const hours = pad2(val.hours || parsed?.hours || '');
            const minutes = pad2(val.minutes || parsed?.minutes || '');
            const amPm = normaliseAmPm(val.am_pm || parsed?.amPm || '');
            return [date, hours, minutes, amPm].join('|');
        }

        const parsed = parseTimeString(val);
        if (parsed) {
            return [parsed.date, parsed.hours, parsed.minutes, parsed.amPm].join('|');
        }

        return String(val).trim();
    }

    _normaliseDisplayForCompare(val) {
        if (val === null || val === undefined) return null;
        const displayValue = knackValueResolver.toDisplayString(val);
        return displayValue ? displayValue.trim() : this._normaliseForCompare(val);
    }

    /**
     * Compares two values after normalisation to determine if they are effectively equal.
     * @param {*} a - The first value.
     * @param {*} b - The second value.
     * @returns {boolean} - True if values are considered equal, otherwise false.
     * @private
     */
    _valuesEffectivelyEqual(a, b) {
        return this._normaliseForCompare(a) === this._normaliseForCompare(b);
    }

    _valuesEffectivelyEqualForField(fieldKey, receivedValue, sentValue) {
        const normalizedFieldId = knackValueResolver.normalizeFieldId(fieldKey);
        const fieldType = knackValueResolver.getFieldType(normalizedFieldId);

        if (fieldType === 'date_time') {
            return this._normaliseDateTimeForCompare(receivedValue) === this._normaliseDateTimeForCompare(sentValue);
        }

        return this._valuesEffectivelyEqual(receivedValue, sentValue)
            || this._normaliseDisplayForCompare(receivedValue) === this._normaliseDisplayForCompare(sentValue);
    }

    /**
     * Normalizes the write concurrency option.
     * @param {number} writeConcurrency - Desired concurrency value
     * @returns {number} - Normalized concurrency
     * @private
     */
    _resolveWriteConcurrency(writeConcurrency) {
        if (writeConcurrency === Infinity) {
            return Infinity;
        }
        const parsed = Number(writeConcurrency);
        if (Number.isFinite(parsed)) {
            return Math.max(1, Math.floor(parsed));
        }
        return KnackAPI.DEFAULT_WRITE_CONCURRENCY;
    }

    /**
     * Initialize write queue for concurrency control.
     * @private
     */
    _initWriteQueue() {
        const configuredConcurrency = this.options.writeConcurrency;
        const isInfinite = configuredConcurrency === Infinity;
        const configuredMax = Number.isFinite(this.options.writeMaxConcurrency)
            ? this.options.writeMaxConcurrency
            : (isInfinite ? Infinity : configuredConcurrency);
        const max = isInfinite ? Infinity : Math.max(1, Math.floor(configuredMax || configuredConcurrency || 1));
        const min = Math.max(1, Math.floor(this.options.writeMinConcurrency || 1));
        const startRaw = isInfinite ? Infinity : Math.floor(configuredConcurrency || max);
        const start = isInfinite ? Infinity : Math.min(max, Math.max(min, startRaw));

        this._writeQueue = {
            max,
            min,
            current: start,
            maxPerSecond: Math.max(1, Math.floor(this.options.writeRatePerSecond || 1)),
            active: 0,
            pausedUntil: 0,
            last429At: 0,
            rampDelayMs: Math.max(0, Math.floor(this.options.writeRampDelayMs || 0)),
            dispatchTimestamps: [],
            drainTimerId: null,
            nextDrainAt: 0,
            queue: []
        };
    }

    /**
     * Remove dispatch timestamps outside the rolling 1-second window.
     * @param {number} now
     * @private
     */
    _pruneWriteDispatchTimestamps(now = Date.now()) {
        const q = this._writeQueue;
        if (!q) return;
        const cutoff = now - 1000;
        while (q.dispatchTimestamps.length && q.dispatchTimestamps[0] <= cutoff) {
            q.dispatchTimestamps.shift();
        }
    }

    /**
     * Schedule a queue drain while avoiding timer storms.
     * @private
     */
    _scheduleWriteDrain(delayMs) {
        const q = this._writeQueue;
        if (!q) return;

        const wait = Math.max(1, Math.floor(delayMs || 1));
        const target = Date.now() + wait;

        if (q.drainTimerId && q.nextDrainAt && q.nextDrainAt <= target) return;

        if (q.drainTimerId) {
            clearTimeout(q.drainTimerId);
        }

        q.nextDrainAt = target;
        q.drainTimerId = setTimeout(() => {
            q.drainTimerId = null;
            q.nextDrainAt = 0;
            this._drainWriteQueue();
        }, wait);
    }

    /**
     * Build common batch execution settings for bulk write methods.
     * @param {number} total
     * @param {Object} [options]
     * @param {Function} [on429]
     * @returns {{opts:Object,staggerMs:number,workerCount:number,requestOptions:Object}}
     * @private
     */
    _buildBatchContext(total, options = {}, on429 = () => { }) {
        this._assertWriteOptions(options, 'batch operation');
        const opts = options || {};
        const continueOnError = opts.continueOnError !== false;
        const staggerMs = Math.max(0, Number(opts.staggerMs) || 0);
        const queue = this._writeQueue || {};
        const queueCurrent = queue.current === Infinity
            ? total
            : Math.floor(queue.current || this.options.writeConcurrency || 1);
        const workerCount = Math.max(1, Math.min(total, queueCurrent));
        const requestOptions = {
            ...opts,
            continueOnError,
            _on429: () => {
                typeof on429 === 'function' && on429();
            }
        };

        return { opts: { ...opts, continueOnError }, staggerMs, workerCount, requestOptions };
    }

    /**
     * Log standardized summary for bulk API operations.
     * @param {'create'|'update'|'delete'} operation
     * @param {string} target
     * @param {number} processed
     * @param {number} total
     * @param {number} rateLimit429Count
     * @private
     */
    _logBatchSummary(operation, target, processed, total, rateLimit429Count) {
        this._log(`Concurrent ${operation} summary`, { target, processed, total, rateLimit429Count }, 'info');
    }

    /**
     * Log standardized failure details for bulk API operations.
     * @param {string} code
     * @param {'create'|'update'|'delete'} operation
     * @param {string} target
     * @param {number} failedCount
     * @param {number} total
     * @param {string} detailsSuffix
     * @private
     */
    _logBatchFailures(code, operation, target, failedCount, total, detailsSuffix = '') {
        if (failedCount <= 0) return;
        this._log(`${code} - API ${operation} failed for ${target}. Failed records (${failedCount}/${total})${detailsSuffix}`, null, 'warn');
    }

    /**
     * Run indexed tasks using bounded worker concurrency.
     * @param {Object} config
     * @param {number} config.total
     * @param {number} config.workerCount
     * @param {number} [config.staggerMs=0]
     * @param {boolean} [config.continueOnError=true]
     * @param {(index:number)=>Promise<void>} config.execute
     * @returns {Promise<{firstError: Error|null}>}
     * @private
     */
    async _runBatchWorkers(config = {}) {
        const total = Number.isFinite(config.total) ? config.total : 0;
        const workerCount = Number.isFinite(config.workerCount) ? Math.max(1, Math.floor(config.workerCount)) : 1;
        const staggerMs = Number.isFinite(config.staggerMs) ? Math.max(0, Math.floor(config.staggerMs)) : 0;
        const continueOnError = config.continueOnError !== false;
        const execute = typeof config.execute === 'function' ? config.execute : null;

        if (!execute) {
            throw new TypeError('KnackAPI error: _runBatchWorkers requires an execute callback');
        }

        if (total <= 0) {
            return { firstError: null };
        }

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let nextIndex = 0;
        let stopScheduling = false;
        let firstError = null;

        const runWorker = async () => {
            while (true) {
                if (stopScheduling && !continueOnError) return;

                if (staggerMs > 0) {
                    await delay(staggerMs);
                }

                if (stopScheduling && !continueOnError) return;

                const index = nextIndex;
                nextIndex += 1;
                if (index >= total) return;

                try {
                    await execute(index);
                } catch (error) {
                    if (!firstError) firstError = error;
                    if (!continueOnError) {
                        stopScheduling = true;
                    }
                }
            }
        };

        await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
        return { firstError };
    }

    /**
     * Check whether a value is a plain object.
     * @param {*} value
     * @returns {boolean}
     * @private
     */
    _isPlainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    /**
     * Assert that method options are a plain object when provided.
     * @param {*} options
     * @param {string} methodName
     * @private
     */
    _assertWriteOptions(options, methodName) {
        if (options === undefined) return;
        if (!this._isPlainObject(options)) {
            throw new Error(`KnackAPI error: ${methodName} options must be a plain object.`);
        }
    }

    /**
     * Enqueue a write operation respecting configured concurrency.
     * @param {Function} task
     * @returns {Promise<*>}
     * @private
     */
    _enqueueWrite(task) {
        if (this.options.writeConcurrency === Infinity) {
            return Promise.resolve().then(task);
        }

        return new Promise((resolve, reject) => {
            this._writeQueue.queue.push({ task, resolve, reject });
            this._drainWriteQueue();
        });
    }

    /**
     * Drains the write queue up to the configured concurrency limit.
     * @private
     */
    _drainWriteQueue() {
        const q = this._writeQueue;
        if (!q) return;

        const now = Date.now();
        if (q.pausedUntil > now) {
            const delay = Math.max(0, q.pausedUntil - now);
            this._scheduleWriteDrain(delay + 1);
            return;
        }

        this._pruneWriteDispatchTimestamps(now);

        while (q.active < q.current && q.queue.length > 0) {
            const dispatchNow = Date.now();
            this._pruneWriteDispatchTimestamps(dispatchNow);

            if (q.dispatchTimestamps.length >= q.maxPerSecond) {
                const oldest = q.dispatchTimestamps[0];
                const waitMs = Math.max(1, 1000 - (dispatchNow - oldest) + 1);
                this._scheduleWriteDrain(waitMs);
                return;
            }

            const job = q.queue.shift();
            q.active += 1;
            q.dispatchTimestamps.push(dispatchNow);

            Promise.resolve()
                .then(job.task)
                .then((result) => {
                    q.active -= 1;
                    this._maybeRampWriteConcurrency();
                    job.resolve(result);
                    this._drainWriteQueue();
                })
                .catch((error) => {
                    q.active -= 1;
                    job.reject(error);
                    this._drainWriteQueue();
                });
        }
    }

    /**
     * Pause and lower concurrency after a rate limit response.
     * @param {number} delayMs
     * @private
     */
    _notifyWriteRateLimit(delayMs) {
        const q = this._writeQueue;
        if (!q || this.options.writeConcurrency === Infinity) return;

        const now = Date.now();
        const pauseFor = Math.max(0, Math.floor(delayMs || 0));
        const pauseUntil = now + pauseFor;

        q.pausedUntil = Math.max(q.pausedUntil, pauseUntil);
        q.last429At = now;
        q.current = q.min;

        if (q.queue.length > 0) {
            this._scheduleWriteDrain(pauseFor + 1);
        }
    }

    /**
     * Gradually ramp concurrency after the pause window.
     * @private
     */
    _maybeRampWriteConcurrency() {
        const q = this._writeQueue;
        if (!q || q.current === Infinity || q.max === Infinity || q.current >= q.max) return;
        const now = Date.now();
        if (q.last429At && (now - q.last429At) < q.rampDelayMs) return;
        q.current = Math.min(q.max, q.current + 1);
    }

    /**
     * Perform an HTTP request with retries, backoff, and timeout.
     * Identical concurrent GET requests are deduplicated.
     * @param {string} url
     * @param {Object} options
     * @param {number} [timeoutOverride]
     * @returns {Promise<Object>}
     * @private
     */
    async _request(url, options = {}, timeoutOverride) {
        const method = ((options || {}).method || 'GET').toUpperCase();

        if (method === 'GET') {
            const timeoutKey = Number.isFinite(timeoutOverride) ? timeoutOverride : 'default';
            const key = `${url}::${timeoutKey}`;
            if (this._inflightGets.has(key)) {
                return this._inflightGets.get(key);
            }

            const promise = this._requestInner(url, options, timeoutOverride).finally(() => {
                this._inflightGets.delete(key);
            });
            this._inflightGets.set(key, promise);
            return promise;
        }

        return this._requestInner(url, options, timeoutOverride);
    }

    /**
     * Inner fetch-with-retry implementation.
     * @param {string} url
     * @param {Object} options
     * @param {number} [timeoutOverride]
     * @returns {Promise<Object>}
     * @private
     */
    async _requestInner(url, options = {}, timeoutOverride) {
        this._checkKnack();

        const timeoutMs = Number.isFinite(timeoutOverride) ? timeoutOverride : this.options.timeout;
        const { rateLimitHandler, onRateLimit429, headers, ...requestOptions } = options || {};

        return this._runRetriedRequest(url, {
            method: (requestOptions.method || 'GET').toUpperCase(),
            rateLimitHandler,
            onRateLimit429,
            execute: async () => {
                const method = (requestOptions.method || 'GET').toUpperCase();
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                try {
                    const fetchOptions = {
                        method,
                        headers: headers || (this._buildHeaders(true, { json: !(requestOptions.body instanceof FormData) })),
                        signal: controller.signal
                    };

                    if (requestOptions.body !== undefined && requestOptions.body !== null && !['GET', 'HEAD'].includes(method)) {
                        fetchOptions.body = requestOptions.body;
                    }

                    const response = await fetch(url, fetchOptions);
                    const responseText = await response.text();
                    if (!response.ok) {
                        throw {
                            status: response?.status,
                            statusText: response?.statusText,
                            responseText,
                            headers: response?.headers
                        };
                    }

                    const result = responseText ? (() => {
                        try {
                            return JSON.parse(responseText);
                        } catch (error) {
                            return responseText;
                        }
                    })() : {};

                    this._log('API response', result);
                    return { result, status: response?.status, headers: response?.headers };
                } catch (error) {
                    if (error?.name === 'AbortError') {
                        throw {
                            status: 0,
                            statusText: 'Request timeout',
                            responseText: '',
                            headers: null
                        };
                    }
                    throw error;
                } finally {
                    clearTimeout(timeoutId);
                }
            }
        });
    }

    /**
     * Runs a retried request loop with shared logging and 429/backoff handling.
     * @param {string} url
     * @param {Object} options
     * @param {string} options.method
     * @param {Function} options.execute
     * @param {Function} [options.rateLimitHandler]
     * @param {Function} [options.onRateLimit429]
     * @returns {Promise<*>}
     * @private
     */
    async _runRetriedRequest(url, options = {}) {
        const maxRetries = this.options.maxRetries;
        const maxAttempts = 1 + maxRetries;
        const retryOnStatus = this.options.retryOnStatus;
        const baseDelay = this.options.retryDelayBase;
        const maxDelay = this.options.retryDelayMax;
        const min429Delay = this.options.retryDelayMin429;
        const method = String(options.method || 'GET').toUpperCase();
        const execute = typeof options.execute === 'function' ? options.execute : null;

        if (!execute) {
            throw new Error('KnackAPI error: _runRetriedRequest requires an execute callback.');
        }

        this._toggleSpinner(true);

        try {
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                const requestedAt = Date.now();
                try {
                    const outcome = await execute(attempt);
                    this._recordApiUsage({
                        method,
                        url,
                        attempt,
                        ok: true,
                        status: Number.isFinite(outcome?.status) ? outcome.status : 200,
                        headers: outcome?.headers || null,
                        requestedAt,
                        respondedAt: Date.now()
                    });
                    return outcome?.result;
                } catch (error) {
                    const normalizedError = error instanceof Error && error.status !== undefined
                        ? error
                        : this._buildRequestError(error);
                    const status = normalizedError?.status;

                    this._recordApiUsage({
                        method,
                        url,
                        attempt,
                        ok: false,
                        status: Number.isFinite(status) ? status : null,
                        headers: error?.headers || null,
                        requestedAt,
                        respondedAt: Date.now()
                    });

                    const isRetryable = retryOnStatus.includes(status);
                    if (status === 429 && typeof options.onRateLimit429 === 'function') {
                        options.onRateLimit429();
                    }
                    if (!isRetryable || attempt >= maxAttempts) {
                        throw normalizedError;
                    }

                    const retryIndex = attempt - 1;
                    const backoffDelay = this._computeBackoffMs(baseDelay, maxDelay, retryIndex);
                    const retryAfterDelay = status === 429 ? this._getRetryAfterDelayMs(error) : 0;
                    const delay = status === 429
                        ? Math.max(backoffDelay, Number(min429Delay) || 0, retryAfterDelay)
                        : backoffDelay;

                    if (status === 429 && typeof options.rateLimitHandler === 'function') {
                        options.rateLimitHandler(delay);
                    }

                    this._log('Retrying request', { status, attempt, delay }, 'warn');
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } finally {
            this._toggleSpinner(false);
        }
    }

    /**
     * Build a structured error from an HTTP/fetch error-like object.
     * @param {Object} errorLike
     * @returns {Error}
     * @private
     */
    _buildRequestError(errorLike) {
        const status = errorLike?.status || 0;
        const responseText = typeof errorLike?.responseText === 'string'
            ? errorLike.responseText
            : (typeof errorLike?.body === 'string' ? errorLike.body : '');
        let message = errorLike?.statusText || 'Unknown error';

        try {
            const json = responseText ? JSON.parse(responseText) : null;
            message = this._extractErrorMessage(json) || message;
        } catch (error) {
            // ignore parse errors
        }

        const requestError = new Error(`API error ${status}: ${message}`);
        requestError.status = status;
        requestError.body = responseText || null;
        return requestError;
    }

    /**
     * Pull a readable message out of a Knack error response body.
     * Knack validation failures (HTTP 400) are shaped `{ errors: [{ field, message }] }` or
     * `{ errors: ['message'] }` rather than `{ message }`.
     * @param {Object|null} json - Parsed response body.
     * @returns {string} Message, or an empty string when none is found.
     * @private
     */
    _extractErrorMessage(json) {
        if (!json || typeof json !== 'object') return '';

        const errors = Array.isArray(json.errors) ? json.errors : (json.errors ? [json.errors] : []);
        const errorMessages = errors
            .map((entry) => {
                if (typeof entry === 'string') return entry.trim();
                if (!entry || typeof entry !== 'object') return '';
                const text = String(entry.message || entry.error || '').trim();
                const field = String(entry.field || '').trim();
                if (!text) return field;
                return field ? `${text} (${field})` : text;
            })
            .filter(Boolean);

        if (errorMessages.length) return errorMessages.join('; ');
        return String(json.message || json.error || '').trim();
    }

    /**
     * Compute a jittered exponential backoff delay.
     * @param {number} baseDelay
     * @param {number} maxDelay
     * @param {number} retryIndex
     * @returns {number}
     * @private
     */
    _computeBackoffMs(baseDelay, maxDelay, retryIndex) {
        const exp = Math.pow(2, Math.max(0, retryIndex));
        const cap = Math.min(baseDelay * exp, maxDelay);
        const min = Math.floor(cap / 2);
        return min + Math.floor(Math.random() * (cap - min + 1));
    }

    /**
     * Parse Retry-After header (seconds or date) into milliseconds.
     * @param {Object} responseLike
     * @returns {number}
     * @private
     */
    _getRetryAfterDelayMs(responseLike) {
        if (!responseLike) return 0;

        let retryAfter = null;
        if (typeof responseLike.headers?.get === 'function') {
            retryAfter = responseLike.headers.get('Retry-After');
        }

        if (!retryAfter) return 0;

        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.floor(seconds * 1000);
        }

        const retryAt = Date.parse(retryAfter);
        if (!Number.isNaN(retryAt)) {
            return Math.max(0, retryAt - Date.now());
        }

        return 0;
    }

    /**
     * Creates a minimal Headers-like reader from raw header text.
     * @param {string} rawHeaders
     * @returns {{ get: function(string): string|null }}
     * @private
     */
    _createHeaderReader(rawHeaders = '') {
        const headerMap = new Map();
        String(rawHeaders || '')
            .split(/\r?\n/)
            .forEach((line) => {
                const separatorIndex = line.indexOf(':');
                if (separatorIndex <= 0) return;
                const key = line.slice(0, separatorIndex).trim().toLowerCase();
                const value = line.slice(separatorIndex + 1).trim();
                if (key) headerMap.set(key, value);
            });

        return {
            get(name = '') {
                const key = String(name || '').trim().toLowerCase();
                return key ? (headerMap.get(key) || null) : null;
            }
        };
    }

    /**
     * Resolve API base URL.
     * @returns {string}
     * @private
     */
    _getApiBaseUrl() {
        return Knack?.api_dev || 'https://api.knack.com/v1';
    }

    /**
     * Prepare a JSON body for requests.
     * @param {Object} data
     * @returns {string|null}
     * @private
     */
    _prepareBody(data) {
        if (!data) return null;
        return JSON.stringify(data);
    }
}

/**
 * Returns a shared KnackAPI client for utility-level API calls.
 * Prefers a preconfigured global client when available.
 * @returns {KnackAPI}
 */
function getKnackApiClient() {
    if (typeof window !== 'undefined' && window.knackAPI instanceof KnackAPI) {
        return window.knackAPI;
    }

    if (typeof window !== 'undefined' && window.__knackFunctionsApiClient instanceof KnackAPI) {
        return window.__knackFunctionsApiClient;
    }

    const fallbackClient = new KnackAPI({
        showSpinner: false,
        debug: false,
        developerOnly: true,
        developerRoles: ['Developer']
    });

    if (typeof window !== 'undefined') {
        window.__knackFunctionsApiClient = fallbackClient;
        if (window.knackAPI === undefined || window.knackAPI === null) {
            window.knackAPI = fallbackClient;
        }
    }

    return fallbackClient;
}

/**
 * Resolves the KnackAPI client used by global usage helpers.
 * @param {KnackAPI|null} [apiClient=null] - Optional explicit client instance.
 * @returns {KnackAPI}
 */
function resolveKnackApiUsageClient(apiClient = null) {
    return apiClient instanceof KnackAPI ? apiClient : getKnackApiClient();
}

/**
 * Global helpers for inspecting KnackAPI usage and rate-limit state.
 */
const KnackApiUsage = {
    getClient(apiClient = null) {
        return resolveKnackApiUsageClient(apiClient);
    },
    getStats(apiClient = null) {
        return resolveKnackApiUsageClient(apiClient).getApiUsageStats();
    },
    getCallCount(apiClient = null) {
        return resolveKnackApiUsageClient(apiClient).getRunApiCallCount();
    },
    getRateLimit(apiClient = null) {
        return resolveKnackApiUsageClient(apiClient).getRateLimitStatus();
    },
    resetStats(options = {}, apiClient = null) {
        return resolveKnackApiUsageClient(apiClient).resetApiUsageStats(options);
    },
    logStats(options = {}, apiClient = null) {
        return resolveKnackApiUsageClient(apiClient).logApiUsageStats(options);
    },
    refreshStats(sceneId, viewId, options = {}, apiClient = null) {
        return resolveKnackApiUsageClient(apiClient).refreshApiUsageStats(sceneId, viewId, options);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.KnackApiUsage = KnackApiUsage;
    globalThis.knackAPIUsage = KnackApiUsage;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: webhook-holidays-menus
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Batch 11: V1 lines 8212-8252, 9525-9594, 9712-9720 (getAllTableRows 9093-9123), 12155-12265, 14107-14151, 18551-18627, 18690-18717, 19143-19252, 22919-23034.
// Native DOM; modern fetch/async. getKnackApiClient and KnackAPI are copied as-is in the previous section.

/**
 * Posts data to a webhook.
 * @param {string} webhookURL - HTTPS URL.
 * @param {*} data - JSON body.
 * @param {string} [webhookName='Unnamed Webhook'] - Name used in logs.
 * @param {boolean} [isSecure=false] - Send the user's token in a `userToken` header.
 * @returns {Promise<{success: true, data: *, error: null}|{error: string}>} `{error}` for a non-HTTPS URL.
 * @throws {{success: false, data: *, error: string, webhookName: string}} On a network error or non-OK response.
 */
async function triggerWebhook(webhookURL, data, webhookName = 'Unnamed Webhook', isSecure = false) {
    if (!webhookURL.startsWith('https://')) {
        const errorMsg = `Invalid webhook URL: ${webhookURL} in webhook: ${webhookName}`;
        console.error(errorMsg);
        return { error: errorMsg };
    }
    let responseData = null;
    try {
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', userToken: isSecure ? knackNavigator.getUserToken() : '' },
            body: JSON.stringify(data),
        });
        responseData = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : await response.text();
        if (!response.ok) {
            console.error(`Webhook (${webhookName}) failed with status ${response.status}:`, responseData);
            throw new Error(`Network response was not ok: ${responseData}`);
        }
        console.log(`Webhook (${webhookName}) sent successfully with response:`, responseData);
        return { success: true, data: responseData, error: null };
    } catch (error) {
        console.error(`Error triggering webhook: ${webhookName}`, error);
        throw { success: false, data: responseData, error: error.message, webhookName };
    }
}

/**
 * For a bank holiday date, gives the long weekend it belongs to (Monday: from the Saturday; Friday: to the Sunday).
 * @param {string} dateIso - `yyyy-mm-dd`.
 * @returns {{from: string, to: string, dayName: string}} UK dates (`dd/mm/yyyy`) and the weekday name.
 */
function getBankHolidayWeekendRange(dateIso) {
    const date = new Date(`${dateIso}T00:00:00Z`);
    const day = date.getUTCDay();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    const format = (value) => [value.getUTCDate(), value.getUTCMonth() + 1].map((part) => String(part).padStart(2, '0')).concat(value.getUTCFullYear()).join('/');
    return {
        from: format(day === 1 ? new Date(date.getTime() - twoDays) : date),
        to: format(day === 5 ? new Date(date.getTime() + twoDays) : date),
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day],
    };
}

/**
 * Fetches UK bank holidays from gov.uk for a year.
 * @param {Object} options
 * @param {number|string} options.targetYear - Year (required).
 * @param {number} [options.monthNumber] - Only this month (1-12).
 * @param {string} [options.titleContains] - Only holidays whose title contains this (case-insensitive).
 * @param {'eng'|'scotland'|'ireland'} [options.region='eng'] - `ireland` means Northern Ireland.
 * @returns {Promise<Array<{dateIso: string, dateUk: string, title: string, weekend: Object}>>}
 */
async function getGovBankHolidays(options = {}) {
    const { targetYear, monthNumber, titleContains } = options;
    const region = String(options.region || 'eng').toLowerCase();
    if (targetYear === undefined || targetYear === null) throw new Error('getGovBankHolidays requires options.targetYear');
    const year = Number(targetYear);
    if (!Number.isFinite(year)) throw new Error('getGovBankHolidays: targetYear must be a valid number');

    try {
        const response = await fetch('https://www.gov.uk/bank-holidays.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const division = { scotland: 'scotland', ireland: 'northern-ireland' }[region] ?? 'england-and-wales';
        return (payload?.[division]?.events ?? [])
            .filter((event) => {
                if (!event?.date) return false;
                const date = new Date(`${event.date}T00:00:00Z`);
                return date.getUTCFullYear() === year
                    && (!monthNumber || date.getUTCMonth() + 1 === monthNumber)
                    && (!titleContains || event.title.toLowerCase().includes(titleContains.toLowerCase()));
            })
            .map((event) => ({ dateIso: event.date, dateUk: getDateUKFormat(event.date), title: event.title, weekend: getBankHolidayWeekendRange(event.date) }));
    } catch (error) {
        console.error('getGovBankHolidays error:', error);
        throw error;
    }
}

/**
 * Redirects after a form submit or click, or when a modal's close button is clicked after a view or scene renders.
 * @param {Event|{type: string}} event - Knack event or DOM event.
 * @param {string} newURL - Where to go (after 300ms).
 */
function handleRedirect(event, newURL) {
    if (!event || !newURL) return;
    const go = () => setTimeout(() => { window.location.href = newURL; }, 300);
    if (['knack-form-submit', 'click'].includes(event.type)) go();
    else if (['knack-scene-render', 'knack-view-render'].includes(event.type)) {
        document.querySelectorAll('.kn-modal button.close-modal, .kn-modal .close-modal').forEach((button) => button.addEventListener('click', go, { once: true }));
    }
}

/**
 * Calls `callback(index, row)` for each row of a view's first table, in the order body, then (optionally) header and group rows.
 * @param {string} viewId - View id.
 * @param {(index: number, row: HTMLTableRowElement) => void} callback - Row callback.
 * @param {boolean} [includeHeader=false] - Put `thead` rows first.
 * @param {boolean} [includeGroup=false] - Add group rows last.
 * @param {string|null} [excludeSelector=null] - Skip rows matching this selector.
 */
function getAllTableRows(viewId, callback, includeHeader = false, includeGroup = false, excludeSelector = null) {
    const table = viewId && document.querySelector(`#${viewId} table`);
    if (!table) return;
    const rows = [
        ...(includeHeader ? table.querySelectorAll('thead tr') : []),
        ...table.querySelectorAll('tbody tr:not(.kn-table-group)'),
        ...(includeGroup ? table.querySelectorAll('tbody tr.kn-table-group') : []),
    ];
    rows.filter((row) => !excludeSelector || !row.matches(excludeSelector)).forEach((row, index) => callback(index, row));
}

/**
 * Shows only the week columns around the current week (moved to the end of each row), highlighting this week's cells.
 * Needs the app global WEEK_NUM_SHARED_AREA_GRID (`weekNumberFields`: 52 field classes).
 * @param {string} viewId - View id.
 * @param {string} bgGridColor - Background colour for the current week's cells.
 * @param {number} [weeksToShow=11] - Columns to show.
 * @param {number} [pastWeeksToShow=7] - How many of them are before this week.
 */
function showRelevantWeeks(viewId, bgGridColor, weeksToShow = 11, pastWeeksToShow = 7) {
    const { weekNumberFields } = window.WEEK_NUM_SHARED_AREA_GRID;
    const currentWeek = getWeekNumber(new Date());
    const view = document.getElementById(viewId);
    if (!view) return console.warn(`View element with ID ${viewId} not found`);
    const thead = view.querySelector('thead');
    const tbody = view.querySelector('tbody');
    if (!thead || !tbody) return console.warn(`Table header or body not found in view ${viewId}`);

    weekNumberFields.forEach((field) => view.querySelectorAll(`.${field}`).forEach((element) => { element.style.display = 'none'; }));
    const weeks = Array.from({ length: weeksToShow }, (_, index) => {
        const weekIndex = (currentWeek - pastWeeksToShow + index + 52) % 52 || 52; // Wraps over year ends; 52 not 0.
        return { field: weekNumberFields[weekIndex - 1], isCurrentWeek: weekIndex === currentWeek };
    });

    const headerRow = thead.querySelector('tr');
    weeks.forEach(({ field }) => {
        const header = headerRow?.querySelector(`.${field}`);
        if (!header) return;
        header.style.display = '';
        headerRow.append(header);
    });
    tbody.querySelectorAll('tr').forEach((row) => weeks.forEach(({ field, isCurrentWeek }) => {
        const cell = row.querySelector(`.${field}`);
        if (!cell) return;
        cell.style.display = '';
        if (isCurrentWeek) cell.style.backgroundColor = bgGridColor;
        row.append(cell);
    }));
}

/**
 * Updates a week's field on the shared-area record for a connection and type.
 * Needs the app global WEEK_NUM_SHARED_AREA_GRID.
 * @param {string} conxId - Connected record id.
 * @param {string} formDate - Form date as `dd/mm/yyyy`.
 * @param {*} value - Value to save in that week's field.
 * @param {*} typeValue - Type filter value.
 * @returns {Promise<void>}
 */
async function updateWeekNumberObject(conxId, formDate, value, typeValue) {
    const grid = WEEK_NUM_SHARED_AREA_GRID;
    const api = getKnackApiClient();
    const weekField = grid.weekNumberFields[getWeekNumber(convertToDateObj(formDate)) - 1];
    const [weeklyTask] = (await api.getRecords(grid.sceneId, grid.viewId, { filters: createFilterForWeekObj(grid, conxId, typeValue) })) ?? [];
    if (weeklyTask?.id) await api.updateRecord(grid.sceneId, grid.viewId, weeklyTask.id, { [weekField]: value });
}

/**
 * Replaces cell text with a label when its number is over a limit.
 * @param {string|number} cellIdent - Field id number (`td.field_N`), or text a link label must contain when `isLink`.
 * @param {number} maxNum - Largest number left as is.
 * @param {string} replaceTxt - Replacement text.
 * @param {boolean} [isLink] - Look at `span.knViewLink__label` elements instead of table cells.
 */
function replaceLargeNo(cellIdent, maxNum, replaceTxt, isLink) {
    const cells = isLink
        ? Array.from(document.querySelectorAll('span.knViewLink__label')).filter((span) => span.textContent.includes(cellIdent))
        : document.querySelectorAll(`td.field_${cellIdent}`);
    cells.forEach((cell) => {
        const value = parseInt(cell.textContent.replace(/,/g, ''), 10);
        if (!Number.isNaN(value) && value > maxNum) cell.textContent = replaceTxt;
    });
}

/**
 * Makes buttons and links in a view containing some text open a Knack asset (new window) or navigate to a file path.
 * Needs the app global KN_ASSET_PREFIX for same-window navigation.
 * @param {string} viewId - View id.
 * @param {string} btnText - Text the button must contain.
 * @param {string} filePath - Asset path.
 * @param {boolean} [openInNewWindow=false] - Open the Knack download URL in a new window.
 */
function openFileFromBtn(viewId, btnText, filePath, openInNewWindow = false) {
    const view = document.getElementById(viewId);
    if (!view) return console.error(`View element with ID ${viewId} not found`);
    const buttons = [...view.querySelectorAll('a'), ...view.querySelectorAll('button')].filter((button) => button.textContent.trim().includes(btnText));
    if (!buttons.length) return console.error(`Button with text "${btnText}" not found in view ${viewId}`);
    buttons.forEach((button) => button.addEventListener('click', (event) => {
        event.preventDefault();
        if (openInNewWindow) window.open(`https://api.knack.com/v1/applications/${knackNavigator.getApplicationId()}/download/asset/${filePath}`, '_blank');
        else window.location.href = sanitiseURL(window.location.href) + KN_ASSET_PREFIX + filePath;
    }));
}

/**
 * Keeps two text inputs in sync (both ways, firing input and change events); the non-empty one wins at the start.
 * Safe to call again for the same pair.
 * @param {HTMLInputElement|HTMLTextAreaElement} textInputA - First input.
 * @param {HTMLInputElement|HTMLTextAreaElement} textInputB - Second input.
 */
function syncTextInputs(textInputA, textInputB) {
    if (textInputA.dataset.notesSyncBound === '1' && textInputB.dataset.notesSyncBound === '1') return;
    textInputA.dataset.notesSyncBound = textInputB.dataset.notesSyncBound = '1';

    let isSyncing = false;
    const propagate = (source, target) => {
        if (isSyncing || target.value === source.value) return;
        isSyncing = true;
        target.value = source.value;
        fireEvent(target, 'input');
        fireEvent(target, 'change');
        isSyncing = false;
    };
    ['input', 'change'].forEach((type) => {
        textInputA.addEventListener(type, () => propagate(textInputA, textInputB));
        textInputB.addEventListener(type, () => propagate(textInputB, textInputA));
    });

    const [a, b] = [textInputA.value, textInputB.value].map((value) => (value || '').trim());
    if (a && a !== b) propagate(textInputA, textInputB);
    else if (b && b !== a) propagate(textInputB, textInputA);
}

/**
 * Creates a Knack-styled button. Also accepts the old positional form `createButton(id, html, className)`.
 * @param {Object|string} options - `{id, html, className, type, attributes, onClick}`, or the id in the old form.
 * @returns {HTMLButtonElement}
 */
function createButton(options) {
    if (typeof options === 'string') options = { id: options, html: arguments[1], className: arguments[2] };
    const { id, html, className, type, attributes, onClick } = { id: '', html: '', className: '', type: 'button', attributes: {}, onClick: null, ...options };
    const button = document.createElement('button');
    if (id) button.id = id;
    button.className = `kn-button${className ? ` ${className}` : ''}`;
    button.type = type;
    button.innerHTML = html;
    Object.entries(attributes).forEach(([name, value]) => button.setAttribute(name, value));
    if (typeof onClick === 'function') button.addEventListener('click', onClick);
    return button;
}

/**
 * Opens the browser's date picker when a `type="date"` input is clicked or focused (once per input).
 * @param {HTMLInputElement|string|NodeList|Array} inputOrSelector - Input(s) or selector.
 * @returns {HTMLInputElement[]} The date inputs that have the picker attached.
 */
function attachNativeDateInputPicker(inputOrSelector) {
    return resolveElements(inputOrSelector).filter((input) => {
        if (!(input instanceof HTMLInputElement) || input.type.toLowerCase() !== 'date') return false;
        if (input.dataset.knackNativeDatePickerAttached === 'true') return true;
        const openPicker = () => {
            if (typeof input.showPicker !== 'function' || input.disabled || input.readOnly) return;
            try { input.showPicker(); } catch { /* Browser restriction or unsupported context. */ }
        };
        input.addEventListener('click', openPicker);
        input.addEventListener('focus', openPicker);
        input.dataset.knackNativeDatePickerAttached = 'true';
        return true;
    });
}

/**
 * Replaces the items of a view's menu links with styled buttons.
 * @param {Object} [config]
 * @param {Element} config.root - View root containing `.menu-links`.
 * @param {Array<{label?: string, id?: string, className?: string, isActive?: boolean, data?: Object, colors?: {baseColor?: string, activeColor?: string, textColor?: string}}>} [config.menuItems=[]] - Items.
 * @param {string} [config.buttonClass=''] - Extra class for every button.
 */
function renderMenuButtons({ root, menuItems = [], buttonClass = '' } = {}) {
    if (!root) return;
    ensureMenuButtonActiveStyles();
    const menuLinks = root.querySelector('.menu-links');
    if (!menuLinks) return;
    const list = menuLinks.querySelector('.menu-links__list') || menuLinks;
    list.classList.add('kf-menu-links');
    list.querySelectorAll('.kf-menu-item').forEach((item) => item.remove());

    const linkClassName = menuLinks.querySelector('a')?.className || '';
    const globalClass = String(buttonClass || '').trim();
    const fragment = document.createDocumentFragment();
    (Array.isArray(menuItems) ? menuItems : []).forEach((item) => {
        const link = document.createElement('a');
        const extraClass = String(item?.className || '').trim();
        link.className = `${linkClassName} kn-button kf-menu-button${globalClass ? ` ${globalClass}` : ''}${extraClass ? ` ${extraClass}` : ''}`;
        link.textContent = String(item?.label || '').trim() || 'Menu';
        link.href = '#';
        if (item?.isActive) link.classList.add('is-active');
        if (item?.id) link.dataset.platformId = String(item.id);
        if (item?.data && typeof item.data === 'object') Object.entries(item.data).forEach(([key, value]) => { if (key) link.dataset[key] = String(value); });
        const { baseColor, activeColor, textColor } = item?.colors ?? {};
        if (baseColor) {
            link.style.setProperty('--kf-menu-color', baseColor);
            link.style.setProperty('--kf-menu-color-active', activeColor || baseColor);
            if (textColor) link.style.setProperty('--kf-menu-text-color', textColor);
        }
        const menuItem = Object.assign(document.createElement('li'), { className: 'kf-menu-item menu-links__list-item' });
        menuItem.append(link);
        fragment.append(menuItem);
    });
    list.append(fragment);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: bulk-actions-a
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Bulk actions (core, DOM state, modal and grid controller, replication, exports): V1 lines 1788-1943 ported as-is (analyses C04, C06-C08: wave 3, no signature changes).

/**
 * Returns unique non-empty string values while preserving input order.
 * @param {Array<*>} values - Values to normalise and deduplicate.
 * @returns {Array<string>} Distinct string values.
 */
function bulkActionUniqueStrings(values) {
    return Array.from(
        new Set(
            (Array.isArray(values) ? values : [])
                .map((value) => knackValueResolver.toStringSafe(value))
                .filter(Boolean)
        )
    );
}

/**
 * Resolves a named callback from a local registry first, then from global scope.
 * @param {string} name - Callback name to resolve.
 * @param {Object|null} registry - Optional local callback registry.
 * @param {Object|null} globalScope - Optional global scope fallback.
 * @returns {Function|null} Resolved callback or null.
 */
function bulkActionResolveRegistryCallback(name, registry, globalScope) {
    const key = knackValueResolver.toStringSafe(name);
    if (!key) return null;

    const registryFn = registry && typeof registry === 'object' ? registry[key] : null;
    if (typeof registryFn === 'function') return registryFn;

    const globalFn = globalScope && typeof globalScope === 'object' ? globalScope[key] : null;
    return typeof globalFn === 'function' ? globalFn : null;
}

/**
 * Classifies a bulk-action failure into validation or network-like categories.
 * @param {*} error - Error thrown by the underlying request or handler.
 * @returns {{type: string, message: string}} Normalised failure metadata.
 */
function classifyBulkActionFailure(error) {
    const status = Number(
        error?.status
        ?? error?.httpStatus
        ?? error?.response?.status
        ?? error?.body?.status
        ?? 0
    );

    const message = knackValueResolver.toStringSafe(
        error?.body?.message
        || error?.bodyText
        || error?.message
        || error?.statusText
    );

    const normalized = message.toLowerCase();
    const isValidationError =
        [400, 401, 403, 404, 409, 422].includes(status)
        || BULK_ACTION_DEFAULT_CONFIG.constants.validationErrorPattern.test(normalized);

    return isValidationError
        ? { type: 'validation', message: message || 'Validation issue. Check required or invalid fields.' }
        : { type: 'network', message: message || 'Network or unexpected error.' };
}

/**
 * Wraps storage access with safe get/set/remove guards.
 * @param {Storage|null} storage - Storage provider, typically sessionStorage.
 * @param {Object} [options={}] - Adapter options.
 * @returns {{get: Function, set: Function, remove: Function}} Safe storage adapter.
 */
function createBulkActionStorageAdapter(storage, options = {}) {
    const {
        preferKtl = true,
        session = false,
        noUserId = false,
        secure = false
    } = options;

    const ktlStorage = preferKtl
        && typeof globalThis !== 'undefined'
        && globalThis.ktl?.storage
        && typeof globalThis.ktl.storage.lsGetItem === 'function'
        && typeof globalThis.ktl.storage.lsSetItem === 'function'
        && typeof globalThis.ktl.storage.lsRemoveItem === 'function'
        ? globalThis.ktl.storage
        : null;

    return {
        get(key) {
            if (ktlStorage) {
                try {
                    const value = ktlStorage.lsGetItem(key, noUserId, session, secure);
                    return value === '' ? null : value;
                } catch (_) {
                    return null;
                }
            }

            if (!storage || typeof storage.getItem !== 'function') return null;
            try {
                return storage.getItem(key);
            } catch (_) {
                return null;
            }
        },
        set(key, value) {
            if (ktlStorage) {
                try {
                    ktlStorage.lsSetItem(key, value, noUserId, session, secure);
                    return true;
                } catch (_) {
                    return false;
                }
            }

            if (!storage || typeof storage.setItem !== 'function') return false;
            try {
                storage.setItem(key, value);
                return true;
            } catch (_) {
                return false;
            }
        },
        remove(key) {
            if (ktlStorage) {
                try {
                    ktlStorage.lsRemoveItem(key, noUserId, session, secure);
                    return true;
                } catch (_) {
                    return false;
                }
            }

            if (!storage || typeof storage.removeItem !== 'function') return false;
            try {
                storage.removeItem(key);
                return true;
            } catch (_) {
                return false;
            }
        }
    };
}

/**
 * Returns the session-scoped storage adapter used by bulk-action workflows.
 * Prefers classic KTL storage when available and falls back to raw sessionStorage.
 * @returns {{get: Function, set: Function, remove: Function}} Session storage adapter.
 */
function createBulkActionSessionStorageAdapter() {
    return createBulkActionStorageAdapter(
        typeof sessionStorage !== 'undefined' ? sessionStorage : null,
        { preferKtl: true, session: true }
    );
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: bulk-actions-b
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Bulk actions continued: V1 lines 2833-6900 ported as-is.
/**
 * Resolves the current Knack application id from the provided global scope.
 * @param {Object|null} globalScope - Global scope candidate.
 * @returns {string} Normalised application id.
 */
function resolveDefaultBulkActionAppId(globalScope) {
    return knackValueResolver.toStringSafe(
        globalScope?.Knack?.application_id
        || globalScope?.application_id
    );
}

/**
 * Resolves a field reference from a field id or a view-specific label.
 * @param {string|number} value - Field id, field key, or field label.
 * @param {string} [viewId=''] - View id used for label lookups.
 * @returns {string} Normalised field id, or an empty string.
 */
function resolveBulkActionFieldId(value, viewId = '') {
    const normalizedFieldId = knackNavigator.normalizeFieldId(value);
    if (normalizedFieldId) return normalizedFieldId;

    const normalizedViewId = knackNavigator.normalizeViewId(viewId);
    if (!normalizedViewId) return '';

    return knackNavigator.getFieldIdFromLabel(normalizedViewId, value);
}

/**
 * Parses a bulk-action keyword definition into form replication metadata.
 * @param {Array<*>} params - Raw keyword parameters.
 * @param {string} operation - Target form operation, create or update.
 * @param {Object} [options={}] - Optional parsing hooks.
 * @returns {{recordFieldId: string, dataCallbackName: string, successCallbackName: string, validationCallbackName: string}} Parsed definition.
 */
function parseBulkActionDefinition(params, operation, options = {}) {
    const { resolveFieldId = (value) => knackNavigator.normalizeFieldId(value) } = options;
    const op = String(operation || '').toLowerCase() === 'update' ? 'update' : 'create';
    const third = params?.[2];
    const fourth = params?.[3];
    const fifth = params?.[4];
    const sixth = params?.[5];

    if (op === 'create') {
        return {
            recordFieldId: resolveFieldId(third),
            dataCallbackName: knackValueResolver.toStringSafe(fourth),
            successCallbackName: knackValueResolver.toStringSafe(fifth),
            validationCallbackName: knackValueResolver.toStringSafe(sixth)
        };
    }

    const thirdAsField = resolveFieldId(third);
    if (third != null && !thirdAsField) {
        return {
            recordFieldId: '',
            dataCallbackName: knackValueResolver.toStringSafe(third),
            successCallbackName: knackValueResolver.toStringSafe(fourth),
            validationCallbackName: knackValueResolver.toStringSafe(fifth)
        };
    }

    return {
        recordFieldId: thirdAsField,
        dataCallbackName: knackValueResolver.toStringSafe(fourth),
        successCallbackName: knackValueResolver.toStringSafe(fifth),
        validationCallbackName: knackValueResolver.toStringSafe(sixth)
    };
}

/**
 * Flattens supported keyword input shapes into a list of parameter groups.
 * @param {*} keywordSource - Raw keyword source value.
 * @param {string} [keywordName='_bulk_actions'] - Keyword name to extract.
 * @returns {Array<Array<*>>} Flattened keyword groups.
 */
function normalizeBulkActionKeywordGroupsInput(keywordSource, keywordName = '_bulk_actions') {
    const normalizedKeywordName = knackValueResolver.toStringSafe(keywordName || '_bulk_actions');

    function flatten(source) {
        if (!source) return [];

        if (Array.isArray(source)) {
            if (source.every((item) => Array.isArray(item))) {
                return source;
            }

            return source.flatMap((item) => flatten(item));
        }

        if (typeof source !== 'object') return [];

        if (Array.isArray(source.params)) {
            return flatten(source.params);
        }

        if (normalizedKeywordName && source[normalizedKeywordName] != null) {
            return flatten(source[normalizedKeywordName]);
        }

        return [];
    }

    return flatten(keywordSource);
}

/**
 * Parses bulk-action keyword groups into grid/form action configuration.
 * @param {*} keywordGroups - Raw keyword groups from the Knack keyword parser.
 * @param {Object} [options={}] - Parsing options and callback registries.
 * @returns {{labelFieldIds: Array<string>, defaultRecordFieldId: string, actions: Array<Object>, warnings: Array<Object>}} Parsed configuration.
 */
function parseBulkActionKeywordGroups(keywordGroups, options = {}) {
    const {
        resolveView = (viewId) => knackNavigator.getViewObject(viewId),
        gridActionRegistry = null,
        dataCallbackRegistry = null,
        successCallbackRegistry = null,
        validationCallbackRegistry = null,
        globalScope = typeof globalThis !== 'undefined' ? globalThis : null,
        keywordName = '_bulk_actions',
        sourceViewId = ''
    } = options;

    const groups = normalizeBulkActionKeywordGroupsInput(keywordGroups, keywordName);
    const actions = [];
    const warnings = [];
    let labelFieldIds = [];
    let defaultRecordFieldId = '';

    groups.forEach((params) => {
        if (!Array.isArray(params) || params.length < 2) return;
        const first = knackValueResolver.toStringSafe(params[0]).toLowerCase();

        if (first === 'label') {
            const collected = new Set();
            params.slice(1).forEach((value) => {
                const raw = knackValueResolver.toStringSafe(value);
                if (!raw) return;

                const matches = raw.match(/field_\d+/gi);
                if (matches && matches.length) {
                    matches.forEach((match) => {
                        const normalized = knackNavigator.normalizeFieldId(match);
                        if (normalized) collected.add(normalized);
                    });
                    return;
                }

                const normalized = resolveBulkActionFieldId(raw, sourceViewId);
                if (normalized) collected.add(normalized);
            });

            labelFieldIds = Array.from(collected);
            if (!labelFieldIds.length) {
                warnings.push({ type: 'config', message: 'Invalid label field configuration.', params });
            }
            return;
        }

        if (BULK_ACTION_DEFAULT_CONFIG.constants.reservedLabels.has(first)) {
            const fieldId = knackNavigator.normalizeFieldId(params[1]);
            if (!fieldId) {
                warnings.push({ type: 'config', message: 'Invalid record picker field configuration.', params });
                return;
            }
            defaultRecordFieldId = fieldId;
        }
    });

    groups.forEach((params) => {
        if (!Array.isArray(params) || params.length < 2) return;

        const label = knackValueResolver.toStringSafe(params[0]);
        const target = knackValueResolver.toStringSafe(params[1]);
        const labelLower = label.toLowerCase();
        if (!label || !target || labelLower === 'label' || BULK_ACTION_DEFAULT_CONFIG.constants.reservedLabels.has(labelLower)) {
            return;
        }

        if (/^action\s*:/i.test(target)) {
            const actionName = knackValueResolver.toStringSafe(target.split(':').slice(1).join(':'));
            const handlerBatch = bulkActionResolveRegistryCallback(actionName, gridActionRegistry, globalScope);
            if (!handlerBatch) {
                warnings.push({ type: 'action', message: `Missing grid action: ${actionName || '(blank)'}`, params });
                return;
            }

            actions.push({
                key: `action:${actionName}`,
                label,
                targetType: 'grid',
                target,
                actionName,
                handlerBatch
            });
            return;
        }

        const formViewId = knackNavigator.normalizeViewId(target);
        if (!formViewId) {
            warnings.push({ type: 'action', message: `Invalid action target: ${target}`, params });
            return;
        }

        const view = resolveView(formViewId) || {};
        const operation = String(view.action || '').toLowerCase();
        if (operation !== 'create' && operation !== 'update') {
            warnings.push({ type: 'action', message: `Referenced view must be a create/update form: ${formViewId}`, params });
            return;
        }

        const parsed = parseBulkActionDefinition(params, operation, {
            resolveFieldId: (value) => resolveBulkActionFieldId(value, formViewId)
        });
        if (operation === 'create' && !parsed.recordFieldId && !defaultRecordFieldId) {
            warnings.push({ type: 'action', message: `Create action requires a record picker field: ${formViewId}`, params });
            return;
        }

        const resolvedDataCallback = parsed.dataCallbackName
            ? bulkActionResolveRegistryCallback(parsed.dataCallbackName, dataCallbackRegistry, globalScope)
            : null;
        if (parsed.dataCallbackName) {
            if (!resolvedDataCallback) {
                warnings.push({ type: 'action', message: `Missing data callback: ${parsed.dataCallbackName}`, params });
                return;
            }
        }

        const resolvedSuccessCallback = parsed.successCallbackName
            ? bulkActionResolveRegistryCallback(parsed.successCallbackName, successCallbackRegistry, globalScope)
            : null;
        if (parsed.successCallbackName) {
            if (!resolvedSuccessCallback) {
                warnings.push({ type: 'action', message: `Missing success callback: ${parsed.successCallbackName}`, params });
                return;
            }
        }

        const resolvedValidationCallback = parsed.validationCallbackName
            ? bulkActionResolveRegistryCallback(parsed.validationCallbackName, validationCallbackRegistry, globalScope)
            : null;
        if (parsed.validationCallbackName && !resolvedValidationCallback) {
            warnings.push({ type: 'action', message: `Missing validation callback: ${parsed.validationCallbackName}`, params });
            return;
        }

        actions.push({
            key: `${operation}:${formViewId}`,
            label,
            targetType: 'form',
            target: formViewId,
            operation,
            recordFieldId: parsed.recordFieldId || defaultRecordFieldId,
            dataCallback: resolvedDataCallback,
            successCallback: resolvedSuccessCallback,
            validationCallback: resolvedValidationCallback
        });
    });

    return {
        labelFieldIds,
        defaultRecordFieldId,
        actions,
        warnings
    };
}

/**
 * Removes HTML markup from bulk-action labels so basket text stays readable.
 * @param {*} value - Label value to normalise.
 * @returns {string} Plain-text label.
 */
function bulkActionNormaliseLabelText(value) {
    return knackValueResolver.toStringSafe(value)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Normalises stored basket items so each item has a valid string record id.
 * @param {Array<Object>} [items=[]] - Basket items to normalise.
 * @returns {Array<Object>} Normalised basket items.
 */
function bulkActionNormalizeBasketItems(items = []) {
    return (Array.isArray(items) ? items : [])
        .filter((item) => knackValueResolver.toStringSafe(item?.recordId))
        .map((item) => ({
            ...item,
            recordId: knackValueResolver.toStringSafe(item.recordId),
            label: bulkActionNormaliseLabelText(item?.label) || knackValueResolver.toStringSafe(item?.recordId)
        }));
}

const BULK_ACTION_DEFAULT_CONFIG = {
    namespace: 'KNACK_BULK',
    constants: {
        validationErrorPattern: /required|invalid|validation|duplicate|conflict|not found|forbidden|unauthori[zs]ed/,
        reservedLabels: new Set(['record', 'recordid', 'id', 'target', 'picker']),
        formFlowTtlMs: 10 * 60 * 1000,
        selectors: {
            formField: '[id^="kn-input-field_"]',
            writableControl: 'select:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([disabled]), [contenteditable="true"]',
            textInput: 'textarea:not([disabled]), input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([disabled])',
            richText: '[contenteditable="true"], .redactor_editor'
        },
        styleId: 'knackBulkActionBaseStyles'
    },
    basket: {
        title: 'Basket',
        emptyText: 'No items yet. Tick rows to add.',
        ttlMs: 15 * 60 * 1000,
        modalClass: ''
    },
    action: {
        buttonClass: 'knackBulkActionButton',
        buttonBarClass: 'knackBulkActionBar',
        notify: null,
        onError: null,
        api: {}
    },
    selection: {
        scope: 'ktlCheckbox',
        rowCheckboxClass: 'knackBulkRowCheckbox',
        masterCheckboxClass: 'knackBulkMasterCheckbox'
    },
    form: {
        noticeClass: '',
        chosenUpdateEvent: 'liszt:updated',
        styles: {}
    }
};

/**
 * Creates the canonical bulk-actions config used by grid, basket, and form workflows.
 * @param {Object} [config={}] - Bulk-actions config overrides.
 * @returns {Object} Normalised bulk-actions config.
 */
function createBulkActionConfig(config = {}) {
    const source = config && typeof config === 'object' ? config : {};
    const basket = source.basket && typeof source.basket === 'object' ? source.basket : {};
    const action = source.action && typeof source.action === 'object' ? source.action : {};
    const selection = source.selection && typeof source.selection === 'object' ? source.selection : {};
    const form = source.form && typeof source.form === 'object' ? source.form : {};
    const constants = source.constants && typeof source.constants === 'object' ? source.constants : {};
    const sourceSelectors = constants.selectors && typeof constants.selectors === 'object' ? constants.selectors : {};

    return {
        namespace: knackValueResolver.toStringSafe(source.namespace || BULK_ACTION_DEFAULT_CONFIG.namespace) || BULK_ACTION_DEFAULT_CONFIG.namespace,
        constants: {
            validationErrorPattern: constants.validationErrorPattern instanceof RegExp
                ? constants.validationErrorPattern
                : BULK_ACTION_DEFAULT_CONFIG.constants.validationErrorPattern,
            reservedLabels: constants.reservedLabels instanceof Set
                ? constants.reservedLabels
                : BULK_ACTION_DEFAULT_CONFIG.constants.reservedLabels,
            formFlowTtlMs: Number.isFinite(Number(constants.formFlowTtlMs))
                ? Number(constants.formFlowTtlMs)
                : BULK_ACTION_DEFAULT_CONFIG.constants.formFlowTtlMs,
            selectors: {
                formField: knackValueResolver.toStringSafe(sourceSelectors.formField || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.formField) || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.formField,
                writableControl: knackValueResolver.toStringSafe(sourceSelectors.writableControl || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.writableControl) || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.writableControl,
                textInput: knackValueResolver.toStringSafe(sourceSelectors.textInput || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.textInput) || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.textInput,
                richText: knackValueResolver.toStringSafe(sourceSelectors.richText || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.richText) || BULK_ACTION_DEFAULT_CONFIG.constants.selectors.richText
            },
            styleId: knackValueResolver.toStringSafe(constants.styleId || BULK_ACTION_DEFAULT_CONFIG.constants.styleId) || BULK_ACTION_DEFAULT_CONFIG.constants.styleId
        },
        basket: {
            title: knackValueResolver.toStringSafe(basket.title || BULK_ACTION_DEFAULT_CONFIG.basket.title) || BULK_ACTION_DEFAULT_CONFIG.basket.title,
            emptyText: knackValueResolver.toStringSafe(basket.emptyText || BULK_ACTION_DEFAULT_CONFIG.basket.emptyText) || BULK_ACTION_DEFAULT_CONFIG.basket.emptyText,
            ttlMs: Number.isFinite(Number(basket.ttlMs)) ? Number(basket.ttlMs) : BULK_ACTION_DEFAULT_CONFIG.basket.ttlMs,
            modalClass: knackValueResolver.toStringSafe(basket.modalClass)
        },
        action: {
            buttonClass: knackValueResolver.toStringSafe(action.buttonClass || BULK_ACTION_DEFAULT_CONFIG.action.buttonClass) || BULK_ACTION_DEFAULT_CONFIG.action.buttonClass,
            buttonBarClass: knackValueResolver.toStringSafe(action.buttonBarClass || BULK_ACTION_DEFAULT_CONFIG.action.buttonBarClass) || BULK_ACTION_DEFAULT_CONFIG.action.buttonBarClass,
            notify: typeof action.notify === 'function' ? action.notify : null,
            onError: typeof action.onError === 'function' ? action.onError : null,
            api: action.api && typeof action.api === 'object' ? action.api : {}
        },
        selection: {
            scope: knackValueResolver.toStringSafe(selection.scope || BULK_ACTION_DEFAULT_CONFIG.selection.scope) || BULK_ACTION_DEFAULT_CONFIG.selection.scope,
            rowCheckboxClass: knackValueResolver.toStringSafe(selection.rowCheckboxClass || BULK_ACTION_DEFAULT_CONFIG.selection.rowCheckboxClass) || BULK_ACTION_DEFAULT_CONFIG.selection.rowCheckboxClass,
            masterCheckboxClass: knackValueResolver.toStringSafe(selection.masterCheckboxClass || BULK_ACTION_DEFAULT_CONFIG.selection.masterCheckboxClass) || BULK_ACTION_DEFAULT_CONFIG.selection.masterCheckboxClass
        },
        form: {
            noticeClass: knackValueResolver.toStringSafe(form.noticeClass),
            chosenUpdateEvent: knackValueResolver.toStringSafe(form.chosenUpdateEvent || BULK_ACTION_DEFAULT_CONFIG.form.chosenUpdateEvent) || BULK_ACTION_DEFAULT_CONFIG.form.chosenUpdateEvent,
            styles: form.styles && typeof form.styles === 'object' ? form.styles : {}
        }
    };
}

/**
 * Merges a bulk-actions config override onto an existing config.
 * @param {Object} baseConfig - Base bulk-actions config.
 * @param {Object} [overrideConfig={}] - Override config.
 * @returns {Object} Merged bulk-actions config.
 */
function mergeBulkActionConfig(baseConfig, overrideConfig = {}) {
    const base = createBulkActionConfig(baseConfig);
    const override = overrideConfig && typeof overrideConfig === 'object' ? overrideConfig : {};
    const overrideAction = override.action && typeof override.action === 'object' ? override.action : {};
    const overrideForm = override.form && typeof override.form === 'object' ? override.form : {};

    return createBulkActionConfig({
        ...base,
        ...override,
        basket: {
            ...base.basket,
            ...(override.basket && typeof override.basket === 'object' ? override.basket : {})
        },
        action: {
            ...base.action,
            ...overrideAction,
            api: {
                ...base.action.api,
                ...(overrideAction.api && typeof overrideAction.api === 'object' ? overrideAction.api : {})
            }
        },
        selection: {
            ...base.selection,
            ...(override.selection && typeof override.selection === 'object' ? override.selection : {})
        },
        constants: {
            ...base.constants,
            ...(override.constants && typeof override.constants === 'object' ? override.constants : {}),
            selectors: {
                ...base.constants.selectors,
                ...(override.constants?.selectors && typeof override.constants.selectors === 'object' ? override.constants.selectors : {})
            }
        },
        form: {
            ...base.form,
            ...overrideForm,
            styles: bulkActionMergeStyleMaps(base.form.styles, overrideForm.styles)
        }
    });
}

/**
 * Creates the persistent basket store used by a single bulk-action grid.
 * @param {Object} [options={}] - Store options such as namespace, view id, and storage adapter.
 * @returns {Object} Basket store API.
 */
function createBulkActionBasketStore(options = {}) {
    const {
        namespace = 'KNACK_BULK',
        appId = resolveDefaultBulkActionAppId(typeof globalThis !== 'undefined' ? globalThis : null) || 'app',
        viewId = 'unknown',
        ttlMs = 15 * 60 * 1000,
        now = () => Date.now(),
        isOpen = () => false,
        storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null
    } = options;

    const adapter = createBulkActionStorageAdapter(storage, { preferKtl: true, session: true });
    const memory = {
        items: null,
        storedAt: 0,
        activeActionKey: ''
    };

    function buildStorageKey(...parts) {
        return [namespace, appId, viewId, ...parts].filter(Boolean).join('_');
    }

    const basketKey = buildStorageKey('basket');
    const activeActionKeyName = buildStorageKey('activeAction');

    function loadEnvelope() {
        const raw = adapter.get(basketKey);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed?.items) ? parsed.items : null;
            if (!items) return null;
            return {
                items,
                storedAt: Number(parsed?.storedAt || 0)
            };
        } catch (_) {
            return null;
        }
    }

    function saveEnvelope(items) {
        const normalizedItems = Array.isArray(items) ? items : [];
        const storedAt = Number(now());
        memory.items = normalizedItems;
        memory.storedAt = storedAt;
        adapter.set(basketKey, JSON.stringify({ storedAt, items: normalizedItems }));
        return normalizedItems;
    }

    function expireIfNeeded() {
        if (ttlMs <= 0 || isOpen()) return false;
        const envelope = loadEnvelope();
        const storedAt = Number(memory.storedAt || envelope?.storedAt || 0);
        if (!storedAt) return false;
        if (Number(now()) - storedAt <= ttlMs) return false;
        clear();
        return true;
    }

    function getItems() {
        if (expireIfNeeded()) return [];
        if (Array.isArray(memory.items)) return memory.items.slice();

        const envelope = loadEnvelope();
        if (!envelope) return [];
        memory.items = bulkActionNormalizeBasketItems(envelope.items);
        memory.storedAt = Number(envelope.storedAt || 0);
        return memory.items.slice();
    }

    function setItems(items) {
        return saveEnvelope(bulkActionNormalizeBasketItems(items)).slice();
    }

    function addItems(items) {
        const current = getItems();
        const byId = new Map(current.map((item) => [item.recordId, item]));

        (Array.isArray(items) ? items : []).forEach((item) => {
            const recordId = knackValueResolver.toStringSafe(item?.recordId);
            if (!recordId) return;
            byId.set(recordId, { ...(byId.get(recordId) || {}), ...item, recordId });
        });

        return setItems(Array.from(byId.values()));
    }

    function removeItems(recordIds) {
        const removeSet = new Set(bulkActionUniqueStrings(recordIds));
        if (!removeSet.size) return getItems();
        return setItems(getItems().filter((item) => !removeSet.has(item.recordId)));
    }

    function clear() {
        memory.items = [];
        memory.storedAt = 0;
        memory.activeActionKey = '';
        adapter.remove(basketKey);
        adapter.remove(activeActionKeyName);
        return [];
    }

    function getActiveActionKey() {
        if (memory.activeActionKey) return memory.activeActionKey;
        const raw = adapter.get(activeActionKeyName);
        memory.activeActionKey = knackValueResolver.toStringSafe(raw);
        return memory.activeActionKey;
    }

    function setActiveActionKey(actionKey) {
        memory.activeActionKey = knackValueResolver.toStringSafe(actionKey);
        if (!memory.activeActionKey) {
            adapter.remove(activeActionKeyName);
            return '';
        }
        adapter.set(activeActionKeyName, memory.activeActionKey);
        return memory.activeActionKey;
    }

    return {
        keys: {
            basket: basketKey,
            activeAction: activeActionKeyName
        },
        expireIfNeeded,
        getItems,
        setItems,
        addItems,
        removeItems,
        clear,
        getActiveActionKey,
        setActiveActionKey
    };
}

/**
 * Creates the runner used for non-form bulk actions.
 * @param {Object} [options={}] - Runner options, handlers, and callbacks.
 * @returns {{run: Function, resolveAction: Function}} Runner API.
 */
function createBulkActionRunner(options = {}) {
    const {
        actions = [],
        classifyError = classifyBulkActionFailure,
        onStateChange = () => {},
        concurrency = 'parallel'
    } = options;

    function cloneForHandler(value) {
        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(value);
            } catch (_) {}
        }

        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            if (Array.isArray(value)) return value.slice();
            if (value && typeof value === 'object') return { ...value };
            return value;
        }
    }

    function resolveAction(actionKey) {
        const normalizedActionKey = knackValueResolver.toStringSafe(actionKey);
        return (Array.isArray(actions) ? actions : []).find((action) => knackValueResolver.toStringSafe(action?.key) === normalizedActionKey) || null;
    }

    function createItemMutationHelpers(items = []) {
        const nextItems = items.slice();
        const itemIndexesByRecordId = new Map();
        const clonedIndexes = new Set();

        nextItems.forEach((item, index) => {
            const recordId = knackValueResolver.toStringSafe(item?.recordId);
            if (!recordId) return;

            const indexes = itemIndexesByRecordId.get(recordId) || [];
            indexes.push(index);
            itemIndexesByRecordId.set(recordId, indexes);
        });

        const ensureMutableItem = (index) => {
            if (index < 0) return null;
            if (clonedIndexes.has(index)) return nextItems[index];

            // Clone only the item being mutated so we preserve immutability without copying the whole basket on every update.
            const current = nextItems[index];
            nextItems[index] = current && typeof current === 'object' ? { ...current } : {};
            clonedIndexes.add(index);
            return nextItems[index];
        };

        const mutateRecordItems = (recordId, mutate) => {
            const indexes = itemIndexesByRecordId.get(knackValueResolver.toStringSafe(recordId)) || [];
            indexes.forEach((index) => {
                const mutable = ensureMutableItem(index);
                if (mutable) mutate(mutable);
            });
        };

        return {
            nextItems,
            setFailure(recordId, error) {
                const failure = classifyError(error);
                mutateRecordItems(recordId, (item) => {
                    item.failureType = failure.type;
                    item.failureMessage = failure.message;
                });
            },
            clearFailure(recordId) {
                mutateRecordItems(recordId, (item) => {
                    delete item.failureType;
                    delete item.failureMessage;
                });
            }
        };
    }

    async function run(actionKey, runOptions = {}) {
        const {
            items = [],
            onlyFailed = false,
            context = {}
        } = runOptions;

        const action = resolveAction(actionKey);
        if (!action) {
            throw new Error(`Unknown bulk action: ${actionKey}`);
        }
        if (typeof action.handlerBatch !== 'function' && typeof action.handler !== 'function') {
            throw new Error(`Bulk action is missing a handler: ${actionKey}`);
        }

        const sourceItems = Array.isArray(items) ? items : [];
        const targetItems = onlyFailed
            ? sourceItems.filter((item) => item?.failureType || item?.failureMessage)
            : sourceItems.slice();
        const { nextItems, setFailure, clearFailure } = createItemMutationHelpers(sourceItems);

        let state = bulkActionCreateRunState({
            isRunning: true,
            total: targetItems.length
        });
        const emitState = (overrides = {}) => {
            state = {
                ...state,
                ...overrides
            };
            onStateChange({ ...state });
            return state;
        };
        const emitProgress = (resultKey) => emitState({
            processed: state.processed + 1,
            [resultKey]: state[resultKey] + 1
        });

        emitState();

        if (!targetItems.length) {
            emitState({ isRunning: false, completionMessage: 'No items selected.' });
            return { items: nextItems, state, successIds: [], failedIds: [] };
        }

        targetItems.forEach((item) => clearFailure(item?.recordId));

        if (typeof action.handlerBatch === 'function') {
            const recordIds = targetItems.map((item) => item?.recordId).filter(Boolean);
            try {
                await action.handlerBatch({
                    items: cloneForHandler(targetItems),
                    recordIds,
                    action,
                    context
                });
                emitState({
                    isRunning: false,
                    processed: targetItems.length,
                    success: targetItems.length,
                    completionMessage: `Completed ${targetItems.length} item(s).`
                });
                return { items: nextItems, state, successIds: recordIds, failedIds: [] };
            } catch (error) {
                recordIds.forEach((recordId) => setFailure(recordId, error));
                emitState({
                    isRunning: false,
                    processed: targetItems.length,
                    failed: targetItems.length,
                    completionMessage: `Failed ${targetItems.length} item(s).`
                });
                return { items: nextItems, state, successIds: [], failedIds: recordIds };
            }
        }

        const successIds = [];
        const failedIds = [];
        const runOne = async (item, index) => {
            const recordId = knackValueResolver.toStringSafe(item?.recordId);
            if (!recordId) return;

            try {
                await action.handler({
                    item: cloneForHandler(item),
                    recordId,
                    index: index + 1,
                    total: targetItems.length,
                    action,
                    context
                });
                clearFailure(recordId);
                successIds.push(recordId);
                emitProgress('success');
            } catch (error) {
                setFailure(recordId, error);
                failedIds.push(recordId);
                emitProgress('failed');
            }
        };

        if (concurrency === 'serial') {
            for (let index = 0; index < targetItems.length; index += 1) {
                await runOne(targetItems[index], index);
            }
        } else {
            await Promise.all(targetItems.map((item, index) => runOne(item, index)));
        }

        emitState({
            isRunning: false,
            completionMessage: failedIds.length
                ? `Completed ${successIds.length} item(s); ${failedIds.length} failed.`
                : `Completed ${successIds.length} item(s).`
        });

        return {
            items: nextItems,
            state,
            successIds,
            failedIds
        };
    }

    return {
        run,
        resolveAction
    };
}

const bulkActionControllerStore = new Map();
const bulkActionWorkflowRegistry = new Set();
let bulkActionControllerLifecycleBound = false;

/**
 * Removes UI for controllers whose view is no longer present in the DOM.
 * @returns {void}
 */
function bulkActionSyncControllerVisibility() {
    bulkActionControllerStore.forEach((controller, viewId) => {
        if (!controller || controller.viewId !== viewId) {
            bulkActionControllerStore.delete(viewId);
            return;
        }

        if (!controller.resolveViewElement()) {
            controller.basketModal?.close?.();
            controller.removeExistingUi?.();
            bulkActionControllerStore.delete(viewId);
        }
    });
}

/**
 * Binds a single lifecycle listener that keeps controller UI in sync with Knack renders.
 * @returns {void}
 */
function ensureBulkActionControllerLifecycleBinding() {
    if (bulkActionControllerLifecycleBound || typeof window.jQuery !== 'function') return;

    bulkActionControllerLifecycleBound = true;
    window.jQuery(document).on('knack-view-render.any knack-scene-render', function () {
        window.setTimeout(() => {
            bulkActionSyncControllerVisibility();
        }, 0);
    });
}

/**
 * Normalises a DOM, jQuery, or array-like element reference into a single element.
 * @param {*} value - Candidate element reference.
 * @returns {Element|null} Resolved element.
 */
function bulkActionResolveElement(value) {
    if (!value) return null;
    if (value instanceof Element) return value;
    if (value?.jquery && value[0] instanceof Element) return value[0];
    if (Array.isArray(value) && value[0] instanceof Element) return value[0];
    return null;
}

/**
 * Finds the root element for a Knack view.
 * @param {string} viewId - View id or key.
 * @returns {Element|null} View root element when present.
 */
function bulkActionFindViewRoot(viewId) {
    const normalizedViewId = knackNavigator.normalizeViewId(viewId);
    if (!normalizedViewId) return null;
    return getViewRootElement(viewId);
}

/**
 * Returns the record id stored on a bulk-action row checkbox.
 * @param {HTMLInputElement|Element|null} checkbox - Row checkbox element.
 * @returns {string} Normalized record id.
 */
function bulkActionGetRowCheckboxRecordId(checkbox) {
    const normalizedCheckbox = checkbox instanceof Element ? checkbox : null;
    if (!normalizedCheckbox) return '';

    const recordId = knackValueResolver.toStringSafe(
        normalizedCheckbox.dataset?.recordId
        || normalizedCheckbox.closest('tr')?.id
        || normalizedCheckbox.closest('[data-record-id]')?.getAttribute('data-record-id')
    );

    if (recordId && !normalizedCheckbox.dataset?.recordId) {
        normalizedCheckbox.dataset.recordId = recordId;
    }

    return recordId;
}

/**
 * Returns true when a grid row represents a selectable Knack record row.
 * @param {Element|null} row - Candidate table row.
 * @returns {boolean} Whether the row can participate in bulk-action selection.
 */
function bulkActionIsSelectableGridDataRow(row) {
    if (!(row instanceof HTMLTableRowElement)) return false;

    const classNames = Array.from(row.classList || []);
    if (row.classList.contains('kn-tr-nodata')) return false;
    if (row.classList.contains('kn-table-group')) return false;
    if (row.classList.contains('kn-table-summary')) return false;
    if (classNames.some((className) => /summary|subtotal|total|aggregate/i.test(className))) return false;
    if (row.querySelector('.kn-table-summary')) return false;

    return true;
}

/**
 * Returns selectable bulk-action row checkboxes for a view element.
 * @param {Element|null} viewElement - View root element.
 * @param {string} rowCheckboxClass - Row checkbox class name.
 * @returns {Array<HTMLInputElement>} Selectable row checkboxes.
 */
function bulkActionGetSelectableRowCheckboxes(viewElement, rowCheckboxClass) {
    const normalizedClass = knackValueResolver.toStringSafe(rowCheckboxClass);
    if (!viewElement || !normalizedClass) return [];

    return Array.from(viewElement.querySelectorAll(`tbody .${normalizedClass}`)).filter((checkbox) => {
        return checkbox instanceof HTMLInputElement && bulkActionIsSelectableGridDataRow(checkbox.closest('tr'));
    });
}

/**
 * Removes bulk-action checkboxes from non-record grid rows such as summaries.
 * @param {Element|null} viewElement - View root element.
 * @param {string} rowCheckboxClass - Row checkbox class name.
 * @returns {void}
 */
function bulkActionRemoveNonSelectableRowCheckboxes(viewElement, rowCheckboxClass) {
    const normalizedClass = knackValueResolver.toStringSafe(rowCheckboxClass);
    if (!viewElement || !normalizedClass) return;

    Array.from(viewElement.querySelectorAll(`tbody .${normalizedClass}`)).forEach((checkbox) => {
        if (!(checkbox instanceof HTMLInputElement)) return;
        if (bulkActionIsSelectableGridDataRow(checkbox.closest('tr'))) return;
        checkbox.remove();
    });
}

/**
 * Builds the session-storage key for a form replication workflow.
 * @param {string} namespace - Bulk-action namespace.
 * @param {string} formViewId - Target form view id.
 * @returns {string} Session key.
 */
function bulkActionBuildFormFlowSessionKey(namespace, formViewId) {
    return [
        knackValueResolver.toStringSafe(namespace || 'KNACK_BULK'),
        'FORM_FLOW',
        knackNavigator.normalizeViewId(formViewId) || 'unknown'
    ].filter(Boolean).join('_');
}

/**
 * Reads persisted form-flow state for an in-progress bulk form action.
 * @param {string} sessionKey - Form-flow session key.
 * @returns {Object|null} Parsed state, or null when unavailable.
 */
function bulkActionReadFormFlowState(sessionKey) {
    const normalizedKey = knackValueResolver.toStringSafe(sessionKey);
    if (!normalizedKey) return null;

    const adapter = createBulkActionSessionStorageAdapter();

    try {
        const raw = adapter.get(normalizedKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
        return null;
    }
}

/**
 * Persists form-flow state to session storage.
 * @param {string} sessionKey - Form-flow session key.
 * @param {Object|null} state - State to write.
 * @returns {boolean} True when the write succeeds.
 */
function bulkActionWriteFormFlowState(sessionKey, state) {
    const normalizedKey = knackValueResolver.toStringSafe(sessionKey);
    if (!normalizedKey) return;

    const adapter = createBulkActionSessionStorageAdapter();

    adapter.set(normalizedKey, JSON.stringify(state || {}));
}

/**
 * Merges a partial state patch into the latest form-flow state.
 * @param {string} sessionKey - Form-flow session key.
 * @param {Object} [statePatch={}] - Partial state to merge.
 * @param {Object|null} [fallbackState=null] - Optional already-read state.
 * @returns {Object|null} Merged state, or null when no base state exists.
 */
function bulkActionMergeFormFlowState(sessionKey, statePatch = {}, fallbackState = null) {
    // Callers that already have a fresh state object can pass it in to avoid rereading session storage during the same workflow step.
    const baseState = fallbackState && typeof fallbackState === 'object'
        ? fallbackState
        : bulkActionReadFormFlowState(sessionKey);
    if (!baseState) return null;

    const nextState = {
        ...baseState,
        ...(statePatch && typeof statePatch === 'object' ? statePatch : {})
    };

    bulkActionWriteFormFlowState(sessionKey, nextState);
    return nextState;
}

/**
 * Clears persisted form-flow state.
 * @param {string} sessionKey - Form-flow session key.
 * @returns {boolean} True when the state is cleared.
 */
function bulkActionClearFormFlowState(sessionKey) {
    const normalizedKey = knackValueResolver.toStringSafe(sessionKey);
    if (!normalizedKey) return;

    const adapter = createBulkActionSessionStorageAdapter();

    adapter.remove(normalizedKey);
}

/**
 * Resets pending form replication state and restores the source controller UI.
 * @param {string} sessionKey - Form-flow session key.
 * @returns {boolean} True when there was state to clear.
 */
function bulkActionResetPendingFormFlow(sessionKey) {
    const bulkState = bulkActionReadFormFlowState(sessionKey);
    if (!bulkState) return false;

    const sourceViewId = knackNavigator.normalizeViewId(bulkState.sourceViewId);
    const sourceController = sourceViewId ? bulkActionControllerStore.get(sourceViewId) || null : null;

    bulkActionClearFormFlowState(sessionKey);

    if (sourceController && typeof sourceController.resetFormActionState === 'function') {
        sourceController.resetFormActionState();
    }

    return true;
}

/**
 * Determines whether a modal close event applies to the active bulk-action form.
 * @param {Object} [options={}] - Modal close handling options.
 * @returns {boolean} True when the close event was handled.
 */
function handleModalClosed({ activeViewId = '', closedViewId = '', callback = null, context = null } = {}) {
    const normalizedActiveViewId = knackNavigator.normalizeViewId(activeViewId);
    const normalizedClosedViewId = knackNavigator.normalizeViewId(closedViewId);
    if (normalizedClosedViewId && normalizedActiveViewId && normalizedClosedViewId !== normalizedActiveViewId) {
        return false;
    }

    if (typeof callback === 'function') {
        callback({
            activeViewId: normalizedActiveViewId,
            closedViewId: normalizedClosedViewId,
            context
        });
    }

    return true;
}

/**
 * Closes the active Knack modal when one is open and waits briefly for the close lifecycle to finish.
 * @returns {Promise<boolean>} True when a modal close was attempted.
 */
function bulkActionCloseModalIfOpen() {
    const modalElement = document.querySelector('.kn-modal');
    const closeButton = document.querySelector('button.close-modal, .close-modal');
    const modalActive = Boolean(modalElement || closeButton || knackNavigator.isModalActive());
    if (!modalActive) return Promise.resolve(false);

    return new Promise((resolve) => {
        let settled = false;
        const eventNamespace = '.knackBulkActionsClose';

        const finish = (closed) => {
            if (settled) return;
            settled = true;
            if (typeof window.jQuery === 'function') {
                window.jQuery(document).off(`knack-modal-close${eventNamespace}`);
            }
            resolve(closed);
        };

        if (typeof window.jQuery === 'function') {
            window.jQuery(document).one(`knack-modal-close${eventNamespace}`, function () {
                window.setTimeout(() => finish(true), 0);
            });
        }

        window.setTimeout(() => finish(false), 400);

        try {
            if (typeof Knack?.closeModal === 'function') {
                Knack.closeModal();
                return;
            }

            if (closeButton && typeof closeButton.click === 'function') {
                closeButton.click();
                return;
            }
        } catch (_) {}

        finish(false);
    });
}

/**
 * Reads a query-string parameter from the current location hash.
 * @param {string} name - Query-string parameter name.
 * @returns {string} Parameter value, or an empty string.
 */
function bulkActionGetHashQueryParam(name) {
    const key = knackValueResolver.toStringSafe(name);
    if (!key) return '';

    const hash = knackValueResolver.toStringSafe(window.location.hash);
    const query = hash.includes('?') ? knackValueResolver.toStringSafe(hash.split('?').slice(1).join('?')) : '';
    if (!query) return '';

    const params = new URLSearchParams(query);
    return knackValueResolver.toStringSafe(params.get(key));
}

/**
 * Captures the current location hash path and query before modal navigation mutates it.
 * @returns {{path: string, query: string}} Current hash state.
 */
function bulkActionGetCurrentHashState() {
    const currentHash = knackValueResolver.toStringSafe(window.location.hash);
    const path = knackValueResolver.toStringSafe(currentHash.split('?')[0]) || '#';
    const query = currentHash.includes('?') ? knackValueResolver.toStringSafe(currentHash.split('?').slice(1).join('?')) : '';
    return { path, query };
}

/**
 * Restores a previously captured scene hash/query without forcing a full scene rerender.
 * @param {Object} [options={}] - Hash restore options.
 * @returns {boolean} True when a target hash was available.
 */
function bulkActionRestoreHashState({ path = '', query = '' } = {}) {
    const normalizedPath = knackValueResolver.toStringSafe(path).replace(/^#?/, '#');
    if (!normalizedPath || normalizedPath === '#') return false;

    const normalizedQuery = knackValueResolver.toStringSafe(query).replace(/^\?/, '');
    const targetHash = `${normalizedPath}${normalizedQuery ? `?${normalizedQuery}` : ''}`;

    if (window.location.hash === targetHash) return true;

    const routerTarget = targetHash.startsWith('#') ? targetHash.slice(1) : targetHash;
    if (knackNavigator.navigateToHash(routerTarget, { syncVars: true })) return true;

    window.location.hash = targetHash;
    return true;
}

/**
 * Generates a navigation token used to bind a form route to a basket workflow.
 * @returns {string} Opaque token.
 */
function bulkActionMakeToken() {
    try {
        const bytes = new Uint8Array(12);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch (_) {
        return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    }
}

/**
 * Builds a Knack scene hash with an optional record id and query-string params.
 * @param {string} sceneSlug - Target scene slug.
 * @param {Object} [options={}] - Optional record id and params.
 * @returns {string} Hash fragment.
 */
function bulkActionBuildHash(sceneSlug, { recordId = '', params = {} } = {}) {
    const slug = knackValueResolver.toStringSafe(sceneSlug).replace(/^#/, '');
    if (!slug) return '';

    const normalizedRecordId = knackValueResolver.toStringSafe(recordId);
    const currentHash = knackValueResolver.toStringSafe(window.location.hash);
    const currentPath = knackValueResolver.toStringSafe(currentHash.split('?')[0]).replace(/^#/, '').replace(/\/+$/, '');
    const currentQuery = currentHash.includes('?') ? knackValueResolver.toStringSafe(currentHash.split('?').slice(1).join('?')) : '';
    const queryParams = new URLSearchParams(currentQuery);
    const targetPath = [currentPath, slug, normalizedRecordId].filter(Boolean).join('/');

    Object.entries(params && typeof params === 'object' ? params : {}).forEach(([key, value]) => {
        const paramKey = knackValueResolver.toStringSafe(key);
        const paramValue = knackValueResolver.toStringSafe(value);
        if (!paramKey || !paramValue) return;
        queryParams.set(paramKey, paramValue);
    });

    const query = String(queryParams.toString() || '').trim();
    return `#${targetPath}${query ? `?${query}` : ''}`;
}

/**
 * Navigates the browser to a target scene hash when it differs from the current one.
 * @param {string} sceneSlug - Target scene slug.
 * @param {Object} [options={}] - Optional record id and params.
 * @returns {void}
 */
function bulkActionNavigateToSceneSlug(sceneSlug, { recordId = '', params = {} } = {}) {
    const targetHash = bulkActionBuildHash(sceneSlug, { recordId, params });
    if (!targetHash) return;

    const routerTarget = targetHash.startsWith('#') ? targetHash.slice(1) : targetHash;

    if (knackNavigator.navigateToHash(routerTarget, { trigger: true })) return;

    if (window.location.hash === targetHash) return;

    window.location.hash = targetHash;
}

/**
 * Sets a chosen-style select value, retrying while the widget initialises asynchronously.
 * @param {Object} [options={}] - Target view, field, and selected value details.
 * @returns {void}
 */
function bulkActionSetChosenSelectValue({ viewId, fieldKey, value, label = '', updateEvent = 'liszt:updated' } = {}) {
    const normalizedViewId = knackNavigator.normalizeViewId(viewId);
    const normalizedFieldKey = knackNavigator.normalizeFieldId(fieldKey);
    const normalizedValue = knackValueResolver.toStringSafe(value);
    if (!normalizedViewId || !normalizedFieldKey || !normalizedValue || typeof window.jQuery !== 'function') return;

    const optionLabel = knackValueResolver.toStringSafe(label) || normalizedValue;
    const selectors = [
        `#${normalizedViewId}-${normalizedFieldKey}`,
        `#${normalizedViewId} #kn-input-${normalizedFieldKey} select`,
        `#${normalizedViewId} #kn-input-${normalizedFieldKey} input[type="hidden"]`
    ];

    const findSelect = () => {
        for (const selector of selectors) {
            const found = window.jQuery(selector);
            if (found && found.length) return found;
        }
        return null;
    };

    const maxAttempts = 6;
    const baseDelayMs = 60;

    function applyValue(attempt = 1) {
        const select = findSelect();
        if (!select || !select.length) return;

        const previousValue = knackValueResolver.toStringSafe(select.val());
        if (select.find(`option[value="${normalizedValue}"]`).length === 0) {
            select.append(new Option(optionLabel, normalizedValue));
        }

        select.find(`option[value="${normalizedValue}"]`).prop('selected', true);
        select.val(normalizedValue);
        if (updateEvent) select.trigger(updateEvent);
        select.trigger('liszt:updated');

        const nextValue = knackValueResolver.toStringSafe(select.val());
        if (previousValue !== nextValue) {
            select.trigger('change');
        }

        // Chosen-enhanced inputs can rebuild after render, so retry a few times with a backoff until the hidden select keeps the requested value.
        if (nextValue === normalizedValue || attempt >= maxAttempts) return;
        window.setTimeout(() => applyValue(attempt + 1), baseDelayMs * attempt);
    }

    window.setTimeout(() => applyValue(1), 0);
}

/**
 * Renders or updates the explanatory notice shown on replicated forms.
 * @param {Object} [options={}] - Form notice options.
 * @returns {void}
 */
function bulkActionRenderFormNotice({ viewElement, bulkState, messages = {}, noticeClass = '' } = {}) {
    if (!(viewElement instanceof Element) || !bulkState) return;

    const form = viewElement.querySelector('form');
    if (!form) return;

    const recordIds = Array.isArray(bulkState.recordIds) ? bulkState.recordIds.filter(Boolean) : [];
    const total = recordIds.length;
    if (!total) return;

    const mode = String(bulkState.formMode || 'create').toLowerCase() === 'update' ? 'update' : 'create';
    const actionWord = mode === 'update' ? 'save' : 'submit';
    const additionalCount = Math.max(0, total - 1);
    const prefix = knackValueResolver.toStringSafe(messages.noticePrefix || 'Basket mode:') || 'Basket mode:';
    const singleMessage = knackValueResolver.toStringSafe(messages.noticeSingle || 'This submission applies to the selected basket item only.') || 'This submission applies to the selected basket item only.';
    const pluralMessage = typeof messages.noticePlural === 'function'
        ? messages.noticePlural(additionalCount, actionWord)
        : `When you ${actionWord} this form, the same values will be copied to the ${total} basket item${total === 1 ? '' : 's'}.`;

    let notice = form.querySelector('[data-knack-bulk-form-notice="1"]');
    if (!notice) {
        notice = document.createElement('div');
        notice.dataset.knackBulkFormNotice = '1';
        notice.className = ['knackBulkActionFormNotice', knackValueResolver.toStringSafe(noticeClass)].filter(Boolean).join(' ');
        form.insertAdjacentElement('afterbegin', notice);
    }

    notice.innerHTML = `<strong>${prefix}</strong> ${additionalCount > 0 ? pluralMessage : singleMessage}`;
}

/**
 * Resolves the DOM element, metadata object, and id for a view reference.
 * @param {*} viewRef - View id, key, element, or view object.
 * @returns {{viewElement: Element|null, viewId: string}} View context.
 */
function bulkActionResolveViewContext(viewRef) {
    const viewElement = bulkActionResolveElement(viewRef);
    const viewId = viewElement instanceof Element
        ? knackNavigator.normalizeViewId(viewElement.id)
        : knackNavigator.normalizeViewId(
            typeof viewRef === 'string' || typeof viewRef === 'number'
                ? viewRef
                : viewRef?.key
        );

    return {
        viewElement: viewElement || bulkActionFindViewRoot(viewId),
        viewId
    };
}

/**
 * Resolves a view content host and ensures a mount element exists inside it.
 * @param {*} viewRef - View id, key, element, or view object.
 * @param {Object} [options={}] - Mount resolution options.
 * @param {string} [options.contentHostSelector=''] - Optional selector used to scope where the mount lives.
 * @param {string} [options.mountSelector=''] - Selector for an existing mount element.
 * @param {string} [options.mountClassName=''] - Class name applied when creating the mount element.
 * @param {string} [options.mountTagName='div'] - Tag name used when creating the mount element.
 * @param {boolean} [options.clearContent=true] - Whether to clear the host before creating the mount element.
 * @returns {HTMLElement|null} Mount element.
 */
function getViewMountElement(viewRef, {
    contentHostSelector = '',
    mountSelector = '',
    mountClassName = '',
    mountTagName = 'div',
    clearContent = true
} = {}) {
    const { viewElement } = bulkActionResolveViewContext(viewRef);
    if (!(viewElement instanceof Element)) return null;

    const normalizedHostSelector = knackValueResolver.toStringSafe(contentHostSelector);
    const normalizedMountSelector = knackValueResolver.toStringSafe(mountSelector);
    const normalizedMountClassName = knackValueResolver.toStringSafe(mountClassName).trim();
    const normalizedMountTagName = knackValueResolver.toStringSafe(mountTagName).trim().toLowerCase() || 'div';
    const contentHost = normalizedHostSelector ? viewElement.querySelector(normalizedHostSelector) || viewElement : viewElement;

    let mountElement = normalizedMountSelector ? contentHost.querySelector(normalizedMountSelector) : null;
    if (mountElement instanceof HTMLElement) {
        return mountElement;
    }

    if (clearContent) {
        contentHost.innerHTML = '';
    }

    mountElement = document.createElement(normalizedMountTagName);

    if (normalizedMountClassName) {
        mountElement.className = normalizedMountClassName;
    }

    contentHost.appendChild(mountElement);
    return mountElement;
}

/**
 * Normalises and deduplicates field ids used by form replication helpers.
 * @param {Array<string|number>} [fieldKeys=[]] - Field ids or field keys.
 * @returns {Array<string>} Normalised field ids.
 */
function bulkActionNormalizeFieldKeys(fieldKeys = []) {
    return Array.from(new Set(
        (Array.isArray(fieldKeys) ? fieldKeys : [])
            .map((fieldKey) => knackNavigator.normalizeFieldId(fieldKey))
            .filter(Boolean)
    ));
}

/**
 * Returns true when the value is a plain object.
 * @param {*} value - Value to inspect.
 * @returns {boolean} True for plain objects.
 */
function bulkActionIsPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Returns the provided value when it is a plain object, otherwise an empty object.
 * @param {*} value - Value to normalise.
 * @returns {Object} Plain object or empty object.
 */
function bulkActionObjectOrEmpty(value) {
    return bulkActionIsPlainObject(value) ? value : {};
}

/**
 * Creates the initial run-state object used by basket progress UI.
 * @param {Object} [overrides={}] - Optional state overrides.
 * @returns {Object} Run-state object.
 */
function bulkActionCreateRunState(overrides = {}) {
    return {
        isRunning: false,
        processed: 0,
        total: 0,
        success: 0,
        failed: 0,
        completionMessage: '',
        ...bulkActionObjectOrEmpty(overrides)
    };
}

/**
 * Converts run-state counters into display-ready modal progress text.
 * @param {Object} [runState={}] - Current run-state counters.
 * @returns {{visible: boolean, title: string, detail: string, meta: string, percent: number, stateClass: string}} Progress summary.
 */
function bulkActionSummarizeRunState(runState = {}) {
    const total = Math.max(0, Number(runState?.total || 0));
    const processed = Math.max(0, total > 0
        ? Math.min(total, Number(runState?.processed || 0))
        : Number(runState?.processed || 0));
    const success = Math.max(0, Number(runState?.success || 0));
    const failed = Math.max(0, Number(runState?.failed || 0));
    const remaining = Math.max(0, total - processed);
    const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((processed / total) * 100))) : 0;
    const completionMessage = knackValueResolver.toStringSafe(runState?.completionMessage);
    const isRunning = Boolean(runState?.isRunning);

    if (isRunning) {
        const title = processed === 0
            ? (completionMessage || 'Preparing bulk action...')
            : `${remaining} remaining`;
        const detail = total > 0
            ? `Processed ${processed} of ${total}`
            : completionMessage;
        const metaParts = [];
        if (success > 0) metaParts.push(`${success} succeeded`);
        if (failed > 0) metaParts.push(`${failed} failed`);
        if (!metaParts.length && total > 0) metaParts.push(`${total} queued`);

        return {
            visible: Boolean(total || completionMessage),
            title,
            detail,
            meta: metaParts.join(' • '),
            percent,
            stateClass: 'is-running'
        };
    }

    if (completionMessage || total || success || failed) {
        const title = failed > 0
            ? `${failed} failed`
            : (success > 0 || total > 0 ? 'Completed' : completionMessage || 'Ready');
        const detail = completionMessage || (total > 0 ? `Processed ${processed} of ${total}` : '');
        const metaParts = [];
        if (success > 0) metaParts.push(`${success} succeeded`);
        if (failed > 0) metaParts.push(`${failed} failed`);
        if (!metaParts.length && total > 0) metaParts.push(`${processed} processed`);

        return {
            visible: Boolean(detail || metaParts.length),
            title,
            detail,
            meta: metaParts.join(' • '),
            percent: total > 0 ? 100 : percent,
            stateClass: failed > 0 ? 'is-complete has-failures' : 'is-complete'
        };
    }

    return {
        visible: false,
        title: '',
        detail: '',
        meta: '',
        percent: 0,
        stateClass: ''
    };
}

/**
 * Returns true when the API exposes the batch write method needed for the mode.
 * @param {Object} [api={}] - API client.
 * @param {string} [mode='update'] - Replication mode.
 * @returns {boolean} Whether batch writes are supported.
 */
function bulkActionHasBatchWriteApi(api = {}, mode = 'update') {
    return mode === 'update'
        ? typeof api?.updateRecords === 'function'
        : typeof api?.createRecords === 'function';
}

/**
 * Resolves the API client used for bulk form replication.
 * @param {Object} [api={}] - Preferred API overrides.
 * @returns {Object} API client with single-record and batch write methods.
 */
function bulkActionResolveReplicationApi(api = {}) {
    const sharedApiClient = getKnackApiClient();
    const providedApi = api && typeof api === 'object' ? api : {};
    const batchSource = (typeof providedApi.updateRecords === 'function' || typeof providedApi.createRecords === 'function')
        ? providedApi
        : sharedApiClient;

    const bindPreferred = (methodName, preferredSource, fallbackSource = null) => {
        if (preferredSource && typeof preferredSource[methodName] === 'function') {
            return preferredSource[methodName].bind(preferredSource);
        }
        if (fallbackSource && typeof fallbackSource[methodName] === 'function') {
            return fallbackSource[methodName].bind(fallbackSource);
        }
        return undefined;
    };

    return {
        createRecord: bindPreferred('createRecord', providedApi, sharedApiClient),
        updateRecord: bindPreferred('updateRecord', providedApi, sharedApiClient),
        refreshView: bindPreferred('refreshView', providedApi, sharedApiClient),
        createRecords: bindPreferred('createRecords', batchSource, sharedApiClient),
        updateRecords: bindPreferred('updateRecords', batchSource, sharedApiClient),
        _writeQueue: batchSource?._writeQueue || sharedApiClient?._writeQueue,
        options: batchSource?.options || sharedApiClient?.options || {},
        _source: batchSource === providedApi ? 'provided-api' : 'shared-knack-api'
    };
}

/**
 * Prepares per-record replication payloads before writes begin.
 * @param {Object} [options={}] - Replication preparation options.
 * @returns {Promise<{preparedOperations: Array<Object>, failedIds: Array<string>}>} Prepared operations and preparation failures.
 */
async function bulkActionPrepareReplicateOperations({ mode = 'create', remainingIds = [], basePayload = {}, action, sourceController = null, processedRecordId = '', sourceViewId = '', record = null, recordFieldId = '', options = {} } = {}) {
    const preparedOperations = [];
    const failedIds = [];

    for (let index = 0; index < remainingIds.length; index += 1) {
        const targetId = knackValueResolver.toStringSafe(remainingIds[index]);
        if (!targetId) continue;

        try {
            const payload = { ...basePayload };
            const sourceRecord = sourceController?.recordById?.get?.(targetId) || null;

            if (typeof action?.dataCallback === 'function') {
                const additions = await action.dataCallback({ ...payload }, {
                    mode,
                    sourceViewId,
                    sourceRecord,
                    processedId: processedRecordId,
                    targetId,
                    index: index + 1,
                    total: remainingIds.length,
                    record
                });

                // Callback-provided values intentionally override the base payload so app code can tailor each replicated record.
                if (bulkActionIsPlainObject(additions)) {
                    Object.assign(payload, additions);
                }
            }

            if (mode === 'update') {
                preparedOperations.push({ id: targetId, data: payload });
            } else {
                preparedOperations.push({
                    id: targetId,
                    data: {
                        ...payload,
                        [recordFieldId]: targetId
                    }
                });
            }
        } catch (error) {
            failedIds.push(targetId);
            sourceController?.setBasketItemFailure(targetId, error);
            bulkActionReportError(error, { sourceViewId, targetViewId: knackNavigator.normalizeViewId(action?.target), targetId, mode }, 'Bulk form replicate failed', options);
        }
    }

    return { preparedOperations, failedIds };
}

/**
 * Invokes a bulk-action success callback without interrupting the main flow when the callback fails.
 * @param {Function|null} callback
 * @param {Object} [context={}]
 * @param {Object} [meta={}]
 * @param {Object} [options={}]
 * @returns {Promise<void>}
 */
async function bulkActionInvokeSuccessCallback(callback, context = {}, meta = {}, options = {}) {
    if (typeof callback !== 'function') return;

    try {
        await callback(context);
    } catch (error) {
        bulkActionReportError(error, meta, 'Bulk action success callback failed', options);
    }
}

/**
 * Falls back to sequential single-record writes when batch APIs are unavailable.
 * @param {Object} [options={}] - Fallback replication options.
 * @returns {Promise<Array<string>>} Failed record ids.
 */
async function bulkActionReplicateFallback({ mode = 'create', operations = [], api = {}, sceneId = '', apiViewId = '', sourceStore, sourceController = null, sourceViewId = '', options = {} } = {}) {
    const failedIds = [];

    for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        const targetId = knackValueResolver.toStringSafe(operation?.id);
        if (!targetId) continue;
        let didFail = false;
        let result = null;

        try {
            if (mode === 'update') {
                result = await api.updateRecord(sceneId, apiViewId, targetId, operation.data);
            } else {
                result = await api.createRecord(sceneId, apiViewId, operation.data);
                const createdRecordId = knackValueResolver.toStringSafe(result?.record?.id || result?.id);
                if (!createdRecordId) {
                    throw new Error(`Create response did not include a record id for ${targetId}.`);
                }
            }

            sourceStore?.removeItems?.([targetId]);

            void bulkActionInvokeSuccessCallback(options?.successCallback, {
                stage: 'replicated',
                mode,
                targetId,
                sourceViewId,
                targetViewId: apiViewId,
                sceneId,
                record: result?.record || result || null,
                requestData: operation?.data,
                progress: null
            }, {
                sourceViewId,
                targetViewId: apiViewId,
                targetId,
                mode,
                stage: 'replicated'
            }, options);
        } catch (error) {
            didFail = true;
            failedIds.push(targetId);
            sourceController?.setBasketItemFailure(targetId, error);
            bulkActionReportError(error, { sourceViewId, targetViewId: apiViewId, targetId, mode }, 'Bulk form replicate failed', options);
        } finally {
            if (!sourceController) continue;

            sourceController.patchRunState({
                processed: Math.min(Number(sourceController.runState.total || 0), Number(sourceController.runState.processed || 0) + 1),
                success: Math.max(0, Number(sourceController.runState.success || 0) + (didFail ? 0 : 1)),
                failed: Number(sourceController.runState.failed || 0) + (didFail ? 1 : 0)
            });
        }
    }

    return failedIds;
}

/**
 * Resolves writable field ids from the rendered form's group inputs.
 * @param {Object} view - Form view supplied by Knack's render event.
 * @returns {Array<string>} Form field ids.
 */
function bulkActionGetFormFieldKeys(view) {
    if (!bulkActionIsPlainObject(view)) return [];

    const inputs = (Array.isArray(view.groups) ? view.groups : []).flatMap((group) => {
        return (Array.isArray(group?.columns) ? group.columns : []).flatMap((column) => {
            return Array.isArray(column?.inputs) ? column.inputs : [];
        });
    });

    return bulkActionNormalizeFieldKeys(
        inputs
            .filter((input) => bulkActionIsPlainObject(input))
            .filter((input) => input.read_only !== true && input.editable !== false)
            .filter((input) => !knackValueResolver.isReadOnlyFieldType(knackValueResolver.getFieldType(input.id)))
            .map((input) => input.id)
    );
}

/**
 * Returns the empty request value that matches the rendered field value shape.
 * @param {*} renderedValue - Request value resolved from the rendered record.
 * @param {string} [fieldType=''] - Knack field type.
 * @returns {string|boolean|Array<string>} Empty request value.
 */
function bulkActionGetEmptyRequestValue(renderedValue, fieldType = '') {
    const normalizedFieldType = String(fieldType || '').trim().toLowerCase();

    if (normalizedFieldType === 'boolean') return false;
    return Array.isArray(renderedValue) ? [] : '';
}

/**
 * Captures the record data supplied with a form render event.
 * @param {Object} renderData - Render event record data.
 * @returns {Object|null} Rendered record snapshot.
 */
function bulkActionGetRenderedFormRecord(renderData) {
    if (!renderData || typeof renderData !== 'object' || Array.isArray(renderData)) return null;
    if (!renderData.id && !Object.keys(renderData).some((key) => /^field_\d+(_raw)?$/.test(String(key)))) return null;

    return Object.entries(renderData).reduce((snapshot, [key, value]) => {
        if (key === 'id' || /^field_\d+(_raw)?$/.test(String(key))) {
            snapshot[key] = value;
        }
        return snapshot;
    }, {});
}

/**
 * Builds an update payload from the knack-form-submit record for the visible form fields.
 * Missing submitted values are treated as clears only when the rendered record had a value.
 * @param {Object} [options={}] - Payload options.
 * @returns {Object} Request payload built from the submit event record.
 */
function bulkActionBuildSubmitEventRecordPayload({ record = null, renderRecord = null, includeFieldKeys = [] } = {}) {
    const normalizedFieldKeys = bulkActionNormalizeFieldKeys(includeFieldKeys);
    if (!record || typeof record !== 'object' || !normalizedFieldKeys.length) return {};

    return normalizedFieldKeys.reduce((payload, fieldKey) => {
        const fieldType = knackValueResolver.getFieldType(fieldKey);
        const requestValue = knackValueResolver.resolve(record, fieldKey, { mode: 'request', fallback: undefined });

        if (requestValue !== undefined) {
            payload[fieldKey] = requestValue;
            return payload;
        }

        const renderedValue = knackValueResolver.resolve(renderRecord, fieldKey, { mode: 'request', fallback: undefined });
        if (renderedValue === undefined) return payload;

        payload[fieldKey] = bulkActionGetEmptyRequestValue(renderedValue, fieldType);

        return payload;
    }, {});
}

/**
 * Builds a dynamic payload from a record while excluding selected fields.
 * @param {Object} record - Source record.
 * @param {Object} [options={}] - Include and exclude field options.
 * @returns {Object} Request payload.
 */
function bulkActionBuildDynamicRequestPayload(record, { excludeFieldKeys = [], includeFieldKeys = [] } = {}) {
    const include = bulkActionNormalizeFieldKeys(includeFieldKeys);
    if (!include.length) return {};

    const payload = knackValueResolver.buildRequestPayload(record, include);
    const exclude = new Set((Array.isArray(excludeFieldKeys) ? excludeFieldKeys : []).map((fieldKey) => knackNavigator.normalizeFieldId(fieldKey)).filter(Boolean));
    exclude.forEach((fieldKey) => delete payload[fieldKey]);
    return payload;
}

/**
 * Builds the base payload used when replicating a submitted form across basket items.
 * @param {Object} [options={}] - Replication payload options.
 * @returns {Object} Base replication payload.
 */
function bulkActionBuildReplicateBasePayload({ record = null, renderRecord = null, includeFieldKeys = [], excludeFieldKeys = [] } = {}) {
    const payload = bulkActionBuildSubmitEventRecordPayload({
        record,
        renderRecord,
        includeFieldKeys
    });
    const exclude = new Set((Array.isArray(excludeFieldKeys) ? excludeFieldKeys : []).map((fieldKey) => knackNavigator.normalizeFieldId(fieldKey)).filter(Boolean));
    exclude.forEach((fieldKey) => delete payload[fieldKey]);
    return payload;
}

/**
 * Resolves the connected record id stored in a connection field.
 * @param {Object} record - Source record.
 * @param {string|number} fieldKey - Connection field id.
 * @returns {string} Connected record id.
 */
function bulkActionResolveConnectionFieldRecordId(record, fieldKey) {
    const normalizedFieldKey = knackNavigator.normalizeFieldId(fieldKey);
    if (!record || !normalizedFieldKey) return '';

    const rawReference = knackValueResolver.toConnectionRef(record?.[`${normalizedFieldKey}_raw`]);
    if (rawReference?.id) return rawReference.id;
    return '';
}

/**
 * Emits a bulk-action notification through a custom handler or the console.
 * @param {string} message - Notification message.
 * @param {string} [type='info'] - Notification severity.
 * @param {Object} [options={}] - Notification options.
 * @returns {void}
 */
function bulkActionNotify(message, type = 'info', options = {}) {
    if (typeof options.notify === 'function') {
        options.notify({ message, type });
        return;
    }

    if (type === 'error') {
        console.error('[KnackBulkActions]', message);
        return;
    }

    if (type === 'warning') {
        console.warn('[KnackBulkActions]', message);
        return;
    }

    console.log('[KnackBulkActions]', message);
}

/**
 * Writes a bulk-action log message to the console.
 * @param {string} message - Log message.
 * @param {*} [data=null] - Optional log payload.
 * @param {string} [level='info'] - Console level.
 * @returns {void}
 */
function bulkActionLog(message, data = null, level = 'info') {
    const prefix = `[KnackBulkActions] ${message}`;

    switch (level) {
        case 'warn':
            console.warn(prefix, data || '');
            break;
        case 'error':
            console.error(prefix, data || '');
            break;
        default:
            console.info(prefix, data || '');
    }
}

/**
 * Reports a bulk-action error through a custom handler or the console.
 * @param {*} error - Error to report.
 * @param {Object} [meta={}] - Additional error metadata.
 * @param {string} [label='Bulk action error'] - Log label.
 * @param {Object} [options={}] - Error reporting options.
 * @returns {void}
 */
function bulkActionReportError(error, meta = {}, label = 'Bulk action error', options = {}) {
    if (typeof options.onError === 'function') {
        options.onError(error, meta, label);
        return;
    }

    console.error(`[KnackBulkActions] ${label}`, { error, ...meta });
}

/**
 * Deep-merges nested style map objects used by bulk-action UI.
 * @param {Object} [base={}] - Base style map.
 * @param {Object} [overrides={}] - Override style map.
 * @returns {Object} Merged style map.
 */
function bulkActionMergeStyleMaps(base = {}, overrides = {}) {
    const next = { ...(base || {}) };

    Object.entries(bulkActionObjectOrEmpty(overrides)).forEach(([key, value]) => {
        if (bulkActionIsPlainObject(value)) {
            next[key] = bulkActionMergeStyleMaps(base?.[key] || {}, value);
            return;
        }

        next[key] = value;
    });

    return next;
}

/**
 * Returns the shared CSS text for the bulk-action UI.
 * @returns {string} CSS text.
 */
function bulkActionGetBaseCssText() {
    return `
:root {
    --knack-bulk-surface: #f6f7f8;
    --knack-bulk-surface-alt: #eef1f3;
    --knack-bulk-border: #d7dde3;
    --knack-bulk-text: #34424c;
    --knack-bulk-text-muted: #5d6974;
    --knack-bulk-primary-border: #365f7f;
    --knack-bulk-primary-top: #5b84a3;
    --knack-bulk-primary-bottom: #456b89;
    --knack-bulk-primary-active-top: #6a93b1;
    --knack-bulk-primary-active-bottom: #507694;
    --knack-bulk-warning: #b45309;
    --knack-bulk-danger: #c0362c;
    --knack-bulk-form-notice: #3f7db6;
    --knack-bulk-form-notice-bg: #f6fbff;
}

.knackBulkActionBar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.knackBulkActionButton {
    border: 1px solid #c5d4e6;
    background: #f8fafc;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
}

.knackBulkActionButton.is-disabled,
.knackBulkActionButton:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.knackBulkActionButton.is-active:not(:disabled) {
    box-shadow: 0 0 0 1px #5f7f98;
}

.knackBulkActionModal {
    display: none;
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: 360px;
    max-width: calc(100vw - 40px);
    max-height: 70vh;
    z-index: 2147483000;
    overflow: hidden;
    flex-direction: column;
    border-radius: 10px;
    background: var(--knack-bulk-surface);
    border: 1px solid var(--knack-bulk-border);
    box-shadow: 0 14px 34px rgba(33, 43, 54, 0.18);
}

.knackBulkActionModalHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--knack-bulk-border);
    background: #e8edf1;
    color: #32414b;
    font-weight: 600;
}

.knackBulkActionModalClose {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: #5a6975;
    font-size: 18px;
}

.knackBulkActionModalBody {
    background: var(--knack-bulk-surface);
    padding: 10px 14px;
    overflow: auto;
    flex: 1 1 auto;
}

.knackBulkActionModalMeta {
    font-size: 12px;
    color: var(--knack-bulk-text-muted);
    margin-bottom: 10px;
}

.knackBulkActionValidation {
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid rgba(180, 83, 9, 0.45);
    background: #fff8e8;
    color: #8a4808;
    font-size: 13px;
    line-height: 1.4;
}

.knackBulkActionModalList {
    display: grid;
    gap: 8px;
}

.knackBulkActionModalFooter {
    padding: 10px 14px;
    border-top: 1px solid var(--knack-bulk-border);
    background: var(--knack-bulk-surface-alt);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.knackBulkActionModalActions {
    display: flex;
    flex-wrap: nowrap;
    flex: 1 1 auto;
    min-width: 0;
    gap: 8px;
}

.knackBulkActionModalProgress {
    flex: 1 0 100%;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: none;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 1px solid rgba(54, 95, 127, 0.18);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.8);
}

.knackBulkActionModalProgress.is-visible {
    display: grid;
    gap: 6px;
}

.knackBulkActionModalProgress.is-running {
    background: linear-gradient(180deg, rgba(246, 251, 255, 0.98) 0%, rgba(235, 243, 249, 0.96) 100%);
    border-color: rgba(63, 125, 182, 0.3);
}

.knackBulkActionModalProgress.has-failures {
    border-color: rgba(180, 83, 9, 0.28);
}

.knackBulkActionModalProgressSummary {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
}

.knackBulkActionModalProgressTitle {
    color: var(--knack-bulk-text);
    flex: 1 1 auto;
    min-width: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.1;
    overflow-wrap: anywhere;
}

.knackBulkActionModalProgressPercent {
    color: var(--knack-bulk-text-muted);
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.knackBulkActionModalProgressDetail,
.knackBulkActionModalProgressMeta {
    color: var(--knack-bulk-text-muted);
    min-width: 0;
    font-size: 12px;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.knackBulkActionModalProgressTrack {
    position: relative;
    overflow: hidden;
    height: 10px;
    border-radius: 999px;
    background: rgba(93, 105, 116, 0.16);
}

.knackBulkActionModalProgressBar {
    height: 100%;
    width: 0%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--knack-bulk-primary-top) 0%, var(--knack-bulk-primary-bottom) 100%);
    transition: width 180ms ease-out;
}

.knackBulkActionModalClear {
    flex: 0 0 auto;
    border: 1px solid #d9dee5;
    background: #ffffff;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
}

.knackBulkActionModalEmpty {
    font-size: 13px;
    color: var(--knack-bulk-text-muted);
}

.knackBulkActionModalItem {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    background: #ffffff;
    border: 1px solid #dde4ea;
    border-radius: 8px;
    padding: 8px 10px;
}

.knackBulkActionModalItemText {
    color: var(--knack-bulk-text);
    font-size: 13px;
    line-height: 1.4;
}

.knackBulkActionModalItemFailure {
    font-size: 11px;
    margin-top: 4px;
    color: var(--knack-bulk-warning);
}

.knackBulkActionModalRemove {
    border: 0;
    background: transparent;
    color: var(--knack-bulk-danger);
    cursor: pointer;
    font-weight: 700;
}

.knackBulkActionModalAction.knackBulkActionButton {
    border: 1px solid var(--knack-bulk-primary-border);
    background: linear-gradient(180deg, var(--knack-bulk-primary-top) 0%, var(--knack-bulk-primary-bottom) 100%);
    box-shadow: 0 2px 6px rgba(42, 63, 80, 0.18);
    color: #ffffff;
    font-weight: 600;
    padding: 6px 14px;
}

.knackBulkActionModalAction.knackBulkActionButton.is-active:not(:disabled) {
    background: linear-gradient(180deg, var(--knack-bulk-primary-active-top) 0%, var(--knack-bulk-primary-active-bottom) 100%);
}

.knackBulkActionFormNotice {
    margin-bottom: 10px;
    padding: 10px 12px;
    border: 1px solid var(--knack-bulk-form-notice);
    border-left: 4px solid var(--knack-bulk-form-notice);
    border-radius: 6px;
    background: var(--knack-bulk-form-notice-bg);
    color: #24527a;
    font-size: 13px;
    line-height: 1.45;
}

@media (max-width: 640px) {
    .knackBulkActionModal {
        right: 12px;
        left: 12px;
        bottom: 12px;
        width: auto;
        max-width: none;
    }
}
`;
}

/**
 * Injects the shared bulk-action stylesheet once per page.
 * @returns {void}
 */
function ensureBulkActionBaseStyles() {
    if (document.getElementById(BULK_ACTION_DEFAULT_CONFIG.constants.styleId)) return;

    const style = document.createElement('style');
    style.id = BULK_ACTION_DEFAULT_CONFIG.constants.styleId;
    style.textContent = bulkActionGetBaseCssText();
    document.head.appendChild(style);
}

/**
 * Builds a stable DOM id for a bulk-action button.
 * @param {string} viewId - Source view id.
 * @param {string} actionKey - Action key.
 * @param {string} [suffix='button'] - Button suffix.
 * @returns {string} DOM id.
 */
function bulkActionBuildButtonId(viewId, actionKey, suffix = 'button') {
    return [
        knackNavigator.normalizeViewId(viewId) || 'view',
        'bulk',
        knackValueResolver.toStringSafe(actionKey || suffix).replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || suffix,
        suffix
    ].join('-');
}

/**
 * Creates a bulk-action button using KTL button rendering.
 * @param {*} container - Target container element.
 * @param {Object} [config={}] - Button configuration.
 * @param {Object} [options={}] - Creation options.
 * @returns {Element|null} Created button element.
 */
function bulkActionCreateButton(container, config = {}, options = {}) {
    const parent = bulkActionResolveElement(container);
    if (!parent) return null;

    if (typeof ktl?.fields?.addButton !== 'function') return null;

    const classes = ['kn-button', 'ktlButtonMargin'];
    if (Array.isArray(config.classes) && config.classes.length) {
        classes.push(...config.classes.filter(Boolean));
    }

    const button = ktl.fields.addButton(
        parent,
        knackValueResolver.toStringSafe(config.label || 'Button') || 'Button',
        knackValueResolver.toStringSafe(config.styleText || ''),
        Array.from(new Set(classes)),
        knackValueResolver.toStringSafe(config.id || '')
    );

    if (button instanceof HTMLElement && options.location === 'modal-action') {
        button.classList.remove('ktlButtonMargin');
    }

    return button instanceof Element ? button : null;
}

/**
 * Modal UI used to display basket contents and progress.
 */
class BulkActionModal {
    /**
     * Creates a new basket modal.
     * @param {Object} [options={}] - Modal options.
     */
    constructor({ viewId, bulkActionConfig } = {}) {
        const config = createBulkActionConfig(bulkActionConfig);
        this.viewId = knackNavigator.normalizeViewId(viewId);
        this.title = config.basket.title;
        this.emptyText = config.basket.emptyText;
        this.modalId = `knack-bulk-basket-${this.viewId}`;
        this.buttonClass = config.action.buttonClass;
        this.modalClass = config.basket.modalClass;
        this.isOpen = false;
        this.onClose = null;
        this.onRemove = null;
        this.onClear = null;
        this.onAction = null;
        this.syncOpenStateFromDom();
    }

    /**
     * Syncs open state from the existing DOM node.
     * @returns {void}
     */
    syncOpenStateFromDom() {
        const modal = document.getElementById(this.modalId);
        if (!modal) {
            this.isOpen = false;
            return;
        }

        this.isOpen = modal.style.display !== 'none';
    }

    /**
     * Ensures the modal DOM exists and returns it.
     * @returns {HTMLElement} Modal element.
     */
    ensureModal() {
        let modal = document.getElementById(this.modalId);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = ['knackBulkActionModal', this.modalClass].filter(Boolean).join(' ');

        const header = document.createElement('div');
        header.className = 'knackBulkActionModalHeader';

        const title = document.createElement('div');
        title.className = 'knackBulkActionModalTitle';
        title.textContent = this.title;

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = 'x';
        closeButton.setAttribute('aria-label', 'Close basket');
        closeButton.className = 'knackBulkActionModalClose';
        closeButton.addEventListener('click', () => {
            this.close();
            if (typeof this.onClose === 'function') this.onClose();
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'knackBulkActionModalBody';
        body.dataset.knackBulkBasketBody = '1';

        const meta = document.createElement('div');
        meta.dataset.knackBulkBasketMeta = '1';
        meta.className = 'knackBulkActionModalMeta';

        const validation = document.createElement('div');
        validation.dataset.knackBulkBasketValidation = '1';
        validation.className = 'knackBulkActionValidation';
        validation.hidden = true;

        const list = document.createElement('div');
        list.dataset.knackBulkBasketList = '1';
        list.className = 'knackBulkActionModalList';

        body.appendChild(meta);
    body.appendChild(validation);
        body.appendChild(list);

        const footer = document.createElement('div');
        footer.className = 'knackBulkActionModalFooter';

        const actions = document.createElement('div');
        actions.dataset.knackBulkBasketActions = '1';
        actions.className = 'knackBulkActionModalActions';

        const progress = document.createElement('div');
        progress.dataset.knackBulkBasketProgress = '1';
        progress.className = 'knackBulkActionModalProgress';

        const progressSummary = document.createElement('div');
        progressSummary.className = 'knackBulkActionModalProgressSummary';

        const progressTitle = document.createElement('div');
        progressTitle.dataset.knackBulkBasketProgressTitle = '1';
        progressTitle.className = 'knackBulkActionModalProgressTitle';

        const progressPercent = document.createElement('div');
        progressPercent.dataset.knackBulkBasketProgressPercent = '1';
        progressPercent.className = 'knackBulkActionModalProgressPercent';

        progressSummary.appendChild(progressTitle);
        progressSummary.appendChild(progressPercent);

        const progressDetail = document.createElement('div');
        progressDetail.dataset.knackBulkBasketProgressDetail = '1';
        progressDetail.className = 'knackBulkActionModalProgressDetail';

        const progressTrack = document.createElement('div');
        progressTrack.className = 'knackBulkActionModalProgressTrack';

        const progressBar = document.createElement('div');
        progressBar.dataset.knackBulkBasketProgressBar = '1';
        progressBar.className = 'knackBulkActionModalProgressBar';
        progressTrack.appendChild(progressBar);

        const progressMeta = document.createElement('div');
        progressMeta.dataset.knackBulkBasketProgressMeta = '1';
        progressMeta.className = 'knackBulkActionModalProgressMeta';

        progress.appendChild(progressSummary);
        progress.appendChild(progressDetail);
        progress.appendChild(progressTrack);
        progress.appendChild(progressMeta);

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.textContent = 'Clear';
        clearButton.className = 'knackBulkActionModalClear';
        clearButton.addEventListener('click', () => {
            if (typeof this.onClear === 'function') this.onClear();
        });

        footer.appendChild(actions);
        footer.appendChild(clearButton);
        footer.appendChild(progress);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        document.body.appendChild(modal);
        return modal;
    }

    /**
     * Renders the basket item list.
     * @param {Object} [options={}] - Render options.
     * @returns {void}
     */
    render({ items = [], validationMessage = '' } = {}) {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;

        const meta = modal.querySelector('[data-knack-bulk-basket-meta="1"]');
        if (meta) {
            meta.textContent = `${items.length} item${items.length === 1 ? '' : 's'} in basket`;
        }

        const validation = modal.querySelector('[data-knack-bulk-basket-validation="1"]');
        if (validation) {
            validation.textContent = knackValueResolver.toStringSafe(validationMessage);
            validation.hidden = !validation.textContent;
        }

        const list = modal.querySelector('[data-knack-bulk-basket-list="1"]');
        if (!list) return;
        list.innerHTML = '';

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'knackBulkActionModalEmpty';
            empty.textContent = this.emptyText;
            list.appendChild(empty);
            return;
        }

        items.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'knackBulkActionModalItem';

            const text = document.createElement('div');
            text.className = 'knackBulkActionModalItemText';
            text.textContent = knackValueResolver.toStringSafe(item?.label || item?.recordId);

            if (item?.failureType || item?.failureMessage) {
                const failure = document.createElement('div');
                failure.className = 'knackBulkActionModalItemFailure';
                failure.textContent = `${item.failureType === 'validation' ? 'Validation' : 'Network'}: ${knackValueResolver.toStringSafe(item.failureMessage) || 'Retry this item.'}`;
                text.appendChild(failure);
            }

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.textContent = 'x';
            removeButton.setAttribute('aria-label', 'Remove item');
            removeButton.className = 'knackBulkActionModalRemove';
            removeButton.addEventListener('click', () => {
                if (typeof this.onRemove === 'function') this.onRemove(item?.recordId);
            });

            row.appendChild(text);
            row.appendChild(removeButton);
            list.appendChild(row);
        });
    }

    /**
     * Renders the action buttons shown in the modal footer.
     * @param {Array<Object>} [actions=[]] - Action button configuration.
     * @returns {void}
     */
    renderActions(actions = []) {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;

        const container = modal.querySelector('[data-knack-bulk-basket-actions="1"]');
        if (!container) return;
        container.innerHTML = '';

        (Array.isArray(actions) ? actions : []).forEach((action) => {
            const button = bulkActionCreateButton(container, {
                id: bulkActionBuildButtonId(this.viewId, action?.key || 'action', 'modal-action'),
                label: action?.label || 'Submit',
                classes: ['knackBulkActionButton', 'knackBulkActionModalAction', this.buttonClass].filter(Boolean),
                styleText: ''
            }, {
                viewId: this.viewId,
                location: 'modal-action',
                actionKey: action?.key,
                action
            });
            if (!(button instanceof Element)) return;
            button.disabled = Boolean(action?.disabled);
            button.classList.toggle('is-active', Boolean(action?.active));
            button.classList.toggle('is-disabled', button.disabled);
            button.addEventListener('click', () => {
                if (button.disabled) return;
                if (typeof this.onAction === 'function') this.onAction(action?.key);
            });
            container.appendChild(button);
        });
    }

    /**
     * Updates the progress state shown in the modal.
     * @param {Object} [runState={}] - Current run-state object.
     * @returns {void}
     */
    setProgressState(runState = {}) {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;
        const progress = modal.querySelector('[data-knack-bulk-basket-progress="1"]');
        if (!progress) return;

        const summary = bulkActionSummarizeRunState(runState);
        progress.className = ['knackBulkActionModalProgress', summary.visible ? 'is-visible' : '', summary.stateClass].filter(Boolean).join(' ');

        const title = modal.querySelector('[data-knack-bulk-basket-progress-title="1"]');
        const detail = modal.querySelector('[data-knack-bulk-basket-progress-detail="1"]');
        const meta = modal.querySelector('[data-knack-bulk-basket-progress-meta="1"]');
        const percent = modal.querySelector('[data-knack-bulk-basket-progress-percent="1"]');
        const bar = modal.querySelector('[data-knack-bulk-basket-progress-bar="1"]');

        if (title) title.textContent = summary.title;
        if (detail) detail.textContent = summary.detail;
        if (meta) meta.textContent = summary.meta;
        if (percent) percent.textContent = summary.visible ? `${summary.percent}%` : '';
        if (bar instanceof Element) {
            bar.style.width = `${summary.percent}%`;
        }
    }

    /**
     * Opens the modal.
     * @returns {void}
     */
    open() {
        const modal = this.ensureModal();
        modal.style.display = 'flex';
        this.isOpen = true;
    }

    /**
     * Closes the modal.
     * @returns {void}
     */
    close() {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.style.display = 'none';
        this.isOpen = false;
    }
}

/**
 * Ensures a grid exposes shared KTL-managed selection checkboxes.
 * @param {string} viewId - Grid view id.
 * @param {Object} selectionConfig - Selection config containing checkbox classes.
 * @param {Object} [handlers={}] - Checkbox change handlers.
 * @returns {void}
 */
function ensureBulkActionCheckboxes(viewId, selectionConfig, handlers = {}) {
    if (typeof ktl?.views?.addCheckboxesToTable !== 'function') return;
    const selectionScope = knackValueResolver.toStringSafe(selectionConfig?.scope || 'ktlCheckbox') || 'ktlCheckbox';

    ktl.views.addCheckboxesToTable(viewId, {
        withMaster: true,
        selectionScope,
        checkboxClasses: ['bulkEditCb', 'ktlCheckbox-bulkops'],
        checkboxDataAttrs: {
            'data-ktl-selection': selectionScope,
            'data-ktl-bulkops': '1'
        },
        masterCheckboxDataAttrs: {
            'data-ktl-bulkops': '1'
        },
        rowCheckboxDataAttrs: {
            'data-ktl-bulkops': '1'
        },
        rowCheckboxClasses: [selectionConfig?.rowCheckboxClass].filter(Boolean),
        masterCheckboxClasses: [selectionConfig?.masterCheckboxClass].filter(Boolean),
        enhanceExisting: true,
        onMasterChange: () => {
            if (typeof handlers.onSelectionChange === 'function') {
                handlers.onSelectionChange();
            }
        },
        onRowChange: () => {
            if (typeof handlers.onSelectionChange === 'function') {
                handlers.onSelectionChange();
            }
        },
        shiftClickChangeHandler: () => {
            if (typeof handlers.onSelectionChange === 'function') {
                handlers.onSelectionChange();
            }
        },
    });

    const viewElement = bulkActionFindViewRoot(viewId);
    const rowCheckboxClass = knackValueResolver.toStringSafe(selectionConfig?.rowCheckboxClass);
    if (!viewElement || !rowCheckboxClass) return;

    bulkActionRemoveNonSelectableRowCheckboxes(viewElement, rowCheckboxClass);
    bulkActionGetSelectableRowCheckboxes(viewElement, rowCheckboxClass).forEach((checkbox) => {
        bulkActionGetRowCheckboxRecordId(checkbox);
    });
}

const KTL_BULK_EDIT_SELECTION_STYLE_ID = 'ktlBulkEditSelectionStyles';
const KTL_BULK_EDIT_ROW_MARKER_CLASS = 'ktlBulkEditRowSelected';
// Keyed by viewId, one observer per `_ebo` grid (never more than a handful per app), replaced on
// every render - see preserveBulkEditSelectedRowColors. Left connected to an inert/detached tbody
// if a view is never rendered again, which is an acceptable, bounded cost for this view count.
const ktlBulkEditRowColorObservers = new Map();

/**
 * Returns the CSS for the KTL `_ebo` bulk-edit row selection outline.
 * @returns {string} CSS text.
 */
function ktlBulkEditSelectionCssText() {
    return `
tr.${KTL_BULK_EDIT_ROW_MARKER_CLASS} {
    outline: 2px solid var(--ktl-bulk-edit-outline-color, #2a3f50);
    outline-offset: -2px;
}
`;
}

/**
 * Injects the shared bulk-edit row selection stylesheet once per page.
 * @returns {void}
 */
function ensureBulkEditSelectionStyles() {
    if (document.getElementById(KTL_BULK_EDIT_SELECTION_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = KTL_BULK_EDIT_SELECTION_STYLE_ID;
    style.textContent = ktlBulkEditSelectionCssText();
    document.head.appendChild(style);
}

/**
 * KTL's native `_ebo` row selection strips the inline background/text colour it finds on a
 * `td.bulkEditSelectedRow` cell (saving it to `data-bulk-edit-saved-*`) so its own selection
 * background can show through. That only works for inline-editable (`cell-edit`) cells - on
 * plain cells it leaves the colour cleared with nothing to replace it, which can make custom
 * per-row colour formatting (e.g. white text on a coloured background) invisible while selected.
 * This re-applies the saved colours immediately, and marks the whole row (rather than individual
 * cells) with an outline class so selection has one consistent visual cue.
 * @param {string} viewId - Grid view id with the KTL `_ebo` keyword enabled.
 * @returns {void}
 */
function preserveBulkEditSelectedRowColors(viewId) {
    const normalizedViewId = knackNavigator.normalizeViewId(viewId);
    if (!normalizedViewId) return;

    const viewElement = document.getElementById(normalizedViewId);
    if (!viewElement) return;

    ensureBulkEditSelectionStyles();

    // The table body is replaced on every render, so drop any observer left over from before.
    ktlBulkEditRowColorObservers.get(normalizedViewId)?.disconnect();

    const syncRowOutline = (row) => {
        if (!(row instanceof HTMLElement)) return;
        const hasSelectedCell = !!row.querySelector('td.bulkEditSelectedRow');
        const hasMarker = row.classList.contains(KTL_BULK_EDIT_ROW_MARKER_CLASS);
        // Only touch the class when the state actually changes, to avoid retriggering the observer.
        if (hasSelectedCell && !hasMarker) {
            row.classList.add(KTL_BULK_EDIT_ROW_MARKER_CLASS);
        } else if (!hasSelectedCell && hasMarker) {
            row.classList.remove(KTL_BULK_EDIT_ROW_MARKER_CLASS);
        }
    };

    const restoreCell = (target) => {
        if (!(target instanceof HTMLElement)) return;
        const cell = target.matches('td') ? target : target.closest('td');

        if (cell?.classList.contains('bulkEditSelectedRow')) {
            const savedBg = cell.dataset.bulkEditSavedBg;
            const savedColor = cell.dataset.bulkEditSavedColor || '';
            if (savedBg && (cell.style.backgroundColor !== savedBg || cell.style.color !== savedColor)) {
                cell.style.backgroundColor = savedBg;
                cell.style.color = savedColor;
            }
        }

        syncRowOutline(target.closest('tr'));
    };

    const tableBody = viewElement.querySelector('tbody') || viewElement;
    tableBody.querySelectorAll('td').forEach(restoreCell);

    // KTL adds `bulkEditSelectedRow` (a "class" mutation) and clears the saved colour (a "style"
    // mutation) synchronously, one after the other, so both records land in the same observer
    // callback - filtering to just these two keeps this from re-running on every unrelated
    // attribute Knack touches while rendering (aria-*, data-column-index, etc.).
    const observer = new MutationObserver((mutations) => {
        new Set(mutations.map((mutation) => mutation.target)).forEach(restoreCell);
    });
    observer.observe(tableBody, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        subtree: true,
    });

    ktlBulkEditRowColorObservers.set(normalizedViewId, observer);
}

/**
 * Mounts the bulk-action toolbar group into the shared KTL add-ons div.
 * @param {Element} container - KTL add-ons container.
 * @param {Element} wrapper - Bulk-action toolbar group.
 * @param {string} viewId - Source view id.
 * @returns {void}
 */
function bulkActionMountToolbarGroup(container, wrapper, viewId) {
    if (!(container instanceof Element) || !(wrapper instanceof Element)) return;

    const bulkOpsGroup = container.querySelector(`#bulkOpsControlsDiv-${viewId}`) || container.querySelector('.bulkOpsControlsDiv');
    if (bulkOpsGroup instanceof Element && bulkOpsGroup.parentElement === container) {
        if (bulkOpsGroup.nextSibling !== wrapper) {
            bulkOpsGroup.insertAdjacentElement('afterend', wrapper);
        }
        return;
    }

    container.appendChild(wrapper);
}

/**
 * Controller that wires a grid view to basket UI and bulk-action workflows.
 */
class BulkActionGridController {
    /**
     * Creates a grid controller for a single bulk-action-enabled view.
     * @param {Object} options - Grid controller options.
     */
    constructor({
        viewId,
        rowRecords = [],
        labelFieldIds = [],
        actions = [],
        bulkActionsApi = KnackBulkActions,
        bulkActionConfig
    } = {}) {
        this.viewId = knackNavigator.normalizeViewId(viewId);
        this.rowRecords = Array.isArray(rowRecords) ? rowRecords : [];
        this.labelFieldIds = Array.isArray(labelFieldIds) ? labelFieldIds : [labelFieldIds];
        this.actions = Array.isArray(actions) ? actions.filter((action) => action?.key && action?.label) : [];
        this.bulkActionsApi = bulkActionsApi;
        this.bulkActionConfig = createBulkActionConfig(bulkActionConfig);
        this.namespace = this.bulkActionConfig.namespace;

        this.recordById = new Map();
        this.labelById = new Map();
        this.rebuildRecordMaps();

        this.basketModal = new BulkActionModal({
            viewId: this.viewId,
            bulkActionConfig: this.bulkActionConfig
        });
        this.basketModal.onRemove = (recordId) => this.removeFromBasket([recordId]);
        this.basketModal.onClear = () => this.clearBasket();
        this.basketModal.onAction = (actionKey) => this.runAction(actionKey);

        this.basketStore = this.bulkActionsApi.createBasketStore({
            namespace: this.namespace,
            viewId: this.viewId,
            ttlMs: this.bulkActionConfig.basket.ttlMs,
            isOpen: () => this.basketModal.isOpen
        });

        this.basketItems = this.basketStore.getItems();
        this.activeActionKey = this.basketStore.getActiveActionKey() || knackValueResolver.toStringSafe(this.actions[0]?.key);
        this.runState = bulkActionCreateRunState();
    }

    /**
     * Rebuilds record and label lookup maps for the current row data.
     * @returns {void}
     */
    rebuildRecordMaps() {
        this.recordById.clear();
        this.labelById.clear();

        this.rowRecords.forEach((record) => {
            const recordId = knackValueResolver.toStringSafe(record?.id);
            if (!recordId) return;
            this.recordById.set(recordId, record);
            this.labelById.set(
                recordId,
                bulkActionNormaliseLabelText(this.bulkActionsApi.getRecordLabel(record, this.labelFieldIds)) || recordId
            );
        });
    }

    /**
     * Resolves the current view root element.
     * @returns {Element|null} View element.
     */
    resolveViewElement() {
        return bulkActionFindViewRoot(this.viewId);
    }

    /**
     * Returns the currently selected row record ids.
     * @returns {Array<string>} Selected record ids.
     */
    getSelectedRecordIds() {
        const viewElement = this.resolveViewElement();
        if (!viewElement) return [];

        return bulkActionGetSelectableRowCheckboxes(viewElement, this.bulkActionConfig.selection.rowCheckboxClass)
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => bulkActionGetRowCheckboxRecordId(checkbox))
            .filter(Boolean);
    }

    /**
     * Finds the row checkbox for a specific record id.
     * @param {string} recordId - Record id to find.
     * @param {Element|null} [viewElement=this.resolveViewElement()] - Optional view element.
     * @returns {HTMLInputElement|null} Row checkbox when found.
     */
    findRowCheckbox(recordId, viewElement = this.resolveViewElement()) {
        const normalizedRecordId = knackValueResolver.toStringSafe(recordId);
        if (!viewElement || !normalizedRecordId) return null;

        return bulkActionGetSelectableRowCheckboxes(viewElement, this.bulkActionConfig.selection.rowCheckboxClass).find((checkbox) => {
            return bulkActionGetRowCheckboxRecordId(checkbox) === normalizedRecordId;
        }) || null;
    }

    /**
     * Builds basket items from record ids.
     * @param {Array<string>} [recordIds=[]] - Record ids to convert.
     * @returns {Array<Object>} Basket items.
     */
    buildBasketItems(recordIds = []) {
        return bulkActionUniqueStrings(recordIds).map((recordId) => {
            return {
                recordId,
                label: this.labelById.get(recordId) || recordId,
                sourceRecord: this.recordById.get(recordId) || null
            };
        });
    }

    /**
     * Returns the record ids currently stored in the basket.
     * @returns {Array<string>} Basket record ids.
     */
    getBasketRecordIds() {
        return this.basketItems.map((item) => item?.recordId).filter(Boolean);
    }

    /**
     * Refreshes basket, selection, and toolbar UI from controller state.
     * @param {Object} [options={}] - Refresh options.
     * @param {boolean} [options.restoreSelection=false] - Whether checkbox selection should be restored from the basket.
     * @returns {void}
     */
    refreshUi({ restoreSelection = false } = {}) {
        this.syncBasketUi();
        if (restoreSelection) {
            this.restoreSelectionFromBasket();
        }
        this.updateButtonsDisabledState();
    }

    /**
     * Replaces the current run state and refreshes modal progress.
     * @param {Object} [nextState={}] - Next run-state object.
     * @returns {Object} Normalized run state.
     */
    replaceRunState(nextState = {}) {
        this.runState = bulkActionCreateRunState(nextState);
        this.syncBasketUi();
        return this.runState;
    }

    /**
     * Patches the current run state and refreshes modal progress.
     * @param {Object} [statePatch={}] - Partial run-state patch.
     * @returns {Object} Normalized run state.
     */
    patchRunState(statePatch = {}) {
        return this.replaceRunState({
            ...this.runState,
            ...(statePatch && typeof statePatch === 'object' ? statePatch : {})
        });
    }

    /**
     * Adds records to the basket.
     * @param {Array<string>} [recordIds=[]] - Record ids to add.
     * @returns {Array<Object>} Updated basket items.
     */
    addToBasket(recordIds = []) {
        const nextItems = this.basketStore.addItems(this.buildBasketItems(recordIds));
        this.basketItems = nextItems;
        this.refreshUi({ restoreSelection: true });
        return nextItems;
    }

    /**
     * Replaces the basket contents with the supplied record ids.
     * @param {Array<string>} [recordIds=[]] - Replacement record ids.
     * @returns {Array<Object>} Updated basket items.
     */
    replaceBasketFromRecordIds(recordIds = []) {
        const nextItems = this.basketStore.setItems(this.buildBasketItems(recordIds));
        this.basketItems = nextItems;
        this.refreshUi({ restoreSelection: true });
        return nextItems;
    }

    /**
     * Removes records from the basket.
     * @param {Array<string>} [recordIds=[]] - Record ids to remove.
     * @returns {Array<Object>} Updated basket items.
     */
    removeFromBasket(recordIds = []) {
        const normalizedRecordIds = bulkActionUniqueStrings(recordIds);
        const viewElement = this.resolveViewElement();
        if (viewElement && normalizedRecordIds.length) {
            let syncedFromDom = false;

            normalizedRecordIds.forEach((recordId) => {
                const checkbox = this.findRowCheckbox(recordId, viewElement);
                if (!(checkbox instanceof HTMLInputElement) || !checkbox.checked) return;

                checkbox.checked = false;
                syncedFromDom = true;
            });

            if (syncedFromDom) {
                this.syncSelectionFromDom();
                return this.basketItems;
            }
        }

        const nextItems = this.basketStore.removeItems(recordIds);
        this.basketItems = nextItems;
        this.refreshUi({ restoreSelection: true });
        return nextItems;
    }

    /**
     * Clears the basket and resets modal progress state.
     * @returns {void}
     */
    clearBasket() {
        this.basketItems = this.basketStore.clear();
        this.activeActionKey = '';
        this.runState = bulkActionCreateRunState();
        this.basketModal.close();
        this.refreshUi({ restoreSelection: true });
    }

    /**
     * Clears stored failure metadata for matching basket items.
     * @param {Array<string>} [recordIds=[]] - Optional record ids to clear.
     * @returns {void}
     */
    clearBasketItemFailures(recordIds = []) {
        const clearSet = new Set(bulkActionUniqueStrings(recordIds));
        const nextItems = this.basketStore.getItems().map((item) => {
            if (!clearSet.size || clearSet.has(item.recordId)) {
                const nextItem = { ...item };
                delete nextItem.failureType;
                delete nextItem.failureMessage;
                return nextItem;
            }
            return item;
        });

        this.basketItems = this.basketStore.setItems(nextItems);
        this.syncBasketUi();
    }

    /**
     * Records a failure against a basket item.
     * @param {string} recordId - Failed record id.
     * @param {*} error - Error to classify and store.
     * @returns {void}
     */
    setBasketItemFailure(recordId, error) {
        const normalizedRecordId = knackValueResolver.toStringSafe(recordId);
        if (!normalizedRecordId) return;

        const failure = this.bulkActionsApi.classifyFailure(error);
        const nextItems = this.basketStore.getItems().map((item) => {
            if (item.recordId !== normalizedRecordId) return item;
            return {
                ...item,
                failureType: failure.type,
                failureMessage: failure.message
            };
        });

        this.basketItems = this.basketStore.setItems(nextItems);
        this.syncBasketUi();
    }

    /**
     * Resolves the currently active action.
     * @returns {Object|null} Active action.
     */
    resolveActiveAction() {
        // The constructor keeps only actions that have a key and a label.
        return this.actions.find((action) => action.key === this.activeActionKey) || this.actions[0] || null;
    }

    /**
     * Sets the active action key and refreshes the UI.
     * @param {string} actionKey - Action key to activate.
     * @returns {void}
     */
    setActiveActionKey(actionKey) {
        const normalizedActionKey = knackValueResolver.toStringSafe(actionKey);
        this.activeActionKey = normalizedActionKey;
        this.basketStore.setActiveActionKey(normalizedActionKey);
        this.refreshUi();
    }

    /**
     * Validates one action against the current basket contents.
     * @param {Object} action - Bulk action to validate.
     * @returns {{valid: boolean, message: string}} Validation result.
     */
    getActionValidation(action) {
        if (typeof action?.validationCallback !== 'function') {
            return { valid: true, message: '' };
        }

        const items = this.basketItems.slice();
        const context = {
            action,
            controller: this,
            items,
            recordIds: items.map((item) => knackValueResolver.toStringSafe(item?.recordId)).filter(Boolean),
            records: items.map((item) => this.recordById.get(item?.recordId) || item?.sourceRecord || null).filter(Boolean)
        };

        try {
            const result = action.validationCallback(context);
            if (result === false) {
                return { valid: false, message: 'This bulk action cannot be used with the selected records.' };
            }
            if (typeof result === 'string') {
                return { valid: false, message: result };
            }
            if (result && typeof result === 'object' && result.valid === false) {
                const hasMessage = Object.prototype.hasOwnProperty.call(result, 'message');
                return {
                    valid: false,
                    message: hasMessage
                        ? knackValueResolver.toStringSafe(result.message)
                        : 'This bulk action cannot be used with the selected records.'
                };
            }
        } catch (error) {
            bulkActionReportError(error, { viewId: this.viewId, actionKey: action?.key }, 'Bulk action validation failed', this.bulkActionConfig.action);
            return { valid: false, message: 'Unable to validate the selected records for this bulk action.' };
        }

        return { valid: true, message: '' };
    }

    /**
     * Returns the action configuration shown in the basket modal.
     * @returns {Array<Object>} Modal action configuration.
     */
    getBasketActionConfigs() {
        const activeAction = this.resolveActiveAction();
        if (!activeAction) return [];
        const validation = this.getActionValidation(activeAction);

        return [{
            key: activeAction.key,
            label: activeAction.label,
            active: true,
            disabled: this.runState.isRunning || !this.basketItems.length || !validation.valid,
            validationMessage: validation.message
        }];
    }

    /**
     * Syncs basket contents, actions, and progress into the modal UI.
     * @returns {void}
     */
    syncBasketUi() {
        this.basketItems = this.basketStore.getItems();
        const modalExists = document.getElementById(this.basketModal.modalId);
        if (modalExists) {
            const actionConfigs = this.getBasketActionConfigs();
            this.basketModal.render({
                items: this.basketItems,
                validationMessage: actionConfigs[0]?.validationMessage || ''
            });
            this.basketModal.renderActions(actionConfigs);
            this.basketModal.setProgressState(this.runState);
        }
    }

    /**
     * Restores row checkbox selection from the current basket.
     * @returns {void}
     */
    restoreSelectionFromBasket() {
        const viewElement = this.resolveViewElement();
        if (!viewElement) return;

        const selectedIds = new Set(this.basketItems.map((item) => item.recordId));
        bulkActionRemoveNonSelectableRowCheckboxes(viewElement, this.bulkActionConfig.selection.rowCheckboxClass);
        bulkActionGetSelectableRowCheckboxes(viewElement, this.bulkActionConfig.selection.rowCheckboxClass).forEach((checkbox) => {
            const recordId = bulkActionGetRowCheckboxRecordId(checkbox);
            checkbox.checked = selectedIds.has(recordId);
        });

        this.syncMasterCheckboxState(viewElement);
    }

    /**
     * Updates the master checkbox state for the current grid.
     * @param {Element|null} [viewElement=this.resolveViewElement()] - Optional view element.
     * @returns {void}
     */
    syncMasterCheckboxState(viewElement = this.resolveViewElement()) {
        if (!viewElement) return;

        const rowCheckboxes = bulkActionGetSelectableRowCheckboxes(viewElement, this.bulkActionConfig.selection.rowCheckboxClass);
        const checkedCount = rowCheckboxes.filter((checkbox) => checkbox.checked).length;
        const hasRows = rowCheckboxes.length > 0;
        const allChecked = hasRows && checkedCount === rowCheckboxes.length;
        const someChecked = checkedCount > 0;

        viewElement.querySelectorAll(`.${this.bulkActionConfig.selection.masterCheckboxClass}`).forEach((checkbox) => {
            checkbox.checked = allChecked;
            checkbox.indeterminate = someChecked && !allChecked;
        });
    }

    /**
     * Rebuilds basket contents from the current DOM checkbox selection.
     * @returns {void}
     */
    syncSelectionFromDom() {
        const viewElement = this.resolveViewElement();
        if (!viewElement) return;

        bulkActionRemoveNonSelectableRowCheckboxes(viewElement, this.bulkActionConfig.selection.rowCheckboxClass);
        const rowCheckboxes = bulkActionGetSelectableRowCheckboxes(viewElement, this.bulkActionConfig.selection.rowCheckboxClass);
        const checkedIds = rowCheckboxes.filter((checkbox) => checkbox.checked).map((checkbox) => bulkActionGetRowCheckboxRecordId(checkbox)).filter(Boolean);
        this.replaceBasketFromRecordIds(checkedIds);
    }

    /**
     * Updates toolbar button disabled and active states.
     * @returns {void}
     */
    updateButtonsDisabledState() {
        const wrapper = document.querySelector(`[data-knack-bulk-bar="${this.viewId}"]`);
        if (!wrapper) return;

        const hasSelection = this.basketItems.length > 0;
        wrapper.querySelectorAll(`.${this.bulkActionConfig.action.buttonClass}`).forEach((button) => {
            button.disabled = !hasSelection;
            button.classList.toggle('is-disabled', !hasSelection);

            if (knackValueResolver.toStringSafe(button.dataset.bulkActionKey) === knackValueResolver.toStringSafe(this.resolveActiveAction()?.key)) {
                button.classList.add('is-active');
                button.classList.remove('is-inactive');
            } else {
                button.classList.remove('is-active');
                button.classList.add('is-inactive');
            }
        });
    }

    /**
     * Resolves the container used to mount the toolbar button bar.
     * @returns {Element|null} Button container.
     */
    resolveButtonContainer() {
        if (typeof ktl?.views?.getKtlAddOnsDiv !== 'function') return null;
        return bulkActionResolveElement(ktl.views.getKtlAddOnsDiv(this.viewId));
    }

    /**
     * Removes any previously rendered toolbar UI for this controller.
     * @returns {void}
     */
    removeExistingUi() {
        const existing = document.querySelector(`[data-knack-bulk-bar="${this.viewId}"]`);
        if (existing) existing.remove();
    }

    /**
     * Renders the toolbar button bar for available actions.
     * @returns {void}
     */
    renderButtonBar() {
        const container = this.resolveButtonContainer();
        if (!container) return;
        const isKtlAddonsContainer = container.classList?.contains('ktlAddonsDiv');

        this.removeExistingUi();

        const wrapper = document.createElement('div');
        wrapper.dataset.knackBulkBar = this.viewId;
        wrapper.id = `bulkActionControlsDiv-${this.viewId}`;
        wrapper.className = ['knackBulkActionBar', this.bulkActionConfig.action.buttonBarClass].filter(Boolean).join(' ');
        if (isKtlAddonsContainer) {
            wrapper.classList.add('ktlFeatureGroup');
        }

        this.actions.forEach((action) => {
            const button = bulkActionCreateButton(wrapper, {
                id: bulkActionBuildButtonId(this.viewId, action.key, 'toolbar-action'),
                label: action.label,
                classes: ['knackBulkActionButton', 'knackBulkActionToolbarButton', this.bulkActionConfig.action.buttonClass].filter(Boolean),
                styleText: ''
            }, {
                viewId: this.viewId,
                location: 'toolbar-action',
                actionKey: action.key,
                action
            });
            if (!(button instanceof Element)) return;
            button.dataset.bulkActionKey = action.key;
            button.addEventListener('click', () => {
                const selectedIds = this.getSelectedRecordIds();
                if (!selectedIds.length && !this.basketItems.length) {
                    bulkActionNotify('Select one or more rows first.', 'warning', this.bulkActionConfig.action);
                    return;
                }

                this.setActiveActionKey(action.key);
                this.openBasketAndAdd(selectedIds);
            });
        });

        bulkActionMountToolbarGroup(container, wrapper, this.viewId);
        window.setTimeout(() => {
            const bulkOpsGroup = container.querySelector(`#bulkOpsControlsDiv-${this.viewId}`) || container.querySelector('.bulkOpsControlsDiv');
            if (wrapper.isConnected && bulkOpsGroup instanceof Element && bulkOpsGroup.nextElementSibling !== wrapper) {
                bulkActionMountToolbarGroup(container, wrapper, this.viewId);
            }
        }, 0);
    }

    /**
     * Opens the basket modal and optionally adds record ids first.
     * @param {Array<string>} [recordIds=[]] - Record ids to add before opening.
     * @returns {void}
     */
    openBasketAndAdd(recordIds = []) {
        if (Array.isArray(recordIds) && recordIds.length) {
            this.addToBasket(recordIds);
        }

        this.openBasket();
    }

    /**
     * Opens the basket modal using the current basket contents.
     * @returns {void}
     */
    openBasket() {
        if (!this.basketItems.length) {
            bulkActionNotify('Select one or more rows first.', 'warning', this.bulkActionConfig.action);
            return;
        }

        this.basketModal.open();
        this.syncBasketUi();
    }

    /**
     * Resets form-action progress state without altering basket contents.
     * @returns {void}
     */
    resetFormActionState() {
        this.runState = bulkActionCreateRunState();
        this.refreshUi();
    }

    /**
     * Starts a form-based bulk action by storing workflow state and navigating to the form.
     * @param {Object} action - Target form action.
     * @returns {Promise<void>}
     */
    async startFormAction(action) {
        const sceneInfo = knackNavigator.getSceneInfoForView(action?.target);
        const sceneSlug = knackValueResolver.toStringSafe(sceneInfo?.slug);
        if (!sceneSlug) {
            bulkActionNotify('Bulk action could not resolve the target form route.', 'error', this.bulkActionConfig.action);
            return;
        }

        const recordIds = this.getBasketRecordIds();
        if (!recordIds.length) return;

        const firstRecordId = recordIds[0];
        const firstItem = this.basketItems.find((item) => item.recordId === firstRecordId) || null;
        const sessionKey = bulkActionBuildFormFlowSessionKey(this.namespace, action.target);
        const navToken = bulkActionMakeToken();
        const sourceHashState = bulkActionGetCurrentHashState();

        bulkActionWriteFormFlowState(sessionKey, {
            sourceViewId: this.viewId,
            recordIds,
            actionKey: knackValueResolver.toStringSafe(action?.key),
            recordFieldId: action.recordFieldId || '',
            firstRecordLabel: knackValueResolver.toStringSafe(firstItem?.label),
            formMode: String(action.operation || 'create').toLowerCase() === 'update' ? 'update' : 'create',
            sceneSlug,
            navToken,
            sourceHashPath: sourceHashState.path,
            sourceHashQuery: sourceHashState.query,
            createdAt: Date.now(),
            activeFormViewId: ''
        });

        this.replaceRunState({
            isRunning: true,
            total: recordIds.length,
            completionMessage: 'Waiting for form submission...'
        });

        bulkActionNavigateToSceneSlug(sceneSlug, {
            recordId: firstRecordId,
            params: { coBulkToken: navToken }
        });
    }

    /**
     * Runs the selected bulk action.
     * @param {string} actionKey - Action key to run.
     * @returns {Promise<void>}
     */
    async runAction(actionKey) {
        const action = this.actions.find((candidate) => knackValueResolver.toStringSafe(candidate?.key) === knackValueResolver.toStringSafe(actionKey));
        if (!action || this.runState.isRunning) return;

        const validation = this.getActionValidation(action);
        if (!validation.valid) {
            if (validation.message) {
                bulkActionNotify(validation.message, 'warning', this.bulkActionConfig.action);
            }
            this.syncBasketUi();
            return;
        }

        if (action.targetType === 'form') {
            await this.startFormAction(action);
            return;
        }

        const runner = this.bulkActionsApi.createActionRunner({
            actions: [action],
            concurrency: 'serial',
            onStateChange: (state) => {
                this.replaceRunState(state);
            }
        });

        try {
            const result = await runner.run(action.key, {
                items: this.basketItems,
                context: {
                    viewId: this.viewId,
                    controller: this
                }
            });

            const failedItems = (result?.items || []).filter((item) => item?.failureType || item?.failureMessage);
            this.basketItems = this.basketStore.setItems(failedItems);
            if (!failedItems.length) {
                this.basketModal.close();
            }
            this.replaceRunState(result?.state || this.runState);
            this.restoreSelectionFromBasket();
            this.updateButtonsDisabledState();
        } catch (error) {
            bulkActionReportError(error, { viewId: this.viewId, actionKey: action.key }, 'Bulk batch action failed', this.bulkActionConfig.action);
            bulkActionNotify('Bulk action failed. See console for details.', 'error', this.bulkActionConfig.action);
        }
    }

    /**
     * Initialises checkbox wiring, toolbar UI, and form workflows for the grid.
     * @returns {BulkActionGridController|null} The initialised controller.
     */
    init() {
        if (!this.viewId) return null;
        const viewElement = this.resolveViewElement();
        if (!viewElement) return null;

        ensureBulkActionBaseStyles();
        ensureBulkActionControllerLifecycleBinding();
        bulkActionControllerStore.set(this.viewId, this);
        this.rebuildRecordMaps();
        ensureBulkActionCheckboxes(this.viewId, this.bulkActionConfig.selection, {
            onSelectionChange: () => this.syncSelectionFromDom()
        });
        this.renderButtonBar();
        this.refreshUi({ restoreSelection: true });

        this.actions.filter((action) => action?.targetType === 'form').forEach((action) => {
            registerBulkActionFormReplicateWorkflow({
                namespace: this.namespace,
                action,
                bulkActionConfig: this.bulkActionConfig
            });
        });

        return this;
    }
}

/**
 * Replicates a just-submitted bulk form record to the remaining basket items.
 * @param {Object} [options={}] - Replication options.
 * @returns {Promise<{failedIds: Array<string>, total: number}>} Replication result summary.
 */
async function replicateBulkActionSubmittedRecord({ action, bulkState, record, api = {}, options = {} } = {}) {
    const mode = String(bulkState?.formMode || 'create').toLowerCase() === 'update' ? 'update' : 'create';
    const sourceViewId = knackNavigator.normalizeViewId(bulkState?.sourceViewId);
    const recordIds = bulkActionUniqueStrings(bulkState?.recordIds || []);
    const recordFieldId = knackNavigator.normalizeFieldId(bulkState?.recordFieldId);
    const sourceController = bulkActionControllerStore.get(sourceViewId) || null;
    const sourceStore = action?.bulkActionsApi?.createBasketStore
        ? action.bulkActionsApi.createBasketStore({ namespace: bulkState?.namespace || options.namespace || 'KNACK_BULK', viewId: sourceViewId })
        : createBulkActionBasketStore({ namespace: bulkState?.namespace || options.namespace || 'KNACK_BULK', viewId: sourceViewId });
    const apiClient = bulkActionResolveReplicationApi(api);

    const processedRecordId = mode === 'update'
        ? knackValueResolver.toStringSafe(record?.id)
        : bulkActionResolveConnectionFieldRecordId(record, recordFieldId);

    if (!processedRecordId || !recordIds.includes(processedRecordId)) {
        throw new Error(`Submitted ${mode} record could not be matched to the selected basket items.`);
    }

    const includeFieldKeys = bulkActionNormalizeFieldKeys(bulkState?.formFieldKeys);
    const excludeFieldKeys = mode === 'create' && recordFieldId ? [recordFieldId] : [];
    const renderRecord = bulkActionObjectOrEmpty(bulkState?.renderRecord);
    const basePayload = bulkActionBuildReplicateBasePayload({
        record,
        renderRecord,
        includeFieldKeys,
        excludeFieldKeys
    });
    const sceneId = knackNavigator.normalizeSceneId(action?.sceneId || knackNavigator.getSceneInfoForView(action?.target)?.key);
    const apiViewId = knackNavigator.normalizeViewId(action?.target);
    const preparedOperationById = new Map();

    if (processedRecordId) {
        void bulkActionInvokeSuccessCallback(action?.successCallback, {
            stage: 'submitted',
            mode,
            targetId: processedRecordId,
            sourceViewId,
            targetViewId: apiViewId,
            sceneId,
            record,
            requestData: basePayload,
            bulkState
        }, {
            sourceViewId,
            targetViewId: apiViewId,
            targetId: processedRecordId,
            mode,
            stage: 'submitted'
        }, options);
    }

    if (processedRecordId) {
        sourceStore.removeItems([processedRecordId]);
    }

    const remainingIds = recordIds.filter((recordId) => recordId && recordId !== processedRecordId);
    if (!remainingIds.length) {
        if (sourceController) {
            sourceController.replaceRunState({
                isRunning: false,
                processed: recordIds.length,
                total: recordIds.length,
                success: recordIds.length,
                failed: 0,
                completionMessage: `Done: ${recordIds.length} ok.`
            });
            sourceController.basketModal.close();
        }
        return { failedIds: [], total: recordIds.length };
    }

    if (sourceController) {
        sourceController.replaceRunState({
            isRunning: true,
            processed: processedRecordId ? 1 : 0,
            total: recordIds.length,
            success: processedRecordId ? 1 : 0
        });
        sourceController.clearBasketItemFailures(recordIds);
    }

    const failedIds = [];
    const { preparedOperations, failedIds: preparationFailedIds } = await bulkActionPrepareReplicateOperations({
        mode,
        remainingIds,
        basePayload,
        action,
        sourceController,
        processedRecordId,
        sourceViewId,
        record,
        recordFieldId,
        options
    });

    if (preparationFailedIds.length) {
        failedIds.push(...preparationFailedIds);
        if (sourceController) {
            sourceController.patchRunState({
                processed: Math.min(Number(sourceController.runState.total || 0), Number(sourceController.runState.processed || 0) + preparationFailedIds.length),
                failed: Number(sourceController.runState.failed || 0) + preparationFailedIds.length
            });
        }
    }

    preparedOperations.forEach((operation) => {
        const operationId = knackValueResolver.toStringSafe(operation?.id);
        if (!operationId) return;
        preparedOperationById.set(operationId, operation);
    });

    const onBatchProgress = (progress = {}) => {
        const targetId = mode === 'update'
            ? knackValueResolver.toStringSafe(progress.recordId)
            : knackValueResolver.toStringSafe(preparedOperations[Number(progress.index)]?.id);

        if (targetId && !progress.error) {
            sourceStore.removeItems([targetId]);

            const requestData = mode === 'update'
                ? preparedOperationById.get(targetId)?.data
                : preparedOperations[Number(progress.index)]?.data;

            void bulkActionInvokeSuccessCallback(action?.successCallback, {
                stage: 'replicated',
                mode,
                targetId,
                sourceViewId,
                targetViewId: apiViewId,
                sceneId,
                record: progress.record || null,
                requestData,
                bulkState,
                progress
            }, {
                sourceViewId,
                targetViewId: apiViewId,
                targetId,
                mode,
                stage: 'replicated'
            }, options);
        }

        if (targetId && progress.error) {
            failedIds.push(targetId);
            sourceController?.setBasketItemFailure(targetId, progress.error);
            bulkActionReportError(progress.error, { sourceViewId, targetViewId: apiViewId, targetId, mode }, 'Bulk form replicate failed', options);
        }

        if (!sourceController) return;

        const batchSuccess = mode === 'update'
            ? Number(progress.updated || 0)
            : Number(progress.created || 0);
        const batchFailed = Number(progress.failed || 0);
        sourceController.patchRunState({
            processed: (processedRecordId ? 1 : 0) + preparationFailedIds.length + batchSuccess + batchFailed,
            success: (processedRecordId ? 1 : 0) + batchSuccess,
            failed: preparationFailedIds.length + batchFailed
        });
    };

    // Prefer batch writes when available so progress can be tracked across queued writes; otherwise fall back to one-record-at-a-time replication.
    const canUseBatchApi = bulkActionHasBatchWriteApi(apiClient, mode);

    if (preparedOperations.length) {
        if (canUseBatchApi) {
            if (mode === 'update') {
                await apiClient.updateRecords(sceneId, apiViewId, preparedOperations, {
                    continueOnError: true,
                    onProgress: onBatchProgress
                });
            } else {
                await apiClient.createRecords(sceneId, apiViewId, preparedOperations.map((operation) => operation.data), {
                    continueOnError: true,
                    requireRecordId: true,
                    onProgress: onBatchProgress
                });
            }
        } else {
            const fallbackFailedIds = await bulkActionReplicateFallback({
                mode,
                operations: preparedOperations,
                api: apiClient,
                sceneId,
                apiViewId,
                sourceStore,
                sourceController,
                sourceViewId,
                options: {
                    ...options,
                    successCallback: action?.successCallback
                }
            });
            failedIds.push(...fallbackFailedIds);
        }
    }

    if (sourceController) {
        const successCount = Math.max(0, recordIds.length - failedIds.length);
        sourceController.patchRunState({
            isRunning: false,
            processed: recordIds.length,
            success: successCount,
            failed: failedIds.length,
            completionMessage: failedIds.length
                ? `Done: ${successCount} ok, ${failedIds.length} failed.`
                : `Done: ${successCount} ok.`
        });
        if (!failedIds.length) {
            sourceController.basketModal.close();
        }
    }

    await bulkActionCloseModalIfOpen();
    bulkActionRestoreHashState({
        path: bulkState?.sourceHashPath,
        query: bulkState?.sourceHashQuery
    });

    if (typeof apiClient.refreshView === 'function' && document.getElementById(sourceViewId)) {
        try {
            await apiClient.refreshView(sourceViewId);
        } catch (_) {}
    }

    return {
        failedIds,
        total: recordIds.length
    };
}

/**
 * Registers the event workflow that links a form view back to its source basket.
 * @param {Object} [options={}] - Workflow registration options.
 * @returns {void}
 */
function registerBulkActionFormReplicateWorkflow({ namespace = 'KNACK_BULK', action, bulkActionConfig } = {}) {
    const config = createBulkActionConfig({ ...(bulkActionConfig || {}), namespace });
    const formViewId = knackNavigator.normalizeViewId(action?.target);
    if (!formViewId) return;
    const actionKey = knackValueResolver.toStringSafe(action?.key);

    const workflowKey = `${namespace}::${formViewId}::${actionKey || 'default'}`;
    if (bulkActionWorkflowRegistry.has(workflowKey)) return;
    bulkActionWorkflowRegistry.add(workflowKey);

    const sessionKey = bulkActionBuildFormFlowSessionKey(namespace, formViewId);
    const viewRenderEvent = `knack-view-render.${formViewId}`;
    const formSubmitEvent = `knack-form-submit.${formViewId}`;
    const anyViewRenderEvent = 'knack-view-render.any';
    const modalClosedEvent = 'KTL.modalClosed';
    const knackModalCloseEvent = 'knack-modal-close';
    const workflowMatchesState = (bulkState) => {
        const activeActionKey = knackValueResolver.toStringSafe(bulkState?.actionKey);
        return !actionKey || !activeActionKey || activeActionKey === actionKey;
    };

    const handleFormClosed = (closedViewId = '', callback = null) => {
        const bulkState = bulkActionReadFormFlowState(sessionKey);
        if (!bulkState) return false;
        if (!workflowMatchesState(bulkState)) return false;

        const activeFormViewId = knackNavigator.normalizeViewId(bulkState.activeFormViewId || formViewId);
        const closeContext = {
            sessionKey,
            bulkState,
            formViewId: activeFormViewId || knackNavigator.normalizeViewId(formViewId)
        };

        return handleModalClosed({
            activeViewId: activeFormViewId,
            closedViewId,
            context: closeContext,
            callback: ({ context }) => {
                bulkActionResetPendingFormFlow(sessionKey);
                if (typeof callback === 'function') {
                    callback(context || closeContext);
                }
            }
        });
    };

    $(document).on(viewRenderEvent, function (_, view, renderData) {
        const bulkState = bulkActionReadFormFlowState(sessionKey);
        if (!bulkState) return;
        if (!workflowMatchesState(bulkState)) return;

        const createdAt = Number(bulkState.createdAt || 0);
        if (createdAt && Date.now() - createdAt > config.constants.formFlowTtlMs) {
            bulkActionClearFormFlowState(sessionKey);
            return;
        }

        const stateToken = knackValueResolver.toStringSafe(bulkState.navToken);
        const hashToken = bulkActionGetHashQueryParam('coBulkToken');
        if (!stateToken || !hashToken || stateToken !== hashToken) return;

        const renderedViewId = knackNavigator.normalizeViewId(view?.key);
        const viewElement = bulkActionFindViewRoot(renderedViewId);
        if (!renderedViewId || !viewElement) return;

        bulkActionMergeFormFlowState(sessionKey, {
            tokenVerifiedAt: Date.now(),
            activeFormViewId: renderedViewId,
            formFieldKeys: bulkActionGetFormFieldKeys(view),
            renderRecord: bulkActionGetRenderedFormRecord(renderData)
        }, bulkState);

        bulkActionRenderFormNotice({
            viewElement,
            bulkState,
            messages: action?.messages?.formReplicate || {},
            noticeClass: config.form.noticeClass
        });

        if (String(bulkState.formMode || 'create').toLowerCase() === 'update') return;

        const firstRecordId = bulkActionUniqueStrings(bulkState.recordIds || [])[0] || '';
        if (!firstRecordId || !bulkState.recordFieldId) return;

        bulkActionSetChosenSelectValue({
            viewId: renderedViewId,
            fieldKey: bulkState.recordFieldId,
            value: firstRecordId,
            label: bulkState.firstRecordLabel,
            updateEvent: config.form.chosenUpdateEvent
        });
    });

    $(document).on(anyViewRenderEvent, function (_, view) {
        const bulkState = bulkActionReadFormFlowState(sessionKey);
        if (!bulkState) return;
        if (!workflowMatchesState(bulkState)) return;

        const sourceViewId = knackNavigator.normalizeViewId(bulkState.sourceViewId);
        const activeFormViewId = knackNavigator.normalizeViewId(bulkState.activeFormViewId || formViewId);
        const renderedViewId = knackNavigator.normalizeViewId(view?.key);
        if (!sourceViewId || !renderedViewId || renderedViewId !== sourceViewId) return;
        if (activeFormViewId && renderedViewId === activeFormViewId) return;

        handleFormClosed();
    });

    $(document).on(modalClosedEvent, function (_, closedViewId) {
        handleFormClosed(closedViewId);
    });

    $(document).on(knackModalCloseEvent, function () {
        window.setTimeout(() => {
            const bulkState = bulkActionReadFormFlowState(sessionKey);
            if (!bulkState) return;
            if (!workflowMatchesState(bulkState)) return;

            const sourceViewId = knackNavigator.normalizeViewId(bulkState.sourceViewId);
            const activeFormViewId = knackNavigator.normalizeViewId(bulkState.activeFormViewId || formViewId);
            const sourceViewVisible = Boolean(sourceViewId && bulkActionFindViewRoot(sourceViewId));
            const activeFormVisible = Boolean(activeFormViewId && bulkActionFindViewRoot(activeFormViewId));
            if (sourceViewVisible && !activeFormVisible) {
                handleFormClosed(activeFormViewId);
            }
        }, 0);
    });

    $(document).on(formSubmitEvent, async function (_, view, record) {
        const bulkState = bulkActionReadFormFlowState(sessionKey);
        if (!bulkState) return;
        if (!workflowMatchesState(bulkState)) return;

        const createdAt = Number(bulkState.createdAt || 0);
        if (createdAt && Date.now() - createdAt > config.constants.formFlowTtlMs) {
            bulkActionClearFormFlowState(sessionKey);
            return;
        }

        const stateToken = knackValueResolver.toStringSafe(bulkState.navToken);
        const hashToken = bulkActionGetHashQueryParam('coBulkToken');
        if (!stateToken || !hashToken || stateToken !== hashToken) return;

        const submitViewId = knackNavigator.normalizeViewId(view?.key);
        const activeFormViewId = knackNavigator.normalizeViewId(bulkState.activeFormViewId || formViewId);
        if (activeFormViewId && submitViewId !== activeFormViewId) return;

        const sourceViewId = knackNavigator.normalizeViewId(bulkState.sourceViewId);
        const sourceController = sourceViewId ? bulkActionControllerStore.get(sourceViewId) || null : null;
        const latestBulkState = (() => {
            const persistedState = bulkActionReadFormFlowState(sessionKey) || bulkState;
            const submitFieldKeys = bulkActionNormalizeFieldKeys(persistedState?.formFieldKeys);

            return {
                ...persistedState,
                activeFormViewId: submitViewId,
                formFieldKeys: submitFieldKeys
            };
        })();

        const resolvedApi = bulkActionResolveReplicationApi(config.action.api);
        const mode = String(bulkState.formMode || 'create').toLowerCase() === 'update' ? 'update' : 'create';
        const hasRequiredApi = mode === 'update'
            ? (typeof resolvedApi.updateRecords === 'function' || typeof resolvedApi.updateRecord === 'function')
            : (typeof resolvedApi.createRecords === 'function' || typeof resolvedApi.createRecord === 'function');
        if (!hasRequiredApi) {
            bulkActionClearFormFlowState(sessionKey);
            sourceController?.resetFormActionState?.();
            bulkActionNotify(`Bulk action API callbacks are missing ${mode} handlers.`, 'error', config.action);
            return;
        }

        const actionWithApi = {
            ...action,
            sceneId: knackNavigator.getSceneInfoForView(submitViewId)?.key || '',
            bulkActionsApi: KnackBulkActions
        };

        try {
            await bulkActionCloseModalIfOpen();

            const result = await replicateBulkActionSubmittedRecord({
                action: actionWithApi,
                bulkState: { ...latestBulkState, namespace },
                record,
                api: resolvedApi,
                options: { ...config.action, namespace, formViewId: submitViewId }
            });

            bulkActionClearFormFlowState(sessionKey);

            const successCount = Math.max(0, Number(result?.total || 0) - Number(result?.failedIds?.length || 0));
            if (result?.failedIds?.length) {
                bulkActionNotify(`Completed ${successCount} item(s); ${result.failedIds.length} failed.`, 'warning', config.action);
            } else {
                bulkActionNotify(`Completed ${successCount} item(s).`, 'success', config.action);
            }
        } catch (error) {
            bulkActionClearFormFlowState(sessionKey);
            sourceController?.resetFormActionState?.();
            bulkActionReportError(error, { targetViewId: submitViewId, sourceViewId: bulkState.sourceViewId }, 'Bulk form submit replicate failed', config.action);
            bulkActionNotify('Bulk form replication failed.', 'error', config.action);
        }
    });
}

/**
 * Mounts a bulk-action grid controller from parsed keyword context.
 * @param {Object} context - Parsed keyword context.
 * @param {Object} [options={}] - Mount options.
 * @returns {BulkActionGridController|null} Initialised controller.
 */
function mountBulkActionGrid(context, options = {}) {
    const viewId = knackNavigator.normalizeViewId(context?.viewId);
    const config = bulkActionObjectOrEmpty(context?.config);
    if (!viewId || !Array.isArray(config?.actions) || !config.actions.length || !Array.isArray(config?.labelFieldIds) || !config.labelFieldIds.length) {
        return null;
    }

    const bulkActionConfig = createBulkActionConfig(options.bulkActionConfig);

    const controller = new BulkActionGridController({
        viewId,
        rowRecords: Array.isArray(context?.data) ? context.data : [],
        labelFieldIds: config.labelFieldIds,
        actions: config.actions,
        bulkActionsApi: context?.bulkActions || KnackBulkActions,
        bulkActionConfig
    });

    return controller.init();
}

/**
 * Processes and mounts the bulk-action keyword for a single view.
 * @param {Object} view - Knack view metadata.
 * @param {Object} keywords - Parsed keyword object.
 * @param {*} data - Render data.
 * @param {Object} [options={}] - Mount options.
 * @returns {*} Mount result.
 */
function mountBulkActionKeyword(view, keywords, data, options = {}) {
    return processBulkActionsKeyword(view, keywords, data, {
        ...options,
        onKeyword(context) {
            if (typeof options.onKeyword === 'function') {
                options.onKeyword(context);
            }

            return mountBulkActionGrid(context, options);
        }
    });
}

/**
 * Parses a bulk-actions keyword and returns the processed context.
 * @param {Object} view - Knack view metadata.
 * @param {Object} keywords - Parsed keyword object.
 * @param {*} data - Render data.
 * @param {Object} [options={}] - Processing options.
 * @returns {*} Keyword processing result.
 */
function processBulkActionsKeyword(view, keywords, data, options = {}) {
    const keywordName = knackValueResolver.toStringSafe(options.keywordName || '_bulk_actions') || '_bulk_actions';
    const viewId = knackNavigator.normalizeViewId(view?.key);
    if (!viewId || !keywords?.[keywordName]) return null;

    const parseOptions = options.parseOptions || {};
    const bulkActionsApi = options.bulkActionsApi && typeof options.bulkActionsApi.parseKeywordGroups === 'function'
        ? options.bulkActionsApi
        : createKnackBulkActions(options);
    const config = bulkActionsApi.parseKeywordGroups(keywords, {
        ...parseOptions,
        sourceViewId: parseOptions.sourceViewId || viewId
    });

    if (options.logWarnings !== false && Array.isArray(config?.warnings)) {
        config.warnings.forEach((warning) => {
            console.warn('[KnackBulkActions]', warning.message, {
                viewId,
                keywordName,
                warning
            });
        });
    }

    const context = {
        view,
        viewId,
        keywords,
        data,
        keywordName,
        config,
        bulkActions: bulkActionsApi
    };

    if (typeof options.onKeyword === 'function') {
        return options.onKeyword(context);
    }

    return context;
}

/**
 * Creates a configured bulk-actions API facade.
 * @param {Object} [options={}] - Shared bulk-actions configuration.
 * @returns {Object} Bulk-actions API.
 */
function createKnackBulkActions(options = {}) {
    const config = { ...options };
    const sharedBulkActionConfig = createBulkActionConfig(config.bulkActionConfig);
    const withConfig = (overrides = {}) => ({
        ...config,
        ...overrides,
        bulkActionConfig: overrides.bulkActionConfig
            ? mergeBulkActionConfig(sharedBulkActionConfig, overrides.bulkActionConfig)
            : sharedBulkActionConfig
    });

    const api = {
        normalizeFieldId: knackNavigator.normalizeFieldId.bind(knackNavigator),
        normalizeViewId: knackNavigator.normalizeViewId.bind(knackNavigator),
        getFieldChoiceOptions: knackNavigator.getFieldChoiceOptions.bind(knackNavigator),
        getFieldValueMeta: knackValueResolver.getFieldValueMeta.bind(knackValueResolver),
        getRecordLabel: knackValueResolver.getRecordLabel.bind(knackValueResolver),
        classifyFailure: classifyBulkActionFailure,
        resolveRegistryCallback: bulkActionResolveRegistryCallback,
        normalizeKeywordGroupsInput: normalizeBulkActionKeywordGroupsInput,
        parseKeywordGroups(keywordGroups, parseOptions) {
            return parseBulkActionKeywordGroups(keywordGroups, withConfig(parseOptions));
        },
        createBasketStore(storeOptions) {
            return createBulkActionBasketStore(withConfig(storeOptions));
        },
        createActionRunner(runnerOptions) {
            return createBulkActionRunner(withConfig(runnerOptions));
        },
        mountGrid(context, mountOptions) {
            return mountBulkActionGrid(context, withConfig(mountOptions));
        },
        mountKeyword(view, keywords, data, mountOptions) {
            return mountBulkActionKeyword(view, keywords, data, withConfig(mountOptions));
        },
        processKeyword(view, keywords, data, processOptions) {
            return processBulkActionsKeyword(view, keywords, data, {
                ...withConfig(processOptions),
                bulkActionsApi: api
            });
        }
    };

    return api;
}

const KnackBulkActions = {
    normalizeFieldId: knackNavigator.normalizeFieldId.bind(knackNavigator),
    normalizeViewId: knackNavigator.normalizeViewId.bind(knackNavigator),
    getFieldChoiceOptions: knackNavigator.getFieldChoiceOptions.bind(knackNavigator),
    getFieldValueMeta: knackValueResolver.getFieldValueMeta.bind(knackValueResolver),
    getRecordLabel: knackValueResolver.getRecordLabel.bind(knackValueResolver),
    classifyFailure: classifyBulkActionFailure,
    resolveRegistryCallback: bulkActionResolveRegistryCallback,
    normalizeKeywordGroupsInput: normalizeBulkActionKeywordGroupsInput,
    parseKeywordGroups: parseBulkActionKeywordGroups,
    createBasketStore: createBulkActionBasketStore,
    createActionRunner: createBulkActionRunner,
    mountGrid: mountBulkActionGrid,
    mountKeyword: mountBulkActionKeyword,
    createKnackBulkActions,
    processKeyword: processBulkActionsKeyword
};

if (typeof globalThis !== 'undefined') {
    globalThis.KnackBulkActions = {
        ...(globalThis.KnackBulkActions || {}),
        ...KnackBulkActions
    };
    globalThis.createKnackBulkActions = createKnackBulkActions;
    globalThis.processBulkActionsKeyword = processBulkActionsKeyword;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: leftovers
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Leftover helpers ported as-is (V1 already native; jQuery only where Knack forces it: pickers, Chosen, Knack events). Analyses C11, C12, C16, C18, C19, C21, C22, C24, C25.

/**
 * Renders or removes a lightweight floating version indicator.
 * Callers provide the already-normalised text plus any app-specific id or class names.
 * @param {string} text - Version text to display. Empty text removes the indicator.
 * @param {Object} [options={}] - Rendering options.
 * @returns {void}
 */
function renderVersionIndicator(text, options = {}) {
    const {
        indicatorId = 'kf-version-indicator',
        className = 'kf-version-indicator',
        container = document.body,
    } = options;

    if (!(container instanceof HTMLElement)) {
        return;
    }

    const versionText = knackValueResolver.toStringSafe(text);
    let versionElement = document.getElementById(String(indicatorId || '').trim());

    if (!versionText) {
        if (versionElement instanceof HTMLElement) {
            versionElement.remove();
        }
        return;
    }

    if (!(versionElement instanceof HTMLElement)) {
        versionElement = document.createElement('div');
        versionElement.id = String(indicatorId || '').trim() || 'kf-version-indicator';
        container.appendChild(versionElement);
    }

    versionElement.className = String(className || '').trim() || 'kf-version-indicator';
    versionElement.textContent = versionText;
}

/**
 * Adds event listeners to an element (or selector) for input-related events.
 *
 * Rules:
 * - Uses native addEventListener for normal fields
 * - Uses jQuery only for:
 *   - Chosen change events
 *   - jQuery UI datepicker calendar selections (onSelect)
 *   - jQuery timepicker selections (onSelect)
 *
 * @param {HTMLElement|NodeList|Array<HTMLElement>|string} target - Element, collection, or selector
 * @param {Function} callback - Function(event, element) to call on event
 * @param {Object} [options] - Optional settings
 * @param {string|string[]} [options.events='change'] - Event(s) to listen for
 * @param {string|null} [options.delegate=null] - Selector for event delegation
 * @param {boolean} [options.runOnInit=false] - If true, runs callback once per matched element
 * @returns {HTMLElement[]} List of elements that were wired (or matched for init)
 */
function addInputEventListener(target, callback, options = {}) {
    const {
        events = 'change',
        delegate = null,
        runOnInit = false
    } = options;

    const eventList = Array.isArray(events) ? events : [events];
    const wired = [];

    const hasJq = () => !!(window.jQuery && window.jQuery.fn);
    const jq = () => window.jQuery;

    const isChosenSelect = (el) => {
        if (!el || el.tagName !== 'SELECT') return false;

        const cls = el.classList;
        if (cls && (cls.contains('chosen-select') || cls.contains('chzn-select'))) return true;

        // Chosen typically inserts a sibling container after the <select>
        const next = el.nextElementSibling;
        if (next && next.classList && (next.classList.contains('chosen-container') || next.classList.contains('chzn-container'))) return true;

        return false;
    };

    const isDatepickerInput = (el) => {
        // jQuery UI datepicker adds 'hasDatepicker' class to the input it is attached to
        return !!(el && el.classList && el.classList.contains('hasDatepicker'));
    };

    const isTimepickerInput = (el) => {
        // jQuery timepicker commonly marks attached input with ui-timepicker-input
        return !!(el && el.classList && el.classList.contains('ui-timepicker-input'));
    };

    const getInputLikeElements = (root) => {
        if (!root) return [];
        const tag = (root.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return [root];
        return Array.from(root.querySelectorAll('input, select, textarea'));
    };

    const runInitFor = (elements) => {
        if (!runOnInit) return;
        elements.forEach((el) => {
            try { callback(null, el); } catch (_) {}
        });
    };

    const addNative = (el, type, handler) => {
        el.addEventListener(type, handler, false);
    };

    const addChosenJqDirect = (selectEl) => {
        if (!hasJq()) return false;
        try {
            const j = jq();
            j(selectEl)
                .off('change.ktl_chosen')
                .on('change.ktl_chosen', function (e) {
                    callback(e, selectEl);
                });
            return true;
        } catch (_) {
            return false;
        }
    };

    const addChosenJqDelegated = (rootEl) => {
        if (!hasJq() || !delegate) return false;
        try {
            const j = jq();
            j(rootEl).off('change.ktl_delegate_chosen');
            j(rootEl).on(
                'change.ktl_delegate_chosen',
                `${delegate} select.chosen-select, ${delegate} select.chzn-select, ${delegate}.chosen-select, ${delegate}.chzn-select`,
                function (e) {
                    callback(e, this);
                }
            );
            return true;
        } catch (_) {
            return false;
        }
    };

    const wireDatepickerOnSelect = (inputEl) => {
        if (!hasJq()) return;
        const j = jq();

        if (typeof j.fn.datepicker !== 'function') return;
        if (!isDatepickerInput(inputEl)) return;

        try {
            const inputJq = j(inputEl);
            let existingOnSelect = null;

            try {
                existingOnSelect = inputJq.datepicker('option', 'onSelect');
            } catch (_) {
                existingOnSelect = null;
            }

            inputJq.datepicker('option', 'onSelect', function (dateText, inst) {
                if (typeof existingOnSelect === 'function') {
                    try { existingOnSelect.call(this, dateText, inst); } catch (_) {}
                }

                const syntheticEvent = {
                    type: 'datepicker',
                    dateText: dateText,
                    target: inputEl
                };

                try { callback(syntheticEvent, inputEl); } catch (_) {}
            });
        } catch (_) {
            // Non-critical enhancement: ignore
        }
    };

    const wireTimepickerOnSelect = (inputEl) => {
        if (!hasJq()) return;
        const j = jq();

        if (typeof j.fn.timepicker !== 'function') return;
        if (!isTimepickerInput(inputEl)) return;

        try {
            const inputJq = j(inputEl);
            let existingOnSelect = null;

            try {
                existingOnSelect = inputJq.timepicker('option', 'onSelect');
            } catch (_) {
                existingOnSelect = null;
            }

            inputJq.timepicker('option', 'onSelect', function (timeText, inst) {
                if (typeof existingOnSelect === 'function') {
                    try { existingOnSelect.call(this, timeText, inst); } catch (_) {}
                }

                if (typeof timeText === 'string') {
                    inputEl.value = timeText;
                }

                const syntheticEvent = {
                    type: 'timepicker',
                    timeText: timeText,
                    target: inputEl
                };

                window.setTimeout(function () {
                    try { callback(syntheticEvent, inputEl); } catch (_) {}
                }, 0);
            });
        } catch (_) {
            // Non-critical enhancement: ignore
        }
    };

    const wireTimepickerEvents = (inputEl) => {
        if (!hasJq()) return;
        if (!inputEl || inputEl.tagName !== 'INPUT') return;

        try {
            const j = jq();
            const inputJq = j(inputEl);

            inputJq
                .off('changeTime.ktl_timepicker selectTime.ktl_timepicker')
                .on('changeTime.ktl_timepicker selectTime.ktl_timepicker', function (e) {
                    try { callback(e, inputEl); } catch (_) {}
                });
        } catch (_) {
            // Non-critical enhancement: ignore
        }
    };

    const attachToRoot = (rootEl) => {
        if (!(rootEl instanceof Element)) return;

        // Delegated mode
        if (delegate) {
            const delegateMatches = Array.from(rootEl.querySelectorAll(delegate));

            const includesChosen = delegateMatches.some((m) => {
                if (!m) return false;
                if (isChosenSelect(m)) return true;
                return !!m.querySelector && (!!m.querySelector('select.chosen-select') || !!m.querySelector('select.chzn-select'));
            });

            if (includesChosen && addChosenJqDelegated(rootEl)) {
                wired.push(rootEl);
            } else {
                eventList.forEach((type) => {
                    addNative(rootEl, type, function (e) {
                        const hit = (e.target && e.target.closest) ? e.target.closest(delegate) : null;
                        if (!hit) return;
                        if (!rootEl.contains(hit)) return;
                        try { callback(e, hit); } catch (_) {}
                    });
                });
                wired.push(rootEl);
            }

            runInitFor(delegateMatches);
            return;
        }

        // Non-delegated
        const fields = getInputLikeElements(rootEl);
        if (!fields.length) return;

        fields.forEach((fieldEl) => {
            wireDatepickerOnSelect(fieldEl);
            wireTimepickerOnSelect(fieldEl);
            wireTimepickerEvents(fieldEl);

            if (isChosenSelect(fieldEl)) {
                if (addChosenJqDirect(fieldEl)) {
                    wired.push(fieldEl);
                    return;
                }
            }

            eventList.forEach((type) => {
                addNative(fieldEl, type, function (e) {
                    try { callback(e, fieldEl); } catch (_) {}
                });
            });

            wired.push(fieldEl);
        });

        runInitFor(fields);
    };

    resolveElements(target).forEach(attachToRoot);

    return wired;
}

/**
 * Waits for an element that matches the selector and optionally contains specific text to appear in the DOM
 * @param {Object} options - Configuration options
 * @param {string} options.selector - CSS selector to wait for
 * @param {function|string|Object} [options.textCondition=null] - Optional text content to match or custom condition callback
 *                                                If object: {text: string, exact: boolean}
 * @param {string} [options.returnType='element'] - Type of return: 'element', 'elements', 'empty' for just success
 * @param {number} [options.timeout=10000] - Maximum time to wait in milliseconds
 * @returns {Promise<Element|Element[]|boolean>} - Resolves with the element(s) or true, rejects on timeout
 */
async function waitSelector({
    selector,
    textCondition = null,
    returnType = 'element',
    timeout = 10000
}) {
    return new Promise((resolve, reject) => {
        // Declare observer variable at the top of the function scope
        let observer = null;
        let timeoutId = null;

        // Check if element already exists
        const checkForElement = () => {
            let result = null;
            // Process text condition to determine matching function
            let textMatch = null;
            let isExactMatch = false;

            if (textCondition) {
                if (typeof textCondition === 'string') {
                    textMatch = textCondition;
                    isExactMatch = false; // Default to includes for backward compatibility
                } else if (typeof textCondition === 'object' && textCondition !== null) {
                    textMatch = textCondition.text;
                    isExactMatch = !!textCondition.exact;
                }
            }

            // Function to check if element's text content matches condition
            const matchesText = (el) => {
                if (!textMatch) return true;
                const content = el.textContent.trim();
                return isExactMatch ? content === textMatch : content.includes(textMatch);
            };

            if (returnType === 'elements') {
                result = document.querySelectorAll(selector);
                if (result.length > 0) {
                    // Filter by text content if needed
                    if (textMatch) {
                        result = Array.from(result).filter(matchesText);
                        if (result.length === 0) return; // No matches, keep waiting
                    }

                    if (!textCondition || typeof textCondition === 'string' ||
                        typeof textCondition === 'object' || textCondition(result)) {
                        if (observer) observer.disconnect();
                        clearTimeout(timeoutId);
                        resolve(result);
                    }
                }
            } else {
                if (textMatch) {
                    // Find elements that match both selector and text content
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if (matchesText(el)) {
                            result = el;
                            break;
                        }
                    }
                } else {
                    result = document.querySelector(selector);
                }

                if (result) {
                    if (!textCondition || typeof textCondition === 'string' ||
                        typeof textCondition === 'object' || textCondition(result)) {
                        if (observer) observer.disconnect();
                        clearTimeout(timeoutId);
                        resolve(returnType === 'empty' ? true : result);
                    }
                }
            }
        };

        // Check immediately in case the element already exists
        checkForElement();

        // Set up a timeout to reject the promise if the element doesn't appear
        timeoutId = setTimeout(() => {
            if (observer) observer.disconnect();
            let textInfo = '';
            if (textCondition) {
                if (typeof textCondition === 'string') {
                    textInfo = ` with text: ${textCondition}`;
                } else if (typeof textCondition === 'object' && textCondition.text) {
                    textInfo = ` with ${textCondition.exact ? 'exact ' : ''}text: ${textCondition.text}`;
                }
            }
            reject(new Error(`Timeout waiting for selector: ${selector}${textInfo} after ${timeout}ms`));
        }, timeout);

        // Use MutationObserver to watch for DOM changes
        observer = new MutationObserver((mutations, obs) => {
            checkForElement();
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
    });
}

/**
 * Read date/time values from a Knack datetime wrapper.
 * @param {HTMLElement|null} fieldWrap
 * @returns {{date: string, time: string}}
 */
function getDateTimeParts(fieldWrap) {
    if (!fieldWrap) return { date: '', time: '' };
    const dateInput = fieldWrap.querySelector('.kn-datetime input[name="date"], input.knack-date-input, input[name="date"]');
    const timeInput = fieldWrap.querySelector('.kn-datetime input[name="time"], input.kn-time-input, input[name="time"]');
    const hoursSelect = fieldWrap.querySelector('select[name="hours"]');
    const minutesSelect = fieldWrap.querySelector('select[name="minutes"]');
    const amPmSelect = fieldWrap.querySelector('select[name="am_pm"]');
    const dateValue = dateInput ? String(dateInput.value || '').trim() : '';

    if (timeInput) {
        return {
            date: dateValue,
            time: String(timeInput.value || '').trim().replace(/\s+/g, ''),
        };
    }

    if (hoursSelect instanceof HTMLSelectElement && minutesSelect instanceof HTMLSelectElement) {
        const hours = String(hoursSelect.value || '').trim();
        const minutes = String(minutesSelect.value || '').trim();
        const amPm = amPmSelect instanceof HTMLSelectElement ? String(amPmSelect.value || '').trim().toLowerCase() : '';
        return {
            date: dateValue,
            time: hours && minutes ? `${hours}:${minutes}${amPm}` : '',
        };
    }

    return {
        date: dateValue,
        time: '',
    };
}

/**
 * Write date/time values to a Knack datetime wrapper.
 * @param {HTMLElement|null} fieldWrap
 * @param {{date?: string, time?: string}} [parts]
 * @param {{emitEvents?: boolean}} [options]
 * @returns {void}
 */
function setDateTimeParts(fieldWrap, parts = {}, options = {}) {
    if (!fieldWrap) return;
    const emitEvents = options.emitEvents !== false;
    const dateInput = fieldWrap.querySelector('.kn-datetime input[name="date"], input.knack-date-input, input[name="date"]');
    const timeInput = fieldWrap.querySelector('.kn-datetime input[name="time"], input.kn-time-input, input[name="time"]');

    if (dateInput) {
        dateInput.value = parts.date || '';
        if (emitEvents) {
            dateInput.dispatchEvent(new Event('input', { bubbles: true }));
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    if (timeInput) {
        timeInput.value = parts.time || '';
        if (emitEvents) {
            timeInput.dispatchEvent(new Event('input', { bubbles: true }));
            timeInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

/**
 * Read from/to values from a Knack calendar from/to control wrapper.
 * @param {HTMLElement|null} fieldWrap
 * @returns {{from: {date: string, time: string}, to: {date: string, time: string}}}
 */
function getCalendarFromToParts(fieldWrap) {
    if (!fieldWrap) {
        return {
            from: { date: '', time: '' },
            to: { date: '', time: '' },
        };
    }

    const fromDateInput = fieldWrap.querySelector('.kn-datetime input[name="date"]');
    const fromTimeInput = fieldWrap.querySelector('.kn-datetime input[name="time"]');
    const toDateInput = fieldWrap.querySelector('.kn-datetime input[name="to_date"], .kn-datetime input[id$="-to"]:not([id*="-time-"])');
    const toTimeInput = fieldWrap.querySelector('.kn-datetime input[name="to_time"], .kn-datetime input[id$="-time-to"]');

    return {
        from: {
            date: fromDateInput ? fromDateInput.value : '',
            time: fromTimeInput ? fromTimeInput.value : '',
        },
        to: {
            date: toDateInput ? toDateInput.value : '',
            time: toTimeInput ? toTimeInput.value : '',
        },
    };
}

/**
 * Write from/to values to a Knack calendar from/to control wrapper.
 * @param {HTMLElement|null} fieldWrap - #kn-input-field_123
 * @param {{from?: {date?: string, time?: string}, to?: {date?: string, time?: string}}} [parts]
 * @param {{emitEvents?: boolean}} [options]
 * @returns {void}
 */
function setCalendarFromToParts(fieldWrap, parts = {}, options = {}) {
    if (!fieldWrap) return;
    const emitEvents = options.emitEvents !== false;

    const fromDateInput = fieldWrap.querySelector('.kn-datetime input[name="date"]');
    const fromTimeInput = fieldWrap.querySelector('.kn-datetime input[name="time"]');
    const toDateInput = fieldWrap.querySelector('.kn-datetime input[name="to_date"], .kn-datetime input[id$="-to"]:not([id*="-time-"])');
    const toTimeInput = fieldWrap.querySelector('.kn-datetime input[name="to_time"], .kn-datetime input[id$="-time-to"]');

    const setAndTrigger = (input, value) => {
        if (!input) return;
        input.value = value || '';
        if (emitEvents) {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    setAndTrigger(fromDateInput, parts.from?.date);
    setAndTrigger(fromTimeInput, parts.from?.time);
    setAndTrigger(toDateInput, parts.to?.date);
    setAndTrigger(toTimeInput, parts.to?.time);
}

/**
 * Parse UK date/time parts into a Date.
 * Accepts date as dd/mm/yyyy and time as either HH:mm or h:mmam/pm.
 * @param {{date?: string, time?: string}} parts
 * @returns {Date|null}
 */
function parseDateTimeParts(parts) {
    const dateText = String(parts?.date || '').trim();
    const timeText = String(parts?.time || '').trim();
    const dateMatch = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dateMatch) return null;

    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);

    let hours = 0;
    let minutes = 0;
    if (timeText) {
        const ampmMatch = timeText.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
        const twentyFourMatch = timeText.match(/^(\d{1,2}):(\d{2})$/);
        if (ampmMatch) {
            hours = Number(ampmMatch[1]) % 12;
            minutes = Number(ampmMatch[2]);
            if (ampmMatch[3].toLowerCase() === 'pm') hours += 12;
        } else if (twentyFourMatch) {
            hours = Number(twentyFourMatch[1]);
            minutes = Number(twentyFourMatch[2]);
        } else {
            return null;
        }
    }

    return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * Parse a Knack from/to date-time wrapper into local start and end dates.
 * Supports both single and range layouts that expose one or two date/time inputs.
 * @param {HTMLElement|null} fieldWrap
 * @returns {{startDate: Date|null, endDate: Date|null}} Parsed inclusive range.
 * Example return with times:
 * { startDate: new Date(2026, 6, 24, 10, 0, 0, 0), endDate: new Date(2026, 6, 27, 23, 30, 0, 0) }
 * Example return with date-only values:
 * { startDate: new Date(2026, 6, 24, 0, 0, 0, 0), endDate: new Date(2026, 6, 27, 23, 59, 59, 999) }
 */
function parseFromToDate(fieldWrap) {
    if (!(fieldWrap instanceof HTMLElement)) {
        return { startDate: null, endDate: null };
    }

    const dateInputs = Array.from(fieldWrap.querySelectorAll('input.knack-date'));
    const timeInputs = Array.from(fieldWrap.querySelectorAll('input.kn-time'));
    const fromDateText = String(dateInputs?.[0]?.value || '').trim();
    const hasExplicitToDateInput = dateInputs.length > 1;
    const toDateText = hasExplicitToDateInput
        ? String(dateInputs?.[1]?.value || '').trim()
        : String(dateInputs?.[0]?.value || '').trim();
    const fromTimeText = String(timeInputs?.[0]?.value || '').trim();
    const toTimeText = String(timeInputs?.[1]?.value || '').trim();

    if (!fromDateText || !toDateText) {
        return { startDate: null, endDate: null };
    }

    if (hasExplicitToDateInput && !String(dateInputs?.[1]?.value || '').trim()) {
        return { startDate: null, endDate: null };
    }

    const parseBoundaryDate = function (value, endOfDay = false) {
        const parsedDate = parseDateObject(value);
        if (!(parsedDate instanceof Date) || Number.isNaN(parsedDate.getTime())) {
            return null;
        }

        return endOfDay
            ? new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999)
            : new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0);
    };

    const parsedStartDate = parseDateTimeParts({ date: fromDateText, time: fromTimeText }) || parseBoundaryDate(fromDateText, false);
    const parsedEndDate = toTimeText
        ? parseDateTimeParts({ date: toDateText, time: toTimeText }) || parseBoundaryDate(toDateText, true)
        : parseBoundaryDate(toDateText, true);

    if (!(parsedStartDate instanceof Date) || Number.isNaN(parsedStartDate.getTime()) || !(parsedEndDate instanceof Date) || Number.isNaN(parsedEndDate.getTime())) {
        return { startDate: null, endDate: null };
    }

    if (parsedStartDate.getTime() > parsedEndDate.getTime()) {
        return { startDate: parsedEndDate, endDate: parsedStartDate };
    }

    return {
        startDate: parsedStartDate,
        endDate: parsedEndDate,
    };
}

function showHideViewGroupContent(showHideId, delay, flexOn = false) {
    const button = document.getElementById(showHideId);
    const arrow = document.getElementById(`arrow_${showHideId}`);
    const hiddenSection = document.querySelector(`.${showHideId}`);
    const shrinkLink = document.getElementById(`shrink-link_${showHideId}`);

    if (!button || !arrow || !hiddenSection) return;

    // Helper to get computed paddings/margins
    function getBoxSpacing(elem) {
        const style = window.getComputedStyle(elem);
        return {
            paddingTop: style.paddingTop,
            paddingBottom: style.paddingBottom,
            marginTop: style.marginTop,
            marginBottom: style.marginBottom
        };
    }

    // Animate height, padding, and margin for smooth slide
    function slideToggle(elem, duration = 600, displayType = 'block') {
        const isHidden = window.getComputedStyle(elem).display === 'none';
        const spacing = getBoxSpacing(elem);

        if (isHidden) {
            elem.style.removeProperty('display');
            let display = window.getComputedStyle(elem).display;
            if (display === 'none') display = displayType;
            elem.style.display = display;
            elem.style.overflow = 'hidden';
            elem.style.height = '0px';
            elem.style.paddingTop = '0px';
            elem.style.paddingBottom = '0px';
            elem.style.marginTop = '13px';
            elem.style.marginBottom = '0px';
            elem.offsetHeight; // force reflow

            requestAnimationFrame(() => {
                elem.style.transition = [
                    `height ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`
                ].join(', ');
                elem.style.height = elem.scrollHeight + 'px';
                elem.style.paddingTop = spacing.paddingTop;
                elem.style.paddingBottom = spacing.paddingBottom;
                elem.style.marginTop = spacing.marginTop;
                elem.style.marginBottom = spacing.marginBottom;
            });

            setTimeout(() => {
                elem.style.transition = '';
                elem.style.height = 'auto';
                elem.style.overflow = '';
                elem.style.paddingTop = '';
                elem.style.paddingBottom = '';
                elem.style.marginTop = '13px';
                elem.style.marginBottom = '';

                // --- BEGIN: Inserted signature/table group logic ---
                // Find the parent view element (with id starting with "view_")
                let parentView = elem.closest('[id^="view_"]');
                if (parentView) {
                    // Render signatures if needed
                    const signatureElements = parentView.querySelectorAll('.kn-input-signature');
                    const viewId = parentView.id;
                    if (signatureElements.length) knackNavigator.getRenderedView(viewId)?.renderSignatures?.();

                    // Adjust colspan for table group cell
                    const tableGroupCell = parentView.querySelector('.kn-table-group td');
                    const visibleThs = parentView.querySelectorAll('th:not([style*="display: none"])');
                    if (tableGroupCell && visibleThs.length) {
                        const numOfVisibleColumns = visibleThs.length;
                        const currentColspan = parseInt(tableGroupCell.getAttribute('colspan'), 10);
                        if (currentColspan !== numOfVisibleColumns) {
                            tableGroupCell.setAttribute('colspan', numOfVisibleColumns);
                        }
                    }
                }
            }, duration);
        } else {
            elem.style.height = elem.scrollHeight + 'px';
            elem.style.overflow = 'hidden';
            elem.offsetHeight; // force reflow

            requestAnimationFrame(() => {
                elem.style.transition = [
                    `height ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`
                ].join(', ');
                elem.style.height = '0px';
                elem.style.paddingTop = '0px';
                elem.style.paddingBottom = '0px';
                elem.style.marginTop = '13px';
                elem.style.marginBottom = '0px';
            });

            setTimeout(() => {
                elem.style.display = 'none';
                elem.style.transition = '';
                elem.style.height = '';
                elem.style.overflow = '';
                elem.style.paddingTop = '';
                elem.style.paddingBottom = '';
                elem.style.marginTop = '13px';
                elem.style.marginBottom = '';
            }, duration);
        }
    }

    function slideUp(elem, duration = 400) {
        if (window.getComputedStyle(elem).display === 'none') return;
        elem.style.height = elem.scrollHeight + 'px';
        elem.style.overflow = 'hidden';
        elem.offsetHeight; // force reflow

        requestAnimationFrame(() => {
            elem.style.transition = `height ${duration}ms cubic-bezier(0.33,0,0.2,1)`;
            elem.style.height = '0px';
        });

        setTimeout(() => {
            elem.style.display = 'none';
            elem.style.transition = '';
            elem.style.height = '';
            elem.style.overflow = '';
        }, duration);
    }

    button.onclick = function () {
        slideToggle(hiddenSection, delay, flexOn ? 'flex' : 'block');
        arrow.classList.toggle('ktlDown');
        arrow.classList.toggle('ktlUp');
        button.classList.toggle('ktlActive');
        if (flexOn && window.getComputedStyle(hiddenSection).display !== 'none') {
            hiddenSection.style.display = 'flex';
        }
    };

    if (shrinkLink) {
        shrinkLink.onclick = function () {
            slideUp(hiddenSection, delay);
            arrow.classList.toggle('ktlDown');
            arrow.classList.toggle('ktlUp');
            button.classList.remove('ktlActive');
        };
    }
}

/**
 * Adds checkboxes to a table view and handles select/unselect all functionality.
 * Optionally invokes a callback when checkboxes change.
 *
 * @param {string} viewId - The ID of the view.
 * @param {function} [onCheckedChange] - Optional callback invoked on changes.
 * @param {boolean} [addHeaderCheckbox=true] - Whether to add a select-all checkbox to the header.
 *   Signature: ({ type: 'row'|'header', checked: boolean, row?: HTMLTableRowElement,
 *                 viewId: string, checkedCount: number, totalCount: number, headerChecked: boolean, event: Event }) => void
 * @example
 * addCheckboxes('view_1234', ({ type, checked, checkedCount }) => console.log(type, checked, checkedCount));
 */
function addCheckboxes(viewId, onCheckedChange, addHeaderCheckbox = true) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const table = viewElement.querySelector('table.kn-table');
    if (!table) return;

    const headerRow = table.querySelector('thead tr');
    const bodyRows = table.querySelectorAll('tbody tr:not(.kn-tr-nodata)');

    // Always ensure a placeholder header cell exists for alignment
    let headerCheckboxTh = headerRow.querySelector('th.header-checkbox-th');
    if (!headerCheckboxTh) {
        headerCheckboxTh = document.createElement('th');
        headerCheckboxTh.className = 'header-checkbox-th';
    }
    // Ensure placeholder is first column
    if (headerRow.firstChild !== headerCheckboxTh) {
        headerRow.insertBefore(headerCheckboxTh, headerRow.firstChild);
    }

    // Conditionally add/remove the select-all checkbox input
    let headerCheckbox = null;
    if (addHeaderCheckbox) {
        headerCheckbox = headerCheckboxTh.querySelector('input[type="checkbox"]');
        if (!headerCheckbox) {
            headerCheckbox = document.createElement('input');
            headerCheckbox.type = 'checkbox';
            headerCheckbox.className = 'header-checkbox';
            headerCheckboxTh.appendChild(headerCheckbox);
        }
    } else {
        const existingHeaderCb = headerCheckboxTh.querySelector('input[type="checkbox"]');
        if (existingHeaderCb) existingHeaderCb.remove();
    }

    // Add row checkboxes if not already present
    bodyRows.forEach(row => {
        let checkboxTd = row.querySelector('td.row-checkbox-td');
        if (!checkboxTd) {
            checkboxTd = document.createElement('td');
            checkboxTd.className = 'row-checkbox-td';
            checkboxTd.style.maxWidth = '32px';
            const rowCheckbox = document.createElement('input');
            rowCheckbox.type = 'checkbox';
            rowCheckbox.className = 'row-checkbox';
            checkboxTd.appendChild(rowCheckbox);
            row.insertBefore(checkboxTd, row.firstChild);

            addInputEventListener(rowCheckbox, function (e) {
                const allChecked = Array.from(table.querySelectorAll(`tbody tr:not(.kn-tr-nodata) ${INPUT_CHECKBOX_SELECTOR}`))
                    .every(cb => cb.checked);
                if (headerCheckbox) headerCheckbox.checked = allChecked;

                // Invoke callback for row checkbox change
                if (typeof onCheckedChange === 'function') {
                    const checkedCount = table.querySelectorAll('tbody tr:not(.kn-tr-nodata) input[type="checkbox"].row-checkbox:checked').length;
                    onCheckedChange({
                        type: 'row',
                        checked: rowCheckbox.checked,
                        row,
                        viewId,
                        checkedCount,
                        totalCount: bodyRows.length,
                        headerChecked: !!headerCheckbox?.checked,
                        event: e || null
                    });
                }
            }, { events: 'change' });
        }
    });

    if (headerCheckbox) {
        addInputEventListener(headerCheckbox, function (e) {
            const isChecked = headerCheckbox.checked;
            bodyRows.forEach(row => {
                const cb = row.querySelector(`td.row-checkbox-td ${INPUT_CHECKBOX_SELECTOR}`);
                if (cb) cb.checked = isChecked;
            });

            // Invoke callback for header checkbox change (after rows updated)
            if (typeof onCheckedChange === 'function') {
                const checkedCount = isChecked
                    ? bodyRows.length
                    : 0;
                onCheckedChange({
                    type: 'header',
                    checked: isChecked,
                    viewId,
                    checkedCount,
                    totalCount: bodyRows.length,
                    headerChecked: !!headerCheckbox.checked,
                    event: e || null
                });
            }
        }, { events: 'change' });
    }
}

/**
 * Adds a checkbox to each table header cell in a Knack view (does not add to rows).
 * Only adds a checkbox if the header cell has a class starting with "field_".
 * Ensures the checkbox is the first child and inline with the header text.
 * Optionally accepts a callback that receives an array of field IDs for checked headers.
 * Uses addInputEventListener for event handling.
 * @param {string} viewId - The ID of the view containing the table.
 * @param {function} [onCheckedChange] - Optional callback: (checkedFieldIds: string[]) => void
 * @example
 * addCheckboxesToHeaders('view_1234', checkedIds => { console.log(checkedIds); });
 */
function addCheckboxesToHeaders(viewId, onCheckedChange) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const table = viewElement.querySelector('table.kn-table');
    if (!table) return;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return;

    Array.from(headerRow.children).forEach(th => {
        // Only add checkbox if th has a class starting with "field_"
        const fieldClass = Array.from(th.classList).find(cls => cls.startsWith('field_'));
        if (!fieldClass) return;

        // Wrap existing content in a flex container if not already
        let flexWrap = th.querySelector('.header-flex-wrap');
        if (!flexWrap) {
            flexWrap = document.createElement('span');
            flexWrap.className = 'header-flex-wrap';
            flexWrap.style.display = 'inline-flex';
            flexWrap.style.alignItems = 'center';
            flexWrap.style.gap = '4px';

            // Move all th children into the flexWrap
            while (th.firstChild) {
                flexWrap.appendChild(th.firstChild);
            }
            th.appendChild(flexWrap);
        }

        // Add checkbox if not already present
        if (!flexWrap.querySelector(INPUT_CHECKBOX_SELECTOR)) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'header-checkbox';
            checkbox.style.verticalAlign = 'middle';
            checkbox.style.marginRight = '6px';
            flexWrap.insertBefore(checkbox, flexWrap.firstChild);
        } else {
            // Ensure checkbox is first and styled
            const existing = flexWrap.querySelector(INPUT_CHECKBOX_SELECTOR);
            if (existing !== flexWrap.firstChild) {
                flexWrap.insertBefore(existing, flexWrap.firstChild);
            }
            existing.style.verticalAlign = 'middle';
            existing.style.marginRight = '6px';
        }
    });

    // If a callback is provided, set up listeners for all header checkboxes
    if (typeof onCheckedChange === 'function') {
        const headerCheckboxes = headerRow.querySelectorAll(`${INPUT_CHECKBOX_SELECTOR}.header-checkbox`);
        addInputEventListener(headerCheckboxes, function () {
            const checkedFieldIds = Array.from(headerCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => {
                    const th = cb.closest('th');
                    if (!th) return null;
                    const fieldClass = Array.from(th.classList).find(cls => cls.startsWith('field_'));
                    return fieldClass ? fieldClass.replace('field_', '') : null;
                })
                .filter(Boolean);
            onCheckedChange(checkedFieldIds);
        }, { events: 'change' });
    }
}

/**
 * Wire a form so a controlling input can temporarily hide empty required fields.
 * Required fields are detected from Knack view metadata and rendered required markers.
 * @param {string} viewId - Knack view id.
 * @param {Object} [options={}] - Visibility configuration.
 * @param {string|number} options.controllerFieldId - Field id for the controlling input.
 * @param {Function} [options.isEnabled] - Optional predicate returning whether hiding is active.
 * @param {Function} [options.fieldHasValue] - Optional predicate `(fieldWrap, context) => boolean`.
 * @param {Function} [options.resolveVisibilityTarget] - Optional target resolver `(fieldWrap, context) => HTMLElement`.
 * @param {Array<string|number>} [options.excludeFieldIds=[]] - Additional field ids to exclude.
 * @param {string|string[]} [options.events=['change','input']] - Events that should recalculate visibility.
 * @param {string} [options.delegate='input, select, textarea'] - Delegated selector for input changes.
 * @param {string} [options.submitNamespace='conditionalRequiredFieldVisibility'] - Namespace for the submit handler.
 * @returns {{viewElement: HTMLElement, formElement: HTMLFormElement, apply: Function}|null}
 */
function initialiseConditionalRequiredFieldVisibility(viewId, options = {}) {
    const viewElement = getById(viewId);
    const formElement = viewElement?.querySelector('form');
    if (!(viewElement instanceof HTMLElement) || !(formElement instanceof HTMLFormElement)) {
        return null;
    }

    const {
        controllerFieldId,
        isEnabled,
        fieldHasValue,
        resolveVisibilityTarget,
        excludeFieldIds = [],
        events = ['change', 'input'],
        delegate = 'input, select, textarea',
        submitNamespace = 'conditionalRequiredFieldVisibility',
    } = options;

    const getRequiredFieldIds = () => {
        const fieldDefinitions = knackNavigator.getViewFieldDefinitions(viewElement.id);

        return new Set(fieldDefinitions.filter((fieldDefinition) => fieldDefinition?.required).map((fieldDefinition) => {
            return knackNavigator.normalizeFieldId(
                fieldDefinition?.key
                || fieldDefinition?.id
                || fieldDefinition?.field_key
                || ''
            );
        }).filter(Boolean));
    };

    const hasVisibleInputValue = (fieldWrap) => {
        if (!(fieldWrap instanceof HTMLElement)) {
            return false;
        }

        const dateInput = fieldWrap.querySelector('.kn-datetime input[name="date"], input.knack-date-input, input[name="date"]');
        const timeInput = fieldWrap.querySelector('.kn-datetime input[name="time"], input.kn-time-input, input[name="time"]');
        const hoursSelect = fieldWrap.querySelector('select[name="hours"]');
        const minutesSelect = fieldWrap.querySelector('select[name="minutes"]');
        if (dateInput || timeInput || hoursSelect || minutesSelect) {
            return Boolean(getDateTimeParts(fieldWrap).date);
        }

        if (fieldWrap.querySelector('input[type="checkbox"]:checked, input[type="radio"]:checked')) {
            return true;
        }

        const fileInput = fieldWrap.querySelector('input[type="file"]');
        if (fileInput?.files?.length) {
            return true;
        }

        const typedInput = Array.from(fieldWrap.querySelectorAll('textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select'))
            .find(function (inputElement) {
                return elementHasMeaningfulValue(inputElement);
            });

        return Boolean(typedInput);
    };

    const getRequiredFieldWraps = (controllerFieldWrap) => {
        const requiredFieldIds = getRequiredFieldIds();
        const excludedIds = new Set([controllerFieldId, ...(Array.isArray(excludeFieldIds) ? excludeFieldIds : [excludeFieldIds])]
            .map((fieldId) => knackNavigator.normalizeFieldId(fieldId))
            .filter(Boolean));

        return Array.from(viewElement.querySelectorAll('[id^="kn-input-field_"]')).filter((fieldWrap) => {
            if (!(fieldWrap instanceof HTMLElement) || fieldWrap === controllerFieldWrap) return false;
            if (fieldWrap.closest('.is-hidden, [hidden]')) return false;

            const fieldId = knackNavigator.normalizeFieldId(fieldWrap.id.replace(/^kn-input-/, ''));
            if (fieldId && excludedIds.has(fieldId)) return false;

            return Boolean(
                fieldWrap.querySelector('.kn-label .kn-required')
                || fieldWrap.querySelector('[required], [aria-required="true"]')
                || (fieldId ? requiredFieldIds.has(fieldId) : false)
                || fieldWrap.querySelector('input[required], select[required], textarea[required]')
            );
        });
    };

    const resolveTarget = (fieldWrap, context) => {
        if (typeof resolveVisibilityTarget === 'function') {
            return resolveVisibilityTarget(fieldWrap, context);
        }

        return fieldWrap.closest('.kn-input') || fieldWrap;
    };

    const hideField = (fieldWrap, context) => {
        const target = resolveTarget(fieldWrap, context);
        if (!(target instanceof HTMLElement) || target.dataset.conditionalRequiredHidden === 'true') return;

        target.dataset.conditionalRequiredHidden = 'true';
        target.dataset.conditionalRequiredPreviousDisplay = target.style.display || '';
        setVisibility(target, false);

        fieldWrap.querySelectorAll('input, select, textarea, button').forEach((controlElement) => {
            controlElement.dataset.conditionalRequiredWasDisabled = controlElement.disabled ? 'true' : 'false';
            controlElement.disabled = true;
        });
    };

    const restoreField = (fieldWrap, context) => {
        const target = resolveTarget(fieldWrap, context);
        if (!(target instanceof HTMLElement) || target.dataset.conditionalRequiredHidden !== 'true') return;

        const previousDisplay = target.dataset.conditionalRequiredPreviousDisplay || '';
        delete target.dataset.conditionalRequiredHidden;
        delete target.dataset.conditionalRequiredPreviousDisplay;
        target.style.display = previousDisplay;

        fieldWrap.querySelectorAll('input, select, textarea, button').forEach((controlElement) => {
            const wasDisabled = controlElement.dataset.conditionalRequiredWasDisabled === 'true';
            controlElement.disabled = wasDisabled;
            delete controlElement.dataset.conditionalRequiredWasDisabled;
        });
    };

    const apply = () => {
        const controllerFieldWrap = controllerFieldId == null
            ? null
            : knackNavigator.getFieldWrapper(viewElement, controllerFieldId);
        if (controllerFieldId != null && !controllerFieldWrap) {
            return [];
        }

        const context = { viewElement, formElement, controllerFieldWrap, controllerFieldId };
        const visibilityEnabled = typeof isEnabled === 'function'
            ? Boolean(isEnabled(context))
            : (controllerFieldId != null && getFormFieldCheckboxValues(controllerFieldId, viewElement).length > 0);
        const requiredFieldWraps = getRequiredFieldWraps(controllerFieldWrap);

        requiredFieldWraps.forEach((fieldWrap) => {
            const hasValue = typeof fieldHasValue === 'function'
                ? Boolean(fieldHasValue(fieldWrap, context))
                : hasVisibleInputValue(fieldWrap);

            if (visibilityEnabled && !hasValue) {
                hideField(fieldWrap, context);
                return;
            }

            restoreField(fieldWrap, context);
        });

        return requiredFieldWraps;
    };

    apply();

    addInputEventListener(formElement, apply, {
        events,
        delegate,
    });

    if (typeof window.jQuery === 'function') {
        window.jQuery(formElement)
            .off(`submit.${submitNamespace}`)
            .on(`submit.${submitNamespace}`, function () {
                apply();
            });
    }

    return {
        viewElement,
        formElement,
        apply,
    };
}

/**
 * Show/hide message based on radio button values.
 * Supports three modes:
 * 1. "all": All fields must match their value(s) to show message.
 * 2. "any": Any field matches its value(s) to show message.
 * 3. "map": Each field must match its specific value (field-value mapping).
 * Accepts either positional arguments (for backward compatibility) or a single options object.
 *
 * @param {number|number[]|object|object} fieldIds - Field ID(s) or {fieldId: valueToMatch, ...} for "map" mode, or options object.
 * @param {string|string[]|object} [valuesToMatch] - Value(s) to match, or {fieldId: valueToMatch, ...} for "map" mode.
 * @param {string} [selector] - CSS selector for the message element to show/hide.
 * @param {Function} [callback] - Optional callback function to execute on change.
 * @param {Object} [params] - Optional parameters to pass to the callback.
 * @param {'all'|'any'|'map'} [mode='any'] - Matching mode: "all", "any", or "map".
 *
 * @example
 * // Show if both radios are "Yes"
 * showHideMsgBasedOnRadios([123, 456], "Yes", "#msg", null, null, "all");
 *
 * // Show if either radio is "Yes"
 * showHideMsgBasedOnRadios([123, 456], "Yes", "#msg", null, null, "any");
 *
 * // Show if field 123 is "Yes" and field 456 is "No"
 * showHideMsgBasedOnRadios({123: "Yes", 456: "No"}, null, "#msg", null, null, "map");
 *
 * // New: Pass options object
 * showHideMsgBasedOnRadios({
 *   fieldIDs: [123, 456],
 *   valuesToMatch: "Yes",
 *   selector: "#msg",
 *   callback: null,
 *   params: null,
 *   mode: "all"
 * });
 */
function showHideMsgBasedOnRadios(fieldIds, valuesToMatch, selector, callback, params, mode = 'any') {
    // Support options object as first param
    let opts;
    if (typeof fieldIds === 'object' && fieldIds !== null && (
        fieldIds.hasOwnProperty('fieldIds') || fieldIds.hasOwnProperty('selector') || fieldIds.hasOwnProperty('mode')
    )) {
        opts = Object.assign({
            fieldIds: null,
            valuesToMatch: null,
            selector: null,
            callback: null,
            params: null,
            mode: 'any'
        }, fieldIds);
    } else {
        opts = { fieldIds, valuesToMatch, selector, callback, params, mode };
    }

    let fieldIdArr, matchValuesArr;

    // Enforce canonical parameter name 'fieldIds'. If legacy keys are used, error and exit.
    if (opts.fieldIDs || opts.fieldID) {
        console.error('[showHideMsgBasedOnRadios] Deprecated parameter "fieldIDs"/"fieldID" used; please pass "fieldIds" only.');
        return;
    }

    let isMapMode = opts.mode === 'map' || (typeof opts.fieldIds === 'object' && !Array.isArray(opts.fieldIds));

    // Validate required parameters
    if (!opts.fieldIds) {
        console.error('[showHideMsgBasedOnRadios] Missing required parameter "fieldIds". Example: showHideMsgBasedOnRadios([123], "Yes", "#msg")');
        return;
    }
    if (!opts.selector) {
        console.error('[showHideMsgBasedOnRadios] Missing required parameter "selector". Example: showHideMsgBasedOnRadios([123], "Yes", "#msg")');
        return;
    }

    // Get the target message element
    const messageElement = document.querySelector(opts.selector);
    if (!messageElement) {
        console.error(`Message element not found: ${opts.selector}`);
        return;
    }

    // Handler for radio change
    const handleRadioChange = () => {
        let showMessage = false;

        if (isMapMode) {
            // "map" mode: fieldIds is an object {fieldId: valueToMatch, ...}
            showMessage = Object.entries(opts.fieldIds).every(([fid, val]) => {
                const checkedRadio = document.querySelector(`#kn-input-field_${fid} input[type="radio"]:checked`);
                return checkedRadio && checkedRadio.value === val;
            });
        } else {
            // "all"/"any" mode: fieldIds and valuesToMatch are arrays
            fieldIdArr = Array.isArray(opts.fieldIds) ? opts.fieldIds : [opts.fieldIds];
            matchValuesArr = Array.isArray(opts.valuesToMatch) ? opts.valuesToMatch : [opts.valuesToMatch];

            const matches = fieldIdArr.map(fid => {
                const checkedRadio = document.querySelector(`#kn-input-field_${fid} ${INPUT_RADIO_CHECKED_SELECTOR}`);
                return checkedRadio && matchValuesArr.includes(checkedRadio.value);
            });

            if (opts.mode === 'all') {
                showMessage = matches.every(Boolean);
            } else { // "any" (default)
                showMessage = matches.some(Boolean);
            }
        }

        toggleMessage(showMessage, opts.selector);

        if (opts.callback && typeof opts.callback === 'function') {
            opts.callback(showMessage, opts.params);
        }
    };

    // Attach listeners to all relevant radio buttons
    if (isMapMode) {
        Object.keys(opts.fieldIds).forEach(fid => {
            const radios = document.querySelectorAll(`#kn-input-field_${fid} input[type="radio"]`);
            radios.forEach(radio => {
                addInputEventListener(radio, handleRadioChange, { runOnInit: true });
            });
        });
    } else {
        fieldIdArr = Array.isArray(opts.fieldIds) ? opts.fieldIds : [opts.fieldIds];
        fieldIdArr.forEach(fid => {
            const radios = document.querySelectorAll(`#kn-input-field_${fid} input[type="radio"]`);
            radios.forEach(radio => {
                addInputEventListener(radio, handleRadioChange, { runOnInit: true });
            });
        });
    }
}

/**
 * Display a notification on a specified element and return the notification element.
 * @param {Object} options - Configuration options for the notification
 * @param {HTMLElement|string} options.target - The element to attach the notification to (DOM element or selector)
 * @param {array|string} options.message - Text of notification (can be a string or an array of strings)
 * @param {string} [options.backgroundColor='#4CAF50'] - Background color of the notification
 * @param {string} [options.className=''] - CSS classes to apply to the notification
 * @param {number} [options.delay=2000] - Time in milliseconds before the notification disappears (0 for no auto-removal)
 * @param {number} [options.fadeTime=500] - Time in milliseconds for fade transition
 * @param {Object} [options.styles={}] - Additional CSS styles to apply to notification
 * @param {Function} [options.onShow=null] - Callback function when notification is shown
 * @param {Function} [options.onHide=null] - Callback function when notification is hidden
 * @returns {HTMLElement} - The created notification element
 */
function showNotification(options) {
    // Default options
    const defaults = {
        target: null,
        message: '',
        backgroundColor: '',
        className: '',
        delay: 2000,
        fadeTime: 500,
        styles: {},
        onShow: null,
        onHide: null
    };

    // Merge provided options with defaults
    const settings = { ...defaults, ...options };

    // Handle different input types for target
    const targetElement = typeof settings.target === 'string'
        ? document.querySelector(settings.target)
        : settings.target;

    if (!targetElement) {
        console.error('Target element not found:', settings.target);
        return null;
    }

    // Store the original z-index
    const originalZIndex = getComputedStyle(targetElement).zIndex;

    // Ensure target can be positioned properly
    if (originalZIndex === 'auto' || originalZIndex === '0') {
        targetElement.style.position = targetElement.style.position || 'relative';
        targetElement.style.zIndex = '1';
    }

    // Create notification element
    const notification = document.createElement('div');

    const baseClass = 'custom-notification';
    // Split className string(s) into individual class tokens
    let customClasses = [];
    if (Array.isArray(settings.className)) {
        customClasses = settings.className.flatMap(cls => cls.split(' '));
    } else if (typeof settings.className === 'string' && settings.className.trim()) {
        customClasses = settings.className.trim().split(/\s+/);
    }
    notification.classList.add(baseClass, ...customClasses);

    // set content and text styles
    const textStyleKeys = ['color', 'fontWeight', 'fontSize', 'lineHeight', 'textAlign'];
    const messages = Array.isArray(settings.message) ? settings.message : [settings.message];
    messages.forEach(msg => {
        const p = document.createElement('p');
        p.innerHTML = msg;

        textStyleKeys.forEach(key => {
            if (settings.styles?.[key]) {
                p.style[key] = settings.styles[key];
            }
        });
        notification.appendChild(p);
    });

    // Set base styles
    const baseStyles = {
        backgroundColor: settings.backgroundColor,
        opacity: '1',
        transition: `opacity ${settings.fadeTime}ms ease`,
    };

    // Apply base styles
    Object.assign(notification.style, baseStyles);

    // Apply custom styles
    Object.assign(notification.style, settings.styles);

    // Append notification to target
    targetElement.appendChild(notification);

    // Call onShow callback if provided
    if (typeof settings.onShow === 'function') {
        settings.onShow(notification);
    }

    // Set timeout to fade out and remove notification
    if (settings.delay > 0) {
        setTimeout(() => {
            notification.style.opacity = '0';

            // Remove element after fade effect completes
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);

                    // Reset target z-index to original value if we changed it
                    if (originalZIndex === 'auto' || originalZIndex === '0') {
                        targetElement.style.zIndex = originalZIndex;
                    }

                    // Call onHide callback if provided
                    if (typeof settings.onHide === 'function') {
                        settings.onHide();
                    }
                }
            }, settings.fadeTime);
        }, settings.delay);
    }

    return notification;
}

/**
 * Changes an input field to a range slider with labels and synchronizes values
 * @param {string} viewId - The ID of the view containing the input fields
 * @param {string|Element} sliderFieldSelector - Selector or element for the slider field
 * @param {string|Element} resultFieldSelector - Selector or element for the result display field
 * @param {object} attributes - Object with slider attributes
 * @param {number} attributes.min - Minimum value for the slider
 * @param {number} attributes.max - Maximum value for the slider
 * @param {number} attributes.step - Step value for the slider
 * @param {number} attributes.value - Initial value for the slider
 * @param {string} [attributes.minLabel] - Label for minimum value (optional)
 * @param {string} [attributes.maxLabel] - Label for maximum value (optional)
 * @param {string} [attributes.class] - Class to add to slider field & class-result (optional)
 */
function changeToSlider(viewId, sliderFieldSelector, resultFieldSelector, attributes = {}) {
    // Full selectors with viewId included
    const fullSliderSelector = typeof sliderFieldSelector === 'string'
        ? `#${viewId} ${sliderFieldSelector}`
        : sliderFieldSelector;

    const fullResultSelector = typeof resultFieldSelector === 'string'
        ? `#${viewId} ${resultFieldSelector}`
        : resultFieldSelector;

    // Get elements from selectors or use provided elements
    const sliderField = typeof fullSliderSelector === 'string'
        ? document.querySelector(fullSliderSelector)
        : fullSliderSelector;

    const resultField = typeof fullResultSelector === 'string'
        ? document.querySelector(fullResultSelector)
        : fullResultSelector;

    if (!sliderField || !resultField) {
        console.error(`Slider or result field not found in view ${viewId}`);
        return;
    }

    const sliderFieldId = sliderField.id;
    const resultFieldId = resultField.id;

    // Extract labels and optional class, then remove them from the attributes object
    const minLabel = attributes.minLabel || '';
    const maxLabel = attributes.maxLabel || '';
    const extraClass = attributes.class || '';                       // NEW

    // Create a copy without label and class properties so they are not fed into setAttribute
    const sliderAttributes = { ...attributes };
    delete sliderAttributes.minLabel;
    delete sliderAttributes.maxLabel;
    delete sliderAttributes.class;                                   // NEW

    // Convert input to range slider
    sliderField.classList.remove('input');
    sliderField.type = 'range';
    sliderField.classList.add('slider');

    // Add optional class(es) to slider and mirrored “-result” class to the result field
    if (extraClass) {                                                // NEW
        extraClass.split(/\s+/).filter(Boolean).forEach(cls => {
            document.getElementById(`kn-input-${sliderFieldId}`).classList.add(cls);
            document.getElementById(`kn-input-${resultFieldId}`).classList.add(`${cls}-result`);
        });
    }

    // Set remaining attributes on slider
    for (const [key, value] of Object.entries(sliderAttributes)) {
        sliderField.setAttribute(key, value);
    }

    // Add event listener for slider input
    sliderField.addEventListener('input', () => {
        resultField.value = sliderField.value;
    });

    // Add event listener for result field input
    resultField.addEventListener('keyup', () => {
        // Validate if input is in range before setting slider value
        const numValue = parseFloat(resultField.value);
        const min = parseFloat(sliderField.min || 0);
        const max = parseFloat(sliderField.max || 100);

        if (!isNaN(numValue) && numValue >= min && numValue <= max) {
            sliderField.value = numValue;
        }
    });

    // Trigger initial sync
    resultField.value = sliderField.value;

    // Get the parent control element
    if (!sliderFieldId) {
        return; // Can't find control without ID
    }

    const controlDiv = document.querySelector(`#${viewId} #kn-input-${sliderFieldId} div.control`);
    if (!controlDiv) {
        return; // Can't add labels without container
    }

    // Add min label if provided
    if (minLabel) {
        const minLabelElem = document.createElement('label');
        minLabelElem.className = 'slideLabel';
        minLabelElem.textContent = minLabel;
        minLabelElem.style.left = '1px';
        controlDiv.appendChild(minLabelElem);
    }

    // Add max label if provided
    if (maxLabel) {
        const maxLabelElem = document.createElement('label');
        maxLabelElem.className = 'slideLabel';
        maxLabelElem.textContent = maxLabel;
        maxLabelElem.style.right = '2px';
        controlDiv.appendChild(maxLabelElem);
    }
}

/**
 * Adds floating scroll-to-top and close controls to the active Knack modal.
 * Repeated modal render events reuse the existing controls rather than adding duplicates.
 * @return {void}
 */
function addModalNavigationButtons() {
    const modalBg = Array.from(document.querySelectorAll('[id^="kn-modal-bg-"]')).pop();
    if (!modalBg || modalBg.querySelector(':scope > .modal-control-buttons')) return;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-control-buttons';
    buttonContainer.setAttribute('role', 'group');
    buttonContainer.setAttribute('aria-label', 'Modal controls');

    const scrollToTopBtn = createButton({
        html: '<i class="fa fa-arrow-up"></i>',
        className: 'modalButton success-bkgd scroll-to-top-btn',
        attributes: {
            'aria-label': 'Scroll to top of modal',
            title: 'Scroll to top'
        },
        onClick: function() {
            modalBg.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    const closeModalBtn = createButton({
        html: '<i class="fa fa-times"></i>',
        className: 'modalButton warning-bkgd close-modal-btn',
        attributes: {
            'aria-label': 'Close modal',
            title: 'Close'
        },
        onClick: function() {
            modalBg.querySelector('button.close-modal, .close-modal')?.click();
        }
    });

    buttonContainer.appendChild(scrollToTopBtn);
    buttonContainer.appendChild(closeModalBtn);
    modalBg.appendChild(buttonContainer);

    /** Positions the controls beside the modal without allowing viewport overflow. */
    const updatePosition = () => {
        if (!modalBg.isConnected) {
            window.removeEventListener('resize', updatePosition);
            window.visualViewport?.removeEventListener('resize', updatePosition);
            return;
        }

        const modalCard = modalBg.querySelector('.modal-card, .modal-card-body');
        if (!modalCard) return;

        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const viewportEdge = 12;
        const modalGap = 8;
        const preferredLeft = modalCard.getBoundingClientRect().right + modalGap;
        const minimumLeft = viewportLeft + viewportEdge;
        const maximumLeft = viewportLeft + viewportWidth - buttonContainer.offsetWidth - viewportEdge;
        buttonContainer.style.left = `${Math.max(minimumLeft, Math.min(preferredLeft, maximumLeft))}px`;
    };

    /** Updates the controls when the modal crosses the scroll threshold. */
    const updateVisibility = () => {
        buttonContainer.classList.toggle('is-visible', modalBg.scrollTop > 100);
        updatePosition();
    };

    modalBg.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    window.visualViewport?.addEventListener('resize', updatePosition, { passive: true });
    updateVisibility();
}

// Supported office, PDF, and image extensions
const OFFICE_EXTENSIONS = [
    "docx", "odt", "rtf", "docm", "doc", "dotx", "dotm", "dot",
    "xlsx", "xls", "ppts", "ppt", "pptx"
];

const IMAGE_EXTENSIONS = [
    "png", "jpeg", "jpg", "gif", "bmp", "svg", "webp", "tiff", "ico"
];

/**
 * Inserts or replaces asset/file links in a view.
 * - For .ca-link/.ca-link-child: sets href using ID or assetURLs.
 * - For .ca-asset/.kn-view-asset: opens Office files in Office Online, PDF in PDF.js, others direct download.
 * - For images: uses Knack's default behaviour (no viewer link).
 * @param {string} viewId - The ID of the view containing the links/assets.
 * @example
 * updateLinksAndAssets('view_1234');
 */
function updateLinksAndAssets(viewId) {
    const currentURL = sanitiseURL(window.location.href);
    const viewElement = document.getElementById(viewId);
    if (!viewElement) {
        console.error(`View element with ID ${viewId} not found`);
        return;
    }

    /**
     * Returns asset info for a given link or asset element.
     * @param {HTMLElement} el - The link or asset element.
     * @param {boolean} isKnViewAsset - True if .kn-view-asset, false if .ca-link.
     * @returns {object} { assetId, fileName, extension, assetUrl }
     */
    function getAssetInfoFromElement(el, isKnViewAsset = false) {
        let assetId, fileName;
        if (isKnViewAsset) {
            assetId = el.getAttribute('data-asset-id');
            fileName = el.getAttribute('data-file-name');
        } else {
            const linkID = el.id;
            if (!assetURLs[linkID]) return {};
            const fileParts = assetURLs[linkID].split('/');
            assetId = fileParts[0];
            fileName = fileParts[fileParts.length - 1];
        }
        return buildKnackAssetInfo(assetId, fileName);
    }

    /**
     * Sets the correct href/target/download for a link or asset element.
     * @param {HTMLElement} el - The link or asset element.
     * @param {object} info - Asset info object.
     * @param {boolean} isKnViewAsset - True if .kn-view-asset, false if .ca-link.
     */
    function setFileViewerLink(el, info, isKnViewAsset = false) {
        if (!info.extension) return;
        if (IMAGE_EXTENSIONS.includes(info.extension)) {
            // Use Knack's default behaviour for images
            el.setAttribute('href', `${sanitiseURL(window.location.href)}kn-asset/1542-3553-3690-${info.assetId}/${info.fileName}`);
        } else if (OFFICE_EXTENSIONS.includes(info.extension)) {
            el.setAttribute('href', info.assetUrl);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
        } else if (info.extension === "pdf") {
            el.setAttribute('href', info.assetUrl);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
        } else {
            el.setAttribute('href', info.assetUrl);
            el.setAttribute('download', info.fileName);
        }
        if (isKnViewAsset) {
            el.textContent = info.fileName;
        }
    }

    // Unified handler for both .ca-link/.ca-link-child and .kn-view-asset
    function processAssetElement(el, isKnViewAsset = false) {
        const info = getAssetInfoFromElement(el, isKnViewAsset);
        if (!info.extension) return;
        setFileViewerLink(el, info, isKnViewAsset);
    }

    // Handle .ca-link and .ca-link-child
    viewElement.querySelectorAll('.ca-link, .ca-link-child, .ca-link-user').forEach(linkEle => {
        const linkID = linkEle.id;
        let fullFormURL = currentURL;

        if (!linkID) {
            console.error(`%c Error: ${linkEle.textContent} - Link must have ID to define URL `, 'color: red; font-weight: bold;');
            return;
        }

        const isAsset = linkEle.classList.contains('ca-asset');
        const formName = isAsset ? assetURLs[linkID] : linkID;

        if (linkEle.classList.contains('ca-link-child')) {
            fullFormURL += `${formName}/${getRecordID()}`;
        } else if (linkEle.classList.contains('ca-link-user')) {
            fullFormURL += `${formName}/${knackNavigator.getUserAttributes().id}`;
        } else {
            fullFormURL += formName;
        }

        if (isAsset) {
            processAssetElement(linkEle, false);
        } else {
            if (linkEle.getAttribute('target') === '_blank') {
                linkEle.classList.add('extLink');
            }
            linkEle.setAttribute('href', fullFormURL);
        }
    });

    // Handle .kn-view-asset (replace with viewer links)
    viewElement.querySelectorAll('.kn-view-asset').forEach(assetEl => {
        const info = getAssetInfoFromElement(assetEl, true);
        if (!info.extension) return;
        if (IMAGE_EXTENSIONS.includes(info.extension)) return; // Use Knack's default behaviour for images

        const a = document.createElement('a');
        a.target = "_blank";
        // Preserve asset identity so other features (e.g. initFileCarousel) can still identify this cell's file.
        a.setAttribute('data-asset-id', info.assetId);
        a.setAttribute('data-file-name', info.fileName);
        setFileViewerLink(a, info, true);
        assetEl.replaceWith(a);
    });
}

/**
 * Adds KTL-style copy-to-clipboard behaviour for a view while excluding grid headers.
 * Use the `_copybody` view keyword to enable it. The keyword honours the same
 * role options as KTL's `_copy` keyword.
 *
 * @param {{key?: string}} view - Knack view metadata.
 * @param {Object} keywords - Parsed KTL keywords for the view.
 * @returns {void}
 */
function copyViewBodyToClipboard(view, keywords) {
    const keywordName = '_copybody';
    const viewId = knackNavigator.normalizeViewId(view?.key);
    if (!viewId || !keywords?.[keywordName]) return;

    const viewType = ktl.views.getViewType(viewId);
    const selectors = {
        table: `#${viewId} .kn-table-wrapper tbody`,
        search: `#${viewId} .kn-table-wrapper tbody`,
        details: `#${viewId}.kn-details section`,
        list: `#${viewId}.kn-list .columns`
    };
    const contentSelector = selectors[viewType];
    if (!contentSelector) {
        console.log('copyViewBodyToClipboard error. Unsupported view type:', viewId);
        return;
    }

    const buttonSelector = `#${viewId} .knackCopyBodyButton`;
    let button = document.querySelector(buttonSelector);

    if (!button) {
        const keywordOptions = keywords[keywordName][0]?.options;
        if (keywordOptions && !ktl.core.hasRoleAccess(keywordOptions)) return;

        button = document.createElement('button');
        button.className = 'kn-button knackCopyBodyButton';
        button.type = 'button';
        button.textContent = 'Copy to Clipboard';
        Object.assign(button.style, {
            marginBottom: '10px',
            width: 'fit-content'
        });

        let buttonContainer = null;
        if (viewType === 'table' || viewType === 'search') {
            buttonContainer = document.querySelector(`#${viewId} .table-keyword-search`);
            if (buttonContainer) {
                buttonContainer.style.display = 'inline-flex';
                button.style.marginLeft = '10%';
                buttonContainer.appendChild(button);
            }
        }

        if (!buttonContainer) {
            buttonContainer = document.querySelector(
                `#${viewId}.kn-table .kn-records-nav, #${viewId} .kn-list-content, #${viewId} .kn-details section`
            );
            if (!buttonContainer) return;

            buttonContainer.style.flexDirection = 'column';
            button.style.marginLeft = '8px';
            buttonContainer.prepend(button);
        }

        button.addEventListener('click', function () {
            const content = document.querySelector(contentSelector);
            if (!content) {
                ktl.core.timedPopup('Unable to copy', 'error', 2000);
                return;
            }

            ktl.core.selectElementContents(content);
            try {
                const successful = document.execCommand('copy');
                const message = successful
                    ? `${viewType.charAt(0).toUpperCase()}${viewType.slice(1)} copied to clipboard`
                    : 'Error copying to clipboard';
                ktl.core.timedPopup(message, successful ? 'success' : 'error', 1000);
            } catch (error) {
                ktl.core.timedPopup('Unable to copy', 'error', 2000);
            } finally {
                ktl.core.selectElementContents();
            }
        });
    }

    const content = document.querySelector(contentSelector);
    const hasData = Boolean(content) && !content.querySelector('.kn-tr-nodata');
    button.disabled = !hasData;
}

function idleWatchDogTimeout() {
    if (document.querySelector('.kn-login')) return;

    const ID_PREFIX = 'ktl-idle-';
    const overlayId = ID_PREFIX + 'overlay';
    const dialogId = ID_PREFIX + 'dialog';
    const logoutBtnId = ID_PREFIX + 'logout-btn';
    const stayBtnId = ID_PREFIX + 'stay-btn';

    // A second call replaces the first dialog completely, including its auto-logout timer and resize listener.
    idleWatchDogTimeout.teardown?.();

    // Remove any existing overlay/dialog to prevent duplicates
    document.getElementById(overlayId)?.remove();
    document.getElementById(dialogId)?.remove();

    // Create the overlay and append it to the body
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    Object.assign(overlay.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'black',
        opacity: 0.8,
        zIndex: 2010, // higher z-index to avoid being covered
        display: 'block'
    });
    document.body.appendChild(overlay);

    // Create the dialog element
    const dialog = document.createElement('div');
    dialog.id = dialogId;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', ID_PREFIX + 'title');
    dialog.setAttribute('tabindex', '-1');
    dialog.innerHTML = `
        <h2 id="${ID_PREFIX}title">Knack Logout</h2>
        <p>You are about to be logged out. Do you wish to remain logged in?</p>
        <div class="ktl-dialog-buttons">
            <button id="${logoutBtnId}" class="kn-button is-secondary">Logout</button>
            <button id="${stayBtnId}" class="kn-button is-secondary">Stay Logged In</button>
        </div>
    `;
    document.body.appendChild(dialog);

    // Save the element that had focus before opening the dialog
    const previousActiveElement = document.activeElement;
    // Move focus to the dialog for accessibility
    dialog.focus();

    // Internal state to ensure logout is idempotent
    let autoLogoutTimeout;
    let logoutInvoked = false;

    function cleanupUI() {
        overlay.remove();
        dialog.remove();
        window.removeEventListener('resize', setDialogWidth);
        if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
            previousActiveElement.focus();
        }
    }

    function ensureLoggedOutFallback() {
        // If we are not showing a login view after a short delay, force a reload
        setTimeout(() => {
            if (!document.querySelector('.kn-login')) {
                try {
                    knackNavigator.logout(); // try again
                } catch (e) {
                    // last resort: navigate to origin
                    try { window.location.reload(); } catch (e) {}
                }
            }
        }, 2000);
    }

    function performLogout() {
        if (logoutInvoked) return;
        logoutInvoked = true;
        clearTimeout(autoLogoutTimeout);
        cleanupUI();
        try {
            knackNavigator.logout();
        } catch (e) {
            console.warn('Error calling Knack.user.destroy()', e);
        }
        ensureLoggedOutFallback();
    }

    // Button event listeners (use addEventListener so we don't clobber any other handlers)
    document.getElementById(logoutBtnId).addEventListener('click', performLogout);
    document.getElementById(stayBtnId).addEventListener('click', function () {
        cleanupUI();
        try { ktl.scenes.resetIdleWatchdog(); } catch (e) { /* ignore */ }
    });

    // Responsive dialog width
    function setDialogWidth() {
        dialog.style.width = window.innerWidth <= 768 ? '70%' : '25%';
    }

    setDialogWidth();
    window.addEventListener('resize', setDialogWidth);

    // Auto logout after a short confirmation period (fixed 1 minute)
    // Note: `ktl.scenes.getCfg().idleWatchDogDelay` controls the initial inactivity
    // delay that triggers this dialog. This timeout is only the dialog confirmation
    // window and must remain short (1 minute).
    const autoLogoutMinutes = 1;
    // Auto-logout simply triggers the idempotent performLogout(); the fallback
    // will ensure the user is returned to the login screen if needed.
    autoLogoutTimeout = setTimeout(performLogout, Math.max(0, autoLogoutMinutes) * 60 * 1000);
    idleWatchDogTimeout.teardown = () => {
        clearTimeout(autoLogoutTimeout);
        window.removeEventListener('resize', setDialogWidth);
    };
}

/**
 * Show a generic confirmation dialog with app-provided content and styling hooks.
 * @param {Object} [options={}] Dialog options.
 * @param {string} [options.title='Confirmation'] Dialog title.
 * @param {string|string[]} [options.message='Are you sure you want to continue?'] Message paragraph(s). HTML is allowed.
 * @param {string} [options.contentHtml=''] Additional HTML appended after the message block.
 * @param {Array<{ text: string, className?: string, value?: string, action?: Function, closeOnClick?: boolean }>} [options.buttons=[]] Button definitions.
 * @param {Object} [options.styling={}] Styling hooks.
 * @param {string} [options.styling.overlayClass=''] Overlay class name.
 * @param {string} [options.styling.containerClass=''] Optional inner container class name.
 * @param {string} [options.styling.dialogClass=''] Dialog class name.
 * @param {string} [options.styling.titleClass=''] Title class name.
 * @param {string} [options.styling.messageClass=''] Message class name.
 * @param {string} [options.styling.contentClass=''] Content wrapper class name.
 * @param {string} [options.styling.buttonsClass=''] Buttons wrapper class name.
 * @param {boolean} [options.closeOnOverlay=true] Whether clicking the overlay should close the dialog.
 * @param {boolean} [options.closeOnEscape=true] Whether pressing Escape should close the dialog.
 * @returns {Promise<{ value: string, button: Object }|null>} Selected button result, or null when dismissed.
 */
function showConfirmationDialog(options = {}) {
    const defaultButtons = [
        { text: 'Cancel', className: 'kn-button is-secondary', value: 'cancel' },
        { text: 'OK', className: 'kn-button is-primary', value: 'confirm' },
    ];
    const config = {
        title: knackValueResolver.toStringSafe(options?.title) || 'Confirmation',
        message: options?.message ?? 'Are you sure you want to continue?',
        contentHtml: knackValueResolver.toStringSafe(options?.contentHtml),
        buttons: Array.isArray(options?.buttons) && options.buttons.length ? options.buttons : defaultButtons,
        styling: {
            overlayClass: knackValueResolver.toStringSafe(options?.styling?.overlayClass),
            containerClass: knackValueResolver.toStringSafe(options?.styling?.containerClass),
            dialogClass: knackValueResolver.toStringSafe(options?.styling?.dialogClass),
            titleClass: knackValueResolver.toStringSafe(options?.styling?.titleClass),
            messageClass: knackValueResolver.toStringSafe(options?.styling?.messageClass),
            contentClass: knackValueResolver.toStringSafe(options?.styling?.contentClass),
            buttonsClass: knackValueResolver.toStringSafe(options?.styling?.buttonsClass),
        },
        closeOnOverlay: options?.closeOnOverlay !== false,
        closeOnEscape: options?.closeOnEscape !== false,
    };

    return new Promise(function (resolve) {
        const titleId = `knack-confirm-title-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const overlay = document.createElement('div');
        const dialog = document.createElement('div');
        const titleEl = document.createElement('h2');
        const messages = (Array.isArray(config.message) ? config.message : [config.message]).filter(function (messagePart) {
            return messagePart !== null && messagePart !== undefined && String(messagePart).trim() !== '';
        });
        const buttonsWrap = document.createElement('div');
        const previousActiveElement = document.activeElement;
        let isClosed = false;
        const containerClass = config.styling.containerClass;

        overlay.className = config.styling.overlayClass;
        dialog.className = config.styling.dialogClass;
        titleEl.className = config.styling.titleClass;
        titleEl.id = titleId;
        titleEl.textContent = config.title;

        if (!config.styling.overlayClass) {
            Object.assign(overlay.style, {
                position: 'fixed',
                inset: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                zIndex: '2010',
                boxSizing: 'border-box',
            });
        }

        if (!containerClass) {
            Object.assign(dialog.style, {
                width: 'min(100%, 520px)',
                maxHeight: 'calc(100vh - 48px)',
                overflowY: 'auto',
                background: '#ffffff',
                color: '#1f2937',
                borderRadius: '12px',
                boxShadow: '0 20px 55px rgba(15, 23, 42, 0.28)',
                padding: '24px',
                boxSizing: 'border-box',
            });
        }

        if (!config.styling.titleClass) {
            Object.assign(titleEl.style, {
                margin: '0 0 12px',
                fontSize: '20px',
                lineHeight: '1.3',
            });
        }

        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', titleId);
        dialog.setAttribute('tabindex', '-1');
        dialog.appendChild(titleEl);

        messages.forEach(function (messagePart) {
            const paragraph = document.createElement('p');
            paragraph.className = config.styling.messageClass;
            if (!config.styling.messageClass) {
                Object.assign(paragraph.style, {
                    margin: '0 0 12px',
                    lineHeight: '1.5',
                });
            }
            paragraph.innerHTML = String(messagePart);
            dialog.appendChild(paragraph);
        });

        if (config.contentHtml) {
            const contentEl = document.createElement('div');
            contentEl.className = config.styling.contentClass;
            if (!config.styling.contentClass) {
                contentEl.style.marginBottom = '16px';
            }
            contentEl.innerHTML = config.contentHtml;
            dialog.appendChild(contentEl);
        }

        buttonsWrap.className = config.styling.buttonsClass;
        if (!config.styling.buttonsClass) {
            Object.assign(buttonsWrap.style, {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                flexWrap: 'wrap',
                marginTop: '20px',
            });
        }
        dialog.appendChild(buttonsWrap);

        function cleanup(result) {
            if (isClosed) {
                return;
            }

            isClosed = true;
            document.removeEventListener('keydown', handleKeydown);
            overlay.remove();
            if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
                previousActiveElement.focus();
            }
            resolve(result);
        }

        function handleKeydown(event) {
            if (config.closeOnEscape && event.key === 'Escape') {
                event.preventDefault();
                cleanup(null);
            }
        }

        config.buttons.forEach(function (buttonConfig, index) {
            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = knackValueResolver.toStringSafe(buttonConfig?.className || buttonConfig?.class) || 'kn-button';
            buttonEl.textContent = knackValueResolver.toStringSafe(buttonConfig?.text) || `Option ${index + 1}`;
            buttonEl.addEventListener('click', function (event) {
                event.preventDefault();
                const result = {
                    value: knackValueResolver.toStringSafe(buttonConfig?.value) || knackValueResolver.toStringSafe(buttonConfig?.text),
                    button: buttonConfig,
                };

                if (typeof buttonConfig?.action === 'function') {
                    buttonConfig.action(result);
                }

                if (buttonConfig?.closeOnClick === false) {
                    return;
                }

                cleanup(result);
            });
            buttonsWrap.appendChild(buttonEl);
        });

        if (config.closeOnOverlay) {
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) {
                    cleanup(null);
                }
            });
        }

        document.addEventListener('keydown', handleKeydown);
        if (containerClass) {
            const container = document.createElement('div');
            container.className = containerClass;
            container.appendChild(dialog);
            overlay.appendChild(container);
        } else {
            overlay.appendChild(dialog);
        }
        document.body.appendChild(overlay);
        dialog.focus();
    });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: multi-form
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Multi-form coordinator ported as-is (jQuery only for Knack events). Analysis C17.

/**
 * Configuration constants for multi-form submission
 */
const MULTI_FORM_CONFIG = {
    TIMEOUTS: {
        BUTTON_WAIT: 10000,
        FORM_SUBMIT: 30000,
        PRE_SUBMIT_DELAY: 200,
        MODAL_CLOSE_DELAY: 200,
        OUTCOME_POLL_INTERVAL: 500
    },
    SELECTORS: {
        SUBMIT_BUTTON: 'button[type=submit]',
        FORM: 'form',
        SUCCESS_MESSAGE: '.kn-message.success',
        ERROR_MESSAGE: '.kn-message.is-error',
        MODAL: '.kn-modal',
        MODAL_CLOSE: 'button.close-modal'
    }
};

/**
 * Class for managing coordinated submission of multiple Knack forms.
 * Handles a primary manual form and one or more auto-submit forms that must complete first.
 *
 * Features:
 * - Sequential auto-form submission (not parallel) to handle validation properly
 * - Validation using ktlNotValid_* class pattern before submission
 * - Tracks successfully submitted forms to prevent re-submission
 * - On validation failure: stops process and leaves failing form enabled for user to edit
 * - User can fix errors and re-submit - already-submitted forms are skipped
 *
 * @example
 * // Basic usage
 * const coordinator = new MultiFormSubmissionCoordinator({
 *     manualSubmitViewId: 'view_123',
 *     autoSubmitViewIds: ['view_456', 'view_789']
 * });
 * coordinator.initialize('view_123'); // Call on form render
 *
 * @example
 * // With modal close and custom config
 * const coordinator = new MultiFormSubmissionCoordinator({
 *     manualSubmitViewId: 'view_123',
 *     autoSubmitViewIds: ['view_456'],
 *     closeModalAfterSubmit: ({ autoSubmitViewIds }) => autoSubmitViewIds.length > 0,
 *     onAutoFormsComplete: (outcomes) => {
 *         console.log('Auto forms completed:', outcomes);
 *     }
 * });
 */
class MultiFormSubmissionCoordinator {
    /**
     * @param {Object} config - Configuration object
     * @param {string} config.manualSubmitViewId - View ID of the manual (primary) form
     * @param {string[]} config.autoSubmitViewIds - Array of view IDs for auto-submit forms
     * @param {boolean|Function} [config.closeModalAfterSubmit=false] - Close modal after successful submission, or resolve that decision from submission context
     * @param {Function} [config.onAutoFormsComplete=null] - Callback after auto forms complete
     * @param {Function} [config.onBeforeSubmit=null] - Callback before the coordinated submit starts
     * @param {Function} [config.onSubmissionComplete=null] - Callback after the manual form submits successfully
     * @param {Function} [config.onSubmissionError=null] - Callback when the coordinated submit fails
     * @param {Function} [config.onSubmissionSettled=null] - Callback after the coordinated submit finishes, success or failure
     * @param {Object} [config.timeouts] - Override default timeout values
     * @param {Object} [config.selectors] - Override default selector strings
     */
    constructor(config) {
        this.manualSubmitViewId = config.manualSubmitViewId;
        this.autoSubmitViewIds = config.autoSubmitViewIds || [];
        this.closeModalAfterSubmit = config.closeModalAfterSubmit ?? false;
        this.onAutoFormsComplete = config.onAutoFormsComplete || null;
        this.onBeforeSubmit = config.onBeforeSubmit || null;
        this.onSubmissionComplete = config.onSubmissionComplete || null;
        this.onSubmissionError = config.onSubmissionError || null;
        this.onSubmissionSettled = config.onSubmissionSettled || null;

        this.timeouts = { ...MULTI_FORM_CONFIG.TIMEOUTS, ...(config.timeouts || {}) };
        this.selectors = { ...MULTI_FORM_CONFIG.SELECTORS, ...(config.selectors || {}) };

        /**
         * Tracks event namespaces for cleanup. Maps event keys to their jQuery namespaces.
         * Example: Map { 'render-view_123' => 'knack-view-render.view_123.mfc-abc123' }
         * Used by destroy() to unbind all jQuery events and prevent memory leaks.
         */
        this.eventHandlers = new Map();
        this.isInitialized = false;

        // Track successfully submitted forms to avoid re-submission
        this.submittedForms = new Set();

        // Unique instance ID for event namespacing to prevent conflicts between multiple coordinators
        this.instanceId = `mfc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize the coordinator for a specific rendered view
     * @param {string} renderedViewId - The view ID that just rendered
     */
    initialize(renderedViewId) {
        if (renderedViewId === this.manualSubmitViewId) {
            this._attachManualFormHandler();
        } else if (this.autoSubmitViewIds.includes(renderedViewId)) {
            this._waitForManualForm();
        }
    }

    /**
     * Return all view ids managed by this coordinator.
     * @returns {string[]}
     */
    getManagedViewIds() {
        return [this.manualSubmitViewId, ...this.autoSubmitViewIds].filter(Boolean);
    }

    /**
     * Determine whether a view id is managed by this coordinator.
     * @param {string} viewId
     * @returns {boolean}
     */
    isManagedView(viewId) {
        return this.getManagedViewIds().includes(viewId);
    }

    /**
     * Return the currently participating auto-submit view ids.
     * Hidden or missing auto forms are treated as inactive for this submission.
     * @returns {string[]}
     */
    getActiveAutoSubmitViewIds() {
        return this.autoSubmitViewIds.filter((viewId) => this._isAutoSubmitViewParticipating(viewId));
    }

    /**
     * Generate unique event namespace for jQuery events
     * @private
     * @param {string} eventName - Base event name (e.g., 'knack-view-render')
     * @param {string} viewId - View ID to namespace
     * @returns {string} Namespaced event string
     */
    _getEventNamespace(eventName, viewId) {
        return `${eventName}.${viewId}.${this.instanceId}`;
    }

    /**
     * Determine whether one configured auto-submit view is currently participating.
     * @private
     * @param {string} viewId
     * @returns {boolean}
     */
    _isAutoSubmitViewParticipating(viewId) {
        const viewElement = document.getElementById(viewId);
        if (!(viewElement instanceof HTMLElement)) return false;

        const computedStyle = window.getComputedStyle(viewElement);
        if (viewElement.hidden || computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
            return false;
        }

        return !!viewElement.querySelector(this.selectors.FORM);
    }

    /**
     * Build the current submission context for callbacks and modal-close policy.
     * @private
     * @param {Object} [contextOverrides={}]
     * @returns {Object}
     */
    _createSubmissionContext(contextOverrides = {}) {
        const activeAutoSubmitViewIds = this.getActiveAutoSubmitViewIds();
        return {
            manualSubmitViewId: this.manualSubmitViewId,
            autoSubmitViewIds: [...this.autoSubmitViewIds],
            activeAutoSubmitViewIds,
            hasAutoSubmitForms: this.autoSubmitViewIds.length > 0,
            hasActiveAutoSubmitForms: activeAutoSubmitViewIds.length > 0,
            managedViewIds: this.getManagedViewIds(),
            submittedViewId: this.manualSubmitViewId,
            coordinator: this,
            ...contextOverrides,
        };
    }

    /**
     * Check if error is a validation error (not unexpected error)
     * @private
     * @param {Error} error - Error to check
     * @returns {boolean} True if validation error
     */
    _isValidationError(error) {
        return error.message.includes('Form validation failed');
    }

    /**
     * Wait for manual form to be available, then attach handler
     * @private
     */
    async _waitForManualForm() {
        try {
            await waitSelector({
                selector: `#${this.manualSubmitViewId} ${this.selectors.SUBMIT_BUTTON}`,
                timeout: this.timeouts.BUTTON_WAIT
            });
            this._attachManualFormHandler();
        } catch (err) {
            errorHandler.handleError(err, {
                manualSubmitViewId: this.manualSubmitViewId,
                autoSubmitViewIds: this.autoSubmitViewIds
            }, 'MultiFormCoordinator:WaitForManualForm');
        }
    }

    /**
     * Attach submit handler to manual form
     * @private
     */
    _attachManualFormHandler() {
        if (this.isInitialized) return;

        this._hideAutoSubmitButtons();

        const manualView = document.getElementById(this.manualSubmitViewId);
        if (!manualView) {
            console.error(`[MultiFormCoordinator] Manual submit view "${this.manualSubmitViewId}" not found`);
            errorHandler.handleError(
                new Error(`Manual submit view "${this.manualSubmitViewId}" not found`),
                { manualSubmitViewId: this.manualSubmitViewId },
                'MultiFormCoordinator'
            );
            return;
        }

        const manualForm = manualView.querySelector(this.selectors.FORM);
        const manualSubmitBtn = manualView.querySelector(this.selectors.SUBMIT_BUTTON);

        if (!manualForm || !manualSubmitBtn) {
            console.error(`[MultiFormCoordinator] Form or submit button not found in view "${this.manualSubmitViewId}"`);
            errorHandler.handleError(
                new Error(`Form or submit button not found in view "${this.manualSubmitViewId}"`),
                {
                    manualSubmitViewId: this.manualSubmitViewId,
                    formExists: !!manualForm,
                    buttonExists: !!manualSubmitBtn
                },
                'MultiFormCoordinator'
            );
            return;
        }

        this._cleanupPreviousHandler(manualSubmitBtn);

        const clickHandler = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this._handleFormSubmission(manualForm, manualSubmitBtn);
        };

        const formSubmitHandler = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        manualSubmitBtn._multiSubmitHandler = clickHandler;
        manualSubmitBtn.addEventListener('click', clickHandler);

        manualForm._multiFormSubmitHandler = formSubmitHandler;
        manualForm.addEventListener('submit', formSubmitHandler);

        this.isInitialized = true;
    }

    /**
     * Hide submit buttons for auto-submit forms
     * Uses unique namespaced events to prevent duplicates and enable proper cleanup
     * @private
     */
    _hideAutoSubmitButtons() {
        this.autoSubmitViewIds.forEach(autoViewId => {
            const renderHandler = () => {
                const autoSubmitBtn = document.querySelector(`#${autoViewId} ${this.selectors.SUBMIT_BUTTON}`);
                if (autoSubmitBtn) {
                    autoSubmitBtn.classList.add(CLASS_HIDDEN);
                }
            };

            const eventNamespace = this._getEventNamespace('knack-view-render', autoViewId);

            // Unbind any existing handler first to prevent duplicates
            $(document).off(eventNamespace);
            $(document).on(eventNamespace, renderHandler);

            this.eventHandlers.set(`render-${autoViewId}`, eventNamespace);

            // Hide button immediately if already rendered
            waitSelector({
                selector: `#${autoViewId} ${this.selectors.SUBMIT_BUTTON}`,
                timeout: this.timeouts.BUTTON_WAIT
            })
                .then(btn => btn && btn.classList.add(CLASS_HIDDEN))
                .catch(() => {});
        });
    }

    /**
     * Handle the complete form submission workflow
     * @private
     */
    async _handleFormSubmission(manualForm, manualSubmitBtn) {
        if (this.onBeforeSubmit) {
            this.onBeforeSubmit(this._createSubmissionContext());
        }

        manualSubmitBtn.disabled = true;
        this._setFormInputsDisabled(manualForm, true);

        let outcomes = [];
        let manualOutcome = null;
        let modalClosed = false;
        try {
            outcomes = await this._submitAutoForms();

            if (this.onAutoFormsComplete) {
                this.onAutoFormsComplete(outcomes);
            }

            this._setFormInputsDisabled(manualForm, false);
            manualSubmitBtn.disabled = false;

            manualOutcome = await this._submitManualForm(manualForm);
            modalClosed = await this._closeModalAfterSuccessfulSubmit({
                manualForm,
                manualOutcome,
                outcomes,
            });

            if (this.onSubmissionComplete) {
                this.onSubmissionComplete(this._createSubmissionContext({
                    outcomes,
                    manualOutcome,
                    modalClosed,
                }));
            }

        } catch (err) {
            if (this.onSubmissionError) {
                this.onSubmissionError(err, this._createSubmissionContext({
                    outcomes,
                    manualOutcome,
                }));
            }

            errorHandler.handleError(err, {
                manualSubmitViewId: this.manualSubmitViewId,
                autoSubmitViewIds: this.autoSubmitViewIds,
                outcomes
            }, 'MultiFormCoordinator:HandleSubmission');

            this._setFormInputsDisabled(manualForm, false);
            manualSubmitBtn.disabled = false;
        } finally {
            if (this.onSubmissionSettled) {
                this.onSubmissionSettled(this._createSubmissionContext({
                    outcomes,
                    manualOutcome,
                    modalClosed,
                }));
            }
        }
    }

    /**
     * Resolve whether the modal should close after a successful coordinated submit.
     * @private
     * @param {Object} context
     * @returns {boolean|Promise<boolean>}
     */
    async _shouldCloseModalAfterSubmit(context = {}) {
        if (typeof this.closeModalAfterSubmit === 'function') {
            return Boolean(await this.closeModalAfterSubmit(this._createSubmissionContext(context)));
        }

        return this.closeModalAfterSubmit === true;
    }

    /**
     * Close the active modal when configured to do so after a successful manual submit.
     * @private
     * @param {Object} context
     * @returns {Promise<boolean>}
     */
    async _closeModalAfterSuccessfulSubmit(context = {}) {
        const shouldCloseModal = await this._shouldCloseModalAfterSubmit(context);
        if (!shouldCloseModal) {
            return false;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, this.timeouts.MODAL_CLOSE_DELAY);
        });

        return bulkActionCloseModalIfOpen();
    }

    /**
     * Validate a form by checking for fields with ktlNotValid_* classes
     * @private
     * @param {string} viewId - View ID of the form being validated
     * @param {HTMLFormElement} form - The form element to validate
     * @returns {Object} Validation result with { isValid, invalidInputs, errorMessage }
     */
    _validateForm(viewId, form) {
        if (!form) {
            return { isValid: false, invalidInputs: [], errorMessage: `Form not found for ${viewId}` };
        }

        const allInputs = form.querySelectorAll('input, select, textarea');
        const invalidInputs = Array.from(allInputs).filter(input =>
            Array.from(input.classList).some(cls => cls.startsWith('ktlNotValid_'))
        );

        if (invalidInputs.length === 0) {
            return { isValid: true, invalidInputs: [], errorMessage: '' };
        }

        // Build detailed error message with field info
        const invalidFields = invalidInputs.map(input => {
            const invalidClasses = Array.from(input.classList)
                .filter(cls => cls.startsWith('ktlNotValid_'))
                .join(', ');
            return `#${input.id || input.name} (${invalidClasses})`;
        }).join(', ');

        return {
            isValid: false,
            invalidInputs,
            errorMessage: `Form validation failed for ${viewId}. Found ${invalidInputs.length} invalid input(s): ${invalidFields}`
        };
    }

    /**
     * Submit all auto forms sequentially, skipping already-submitted forms
     * @private
     * @returns {Promise<Array>} Array of submission outcomes
     */
    async _submitAutoForms() {
        const outcomes = [];
        const activeAutoSubmitViewIds = this.getActiveAutoSubmitViewIds();

        for (const autoViewId of activeAutoSubmitViewIds) {
            if (this.submittedForms.has(autoViewId)) {
                outcomes.push({
                    success: true,
                    viewId: autoViewId,
                    skipped: true,
                    reason: 'Already submitted'
                });
                continue;
            }

            try {
                const outcome = await this._submitSingleAutoForm(autoViewId);
                outcomes.push(outcome);

                if (outcome.success) {
                    this.submittedForms.add(autoViewId);
                }
            } catch (err) {
                // Validation errors already logged in _submitSingleAutoForm
                if (!this._isValidationError(err)) {
                    errorHandler.handleError(err, {
                        manualSubmitViewId: this.manualSubmitViewId,
                        autoSubmitViewIds: this.autoSubmitViewIds,
                        failedViewId: autoViewId,
                        submittedForms: Array.from(this.submittedForms)
                    }, 'MultiFormCoordinator:SubmitAutoForms');
                }
                throw err;
            }
        }

        return outcomes;
    }

    /**
     * Submit a single auto form and wait for outcome
     * @private
     * @param {string} autoViewId - View ID of the auto form
     * @returns {Promise<Object>} Submission outcome
     */
    async _submitSingleAutoForm(autoViewId) {
        const autoView = document.getElementById(autoViewId);
        if (!autoView) throw new Error(`Auto submit view "${autoViewId}" not found`);

        const autoForm = autoView.querySelector(this.selectors.FORM);
        const autoSubmitBtn = autoView.querySelector(this.selectors.SUBMIT_BUTTON);

        if (!autoForm || !autoSubmitBtn) {
            throw new Error(`Form or submit button not found in auto view "${autoViewId}"`);
        }

        try {
            // Enable form for validation
            this._setFormInputsDisabled(autoForm, false);
            autoSubmitBtn.disabled = false;

            // Validate before submitting
            const validationResult = this._validateForm(autoViewId, autoForm);
            if (!validationResult.isValid) {
                console.error(`[MultiFormCoordinator] ${validationResult.errorMessage}`);
                throw new Error(validationResult.errorMessage);
            }

            // Submit and wait for outcome
            const outcomePromise = this._waitForFormSubmitOutcome(autoViewId);
            autoSubmitBtn.click();
            const outcome = await outcomePromise;

            // Hide success message and disable form
            setVisibility(`#${autoViewId} ${this.selectors.SUCCESS_MESSAGE}`, false);
            this._setFormInputsDisabled(autoForm, true);

            return {
                success: true,
                viewId: autoViewId,
                record: outcome.record || null,
                timestamp: new Date().toISOString()
            };

        } catch (autoErr) {
            // Only log unexpected errors (validation already logged)
            if (!this._isValidationError(autoErr)) {
                errorHandler.handleError(autoErr, {
                    autoViewId,
                    manualSubmitViewId: this.manualSubmitViewId,
                    viewExists: !!autoView
                }, 'MultiFormCoordinator:SubmitSingleAutoForm');
            }
            throw autoErr;
        }
    }

    /**
     * Wait for form submission outcome by monitoring DOM for success/error messages
     * @private
     * @param {string} viewId - View ID to monitor
     * @returns {Promise<Object>} Submission result
     */
    _waitForFormSubmitOutcome(viewId) {
        return new Promise((resolve, reject) => {
            let cleanupDone = false;
            let timeoutId = null;
            let pollIntervalId = null;
            let observer = null;
            const submitEventNamespace = this._getEventNamespace('knack-form-submit', viewId);

            const cleanup = () => {
                if (cleanupDone) return;
                cleanupDone = true;
                if (timeoutId) clearTimeout(timeoutId);
                if (pollIntervalId) clearInterval(pollIntervalId);
                if (observer) observer.disconnect();
                $(document).off(submitEventNamespace);
            };

            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Form submission timeout for ${viewId} after ${this.timeouts.FORM_SUBMIT}ms`));
            }, this.timeouts.FORM_SUBMIT);

            const viewElement = document.getElementById(viewId);
            if (!viewElement) {
                cleanup();
                reject(new Error(`View element not found: ${viewId}`));
                return;
            }

            // Treat Knack's form-submit event as the primary success signal.
            // Some forms submit successfully without leaving a persistent success message in the DOM.
            $(document).off(submitEventNamespace);
            $(document).on(submitEventNamespace, (_, view, record) => {
                cleanup();
                resolve({
                    success: true,
                    record: record || null,
                    view: view?.key || viewId,
                    message: 'Form submitted successfully',
                });
            });

            const checkOutcome = () => {
                // Check for success message
                const successMsg = viewElement.querySelector(this.selectors.SUCCESS_MESSAGE);
                if (successMsg) {
                    cleanup();
                    resolve({
                        success: true,
                        record: null,
                        view: viewId,
                        message: successMsg.textContent.trim()
                    });
                    return true;
                }

                // Check for error message
                const errorMsg = viewElement.querySelector(this.selectors.ERROR_MESSAGE);
                if (errorMsg) {
                    cleanup();
                    reject(new Error(`Form submission failed: ${errorMsg.textContent.trim()}`));
                    return true;
                }

                // Check for invalid inputs
                const invalidInputs = viewElement.querySelectorAll('input.invalid, select.invalid, textarea.invalid, [aria-invalid="true"]');
                if (invalidInputs.length > 0) {
                    const fieldNames = Array.from(invalidInputs)
                        .map(inp => {
                            const label = inp.closest('.kn-input')?.querySelector('.kn-label');
                            return label ? label.textContent.trim().replace('*', '').trim() : 'Unknown field';
                        })
                        .filter((name, index, self) => self.indexOf(name) === index)
                        .slice(0, 3)
                        .join(', ');

                    cleanup();
                    reject(new Error(`Form validation failed: Required fields missing or invalid (${fieldNames})`));
                    return true;
                }

                return false;
            };

            // Monitor for changes with MutationObserver
            observer = new MutationObserver(checkOutcome);
            observer.observe(viewElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'aria-invalid']
            });

            // Wait until the new submission has started so a previous attempt's
            // rendered validation message is not mistaken for the new outcome.
            setTimeout(checkOutcome, this.timeouts.OUTCOME_POLL_INTERVAL);

            // Periodic polling as backup
            pollIntervalId = setInterval(() => {
                if (!cleanupDone) checkOutcome();
            }, this.timeouts.OUTCOME_POLL_INTERVAL);

            this.eventHandlers.set(`submit-${viewId}`, cleanup);
        });
    }

    /**
     * Submit the manual form
     * @private
     */
    async _submitManualForm(manualForm) {
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const manualOutcomePromise = this._waitForFormSubmitOutcome(this.manualSubmitViewId);
                    $(manualForm).submit();

                    const outcome = await manualOutcomePromise;

                    resolve(outcome);
                } catch (submitErr) {
                    errorHandler.handleError(submitErr, {
                        manualSubmitViewId: this.manualSubmitViewId
                    }, 'MultiFormCoordinator:SubmitManualForm');
                    reject(submitErr);
                }
            }, this.timeouts.PRE_SUBMIT_DELAY);
        });
    }

    /**
     * Enable or disable all form inputs
     * @private
     * @param {HTMLFormElement} form - The form element
     * @param {boolean} disabled - True to disable, false to enable
     */
    _setFormInputsDisabled(form, disabled) {
        if (!form) return;
        form.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = disabled;
        });
    }

    /**
     * Clean up previous event handlers from button and form
     * @private
     */
    _cleanupPreviousHandler(button) {
        if (button._multiSubmitHandler) {
            button.removeEventListener('click', button._multiSubmitHandler);
            delete button._multiSubmitHandler;
        }

        const form = button.closest('form');
        if (form && form._multiFormSubmitHandler) {
            form.removeEventListener('submit', form._multiFormSubmitHandler);
            delete form._multiFormSubmitHandler;
        }
    }

    /**
     * Clean up all event handlers and resources
     */
    destroy() {
        // Clean up manual form DOM event handlers
        const manualView = document.getElementById(this.manualSubmitViewId);
        if (manualView) {
            const manualForm = manualView.querySelector(this.selectors.FORM);
            const manualSubmitBtn = manualView.querySelector(this.selectors.SUBMIT_BUTTON);

            if (manualSubmitBtn && manualSubmitBtn._multiSubmitHandler) {
                manualSubmitBtn.removeEventListener('click', manualSubmitBtn._multiSubmitHandler);
                delete manualSubmitBtn._multiSubmitHandler;
            }

            if (manualForm && manualForm._multiFormSubmitHandler) {
                manualForm.removeEventListener('submit', manualForm._multiFormSubmitHandler);
                delete manualForm._multiFormSubmitHandler;
            }
        }

        // Clean up jQuery event handlers using stored namespaces
        this.eventHandlers.forEach((eventHandler) => {
            if (typeof eventHandler === 'function') {
                eventHandler();
                return;
            }

            $(document).off(eventHandler);
        });

        this.eventHandlers.clear();
        this.submittedForms.clear();
        this.isInitialized = false;
    }
}

/**
 * Legacy function wrapper - maintains same API as original function
 * @deprecated Consider using MultiFormSubmissionCoordinator class directly for better control
 * @param {string} manualSubmitViewId - The view ID of the manual (main) form.
 * @param {string[]} autoSubmitViewIds - Array of view IDs for forms to be auto-submitted before the manual form.
 * @param {string} renderedViewId - The view ID of the form that has just rendered.
 * @param {boolean|Function} [closeModalAfterSubmit=false] - If true, closes the modal after successful submission, or resolve that decision from submission context.
 * @returns {MultiFormSubmissionCoordinator} The coordinator instance
 */
function setupAutoFormSubmission(manualSubmitViewId, autoSubmitViewIds, renderedViewId, closeModalAfterSubmit = false) {
    const coordinator = new MultiFormSubmissionCoordinator({
        manualSubmitViewId,
        autoSubmitViewIds,
        closeModalAfterSubmit
    });
    coordinator.initialize(renderedViewId);
    return coordinator;
}

/**
 * Selects a connection by record id in a hidden connection field of a form, searching the Chosen list when the
 * option has not loaded yet. Needs the app global CONNECTION_FIELDS_OBJECT for the search fallback.
 * @param {string} viewId - Form view id.
 * @param {string|number} conxFieldIdInput - Connection field id number.
 * @param {string|null} [connectionId=null] - Record id to select (default: the id in the page URL).
 * @param {string} connectionObject - Key into CONNECTION_FIELDS_OBJECT for the lookup.
 * @returns {Promise<void>}
 */
async function addConnectionIdToRecord(viewId, conxFieldIdInput, connectionId = null, connectionObject) {
    const api = getKnackApiClient();
    const viewRoot = getViewRootElement(viewId);
    if (!(viewRoot instanceof HTMLElement)) return;

    const connectionField = viewRoot.querySelector(`#kn-input-field_${conxFieldIdInput}`);
    const select = connectionField?.querySelector('select');
    const conxId = connectionId || getRecordID();
    connectionField?.classList.add(CLASS_HIDDEN);
    const setConnectionId = (id) => {
        select.value = id;
        refreshChosen(select);
    };

    await ktl.core.waitSelector(`#kn-input-field_${conxFieldIdInput} select option`, 20000);
    if (select.options.length > 1) return setConnectionId(conxId);

    const { sceneIdAPI, viewIdAPI, clientPKField } = CONNECTION_FIELDS_OBJECT[connectionObject];
    try {
        const response = await api.getRecord(sceneIdAPI, viewIdAPI, connectionId);
        const optionText = response[`${clientPKField}_raw`];
        const searchInput = connectionField.querySelector('.chzn-search input');
        if (searchInput) {
            searchInput.focus();
            searchInput.value = optionText;
            fireEvent(searchInput, 'input');
        }

        // Poll for the filtered option (not awaited: the caller was never held up for it).
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const option = Array.from(select.options).find((candidate) => candidate.textContent === optionText);
            if (option) {
                setConnectionId(option.value);
                searchInput?.blur();
            } else if (Date.now() - startedAt < 10000) return;
            else console.log(`Timeout: Could not find item "${optionText}" in the dropdown.`);
            clearInterval(timer);
        }, 500);
    } catch (error) {
        console.error('Error fetching data from API:', error);
    }
}

/**
 * `_btnurl` keyword: makes links (or menu items) with given text navigate to a child page of the current URL.
 * Params: `linkText, pageUrl, isChildPage?, urlPart?`. For tables the record id comes from the row's `td.field_6087`.
 * V1 threw a ReferenceError for users without role access (it used a variable before declaring it); V2 removes the links.
 * @param {{key: string}} view - Knack view.
 * @param {Object} keywords - Parsed view keywords.
 */
function buttonToUrl({ key: viewId }, keywords) {
    const keyword = '_btnurl';
    if (!keywords[keyword]) return;
    const viewType = ktl.views.getViewType(viewId);
    if (['list', 'form'].includes(viewType)) return;
    const view = document.getElementById(viewId);

    ktl.core.getKeywordsByType(viewId, keyword).forEach(({ options, params: paramGroups }) => {
        if (!paramGroups.length) return console.error('Button URL Params Error - No parameter groups found.');
        paramGroups.forEach((params) => {
            if (params.length < 2) return console.error('Button URL Params Error - Insufficient parameters found.');
            const [linkText, pageUrl, isChildPageParam, urlPartParam] = params;
            const findLinks = (root) => Array.from(root?.querySelectorAll(viewType === 'menu' ? 'li' : 'a') ?? [])
                .filter((element) => element.textContent.replace('*', '').trim() === linkText);
            if (!ktl.core.hasRoleAccess(options)) return removeElement(findLinks(view));

            const currentUrl = sanitiseURL(window.location.href);
            const bindLinks = (links, targetUrl) => {
                if (!links.length) return console.error(`buttonURL Error - Button with text "${linkText}" not found.`);
                links.forEach((link) => bindClick(link, 'buttonToUrl', (event) => {
                    event.preventDefault();
                    window.location.href = targetUrl;
                }));
            };

            if (['table', 'search'].includes(viewType)) {
                getTableRowElements(viewId, (_index, row) => {
                    const knackId = row.querySelector('td.field_6087')?.textContent.trim() ?? '';
                    bindLinks(findLinks(row), `${currentUrl}${pageUrl}/${knackId}/`);
                });
            } else {
                const targetUrl = isChildPageParam !== 'false'
                    ? `${currentUrl}${pageUrl}/${getRecordID(urlPartParam || null)}/`
                    : `${currentUrl}${pageUrl}/`;
                bindLinks(findLinks(view), targetUrl);
            }
        });
    });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: quill-truncation
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Quill rich-text editor (React) and grid truncation ported as-is: V1 lines 7143-7655 and 7670-7872 (analyses C09, C10; Quill needs the React/ReactDOM page globals).

/**
 * Enhanced Quill Rich Text Editor for Knack Replaces Knack's Redactor editor with Quill.js
 */

/**
 * QuillEditor React component with optimized rendering
 */
function QuillEditor({ value, onChange, modules, theme = "snow", readOnly = false }) {
    const editorRef = React.useRef(null);
    const quillRef = React.useRef(null);

    // Initialize Quill instance
    React.useEffect(() => {
        if (!editorRef.current || !window.Quill || quillRef.current) return;

        // Create new Quill instance
        quillRef.current = new window.Quill(editorRef.current, {
            theme,
            modules,
            readOnly,
        });

        // Find the toolbar element through various fallback methods
        const toolbar = [
            editorRef.current.previousSibling,
            editorRef.current.parentNode?.querySelector('.ql-toolbar'),
            document.querySelector('.ql-toolbar')
        ].find(el => el?.classList?.contains('ql-toolbar'));

        // Detect Mac or Windows for shortcut display
        function getModifierKey() {
            return /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
        }

        if (toolbar) {
            const modifierKey = getModifierKey();
            const tooltips = [
                { selector: 'button.ql-bold', tip: `Bold (${modifierKey}+B)` },
                { selector: 'button.ql-italic', tip: `Italic (${modifierKey}+I)` },
                { selector: 'button.ql-underline', tip: `Underline (${modifierKey}+U)` },
                { selector: 'button.ql-link', tip: `Insert Link (${modifierKey}+K)` },
                { selector: 'button.ql-image', tip: 'Insert Image' },
                { selector: 'button.ql-code-block', tip: 'Code Block' },
                { selector: 'button.ql-blockquote', tip: 'Blockquote' },
                { selector: 'button.ql-clean', tip: 'Remove Formatting' },
                { selector: 'button.ql-list[value="ordered"]', tip: `Numbered List (${modifierKey}+Shift+7)` },
                { selector: 'button.ql-list[value="bullet"]', tip: `Bullet List (${modifierKey}+Shift+8)` },
                { selector: '.ql-color', tip: 'Text Color' },
                { selector: '.ql-background', tip: 'Background Color' },
                { selector: 'button.ql-script[value="sub"]', tip: `Subscript (${modifierKey}+,)` },
                { selector: 'button.ql-script[value="super"]', tip: `Superscript (${modifierKey }+.)` },
                { selector: '.ql-align', tip: 'Align' }
            ];

            tooltips.forEach(({ selector, tip }) => {
                toolbar.querySelectorAll(selector).forEach(btn => {
                    btn.title = tip;
                });
            });

            // Add tooltips for each align option in the dropdown
            const alignPicker = toolbar.querySelector('.ql-align.ql-picker');
            if (alignPicker) {
                const alignOptions = alignPicker.querySelectorAll('.ql-picker-item');
                alignOptions.forEach(option => {
                    switch (option.getAttribute('data-value')) {
                        case null:
                            option.title = 'Align Left';
                            break;
                        case 'center':
                            option.title = 'Align Center';
                            break;
                        case 'right':
                            option.title = 'Align Right';
                            break;
                        case 'justify':
                            option.title = 'Justify';
                            break;
                    }
                });
            }
        }

        // Listen for text changes
        quillRef.current.on('text-change', () => {
            const html = editorRef.current.querySelector('.ql-editor').innerHTML;
            onChange && onChange(html);
        });

        // Cleanup
        return () => {
            if (quillRef.current) {
                quillRef.current.off('text-change');
                quillRef.current = null;
            }
        };
    }, [modules, theme, readOnly]);

    // Handle external value changes
    React.useEffect(() => {
        if (
            !quillRef.current ||
            value === quillRef.current.root.innerHTML ||
            quillRef.current.hasFocus()
        ) return;

        quillRef.current.clipboard.dangerouslyPasteHTML(value || '');
    }, [value]);

    // Handle readOnly changes
    React.useEffect(() => {
        if (quillRef.current) {
            quillRef.current.enable(!readOnly);
        }
    }, [readOnly]);

    return React.createElement('div', { ref: editorRef });
}

/**
 * Custom Quill icon definitions for lists
 */
function initializeQuillIcons() {
    if (!(window.Quill?.imports?.['ui/icons'])) return;

    const icons = window.Quill.imports['ui/icons'];

    // Improved ordered list icon
    icons['list']['ordered'] = `
        <svg viewBox="0 0 18 18">
            <text x="2" y="5.5" font-size="6" font-family="Arial" fill="#444">1</text>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="3.8" rx="0.3"></rect>
            <text x="2" y="11.5" font-size="6" font-family="Arial" fill="#444">2</text>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="9.6" rx="0.3"></rect>
            <text x="2" y="17" font-size="6" font-family="Arial" fill="#444">3</text>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="15" rx="0.3"></rect>
        </svg>
    `;

    // Improved bullet list icon
    icons['list']['bullet'] = `
        <svg viewBox="0 0 18 18">
            <circle class="ql-fill" cx="5" cy="4" r="1.5"></circle>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="3.8" rx="0.3"></rect>
            <circle class="ql-fill" cx="5" cy="10" r="1.5"></circle>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="9.6" rx="0.3"></rect>
            <circle class="ql-fill" cx="5" cy="15" r="1.5"></circle>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="15" rx="0.3"></rect>
        </svg>
    `;
}

/**
 * Modal management for link and image insertion
 */
const QuillModal = {
    /**
     * Initialize the modal just once
     */
    init() {
        if (document.getElementById('quill-universal-modal')) return;

        // Create modal element
        const modal = document.createElement('div');
        modal.id = 'quill-universal-modal';
        modal.innerHTML = `
            <div class="ql-modal-content">
                <h3 id="ql-modal-title"></h3>
                <div id="ql-modal-fields"></div>
                <div class="ql-modal-actions">
                    <button id="ql-modal-save" type="button">Save</button>
                    <button id="ql-modal-unlink" type="button" style="display:none;">Unlink</button>
                    <button id="ql-modal-cancel" type="button">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #quill-universal-modal {
                position: fixed; z-index: 99999; left: 0; top: 0; width: 100vw; height: 100vh; display: none;
                background: rgba(0,0,0,0.3); align-items: center; justify-content: center;
            }
            .ql-modal-content {
                background: #fff; border-radius: 8px; padding: 1.5em 2em; min-width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                display: flex; flex-direction: column; gap: 1.25em;
            }
            .ql-modal-content h3 {
                margin: 0; padding: 0; font-size: 1.3em;
            }
            .ql-modal-content label {
                display: flex; flex-direction: column; gap: 0.5em; font-weight: 500;
                margin-bottom: 0.5em;
            }
            .ql-modal-content input {
                padding: 0.5em; border: 1px solid #ccc; border-radius: 4px;
                margin-bottom: 0;
            }
            .ql-modal-content small {
                color: #666; font-size: 0.65em; margin-top: -0.7em; margin-bottom: 0.85em;
                display: block;
            }
            .ql-modal-fields {
                margin-bottom: 0.5em;
            }
            .ql-modal-actions {
                display: flex; gap: 1em; justify-content: flex-end;
                margin-top: 0.5em; padding-top: 0.5em;
            }
            .ql-modal-actions button {
                padding: 0.6em 1.2em; border: none; border-radius: 4px;
                background: #0078d4; color: #fff; font-weight: 600; cursor: pointer;
                min-width: 80px;
            }
            .ql-modal-actions button#ql-modal-unlink { background: #e81123; }
            .ql-modal-actions button#ql-modal-cancel { background: #888; }
            .ql-modal-actions button:disabled { opacity: 0.6; cursor: not-allowed; }
            .ql-modal-actions button:hover { filter: brightness(1.1); }
        `;
        document.head.appendChild(style);
    },

    /**
     * Show the modal with the appropriate content
     */
    show({ type, url = '', label = '', onSave, onUnlink, onCancel }) {
        this.init();

        const modal = document.getElementById('quill-universal-modal');
        const fields = document.getElementById('ql-modal-fields');
        const title = document.getElementById('ql-modal-title');
        const saveBtn = document.getElementById('ql-modal-save');
        const unlinkBtn = document.getElementById('ql-modal-unlink');
        const cancelBtn = document.getElementById('ql-modal-cancel');

        // Set content based on type
        if (type === 'link') {
            title.textContent = 'Insert/Edit Link';
            fields.innerHTML = `
                <label>
                    Link URL:
                    <input type="url" id="ql-link-url" placeholder="https://example.com" value="${escapeHtml(url)}" required>
                    <small>
                        If you omit https:// it will be added automatically.
                    </small>
                </label>
                <label>
                    Link Text:
                    <input type="text" id="ql-link-label" placeholder="Link text" value="${escapeHtml(label)}" required>
                </label>
            `;
            unlinkBtn.style.display = '';
        } else if (type === 'image') {
            title.textContent = 'Insert Image';
            fields.innerHTML = `
                <label>
                    Image URL:
                    <input type="url" id="ql-image-url" placeholder="https://example.com/image.jpg" value="${escapeHtml(url)}" required>
                </label>
            `;
            unlinkBtn.style.display = 'none';
        }

        modal.style.display = 'flex';

        // Set up event handlers
        saveBtn.onclick = () => {
            if (type === 'link') {
                let urlVal = document.getElementById('ql-link-url').value.trim();
                let labelVal = document.getElementById('ql-link-label').value.trim();
                if (urlVal && labelVal) {
                    if (!/^https?:\/\//i.test(urlVal)) urlVal = 'https://' + urlVal;
                    onSave(urlVal, labelVal);
                    modal.style.display = 'none';
                }
            } else if (type === 'image') {
                let urlVal = document.getElementById('ql-image-url').value.trim();
                if (urlVal) {
                    onSave(urlVal);
                    modal.style.display = 'none';
                }
            }
        };

        unlinkBtn.onclick = () => {
            onUnlink && onUnlink();
            modal.style.display = 'none';
        };

        cancelBtn.onclick = () => {
            onCancel && onCancel();
            modal.style.display = 'none';
        };
    }
};

/**
 * Configuration for Quill editor features
 */
function createQuillModules() {
    return {
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, 4, false] }, { 'font': [] }],
                ['bold', 'italic', 'underline', { 'color': [] }, { 'background': [] }],
                [{ 'align': [] }, { 'list': 'ordered' }, { 'list': 'bullet' }],
                ['code-block', 'blockquote', { 'script': 'sub' }, { 'script': 'super' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: function () {
                    const quill = this.quill;
                    const savedRange = quill.getSelection(true); // `true` focuses the editor, so a range always exists.

                    QuillModal.show({
                        type: 'image',
                        url: '',
                        onSave: (url) => {
                            quill.setSelection(savedRange.index, savedRange.length);
                            quill.insertEmbed(savedRange.index, 'image', url, 'user');
                        }
                    });
                },
                link: function () {
                    const quill = this.quill;
                    let savedRange = quill.getSelection();
                    if (!savedRange) return;

                    // Get current link and text at selection
                    let currentLink = '';
                    let currentText = '';

                    const [leaf] = quill.getLeaf(savedRange.index);
                    if (leaf?.parent?.formats && typeof leaf.parent.formats === 'function') {
                        const formats = leaf.parent.formats();
                        if (formats.link) {
                            currentLink = formats.link;
                            currentText = leaf.parent.domNode.innerText || quill.getText(savedRange.index, savedRange.length);
                        } else {
                            currentText = quill.getText(savedRange.index, savedRange.length);
                        }
                    } else {
                        currentText = quill.getText(savedRange.index, savedRange.length);
                    }

                    QuillModal.show({
                        type: 'link',
                        url: currentLink,
                        label: currentText,
                        onSave: (url, label) => {
                            quill.setSelection(savedRange.index, savedRange.length);
                            quill.deleteText(savedRange.index, savedRange.length);
                            quill.insertText(savedRange.index, label, 'link', url);
                        },
                        onUnlink: () => {
                            quill.setSelection(savedRange.index, savedRange.length);
                            quill.format('link', false);
                        }
                    });
                }
            }
        },
        keyboard: {
            bindings: {
                orderedList: {
                    key: 55, // '7'
                    shortKey: true,
                    shiftKey: true,
                    handler: function () {
                        this.quill.format('list', 'ordered');
                    }
                },
                bulletList: {
                    key: 56, // '8'
                    shortKey: true,
                    shiftKey: true,
                    handler: function () {
                        this.quill.format('list', 'bullet');
                    }
                }
            }
        }
    };
}

/**
 * Main function to replace Knack's rich text editor with Quill
 */
function replaceKnackRichTextWithQuillEditor(viewId, options = {}) {
    // Check for required dependencies
    if (!window.React || !window.ReactDOM || !window.Quill) {
        console.warn("React or Quill not loaded, using Knack Redactor editor.");
        return;
    }

    // Initialize Quill icons
    initializeQuillIcons();

    // Configure Quill
    const quillModules = createQuillModules();

    // Get container element
    const container = viewId ? document.getElementById(viewId) : document;
    if (!container) return;

    // Get all rich text inputs in container
    const richInputs = container.querySelectorAll?.('.kn-input-rich_text') ||
        document.querySelectorAll('.kn-input-rich_text');

    if (!richInputs.length) return;

    // Process each rich text input
    richInputs.forEach((knInput, idx) => {
        // Idempotency guard: skip if we've already mounted a Quill editor for this input
        if (knInput.dataset.quillMounted === 'true') return;
        const knackEditor = knInput.querySelector('.redactor-editor');
        const textarea = knInput.querySelector('textarea.rich_text');
        if (!knackEditor || !textarea) return;

        // Move label above the new editor
        const label = knInput.querySelector('label.kn-label');
        let detachedLabel = null;
        if (label) {
            detachedLabel = label.cloneNode(true);
            label.remove();
        }

        // Create or get React container
        const containerId = `${viewId || 'global'}-${idx}`;
        let reactDiv = knInput.parentNode.querySelector(`.my-react-editor[data-for="${knInput.id}"]`);

        if (!reactDiv) {
            reactDiv = document.createElement('div');
            reactDiv.className = 'my-react-editor';
            reactDiv.id = `my-react-editor-${containerId}`;
            reactDiv.setAttribute('data-for', knInput.id);

            knInput.parentNode.insertBefore(reactDiv, knInput);
            if (detachedLabel) {
                reactDiv.parentNode.insertBefore(detachedLabel, reactDiv);
            }
        }

        // Replace editor
        try {
            // Hide original editor
            knackEditor.classList.add(CLASS_HIDDEN);

            // Render Quill editor
            if (!reactDiv._reactRootContainer) {
                reactDiv._reactRootContainer = ReactDOM.createRoot(reactDiv);
            }

            reactDiv._reactRootContainer.render(
                React.createElement(QuillEditor, {
                    theme: options.theme || "snow",
                    value: textarea.value,
                    modules: options.modules || quillModules,
                    readOnly: options.readOnly || false,
                    onChange: (content) => {
                        const isEmpty = !content || (!/<img\b/i.test(content) && content.replace(/<[^>]+>/g, '').trim() === '');
                        textarea.value = isEmpty ? '' : content;
                        if (knackEditor) {
                            knackEditor.innerHTML = isEmpty ? '' : content;
                        }
                        // Trigger events to notify Knack
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                })
            );

            // Mark this input as processed to avoid duplicate toolbars on subsequent calls
            knInput.dataset.quillMounted = 'true';

            // Clean up old editor elements
            document.querySelectorAll('.redactor-toolbar, .redactor-toolbar-tooltip, .redactor-air, .redactor-dropdown')
                .forEach(el => el.remove());
            document.querySelectorAll('[id^="redactor-toolbar-"]')
                .forEach(el => el.remove());

        } catch (err) {
            console.error("Failed to load QuillEditor, reverting to Knack Redactor editor:", err);

            // Revert to original editor
            knackEditor.classList.remove(CLASS_HIDDEN);
            reactDiv.remove();
        }
    });

    return richInputs.length; // Return count of replaced editors
}

// Prevent KTL long click when Quill editor is focused or clicked
document.addEventListener('mousedown', function(e) {
    const isQuillFocused = document.activeElement && document.activeElement.closest('.ql-editor');
    const isQuillClick = e.target.closest('.ql-editor, .ql-toolbar, .ql-container');

    // Don't block clicks on toolbar pickers - they need to work!
    const isPickerClick = e.target.closest('.ql-picker, .ql-picker-label, .ql-picker-options, .ql-picker-item');

    if ((isQuillFocused || isQuillClick) && !isPickerClick) {
        e.stopImmediatePropagation();
    }
}, true); // Use capture phase


const gridTruncationControllers = new WeakMap();
const gridTruncationCells = new WeakMap();

/**
 * Adds expandable previews to grid columns, retaining the original content nodes.
 * Also available through the _trunk view keyword when the app's keyword handler calls
 * truncateColumnsInGrid.fromKeywords(view, keywords). Each group accepts a field ID
 * and an optional character limit: _trunk=[field_1234] defaults to 75 characters;
 * _trunk=[field_1234,150],[field_5678] configures multiple columns independently.
 * Keyword usage observes subsequent content updates; direct calls remain one-shot
 * unless options.observe is true. Previews retain basic formatting and clickable links.
 * @param {string} viewId - Rendered view ID.
 * @param {Object} fieldThresholds - Character limits mapped to field IDs, e.g. {75: [1234]}.
 * @param {Object} [options={}] - Set observe to true to follow subsequent DOM updates.
 * @returns {Object|undefined} Controller with refresh and disconnect methods.
 */
function truncateColumnsInGrid(viewId, fieldThresholds, options = {}) {
    const root = document.getElementById(viewId);
    if (!root) return;
    let controller = gridTruncationControllers.get(root);
    if (!controller) {
        const limits = new Map();
        let observing = false;
        let selector = '';
        const observer = new MutationObserver((mutations) => {
            if (!root.isConnected) return disconnect();
            const relevant = mutations.some(({ target, addedNodes }) => {
                const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
                if (element?.closest('.trunk-preview, .trunk-toggle')) return false;
                return element?.closest(selector) || Array.from(addedNodes).some(node =>
                    node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector)));
            });
            if (relevant) refresh();
        });
        // Observe only ancestor child lists, so removing a view/scene releases its observer.
        const removalObserver = new MutationObserver(() => {
            if (!root.isConnected) disconnect();
        });

        /** Stops observation without changing the displayed content. @returns {void} */
        function disconnect() {
            observing = false;
            observer.disconnect();
            removalObserver.disconnect();
        }

        /** Rebuilds changed previews while excluding our own mutations. @returns {void} */
        function refresh() {
            observer.disconnect();
            try {
                for (const [fieldId, limit] of limits) {
                    root.querySelectorAll(`td.${fieldId}, td[data-field-key="${fieldId}"]`).forEach(cell => {
                        const columnIndex = cell.dataset.columnIndex;
                        const content = Array.from(cell.children).find(child => child.classList.contains(`col-${columnIndex}`)) || cell;
                        renderGridTruncation(content, limit);
                    });
                }
            } finally {
                if (observing) observer.observe(root, { childList: true, characterData: true, subtree: true });
            }
        }

        /**
         * Merges column limits and optionally enables observation.
         * @param {Map<string, number>} fields - Validated column limits.
         * @param {boolean} observe - Whether to observe updates.
         * @returns {void}
         */
        function configure(fields, observe) {
            fields.forEach((limit, field) => limits.set(field, limit));
            selector = Array.from(limits.keys()).map(field => `td.${field}, td[data-field-key="${field}"]`).join(',');
            if (observe && !observing && selector) {
                observing = true;
                for (let parent = root.parentNode; parent; parent = parent.parentNode) {
                    removalObserver.observe(parent, { childList: true });
                }
            }
            refresh();
        }
        controller = { configure, refresh, disconnect };
        gridTruncationControllers.set(root, controller);
    }
    const fields = new Map();
    Object.entries(fieldThresholds || {}).forEach(([value, ids]) => {
        const limit = Number(value);
        if (!Number.isSafeInteger(limit) || limit <= 0) return;
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            const field = knackNavigator.normalizeFieldId(id);
            if (field) fields.set(field, limit);
        });
    });
    controller.configure(fields, options.observe === true);
    return controller;
}

/**
 * Renders a preview without duplicating Knack connection attributes or live controls.
 * @param {HTMLElement} content - Column content wrapper (or the cell itself).
 * @param {number} limit - Maximum preview character count, excluding the ellipsis.
 * @returns {void}
 */
function renderGridTruncation(content, limit) {
    const previous = gridTruncationCells.get(content);
    const intact = previous && previous.full.parentNode === content;
    if (intact && previous.limit === limit && previous.html === previous.full.innerHTML
        && previous.preview.parentNode === content && previous.button.parentNode === content
        && content.childNodes.length === 3) return;

    const expanded = intact && previous.button.getAttribute('aria-expanded') === 'true';
    if (intact) previous.full.replaceWith(...previous.full.childNodes);
    previous?.preview.remove();
    previous?.button.remove();
    gridTruncationCells.delete(content);
    // Editing widgets and media do not have a useful character-based preview.
    if (content.querySelector('input, textarea, select, button, iframe, img, video, audio, script, style')) return;

    const preview = document.createElement('div');
    preview.className = 'trunk-preview';
    let length = 0;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /**
     * Copies text, basic formatting and link destinations, excluding IDs and Knack metadata.
     * @param {Node} source - Original node.
     * @param {Node} target - Preview parent.
     * @returns {void}
     */
    function copyPreview(source, target) {
        if (source.nodeType === Node.TEXT_NODE) {
            const characters = Array.from(segmenter.segment(source.textContent), item => item.segment);
            if (length < limit) target.append(document.createTextNode(characters.slice(0, limit - length).join('')));
            length += characters.length;
        } else if (source.nodeType === Node.ELEMENT_NODE) {
            if (source.hidden || source.getAttribute('aria-hidden') === 'true' || source.style.display === 'none') return;
            const tag = source.tagName.toLowerCase();
            const block = /^(br|p|div|li|h[1-6])$/.test(tag);
            if (block && length) length += 1;
            const copy = document.createElement(/^(a|br|p|div|ul|ol|li|strong|b|em|i|u|s|span)$/.test(tag) ? tag : 'span');
            if (tag === 'a') {
                // Keep native navigation (including keyboard and open-in-new-tab actions)
                // without duplicating connection IDs or application selector metadata.
                ['href', 'target', 'rel', 'title', 'download', 'hreflang', 'referrerpolicy'].forEach(attribute => {
                    if (source.hasAttribute(attribute)) copy.setAttribute(attribute, source.getAttribute(attribute));
                });
            }
            if (length < limit) target.append(copy);
            source.childNodes.forEach(child => copyPreview(child, copy));
        }
    }
    content.childNodes.forEach(node => copyPreview(node, preview));
    if (length <= limit) return;
    preview.append(document.createTextNode('…'));

    const full = document.createElement('div');
    full.className = 'trunk-full';
    full.append(...content.childNodes);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-expand trunk-toggle';
    button.style.cssText = 'background:none;border:0;padding:0;font:inherit;color:#0645ad;text-decoration:underline;cursor:pointer';
    /** Applies the expansion state to both content and button. @param {boolean} open - Expanded state. @returns {void} */
    function setExpanded(open) {
        full.hidden = !open;
        full.style.display = open ? '' : 'none';
        preview.hidden = open;
        preview.style.display = open ? 'none' : '';
        button.setAttribute('aria-expanded', String(open));
        button.textContent = open ? 'View less' : 'View more';
    }
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(button.getAttribute('aria-expanded') !== 'true');
    });
    button.addEventListener('mousedown', event => event.stopPropagation());
    setExpanded(Boolean(expanded));
    content.append(preview, full, button);
    gridTruncationCells.set(content, { preview, full, button, limit, html: full.innerHTML });
}

/**
 * Applies _trunk=[field_1234],[field_5678,150] using parsed KTL keyword groups.
 * @param {Object} view - Knack view metadata.
 * @param {Object} keywords - Parsed view keywords.
 * @returns {Object|undefined} Grid truncation controller.
 */
truncateColumnsInGrid.fromKeywords = function (view, keywords) {
    if (view?.type !== 'table' || !keywords?._trunk) return;
    const fields = new Map();
    keywords._trunk.forEach(entry => {
        if (entry.options && !ktl.core.hasRoleAccess(entry.options)) return;
        (entry.params || []).forEach(params => {
            if (!Array.isArray(params) || params.length < 1 || params.length > 2) return;
            const field = knackNavigator.normalizeFieldId(params[0]);
            const limit = params.length === 1 ? 75 : Number(params[1]);
            if (field && Number.isSafeInteger(limit) && limit > 0) fields.set(field, limit);
        });
    });
    if (!fields.size) return;
    const thresholds = {};
    fields.forEach((limit, field) => (thresholds[limit] ||= []).push(field));
    return truncateColumnsInGrid(view.key, thresholds, { observe: true });
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: pickers-options-menu
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Date/time pickers, select options and menu link filters ported as-is (jQuery only for the Knack datepicker/timepicker plugins and Chosen). Analyses C11, C12, C13.

/**
 * Attaches an accessible, dependency-free time picker to one or more text inputs.
 * The selected value is written as `HH:mm` and dispatched through normal input/change
 * events, so it can be used with native fields as well as custom application forms.
 *
 * @param {HTMLElement|string|Array|NodeList} inputOrSelector - Input(s) or selector.
 * @param {Object} [opts={}] - Picker options.
 * @param {number} [opts.step=15] - Minutes between displayed choices; must divide 60.
 * @param {string} [opts.placeholder='HH:MM'] - Input placeholder when none is set.
 * @param {string|Function|null} [opts.minTime=null] - Earliest time, or a function returning one when the picker opens.
 * @param {boolean} [opts.allowNextDay=false] - Keep earlier clock times as `+1 day` choices for overnight ranges.
 * @param {Function|null} [opts.onChange=null] - Called with `(value, input)` after selection.
 * @returns {Function} Removes the pickers and listeners.
 */
function attachTimePicker(inputOrSelector, opts = {}) {
    const options = Object.assign({ step: 15, placeholder: 'HH:MM', minTime: null, allowNextDay: false, onChange: null }, opts || {});
    const step = Number.isFinite(Number(options.step)) && Number(options.step) > 0 && 60 % Number(options.step) === 0
        ? Number(options.step)
        : 15;
    const inputs = typeof inputOrSelector === 'string'
        ? Array.from(document.querySelectorAll(inputOrSelector))
        : (NodeList.prototype.isPrototypeOf(inputOrSelector) || Array.isArray(inputOrSelector))
            ? Array.from(inputOrSelector)
            : inputOrSelector instanceof HTMLElement ? [inputOrSelector] : [];
    const cleanups = [];

    if (!document.getElementById('shared-time-picker-styles')) {
        const style = document.createElement('style');
        style.id = 'shared-time-picker-styles';
        style.textContent = `
            .sharedTimePicker { position: fixed; z-index: 10050; width: min(380px, calc(100vw - 24px)); max-height: 280px; overflow: auto; padding: 8px; border: 1px solid #78919a; border-radius: 4px; background: #fff; box-shadow: 0 10px 28px rgba(0, 0, 0, .22); }
            .sharedTimePicker[hidden] { display: none; }
            .sharedTimePicker__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
            .sharedTimePicker__option { min-height: 32px; border: 1px solid #c9d8dc; border-radius: 3px; background: #fff; color: #18323c; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
            .sharedTimePicker__option:hover, .sharedTimePicker__option:focus { border-color: #007f86; background: #e8f7f8; outline: 0; }
            .sharedTimePicker__option[aria-selected="true"] { border-color: #005f66; background: #007f86; color: #fff; font-weight: 700; }
        `;
        document.head.appendChild(style);
    }

    const normaliseTime = function (value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const match = raw.match(/^(?:([01]?\d|2[0-3])(?::?([0-5]\d)?)?)$/);
        if (!match) return '';
        const hour = Number(match[1]);
        const minute = Number(match[2] || 0);
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    };
    const getMinutes = function (value) {
        const normalized = normaliseTime(value);
        if (!normalized) return null;
        const [hours, minutes] = normalized.split(':').map(Number);
        return (hours * 60) + minutes;
    };

    inputs.forEach(function (input, index) {
        if (!(input instanceof HTMLInputElement)) return;
        const pickerId = `shared-time-picker-${Date.now()}-${index}`;
        const picker = document.createElement('div');
        picker.className = 'sharedTimePicker';
        picker.id = pickerId;
        picker.hidden = true;
        picker.setAttribute('role', 'listbox');
        picker.setAttribute('aria-label', 'Choose a time');
        const times = Array.from({ length: (24 * 60) / step }, function (_, timeIndex) {
            const totalMinutes = timeIndex * step;
            return { value: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`, totalMinutes };
        });
        document.body.appendChild(picker);

        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = input.placeholder || options.placeholder;
        input.setAttribute('aria-haspopup', 'listbox');
        input.setAttribute('aria-controls', pickerId);
        input.setAttribute('aria-expanded', 'false');
        let suppressNextFocusOpen = false;

        const positionPicker = function () {
            const rect = input.getBoundingClientRect();
            picker.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(380, window.innerWidth - 24) - 12))}px`;
            picker.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 292)}px`;
        };
        const closePicker = function () {
            picker.hidden = true;
            input.setAttribute('aria-expanded', 'false');
        };
        const renderOptions = function () {
            const configuredMinTime = typeof options.minTime === 'function' ? options.minTime(input) : options.minTime;
            const minimumMinutes = getMinutes(configuredMinTime);
            const orderedTimes = minimumMinutes === null
                ? times.map(function (time) { return { ...time, nextDay: false }; })
                : options.allowNextDay
                    ? times.map(function (time) {
                        return { ...time, nextDay: time.totalMinutes < minimumMinutes };
                    }).sort(function (left, right) {
                        return (left.totalMinutes + (left.nextDay ? 1440 : 0)) - (right.totalMinutes + (right.nextDay ? 1440 : 0));
                    })
                    : times.filter(function (time) { return time.totalMinutes >= minimumMinutes; }).map(function (time) {
                        return { ...time, nextDay: false };
                    });
            picker.innerHTML = `<div class="sharedTimePicker__grid">${orderedTimes.map(function (time) {
                const label = `${time.value}${time.nextDay ? ' +1' : ''}`;
                const accessibleLabel = `${time.value}${time.nextDay ? ', next day' : ''}`;
                return `<button type="button" class="sharedTimePicker__option" role="option" data-time="${time.value}" aria-label="${accessibleLabel}" aria-selected="false">${label}</button>`;
            }).join('')}</div>`;
        };
        const openPicker = function () {
            renderOptions();
            positionPicker();
            picker.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            const selected = normaliseTime(input.value);
            picker.querySelectorAll('[data-time]').forEach(function (button) {
                button.setAttribute('aria-selected', String(button.dataset.time === selected));
            });
        };
        const writeValue = function (value) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof options.onChange === 'function') options.onChange(value, input);
        };
        const focusInputWithoutOpeningPicker = function () {
            suppressNextFocusOpen = true;
            input.focus();
        };
        const onFocus = function () {
            if (suppressNextFocusOpen) {
                suppressNextFocusOpen = false;
                return;
            }
            openPicker();
        };
        const onBlur = function () {
            const normalised = normaliseTime(input.value);
            if (input.value && normalised) input.value = normalised;
        };
        const onPickerClick = function (event) {
            const button = event.target.closest('.sharedTimePicker__option[data-time]');
            if (!button) return;
            writeValue(button.dataset.time || '');
            closePicker();
            focusInputWithoutOpeningPicker();
        };
        const onPickerKeyDown = function (event) {
            const options = Array.from(picker.querySelectorAll('.sharedTimePicker__option'));
            const currentIndex = options.indexOf(event.target);
            if (currentIndex < 0) return;
            const moveFocus = function (index) {
                event.preventDefault();
                options[Math.max(0, Math.min(options.length - 1, index))]?.focus();
            };
            if (event.key === 'ArrowRight') moveFocus(currentIndex + 1);
            else if (event.key === 'ArrowLeft') moveFocus(currentIndex - 1);
            else if (event.key === 'ArrowDown') moveFocus(currentIndex + 4);
            else if (event.key === 'ArrowUp') moveFocus(currentIndex - 4);
            else if (event.key === 'Home') moveFocus(0);
            else if (event.key === 'End') moveFocus(options.length - 1);
            else if (event.key === 'Escape') {
                event.preventDefault();
                closePicker();
                focusInputWithoutOpeningPicker();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                writeValue(event.target.dataset.time || '');
                closePicker();
                focusInputWithoutOpeningPicker();
            }
        };
        const onDocumentPointerDown = function (event) {
            if (event.target !== input && !picker.contains(event.target)) closePicker();
        };
        const onKeyDown = function (event) {
            if (event.key === 'Escape') closePicker();
            if (event.key === 'ArrowDown' && picker.hidden) {
                event.preventDefault();
                openPicker();
                picker.querySelector('.sharedTimePicker__option[aria-selected="true"], .sharedTimePicker__option')?.focus();
            }
        };
        input.addEventListener('focus', onFocus);
        input.addEventListener('blur', onBlur);
        input.addEventListener('keydown', onKeyDown);
        picker.addEventListener('click', onPickerClick);
        picker.addEventListener('keydown', onPickerKeyDown);
        document.addEventListener('pointerdown', onDocumentPointerDown, true);
        cleanups.push(function () {
            input.removeEventListener('focus', onFocus);
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('keydown', onKeyDown);
            picker.removeEventListener('click', onPickerClick);
            picker.removeEventListener('keydown', onPickerKeyDown);
            document.removeEventListener('pointerdown', onDocumentPointerDown, true);
            picker.remove();
        });
    });

    return function () { cleanups.forEach(function (cleanup) { cleanup(); }); };
}

/**
 * Enhance a jQuery UI datepicker/timepicker input to show month/year selectors, optional date/time bounds, and apply styling.
 * Safe no-op when required plugins are not present or the input lacks an initialized picker.
 *
 * Supports targeting via:
 *  - Knack field reference: { viewId: 'view_1234', fieldId: 'field_5678' } (also supports arrays of these)
 *  - CSS selector string
 *  - HTMLElement
 *  - NodeList / array of elements
 *
 * @param {HTMLElement|string|Object|Array|NodeList} inputOrSelector - Target(s) to enhance
 * @param {Object} [opts] - Options
 * @param {('date'|'time'|'datetime')} [opts.mode='date'] - Apply to date only, time only, or both
 *
 * @param {boolean} [opts.changeMonth=true] - Show month selector (datepicker)
 * @param {boolean} [opts.changeYear=true] - Show year selector (datepicker)
 * @param {number} [opts.yearsBack=80] - Years back from current year for yearRange (datepicker)
 * @param {number} [opts.yearsForward=5] - Years forward from current year for yearRange (datepicker)
 * @param {boolean} [opts.showButtonPanel=false] - Show Today/Done button panel (datepicker)
 *
 * @param {string|null} [opts.dateFormat=null] - Date format string for datepicker
 * @param {string|Date|number|null} [opts.minDate=null] - Minimum selectable date (datepicker)
 * @param {string|Date|number|null} [opts.maxDate=null] - Maximum selectable date (datepicker)
 *
 * @param {string|null} [opts.timeFormat='H:i'] - Time format string (timepicker)
 * @param {string|Date|null} [opts.minTime=null] - Earliest selectable time (timepicker)
 * @param {string|Date|null} [opts.maxTime=null] - Latest selectable time (timepicker)
 * @param {Array<Array<string|Date>>|null} [opts.disableTimeRanges=null] - Disabled time ranges [[start, end], ...]
 * @param {number|null} [opts.step=null] - Minute step for timepicker
 * @param {Object|null} [opts.timepickerOptions=null] - Raw options forwarded to the timepicker plugin
 *
 * @param {boolean} [opts.waitForInit=false] - If true, retries until applied or attempts exhausted
 * @param {number} [opts.maxAttempts=10] - Retry attempts when waitForInit is true
 * @param {number} [opts.attemptInterval=200] - Delay between retries in ms
 * @param {Function|null} [opts.onApplied=null] - Callback invoked per element where enhancements were applied
 *
 * @returns {boolean|Promise<boolean>} True if enhancement applied, false otherwise (Promise when waitForInit)
 */
function enhanceDateTimePicker(inputOrSelector, opts = {}) {
    const defaults = {
        mode: 'date',
        changeMonth: true,
        changeYear: true,
        yearsBack: 80,
        yearsForward: 5,
        showButtonPanel: false,
        dateFormat: null,
        minDate: null,
        maxDate: null,
        waitForInit: false,
        maxAttempts: 10,
        attemptInterval: 200,
        onApplied: null,
        timeFormat: 'H:i',
        minTime: null,
        maxTime: null,
        disableTimeRanges: null,
        step: null,
        timepickerOptions: null
    };

    const options = Object.assign({}, defaults, opts || {});
    const mode = String(options.mode || 'date').toLowerCase();
    const wantsDate = mode === 'date' || mode === 'datetime';
    const wantsTime = mode === 'time' || mode === 'datetime';

    const hasJquery = !!(window.jQuery && window.jQuery.fn);
    const hasDatepicker = hasJquery && typeof window.jQuery.fn.datepicker === 'function';
    const hasTimepicker = hasJquery && typeof window.jQuery.fn.timepicker === 'function';

    if (!hasJquery || (wantsDate && !hasDatepicker) || (wantsTime && !hasTimepicker)) {
        return options.waitForInit ? Promise.resolve(false) : false;
    }

    /**
     * Support passing a Knack field reference object:
     *   { viewId: 'view_8995', fieldId: 'field_4939' }
     * We will locate #kn-input-field_4939 inside the view and then target any contained date/time inputs:
     */
    const resolveFromFieldRef = (ref) => {
        if (!ref || typeof ref !== 'object') return [];
        const viewId = ref.viewId;
        const fieldId = ref.fieldId;

        if (!viewId || !fieldId) return [];

        const viewEl = document.getElementById(viewId);
        if (!viewEl) return [];

        const containerId = `kn-input-${fieldId}`;
        const fieldContainer = viewEl.querySelector(`#${containerId}`);
        if (!fieldContainer) return [];

        const base = `${viewId}-${fieldId}`;
        const validIds = new Set([
            base,
            `${base}-time`,
            `${base}-to`,
            `${base}-time-to`
        ]);

        const inputs = Array.from(fieldContainer.querySelectorAll('input')).filter((input) => {
            if (!input || !input.id) return false;
            return validIds.has(input.id);
        });

        return inputs;
    };

    const resolveDateTimeElement = () => {
        // Array of field refs: [{viewId, fieldId}, ...]
        if (
            Array.isArray(inputOrSelector) &&
            inputOrSelector.length &&
            typeof inputOrSelector[0] === 'object' &&
            !(inputOrSelector[0] instanceof Element)
        ) {
            const all = inputOrSelector.flatMap((ref) => resolveFromFieldRef(ref));
            return Array.from(new Set(all));
        }

        // Single field ref: {viewId, fieldId}
        if (
            inputOrSelector &&
            typeof inputOrSelector === 'object' &&
            !(inputOrSelector instanceof Element) &&
            !NodeList.prototype.isPrototypeOf(inputOrSelector)
        ) {
            const asRef = resolveFromFieldRef(inputOrSelector);
            if (asRef.length) return asRef;
        }

        // Original behaviours
        if (typeof inputOrSelector === 'string') return Array.from(document.querySelectorAll(inputOrSelector));
        if (NodeList.prototype.isPrototypeOf(inputOrSelector) || Array.isArray(inputOrSelector)) return Array.from(inputOrSelector);
        if (inputOrSelector instanceof Element) return [inputOrSelector];
        return [];
    };

    const els = resolveDateTimeElement();
    if (!els.length) return options.waitForInit ? Promise.resolve(false) : false;

    // Inject datepicker styles only when date mode is requested and styles are absent
    if (wantsDate && !document.getElementById('knack-datepicker-styles')) {
        const style = document.createElement('style');
        style.id = 'knack-datepicker-styles';
        style.textContent = `
        /* Improve month/year select styling in jQuery UI datepicker */
        .ui-datepicker-title {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 6px;
        }
        .ui-datepicker select.ui-datepicker-month, .ui-datepicker select.ui-datepicker-year {
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid #cfcfcf;
            background: #fff;
            color: #222;
            font-size: 13px;
            margin-right: 0;
            display: inline-block;
        }
        .ui-datepicker .ui-datepicker-header {
            padding: 6px 8px;
            background: #f5f6f7;
            border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        .ui-datepicker .ui-datepicker-calendar td a {
            border-radius: 4px;
            padding: 6px 8px;
        }
        .ui-datepicker .ui-datepicker-buttonpane {
            text-align: right;
            padding: 6px 8px;
        }
        `;
        document.head.appendChild(style);
    }

    const applyToElements = () => {
        let appliedAny = false;

        els.forEach((el) => {
            try {
                const datepickerEl = $(el);
                if (!datepickerEl || !datepickerEl.hasClass) return;

                let appliedOnElement = false;

                // Date enhancements (month/year dropdowns, min/max date, etc.)
                if (wantsDate && datepickerEl.hasClass('hasDatepicker')) {
                    const currentYear = new Date().getFullYear();
                    const startYear = currentYear - Math.max(0, options.yearsBack);
                    const endYear = currentYear + Math.max(0, options.yearsForward);

                    const optObj = {
                        changeMonth: !!options.changeMonth,
                        changeYear: !!options.changeYear,
                        yearRange: `${startYear}:${endYear}`,
                        showButtonPanel: !!options.showButtonPanel
                    };


                    if (options.dateFormat) optObj.dateFormat = options.dateFormat;
                    if (options.minDate !== null) optObj.minDate = options.minDate;
                    if (options.maxDate !== null) optObj.maxDate = options.maxDate;

                    datepickerEl.datepicker('option', optObj);
                    // Ensure the "Today" button actually sets today's date (can be unreliable in Knack)
                    if (optObj.showButtonPanel) {

                        // Attach once per page load
                        if (!document.documentElement.dataset.knackTodayHandlerAttached) {
                            document.documentElement.dataset.knackTodayHandlerAttached = '1';

                            document.addEventListener('click', (e) => {
                                const btn = e.target && e.target.closest
                                    ? e.target.closest('.ui-datepicker-current[data-handler="today"]')
                                    : null;

                                if (!btn) return;

                                try {
                                    const inst = window.jQuery && window.jQuery.datepicker
                                        ? window.jQuery.datepicker._curInst
                                        : null;

                                    const input = inst && inst.input ? inst.input : null;
                                    if (!input || !input.length) return;

                                    input.datepicker('setDate', new Date());
                                    input.datepicker('hide');
                                } catch (err) {
                                    // swallow
                                }
                            }, true);
                        }
                    }
                    appliedOnElement = true;
                }

                // Time enhancements with guard to avoid affecting date inputs
                if (wantsTime && typeof datepickerEl.timepicker === 'function') {
                    // Prevent accidentally initialising the timepicker on date inputs
                    const inputId = datepickerEl.attr('id') || '';
                    const inputName = datepickerEl.attr('name') || '';

                    const isTimeInput =
                        /-time(-to)?$/.test(inputId) ||
                        inputName === 'time' ||
                        inputName === 'to_time' ||
                        datepickerEl.hasClass('kn-time');

                    if (!isTimeInput) return;

                    const timeOpts = {};
                    if (options.timeFormat) timeOpts.timeFormat = options.timeFormat;
                    if (options.minTime !== null) timeOpts.minTime = options.minTime;
                    if (options.maxTime !== null) timeOpts.maxTime = options.maxTime;
                    if (options.disableTimeRanges) timeOpts.disableTimeRanges = options.disableTimeRanges;
                    if (options.step) timeOpts.step = options.step;
                    if (options.timepickerOptions && typeof options.timepickerOptions === 'object') {
                        Object.assign(timeOpts, options.timepickerOptions);
                    }

                    if (datepickerEl.hasClass('ui-timepicker-input')) {
                        datepickerEl.timepicker('option', timeOpts);
                    } else {
                        datepickerEl.timepicker(timeOpts);
                    }

                    appliedOnElement = true;
                }

                if (appliedOnElement) {
                    appliedAny = true;
                    if (typeof options.onApplied === 'function') {
                        try { options.onApplied(el); } catch (e) { /* swallow */ }
                    }
                }
            } catch (err) {
                // ignore per-element failures
            }
        });

        return appliedAny;
    };

    if (!options.waitForInit) {
        return applyToElements();
    }

    // waitForInit: attempt to apply repeatedly until success or attempts exhausted
    return new Promise((resolve) => {
        let attempts = 0;
        const tryApply = () => {
            attempts += 1;
            const ok = applyToElements();
            if (ok) return resolve(true);
            if (attempts >= Math.max(1, options.maxAttempts)) return resolve(false);
            setTimeout(tryApply, Math.max(50, options.attemptInterval));
        };
        tryApply();
    });
}

/**
 * Updates the "Add Option" button and default/placeholder text for a select field.
 * This updates the underlying `<select>` `data-placeholder`, any placeholder `<option>`,
 * and the visible elements rendered by Chosen/Chosen-like containers. When `disableInitially`
 * is true the add-option button is kept disabled until the user interacts with the select.
 *
 * The function includes a short retry loop to update Chosen's visible elements because
 * Chosen may re-render shortly after initialization and overwrite the display text.
 *
 * @param {HTMLElement} fieldEle - The field container element (e.g. `.kn-input`)
 * @param {string} btnStr - The button label to show for the add-option link
 * @param {string} defaultVal - The placeholder / default text to display for the select
 * @param {boolean} disableInitially - Whether to disable the add-option button initially
 */
const updateOptions = (fieldEle, btnStr, defaultVal, disableInitially) => {
    // Find the .kn-add-option button
    const addOption = fieldEle.querySelector('.kn-add-option');
    if (!addOption) return;

    // Find the default option and container
    const defaultOpt = fieldEle.querySelector('.default');
    const container = fieldEle.querySelector('.chzn-container') || fieldEle.querySelector('.select');

    // Update button label and style
    addOption.textContent = btnStr;
    addOption.style.width = 'fit-content';

    // Handle disabling/enabling logic
    if (disableInitially) {
        addOption.classList.add(CLASS_DISABLED);
        if (container) {
            // Enable when user interacts with the select field. Remove listeners once fired.
            const searchInput = container.querySelector('.chzn-search input, .chosen-search input, .search-field input');
            const select = fieldEle.querySelector('select');

            const enableButton = () => {
                addOption.classList.remove(CLASS_DISABLED);
                // Remove attached listeners to avoid leaks
                container.removeEventListener('click', enableButton);
                if (searchInput) {
                    searchInput.removeEventListener('focus', enableButton);
                    searchInput.removeEventListener('input', enableButton);
                }
                if (select) {
                    select.removeEventListener('change', enableButton);
                    select.removeEventListener('focus', enableButton);
                }
            };

            // Attach listeners
            container.addEventListener('click', enableButton);
            if (searchInput) {
                searchInput.addEventListener('focus', enableButton);
                searchInput.addEventListener('input', enableButton);
            }
            if (select) {
                select.addEventListener('change', enableButton);
                select.addEventListener('focus', enableButton);
            }
        }
    } else {
        // Insert before the first .control element if not already present
        const control = fieldEle.querySelector('.control');
        if (control && control.parentNode !== addOption.parentNode) {
            control.parentNode.insertBefore(addOption, control);
        }
    }

    const selectEl = fieldEle.querySelector('select');
    // Preserve the rendered selection on edit forms and any prefilled selects.
    // The custom prompt should only be pushed into Chosen when the field is blank.
    const hasSelectedValue = selectEl
        ? Array.from(selectEl.selectedOptions || []).some((option) => String(option?.value || '').trim())
            || Boolean(String(selectEl.value || '').trim())
        : false;

    // Set default/placeholder on select element for Chosen and native selects
    if (selectEl) {
        selectEl.setAttribute('data-placeholder', defaultVal);

        // If there's an explicit placeholder option, update its text/value
        if (defaultOpt) {
            if (defaultOpt.tagName && defaultOpt.tagName.toLowerCase() === 'option') {
                defaultOpt.textContent = defaultVal;
                defaultOpt.value = defaultOpt.value || '';
            } else {
                defaultOpt.value = defaultVal;
            }
        }
    } else if (defaultOpt) {
        defaultOpt.value = defaultVal;
    }

    // Update visible placeholder text for Chosen/Chosen-like containers
    if (container) {
        // Only show the custom default text when Chosen does not already have a real selection.
        // Otherwise we can overwrite the visible label while the underlying value remains selected.
        // Single-select chosen: update the display span and mark as default
        const singleSpan = container.querySelector('.chzn-single span, .chosen-single span');
        const singleAnchor = container.querySelector('.chzn-single, .chosen-single');
        if (!hasSelectedValue && singleSpan) {
            singleSpan.textContent = defaultVal;
            if (singleAnchor) singleAnchor.classList.add('chzn-default', 'chosen-default');
        } else if (hasSelectedValue && singleAnchor) {
            singleAnchor.classList.remove('chzn-default', 'chosen-default');
        }

        // Multi-select chosen: update the default search-field input value
        const multiDefaultInput = container.querySelector('.chzn-choices .search-field input.default, .chzn-choices .search-field input, .chosen-choices .search-field input.default, .chosen-choices .search-field input');
        if (!hasSelectedValue && multiDefaultInput) {
            try {
                multiDefaultInput.value = defaultVal;
                multiDefaultInput.setAttribute('value', defaultVal);
            } catch (err) {
                // ignore
            }
        }

        // Update placeholder on the search input if present
        const placeholderInput = container.querySelector('.chzn-search input, .chosen-search input, .search-field input');
        if (placeholderInput && placeholderInput.placeholder !== undefined) {
            placeholderInput.placeholder = defaultVal;
        }

        // Chosen may re-render after this function runs; retry a few times to ensure visible text is updated.
        // Use named constants for clarity and keep retries bounded.
        const MAX_TRIES = 6;
        const TRY_INTERVAL = 100; // ms

        const trySetChosenDisplay = (attempt = 0) => {
            const singleSpanRetry = container.querySelector('.chzn-single span, .chosen-single span');
            if (!hasSelectedValue && singleSpanRetry) singleSpanRetry.textContent = defaultVal;

            const multiInputRetry = container.querySelector('.chzn-choices .search-field input.default, .chzn-choices .search-field input, .chosen-choices .search-field input.default, .chosen-choices .search-field input');
            if (!hasSelectedValue && multiInputRetry) {
                try { multiInputRetry.value = defaultVal; } catch (e) { /* ignore */ }
            }

            if (attempt < MAX_TRIES) {
                setTimeout(() => trySetChosenDisplay(attempt + 1), TRY_INTERVAL);
            }
        };
        trySetChosenDisplay();
    }

    // Add one-time event listener for registration handler. Use `once` so it auto-removes.
    addOption.addEventListener('mousedown', (e) => {
        waitSelector({ selector: 'li.kn-form-col', timeout: 3000 })
            .then(() => registrationHandler(e))
            .catch(() => {});
    }, { once: true });
};

/**
 * Applies menu-based filters to any target view with app-configurable behavior.
 * Designed for generic use across table/list/details/calendar targets.
 *
 * @param {object} params
 * @param {string|number} params.menuViewId - Source menu view id.
 * @param {string|number} params.targetViewId - Target view id to filter.
 * @param {Array<object>} [params.rules=[]] - Rule list keyed by button text or explicit ruleKey.
 * @param {object} [params.app={}] - App-specific behavior configuration.
 * @param {string} [params.app.namespace='kf'] - Namespace for data attributes / wire marker.
 * @param {string} [params.app.linkSelector='a'] - Trigger selector within menu view.
 * @param {string} [params.app.buttonSelector='a.kf-menu-button'] - Selector used for active-state toggling.
 * @param {string} [params.app.activeClass='is-active'] - Active class name.
 * @param {boolean} [params.app.captureClick=false] - Bind menu click handler in capture phase.
 * @param {boolean} [params.app.stopPropagation=false] - Stop propagation for handled menu clicks.
 * @param {boolean} [params.app.stopImmediatePropagation=false] - Stop immediate propagation for handled menu clicks.
 * @param {boolean} [params.app.syncHash=true] - Sync URL hash/query when filters are applied.
 * @param {boolean} [params.app.rerenderCalendar=true] - Repaint calendar views after fetch.
 * @param {number} [params.app.calendarDeferredRenderMs=60] - Deferred calendar render delay.
 * @param {number} [params.app.calendarFirstApplyRetryMs=180] - Extra first-apply retry delay for calendars.
 * @param {number} [params.app.calendarFirstApplyRefetchMs=0] - Optional one-time first-apply refetch delay for calendars.
 * @param {(ctx: { rule: object, fieldId: string, operator: string, value: any }) => (object|null)} [params.app.buildFilter]
 *        Optional custom filter builder. Return null for "show all".
 * @param {(element: HTMLElement) => string} [params.app.getRuleKeyFromElement] - Optional rule-key resolver for non-text triggers.
 * @param {(ctx: { targetId: string, filter: object|null, page: number, rule: object|null, triggerElement: HTMLElement|null }) => void} [params.app.onBeforeApply]
 * @param {(ctx: { targetId: string, filter: object|null, page: number, targetType: string, rule: object|null, triggerElement: HTMLElement|null }) => void} [params.app.onAfterApply]
 * @param {(ctx: { targetId: string, error: Error }) => void} [params.app.onError]
 *
 * @example
 * applyMenuLinkFilters({
 *   menuViewId: 2056,
 *   targetViewId: 1320,
 *   rules: [
 *     { buttonText: 'All Parks' },
 *     { buttonText: 'Tattershall Lakes', fieldId: 407, operator: 'is', value: ['65973d...'] }
 *   ],
 *   app: {
 *     namespace: 'spot',
 *     buttonSelector: 'a.kf-menu-button',
 *     rerenderCalendar: true,
 *   }
 * });
 */
function applyMenuLinkFilters({ menuViewId, targetViewId, rules = [], app = {} } = {}) {
    const viewId = knackNavigator.normalizeViewId(menuViewId);
    const targetId = knackNavigator.normalizeViewId(targetViewId);
    if (!viewId || !targetId) return;

    const config = {
        namespace: 'kf',
        linkSelector: 'a',
        buttonSelector: 'a.kf-menu-button',
        activeClass: 'is-active',
        captureClick: false,
        stopPropagation: false,
        stopImmediatePropagation: false,
        syncHash: true,
        rerenderCalendar: true,
        calendarDeferredRenderMs: 60,
        calendarFirstApplyRetryMs: 180,
        calendarFirstApplyRefetchMs: 0,
        buildFilter: null,
        getRuleKeyFromElement: null,
        onBeforeApply: null,
        onAfterApply: null,
        onError: null,
        ...app
    };

    const viewElement = getById(viewId);
    if (!viewElement) return;
    const linkSelector = config.linkSelector;

    const hasValue = (value) => {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === 'object') return Object.keys(value).length > 0;
        if (typeof value === 'number') return Number.isFinite(value);
        return String(value || '').trim().length > 0;
    };

    const defaultBuildFilter = ({ fieldId, operator, value, rule }) => {
        if (!fieldId || !operator || !hasValue(value)) return null;

        return {
            match: 'and',
            rules: [
                {
                    field: fieldId,
                    operator,
                    value,
                    ...(rule?.valLabel ? { val_label: rule.valLabel } : {}),
                    ...(rule?.fieldName ? { field_name: rule.fieldName } : {})
                }
            ]
        };
    };

    const buildFilterFn = typeof config.buildFilter === 'function'
        ? config.buildFilter
        : defaultBuildFilter;

    const getRuleKeyForRule = (rule) => {
        if (!rule || typeof rule !== 'object') return null;
        if (rule.ruleKey !== undefined && rule.ruleKey !== null) return String(rule.ruleKey);

        const buttonText = String(rule.buttonText || '').trim();
        return buttonText.length ? buttonText : null;
    };

    const getRuleKeyFromElement = (element) => {
        if (!(element instanceof HTMLElement)) return null;

        if (typeof config.getRuleKeyFromElement === 'function') {
            const customRuleKey = config.getRuleKeyFromElement(element);
            return customRuleKey === undefined || customRuleKey === null ? null : String(customRuleKey);
        }

        const buttonText = element.textContent?.trim() || '';
        return buttonText.length ? buttonText : null;
    };

    const ruleMap = new Map(
        (Array.isArray(rules) ? rules : [])
            .map((rule) => [getRuleKeyForRule(rule), rule])
            .filter(([label]) => label !== null)
    );
    if (!ruleMap.size) return;

    const targetViewKey = targetId.replace('view_', '');
    const wireAttr = `data-${config.namespace}-menu-filter-wired`;
    let hasAppliedOnce = false;

    const getTargetViewContext = () => {
        const targetView = knackNavigator.getRenderedView(targetId);
        const targetModel = knackNavigator.getViewModel(targetId);
        const targetType = targetView?.model?.view?.type || targetView?.model?.attributes?.type || '';
        return { targetView, targetModel, targetType };
    };

    const buildHref = (query) => {
        const base = String(window.location.href || '').split('?')[0];
        if (!base) return '';
        return query ? `${base}?${query}` : base;
    };

    const rerenderCalendarIfNeeded = (targetView) => {
        if (!config.rerenderCalendar) return;

        const targetType = targetView?.model?.view?.type || targetView?.model?.attributes?.type;
        if (targetType !== 'calendar' || typeof targetView?.renderRecords !== 'function') return;

        if (typeof targetView?.model?.trigger === 'function') {
            targetView.model.trigger('change');
        }
        if (typeof targetView?.renderView === 'function') {
            targetView.renderView();
        }
        targetView.renderRecords();

        const deferredMs = Number(config.calendarDeferredRenderMs) || 0;
        if (deferredMs > 0) {
            setTimeout(() => {
                try {
                    targetView.renderRecords();
                } catch (_) {}
            }, deferredMs);
        }
    };

    const applyFilterInPlace = (filter, page = 1, rule = null, triggerElement = null) => {
        const sceneHash = knackNavigator.getSceneHash();
        const query = filter && Array.isArray(filter.rules) && filter.rules.length
            ? `view_${targetViewKey}_filters=${encodeURIComponent(JSON.stringify(filter))}&view_${targetViewKey}_page=${page}`
            : `view_${targetViewKey}_page=${page}`;

        if (typeof config.onBeforeApply === 'function') {
            try { config.onBeforeApply({ targetId, filter, page, rule, triggerElement }); } catch (_) {}
        }

        if (config.syncHash) {
            knackNavigator.navigateToHash(query ? `${sceneHash}?${query}` : sceneHash, { syncVars: true });
        }

        try {
            const { targetView, targetModel, targetType } = getTargetViewContext();
            if (!targetModel) return;

            targetModel.setFilters(filter || {});
            targetModel.fetch({
                success: () => {
                    rerenderCalendarIfNeeded(targetView);

                    const firstRetryMs = Number(config.calendarFirstApplyRetryMs) || 0;
                    const firstRefetchMs = Number(config.calendarFirstApplyRefetchMs) || 0;
                    if (!hasAppliedOnce && targetType === 'calendar' && firstRefetchMs > 0) {
                        hasAppliedOnce = true;
                        setTimeout(() => {
                            applyFilterInPlace(filter, page);
                        }, firstRefetchMs);
                    } else if (!hasAppliedOnce && targetType === 'calendar' && firstRetryMs > 0) {
                        hasAppliedOnce = true;
                        setTimeout(() => {
                            rerenderCalendarIfNeeded(targetView);
                        }, firstRetryMs);
                    }

                    if (typeof config.onAfterApply === 'function') {
                        try { config.onAfterApply({ targetId, filter, page, targetType, rule, triggerElement }); } catch (_) {}
                    }

                    if (Knack.hideSpinner) Knack.hideSpinner();
                },
                error: () => {
                    if (Knack.hideSpinner) Knack.hideSpinner();
                }
            });
        } catch (error) {
            if (typeof config.onError === 'function') {
                try {
                    config.onError({ targetId, error });
                    return;
                } catch (_) {}
            }
            console.warn('[KF] Menu filter apply failed', { targetId, error });
        }
    };

    const triggers = Array.from(viewElement.querySelectorAll(linkSelector));
    triggers.forEach((triggerElement) => {
        const ruleKey = getRuleKeyFromElement(triggerElement);
        if (ruleKey === null || !ruleMap.has(ruleKey)) return;

        const rule = ruleMap.get(ruleKey);
        const fieldId = rule?.fieldId ? knackNavigator.normalizeFieldId(rule.fieldId) : '';
        const operator = String(rule?.operator || '').trim();
        const value = rule?.value;
        const page = Number.isFinite(Number(rule?.page)) ? Number(rule.page) : 1;
        const filter = buildFilterFn({ rule, fieldId, operator, value });

        if (!filter) {
            if (triggerElement instanceof HTMLAnchorElement) {
                triggerElement.setAttribute('href', buildHref(''));
            }
            triggerElement.dataset.filterTarget = targetId;
            triggerElement.dataset.filter = '';
            triggerElement.dataset.filterPage = String(page);
            triggerElement.dataset.filterRuleKey = ruleKey;
            return;
        }

        const filterParam = encodeURIComponent(JSON.stringify(filter));
        const query = `view_${targetViewKey}_filters=${filterParam}&view_${targetViewKey}_page=${page}`;
        if (triggerElement instanceof HTMLAnchorElement) {
            triggerElement.setAttribute('href', buildHref(query));
        }
        triggerElement.dataset.filterTarget = targetId;
        triggerElement.dataset.filter = JSON.stringify(filter);
        triggerElement.dataset.filterPage = String(page);
        triggerElement.dataset.filterRuleKey = ruleKey;
    });

    if (viewElement.getAttribute(wireAttr) === 'true') return;

    viewElement.addEventListener('click', (event) => {
        const triggerElement = event.target.closest(linkSelector);
        if (!(triggerElement instanceof HTMLElement) || triggerElement.dataset.filterTarget !== targetId) return;

        event.preventDefault();
        if (config.stopPropagation) {
            event.stopPropagation();
        }
        if (config.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        }

        const page = Number(triggerElement.dataset.filterPage) || 1;
        const filterJson = triggerElement.dataset.filter || '';
        const filter = filterJson ? JSON.parse(filterJson) : null;
        const ruleKey = triggerElement.dataset.filterRuleKey;
        const rule = typeof ruleKey === 'string' && ruleMap.has(ruleKey) ? ruleMap.get(ruleKey) : null;

        applyFilterInPlace(filter, page, rule, triggerElement);

        if (config.buttonSelector) {
            viewElement.querySelectorAll(config.buttonSelector).forEach((btn) => {
                btn.classList.remove(config.activeClass);
            });
            triggerElement.classList.add(config.activeClass);
        }
    }, !!config.captureClick);

    viewElement.setAttribute(wireAttr, 'true');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: interactive-table
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Interactive table ported as-is (analysis C14: modern, no jQuery dependency).

/**
 * Renders a generic interactive table into a Knack view and provides a small controller API.
 *
 * Use cases:
 * - Render prefilled data in a table
 * - Configure per-column editability
 * - Support typed editors (text, date, number, select, checkbox)
 * - Receive change callbacks whenever a cell is updated
 *
 * @param {Object} config - Table configuration.
 * @param {string} config.viewId - View id where the table should be inserted (e.g. 'view_2214').
 * @param {string} [config.containerSelector='.view-content'] - Selector inside the view for insertion.
 * @param {string} [config.tableClassName=''] - One or more space-separated CSS classes appended to the default 'kn-table knTable' classes (e.g. 'is-bordered my-class another-class').
 * @param {string} [config.dateLocale='uk'] - Date locale for picker format and slash-separated date interpretation.
 *   'uk' (default): dd/mm/yyyy display; picker format 'dd/mm/yy'.
 *   'us': mm/dd/yyyy display; picker format 'mm/dd/yy'.
 *   This sets the default column dateFormat and teaches the internal date converters to read/write
 *   the correct field order. Individual columns can still override dateFormat directly.
 * @param {'none'|'manual'|'auto'} [config.saveMode='manual'] - Save behaviour. `manual` renders a submit button, `auto` is reserved for save-as-you-go flows, `none` disables built-in save UI.
 * @param {string} [config.saveButtonText='Save'] - Text shown on the manual submit button.
 * @param {string} [config.saveButtonClassName=''] - Extra CSS classes appended to the default `kn-button is-primary` button classes.
 * @param {string} [config.actionContainerSelector=''] - Optional selector for a dedicated container in the view where table-generated Save and Clear controls render.
 * @param {boolean} [config.showClearButton=false] - Whether to render a clear button in the top-right table toolbar.
 * @param {string} [config.clearButtonText='Clear'] - Text shown on the clear button.
 * @param {string} [config.clearButtonClassName=''] - Extra CSS classes appended to the default `kn-button is-secondary` clear button classes.
 * @param {boolean} [config.confirmOnClear=true] - Whether clearing rows should ask for confirmation first.
 * @param {string} [config.clearConfirmMessage='Are you sure you want to clear all rows? This will remove any unsaved table data.'] - Confirmation text shown before rows are cleared.
 * @param {Function|null} [config.onSubmit=null] - Called when the manual submit button is clicked or controller.submit() is invoked.
 * @param {Function|null} [config.onClear=null] - Called after the clear button is clicked or controller.clear() is invoked.
 * @param {false|{header?: string, key?: string, buttonText?: string, buttonHtml?: string, buttonClassName?: string, ariaLabel?: string, title?: string, align?: string, maxWidth?: string|number|null}} [config.rowRemove=false] - Optional row-remove action column. The app remains responsible for persistence through `onRemoveRow`.
 * @param {Function|null} [config.onRemoveRow=null] - Called after a row is removed through the row-remove action or `controller.removeRow()`.
 * @param {null|string|number|{key: string|number, order?: Array<string>|Function, label?: Function, emptyLabel?: string, className?: string}} [config.groupBy=null] - Optional row grouping. Populated rows are shown under a heading row for each distinct value of `key` (a column key/row property); the trailing empty row always stays last with no heading. Row data order and every `rowIndex` passed to callbacks are unchanged — only the display order is grouped. `order` is an array of group values (unlisted values follow alphabetically) or a `(a, b) => number` comparator; rows with a blank value are grouped last under `emptyLabel` (default 'Ungrouped'). `label(value, rows)` returns the heading text. Editing the grouped column regroups the table immediately. A string or number is shorthand for `{ key }`.
 * @param {Function|null} [config.rowClassName=null] - Optional `(row, rowIndex) => string` returning extra CSS classes for a data row's `<tr>` (e.g. to style removed or flagged rows). Re-evaluated whenever the table re-renders (`setData`, an appended row, a regroup); a single cell edit only re-renders that cell.
 * @param {Array<{header?: string, key?: string|number, type?: string, editable?: boolean|Function, options?: Array|Function, className?: string, inputClassName?: string, align?: string, maxWidth?: string|number|null, allowHtml?: boolean, display?: Function, parse?: Function, openDateHintKey?: string, minDate?: string|Date|null, maxDate?: string|Date|null, dateFormat?: string}>} [config.columns=[]] - Column schema. Select options may be a static array, a function returning an array, or an async function/Promise resolving to an array. `type: 'search-select'` renders a searchable input backed by a datalist while still storing the selected option value. Select options are fetched once per column and cached for the current table instance.
 * @param {Array<string>} [config.headers=[]] - Optional headers when columns are omitted.
 * @param {Array<Object|Array>} [config.rows=[]] - Prefilled row data.
 * @param {Function|null} [config.onChange=null] - Called after a cell value changes.
 * @param {Function|null} [config.onRenderComplete=null] - Called after initial render.
 * @returns {{getData: Function, setData: Function, updateCell: Function, destroy: Function}|null}
 */
function renderInteractiveTable(config = {}) {
    const settings = {
        viewId: '',
        containerSelector: '.view-content',
        tableClassName: '',
        dateLocale: 'uk',
        saveMode: 'manual',
        saveButtonText: 'Save',
        saveButtonClassName: '',
        actionContainerSelector: '',
        showClearButton: false,
        clearButtonText: 'Clear',
        clearButtonClassName: '',
        confirmOnClear: true,
        clearConfirmMessage: 'Are you sure you want to clear all rows? This will remove any unsaved table data.',
        autoAppendRow: false,
        createEmptyRow: null,
        isRowPopulated: null,
        columns: [],
        headers: [],
        rows: [],
        onChange: null,
        onSubmit: null,
        onClear: null,
        rowRemove: false,
        onRemoveRow: null,
        groupBy: null,
        rowClassName: null,
        onRenderComplete: null,
        ...config,
    };

    const viewId = String(settings.viewId || '').trim();
    if (!viewId) {
        console.warn('renderInteractiveTable: missing viewId.');
        return null;
    }

    const viewEl = document.getElementById(viewId);
    if (!viewEl) {
        console.warn('renderInteractiveTable: view element not found:', viewId);
        return null;
    }

    const host = settings.containerSelector
        ? (viewEl.querySelector(settings.containerSelector) || viewEl)
        : viewEl;
    const actionContainerSelector = String(settings.actionContainerSelector || '').trim();
    const actionContainer = actionContainerSelector
        ? viewEl.querySelector(actionContainerSelector)
        : null;
    const usesExternalActionContainer = actionContainer instanceof HTMLElement && actionContainer !== host;

    const cloneRow = (row) => {
        if (Array.isArray(row)) return row.slice();
        if (row && typeof row === 'object') return { ...row };
        return {};
    };

    let rowsData = Array.isArray(settings.rows) ? settings.rows.map(cloneRow) : [];

    const rowRemoveConfig = settings.rowRemove && typeof settings.rowRemove === 'object'
        ? {
            header: '',
            key: '__kfRemoveRow',
            buttonText: 'Remove',
            buttonHtml: '',
            buttonClassName: '',
            ariaLabel: 'Remove row',
            title: 'Remove row',
            align: 'center',
            maxWidth: 90,
            ...settings.rowRemove,
        }
        : null;

    const normaliseColumns = () => {
        let normalisedColumns;
        if (Array.isArray(settings.columns) && settings.columns.length) {
            normalisedColumns = settings.columns.map((column, index) => ({
                header: '',
                key: index,
                type: 'text',
                editable: false,
                options: [],
                className: '',
                inputClassName: '',
                align: 'left',
                maxWidth: null,
                allowHtml: false,
                display: null,
                parse: null,
                openDateHintKey: '',
                minDate: null,
                maxDate: null,
                dateFormat: settings.dateLocale === 'us' ? 'mm/dd/yy' : 'dd/mm/yy',
                ...column,
            }));
        } else {
            const headers = Array.isArray(settings.headers) ? settings.headers : [];
            normalisedColumns = headers.map((header, index) => ({
                header: String(header || ''),
                key: index,
                type: 'text',
                editable: false,
                options: [],
                className: '',
                inputClassName: '',
                align: 'left',
                maxWidth: null,
                allowHtml: false,
                display: null,
                parse: null,
                openDateHintKey: '',
                minDate: null,
                maxDate: null,
                dateFormat: settings.dateLocale === 'us' ? 'mm/dd/yy' : 'dd/mm/yy',
            }));
        }

        if (!rowRemoveConfig) return normalisedColumns;

        return [...normalisedColumns, {
            header: rowRemoveConfig.header,
            key: rowRemoveConfig.key,
            type: 'text',
            editable: false,
            allowHtml: true,
            align: rowRemoveConfig.align,
            maxWidth: rowRemoveConfig.maxWidth,
            display: (_, row, rowIndex) => {
                if (!isRowPopulated(row, rowIndex)) return '';
                const buttonContent = rowRemoveConfig.buttonHtml || escapeHTML(rowRemoveConfig.buttonText);
                const buttonClassName = ['kfInteractiveTable__removeRow', rowRemoveConfig.buttonClassName]
                    .filter(Boolean)
                    .join(' ');
                return `<button type="button" class="${escapeHTML(buttonClassName)}" data-kf-interactive-table-remove-row="true" aria-label="${escapeHTML(rowRemoveConfig.ariaLabel)}" title="${escapeHTML(rowRemoveConfig.title)}">${buttonContent}</button>`;
            },
        }];
    };

    const columns = normaliseColumns();
    const colIndexByKey = new Map(columns.map((col, index) => [String(col.key), index]));
    const selectOptionsCache = new Map();
    let isSubmitting = false;
    let controller = null;
    let pendingEditorNavigation = null;

    const useArrayRowShape = (() => {
        if (Array.isArray(rowsData[0])) return true;
        if (rowsData[0] && typeof rowsData[0] === 'object') return false;
        return columns.every((column, index) => String(column.key) === String(index));
    })();

    const toCssSize = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return `${value}px`;
        }
        const text = String(value ?? '').trim();
        return text || '';
    };

    const getCellValue = (row, column, colIndex) => {
        if (typeof column.getValue === 'function') {
            return column.getValue(row, colIndex);
        }
        if (Array.isArray(row)) {
            const idx = Number(column.key);
            return Number.isFinite(idx) ? row[idx] : row[colIndex];
        }
        return row?.[column.key];
    };

    const setCellValue = (row, column, colIndex, value) => {
        if (Array.isArray(row)) {
            const idx = Number(column.key);
            if (Number.isFinite(idx)) {
                row[idx] = value;
            } else {
                row[colIndex] = value;
            }
            return;
        }
        row[column.key] = value;
    };

    const createDefaultCellValue = (column) => {
        if (Object.prototype.hasOwnProperty.call(column, 'emptyValue')) {
            return column.emptyValue;
        }
        if (column.type === 'checkbox') return false;
        return '';
    };

    const createEmptyRowData = () => {
        if (typeof settings.createEmptyRow === 'function') {
            try {
                const customRow = settings.createEmptyRow({
                    viewId,
                    host,
                    columns: columns.slice(),
                    data: rowsData.map(cloneRow),
                });
                if (Array.isArray(customRow)) return customRow.slice();
                if (customRow && typeof customRow === 'object') return { ...customRow };
            } catch (err) {
                console.error('renderInteractiveTable createEmptyRow error:', err);
            }
        }

        if (useArrayRowShape) {
            return columns.map((column) => createDefaultCellValue(column));
        }

        return columns.reduce((nextRow, column, colIndex) => {
            nextRow[column.key] = createDefaultCellValue(column, colIndex);
            return nextRow;
        }, {});
    };

    const isMeaningfulCellValue = (value, column) => {
        if (column?.type === 'checkbox') return value === true;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'number') return Number.isFinite(value);
        if (value == null) return false;
        return String(value).trim() !== '';
    };

    const defaultIsRowPopulated = (row, rowIndex) => {
        return columns.some((column, colIndex) => {
            const value = getCellValue(row, column, colIndex);
            return isMeaningfulCellValue(value, column, row, rowIndex);
        });
    };

    const isRowPopulated = (row, rowIndex) => {
        if (typeof settings.isRowPopulated === 'function') {
            try {
                return !!settings.isRowPopulated(row, rowIndex, rowsData.map(cloneRow));
            } catch (err) {
                console.error('renderInteractiveTable isRowPopulated error:', err);
            }
        }
        return defaultIsRowPopulated(row, rowIndex);
    };

    const getRawData = () => rowsData.map(cloneRow);

    const getData = (options = {}) => {
        if (options && options.includeEmptyRows === true) {
            return getRawData();
        }

        if (!settings.autoAppendRow) {
            return getRawData();
        }

        return rowsData
            .filter((row, rowIndex) => isRowPopulated(row, rowIndex))
            .map(cloneRow);
    };

    const ensureTrailingEmptyRow = () => {
        if (!settings.autoAppendRow) return false;

        if (!rowsData.length) {
            rowsData.push(createEmptyRowData());
            return true;
        }

        const lastRowIndex = rowsData.length - 1;
        if (isRowPopulated(rowsData[lastRowIndex], lastRowIndex)) {
            rowsData.push(createEmptyRowData());
            return true;
        }

        return false;
    };

    ensureTrailingEmptyRow();

    const groupByConfig = (() => {
        const rawGroupBy = typeof settings.groupBy === 'string' || typeof settings.groupBy === 'number'
            ? { key: settings.groupBy }
            : settings.groupBy;
        if (!rawGroupBy || typeof rawGroupBy !== 'object') return null;
        if (rawGroupBy.key === undefined || rawGroupBy.key === null || String(rawGroupBy.key) === '') return null;

        return {
            key: rawGroupBy.key,
            order: Array.isArray(rawGroupBy.order) ? rawGroupBy.order.map((value) => String(value ?? '').trim()) : rawGroupBy.order,
            label: typeof rawGroupBy.label === 'function' ? rawGroupBy.label : null,
            emptyLabel: String(rawGroupBy.emptyLabel ?? 'Ungrouped'),
            className: String(rawGroupBy.className || '').trim(),
        };
    })();

    const isGroupByColumn = (column) => !!groupByConfig && String(column?.key) === String(groupByConfig.key);

    const getGroupValue = (row) => {
        if (!groupByConfig) return '';
        return String(row?.[groupByConfig.key] ?? '').trim();
    };

    const compareGroupValues = (left, right) => {
        if (left === right) return 0;
        if (!left) return 1;
        if (!right) return -1;

        if (typeof groupByConfig.order === 'function') {
            try {
                return Number(groupByConfig.order(left, right)) || 0;
            } catch (err) {
                console.error('renderInteractiveTable groupBy.order error:', err);
            }
        } else if (Array.isArray(groupByConfig.order)) {
            const rank = (value) => {
                const index = groupByConfig.order.indexOf(value);
                return index === -1 ? groupByConfig.order.length : index;
            };
            const rankDifference = rank(left) - rank(right);
            if (rankDifference !== 0) return rankDifference;
        }

        return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    };

    /**
     * Returns rowsData indexes in the order rows are displayed. Grouping only reorders the
     * display; rowsData (and every rowIndex exposed to callbacks) keeps its own order.
     */
    const getDisplayRowIndexes = () => {
        const indexes = rowsData.map((_, rowIndex) => rowIndex);
        if (!groupByConfig) return indexes;

        const populatedIndexes = indexes.filter((rowIndex) => isRowPopulated(rowsData[rowIndex], rowIndex));
        const emptyIndexes = indexes.filter((rowIndex) => !isRowPopulated(rowsData[rowIndex], rowIndex));
        populatedIndexes.sort((left, right) => {
            return compareGroupValues(getGroupValue(rowsData[left]), getGroupValue(rowsData[right])) || left - right;
        });

        return [...populatedIndexes, ...emptyIndexes];
    };

    const getRowClassName = (row, rowIndex) => {
        if (typeof settings.rowClassName !== 'function') return '';
        try {
            return String(settings.rowClassName(cloneRow(row), rowIndex) || '').trim();
        } catch (err) {
            console.error('renderInteractiveTable rowClassName error:', err);
            return '';
        }
    };

    const renderGroupHeaderRow = (groupValue) => {
        let label = groupValue || groupByConfig.emptyLabel;
        if (groupByConfig.label) {
            const groupRows = rowsData
                .filter((row, rowIndex) => isRowPopulated(row, rowIndex) && getGroupValue(row) === groupValue)
                .map(cloneRow);
            try {
                label = String(groupByConfig.label(groupValue, groupRows) ?? label);
            } catch (err) {
                console.error('renderInteractiveTable groupBy.label error:', err);
            }
        }

        const classes = ['kfInteractiveTable__groupRow', groupByConfig.className].filter(Boolean).join(' ');
        return `<tr class="${escapeHTML(classes)}" data-kf-group="${escapeHTML(groupValue)}"><td colspan="${columns.length}" style="padding:6px 8px;font-weight:600;">${escapeHTML(label)}</td></tr>`;
    };

    const isEditableCell = (column, row, rowIndex) => {
        if (typeof column.editable === 'function') {
            try {
                return !!column.editable(row, rowIndex, rowsData);
            } catch (_) {
                return false;
            }
        }
        return !!column.editable;
    };

    /**
     * Converts a date value to the ISO yyyy-mm-dd string required by <input type="date">.
     * Interprets slash-separated dates according to the table's dateLocale setting.
     */
    const toIsoDate = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
            const parts = text.split('/');
            // US: mm/dd/yyyy → yyyy-mm-dd; UK: dd/mm/yyyy → yyyy-mm-dd
            return settings.dateLocale === 'us'
                ? `${parts[2]}-${parts[0]}-${parts[1]}`
                : `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        const parsed = parseDateObject(text);
        if (!parsed) return '';
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const year = parsed.getFullYear();
        return `${year}-${month}-${day}`;
    };

    /**
     * Converts a date value to the locale display format.
     * UK (default): dd/mm/yyyy. US: mm/dd/yyyy.
     * Accepts ISO strings (yyyy-mm-dd), already-formatted slash dates, or anything
     * parseable by getDateUKFormat as a last resort.
     */
    const toDisplayDate = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        // Already a slash-separated date in the expected locale format — pass through.
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            const parts = text.split('-');
            // US: yyyy-mm-dd → mm/dd/yyyy; UK: yyyy-mm-dd → dd/mm/yyyy
            return settings.dateLocale === 'us'
                ? `${parts[1]}/${parts[2]}/${parts[0]}`
                : `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return getDateUKFormat(text) || text;
    };

    const parseCellValue = (rawValue, column, row, rowIndex) => {
        const baseValue = (() => {
            if (column.type === 'date') return toDisplayDate(rawValue);
            if (column.type === 'number') {
                const normalised = String(rawValue || '').trim();
                if (!normalised) return '';
                const parsed = Number(normalised);
                return Number.isFinite(parsed) ? parsed : normalised;
            }
            if (column.type === 'checkbox') return !!rawValue;
            return String(rawValue ?? '');
        })();

        if (typeof column.parse === 'function') {
            try {
                return column.parse(baseValue, row, rowIndex, rowsData);
            } catch (_) {
                return baseValue;
            }
        }
        return baseValue;
    };

    const formatCellValue = (value, column, row, rowIndex) => {
        if (typeof column.display === 'function') {
            try {
                return String(column.display(value, row, rowIndex, rowsData) ?? '');
            } catch (_) {
                return '';
            }
        }

        if (column.type === 'checkbox') {
            return value ? 'Yes' : 'No';
        }

        if (column.type === 'date') {
            return toDisplayDate(value);
        }

        return String(value ?? '');
    };

    const normaliseSelectOptions = (rawOptions) => {
        const optionsArray = Array.isArray(rawOptions) ? rawOptions : [];
        return optionsArray.map((item) => {
            if (item && typeof item === 'object' && 'value' in item) {
                return {
                    value: String(item.value ?? ''),
                    label: String(item.label ?? item.value ?? ''),
                };
            }
            return {
                value: String(item ?? ''),
                label: String(item ?? ''),
            };
        });
    };

    const resolveSelectOptions = async (column, row, rowIndex, colIndex) => {
        if (typeof column.options === 'function') {
            try {
                const resolvedOptions = await Promise.resolve(column.options(row, rowIndex, rowsData));
                return normaliseSelectOptions(resolvedOptions);
            } catch (err) {
                console.error('renderInteractiveTable select options error:', err);
                return [];
            }
        }

        const cacheKey = String(colIndex);
        if (selectOptionsCache.has(cacheKey)) {
            return selectOptionsCache.get(cacheKey);
        }

        try {
            const rawOptions = column.options;
            const resolvedOptions = await Promise.resolve(rawOptions);
            const normalisedOptions = normaliseSelectOptions(resolvedOptions);
            selectOptionsCache.set(cacheKey, normalisedOptions);
            return normalisedOptions;
        } catch (err) {
            console.error('renderInteractiveTable select options error:', err);
            return [];
        }
    };

    const tryOpenSelectMenu = (selectEl) => {
        if (!selectEl || selectEl.disabled) return;

        const open = () => {
            try {
                if (typeof selectEl.showPicker === 'function') {
                    selectEl.showPicker();
                    return;
                }
            } catch (_) {}

            try {
                selectEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            } catch (_) {}

            try {
                selectEl.click();
            } catch (_) {}
        };

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(open);
            return;
        }

        setTimeout(open, 0);
    };

    const resolveSearchSelectValue = (rawValue, options) => {
        const normalisedRawValue = String(rawValue ?? '').trim();
        if (!normalisedRawValue) return '';

        const matchedOption = (Array.isArray(options) ? options : []).find((option) => {
            const optionValue = String(option?.value ?? '').trim().toLowerCase();
            const optionLabel = String(option?.label ?? '').trim().toLowerCase();
            const targetValue = normalisedRawValue.toLowerCase();
            return optionValue === targetValue || optionLabel === targetValue;
        });

        return matchedOption ? matchedOption.value : '';
    };

    const ensureSearchSelectDropdown = (inputEl) => {
        if (!inputEl) return null;
        if (inputEl._kfSearchDropdown instanceof HTMLElement) {
            return inputEl._kfSearchDropdown;
        }

        const dropdownEl = document.createElement('div');
        dropdownEl.className = 'kfInteractiveTable__searchSelectDropdown';
        dropdownEl.style.position = 'absolute';
        dropdownEl.style.top = 'calc(100% + 4px)';
        dropdownEl.style.left = '0';
        dropdownEl.style.right = '0';
        dropdownEl.style.zIndex = '50';
        dropdownEl.style.maxHeight = '220px';
        dropdownEl.style.overflowY = 'auto';
        dropdownEl.style.background = '#fff';
        dropdownEl.style.border = '1px solid #d3d9e3';
        dropdownEl.style.borderRadius = '0 0 8px 8px';
        dropdownEl.style.boxShadow = '0 10px 26px rgba(15, 23, 42, 0.12)';
        dropdownEl.style.padding = '6px';
        dropdownEl.style.display = 'none';

        inputEl._kfSearchWrapper?.appendChild(dropdownEl);
        inputEl._kfSearchDropdown = dropdownEl;
        return dropdownEl;
    };

    const closeSearchSelectDropdown = (inputEl) => {
        const dropdownEl = inputEl?._kfSearchDropdown;
        if (!(dropdownEl instanceof HTMLElement)) return;
        dropdownEl.style.display = 'none';
        dropdownEl.innerHTML = '';
        inputEl._kfSearchFilteredOptions = [];
        inputEl._kfSearchHighlightedIndex = -1;
        inputEl.setAttribute('aria-expanded', 'false');
    };

    const renderSearchSelectDropdown = (inputEl, options, filterText = '') => {
        const dropdownEl = ensureSearchSelectDropdown(inputEl);
        if (!(dropdownEl instanceof HTMLElement)) return;

        const targetText = String(filterText ?? '').trim().toLowerCase();
        const filteredOptions = (Array.isArray(options) ? options : []).filter((option) => {
            if (!targetText) return true;
            const optionLabel = String(option?.label ?? '').trim().toLowerCase();
            const optionValue = String(option?.value ?? '').trim().toLowerCase();
            return optionLabel.includes(targetText) || optionValue.includes(targetText);
        }).slice(0, 75);

        inputEl._kfSearchFilteredOptions = filteredOptions;
        const hasOptions = filteredOptions.length > 0;
        const nextHighlightedIndex = hasOptions
            ? Math.min(Math.max(Number(inputEl._kfSearchHighlightedIndex) || 0, 0), filteredOptions.length - 1)
            : -1;
        inputEl._kfSearchHighlightedIndex = nextHighlightedIndex;

        dropdownEl.innerHTML = '';

        if (!hasOptions) {
            const emptyStateEl = document.createElement('div');
            emptyStateEl.textContent = 'No matches found';
            emptyStateEl.style.padding = '8px 10px';
            emptyStateEl.style.color = '#6b7280';
            emptyStateEl.style.fontSize = '12px';
            dropdownEl.appendChild(emptyStateEl);
            dropdownEl.style.display = 'block';
            inputEl.setAttribute('aria-expanded', 'true');
            return;
        }

        filteredOptions.forEach((option, optionIndex) => {
            const optionButton = document.createElement('button');
            optionButton.type = 'button';
            optionButton.className = 'kfInteractiveTable__searchSelectOption';
            optionButton.textContent = String(option?.label ?? '');
            optionButton.dataset.value = String(option?.value ?? '');
            optionButton.dataset.label = String(option?.label ?? '');
            optionButton.style.display = 'block';
            optionButton.style.width = '100%';
            optionButton.style.border = '0';
            optionButton.style.borderRadius = '6px';
            optionButton.style.background = optionIndex === nextHighlightedIndex ? '#eef4ff' : 'transparent';
            optionButton.style.color = '#1f2937';
            optionButton.style.cursor = 'pointer';
            optionButton.style.font = 'inherit';
            optionButton.style.padding = '8px 10px';
            optionButton.style.textAlign = 'left';

            optionButton.addEventListener('mouseenter', () => {
                inputEl._kfSearchHighlightedIndex = optionIndex;
                renderSearchSelectDropdown(inputEl, options, inputEl.value);
            });

            let optionSelectionHandled = false;
            const selectSearchOption = (event) => {
                if (optionSelectionHandled) return;
                optionSelectionHandled = true;
                event.preventDefault();
                event.stopPropagation();
                inputEl._kfIgnoreBlurUntil = Date.now() + EDITOR_POINTER_BLUR_GUARD_MS;
                inputEl.value = optionButton.dataset.label || '';
                inputEl._kfSearchSelectedValue = optionButton.dataset.value || '';
                closeEditor(inputEl, true);
            };

            // Pointer events fire before blur on modern browsers. Keep the mouse fallback
            // for older environments so the selected option value is never lost to blur.
            optionButton.addEventListener('pointerdown', selectSearchOption);
            optionButton.addEventListener('mousedown', selectSearchOption);

            optionButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });

            dropdownEl.appendChild(optionButton);
        });

        dropdownEl.style.display = 'block';
        inputEl.setAttribute('aria-expanded', 'true');
    };

    const getCellElement = (rowIndex, colIndex) => {
        return host.querySelector(`td.kfInteractiveTable__cell[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`);
    };

    const getEditableCellCoordinates = () => {
        const coordinates = [];
        getDisplayRowIndexes().forEach((rowIndex) => {
            const row = rowsData[rowIndex];
            columns.forEach((column, colIndex) => {
                if (isEditableCell(column, row, rowIndex)) {
                    coordinates.push({ rowIndex, colIndex });
                }
            });
        });
        return coordinates;
    };

    const findAdjacentEditableCell = (rowIndex, colIndex, direction = 1) => {
        const editableCells = getEditableCellCoordinates();
        const currentIndex = editableCells.findIndex((cell) => cell.rowIndex === rowIndex && cell.colIndex === colIndex);
        if (currentIndex === -1) return null;

        const nextIndex = currentIndex + (direction < 0 ? -1 : 1);
        if (nextIndex < 0 || nextIndex >= editableCells.length) return null;

        const nextCell = editableCells[nextIndex];
        return getCellElement(nextCell.rowIndex, nextCell.colIndex);
    };

    const focusEditableCell = (cell, { open = false } = {}) => {
        if (!cell) return;

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                cell.focus();
                if (open) {
                    void openEditor(cell);
                }
            });
            return;
        }

        setTimeout(() => {
            cell.focus();
            if (open) {
                void openEditor(cell);
            }
        }, 0);
    };

    const emitChange = (payload) => {
        if (typeof settings.onChange !== 'function') return;
        try {
            settings.onChange(payload);
        } catch (err) {
            console.error('renderInteractiveTable onChange error:', err);
        }
    };

    const renderCell = (cell, rowIndex, colIndex) => {
        if (!cell) return;
        const column = columns[colIndex];
        const row = rowsData[rowIndex];
        const value = getCellValue(row, column, colIndex);
        const formatted = formatCellValue(value, column, row, rowIndex);
        cell.innerHTML = column.allowHtml ? formatted : escapeHTML(formatted);
    };

    const renderTable = () => {
        const tableClass = `kn-table knTable is-bordered is-striped ${String(settings.tableClassName || '').trim()}`.trim();
        const saveMode = String(settings.saveMode || 'none').trim().toLowerCase();
        const showSubmitButton = saveMode === 'manual';
        const saveButtonText = String(settings.saveButtonText || 'Save').trim() || 'Save';
        const saveButtonClassName = String(settings.saveButtonClassName || '').trim();
        const submitButtonClass = ['kn-button', 'is-primary', saveButtonClassName].filter(Boolean).join(' ');
        const showClearButton = settings.showClearButton === true;
        const clearButtonText = String(settings.clearButtonText || 'Clear').trim() || 'Clear';
        const clearButtonClassName = String(settings.clearButtonClassName || '').trim();
        const clearButtonClass = ['kn-button', 'is-secondary', clearButtonClassName].filter(Boolean).join(' ');

        const headersHtml = columns.map((column) => {
            const align = String(column.align || 'left');
            const maxWidth = toCssSize(column.maxWidth);
            const styleParts = [`text-align:${escapeHTML(align)}`, 'padding:6px 8px'];
            if (maxWidth) styleParts.push(`max-width:${escapeHTML(maxWidth)}`);
            const headerHtml = String(column.header || '');
            return `<th style="${styleParts.join('; ')};">${headerHtml}</th>`;
        }).join('');

        let previousGroupValue = null;
        const rowsHtml = getDisplayRowIndexes().map((rowIndex) => {
            const row = rowsData[rowIndex];
            let groupHeaderHtml = '';
            if (groupByConfig && isRowPopulated(row, rowIndex)) {
                const groupValue = getGroupValue(row);
                if (groupValue !== previousGroupValue) {
                    previousGroupValue = groupValue;
                    groupHeaderHtml = renderGroupHeaderRow(groupValue);
                }
            }

            const cellsHtml = columns.map((column, colIndex) => {
                const editable = isEditableCell(column, row, rowIndex);
                const value = getCellValue(row, column, colIndex);
                const formatted = formatCellValue(value, column, row, rowIndex);
                const classes = [
                    'kfInteractiveTable__cell',
                    editable ? 'is-editable' : '',
                    editable ? 'ktlInlineEditableCellsStyle' : '',
                    String(column.className || '').trim(),
                ].filter(Boolean).join(' ');
                const align = String(column.align || 'left');
                const maxWidth = toCssSize(column.maxWidth);
                const styleParts = ['padding:4px 8px', `text-align:${escapeHTML(align)}`];
                if (maxWidth) styleParts.push(`max-width:${escapeHTML(maxWidth)}`);
                const tabIndexAttr = editable ? ' tabindex="0"' : '';
                return `<td class="${escapeHTML(classes)}" data-row-index="${rowIndex}" data-col-index="${colIndex}" data-col-key="${escapeHTML(String(column.key))}" style="${styleParts.join('; ')};"${tabIndexAttr}>${column.allowHtml ? formatted : escapeHTML(formatted)}</td>`;
            }).join('');

            const rowClassName = getRowClassName(row, rowIndex);
            const rowClassAttr = rowClassName ? ` class="${escapeHTML(rowClassName)}"` : '';
            return `${groupHeaderHtml}<tr data-row-index="${rowIndex}"${rowClassAttr}>${cellsHtml}</tr>`;
        }).join('');

        const clearButtonHtml = showClearButton
            ? `<button class="${escapeHTML(clearButtonClass)}" type="button" data-kf-interactive-table-clear="true"${isSubmitting ? ' disabled' : ''}>${escapeHTML(clearButtonText)}</button>`
            : '';

        const headerActionsHtml = clearButtonHtml && !usesExternalActionContainer
            ? `<div class="kfInteractiveTable__toolbar" style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:8px;"><button class="${escapeHTML(clearButtonClass)}" type="button" data-kf-interactive-table-clear="true"${isSubmitting ? ' disabled' : ''}>${escapeHTML(clearButtonText)}</button></div>`
            : '';

        const actionButtons = [
            showSubmitButton
                ? `<button class="${escapeHTML(submitButtonClass)}" type="submit" data-kf-interactive-table-submit="true"${isSubmitting ? ' disabled' : ''}>${escapeHTML(saveButtonText)}</button>`
                : '',
        ].filter(Boolean).join('');

        const actionsHtml = actionButtons && !usesExternalActionContainer
            ? `<div class="kfInteractiveTable__actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">${actionButtons}</div>`
            : '';

        host.innerHTML = `${headerActionsHtml}<table class="${escapeHTML(tableClass)}"><thead><tr>${headersHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>${actionsHtml}`;
        if (usesExternalActionContainer) {
            actionContainer.innerHTML = `${clearButtonHtml}${actionButtons}`;
        }
    };

    const clearTable = async () => {
        if (isSubmitting) return;

        const shouldConfirmClear = settings.confirmOnClear !== false;
        const clearConfirmMessage = String(settings.clearConfirmMessage || '').trim()
            || 'Are you sure you want to clear all rows? This will remove any unsaved table data.';

        if (shouldConfirmClear) {
            const confirmationResult = await showConfirmationDialog({
                title: 'Clear rows',
                message: clearConfirmMessage,
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'kn-button is-secondary',
                        value: 'cancel',
                    },
                    {
                        text: 'Clear rows',
                        className: 'kn-button is-danger',
                        value: 'confirm',
                    },
                ],
            });

            if (confirmationResult?.value !== 'confirm') return;
        }

        rowsData = [];
        ensureTrailingEmptyRow();
        renderTable();

        if (typeof settings.onClear === 'function') {
            try {
                await settings.onClear({
                    viewId,
                    host,
                    data: getData(),
                    rawData: getRawData(),
                    controller,
                });
            } catch (err) {
                console.error('renderInteractiveTable onClear error:', err);
                throw err;
            }
        }
    };

    /**
     * Removes a row and notifies the caller so it can queue any persistence work.
     * @param {number} rowIndex
     * @param {string} [source='api']
     * @returns {void}
     */
    const removeRow = (rowIndex, source = 'api') => {
        const index = Number(rowIndex);
        if (!Number.isFinite(index) || index < 0 || index >= rowsData.length) return;

        const removedRow = cloneRow(rowsData[index]);
        if (!isRowPopulated(removedRow, index)) return;

        rowsData.splice(index, 1);
        ensureTrailingEmptyRow();
        renderTable();

        if (typeof settings.onRemoveRow === 'function') {
            try {
                settings.onRemoveRow({
                    rowIndex: index,
                    row: removedRow,
                    data: getData(),
                    rawData: getRawData(),
                    source,
                    controller,
                });
            } catch (err) {
                console.error('renderInteractiveTable onRemoveRow error:', err);
            }
        }
    };

    const submitTable = async () => {
        if (typeof settings.onSubmit !== 'function') {
            console.warn('renderInteractiveTable: manual submit requested but no onSubmit handler was provided.');
            return;
        }

        if (isSubmitting) return;

        isSubmitting = true;
        renderTable();

        try {
            await settings.onSubmit({
                viewId,
                host,
                data: getData(),
                rawData: getRawData(),
                controller,
            });
        } catch (err) {
            console.error('renderInteractiveTable onSubmit error:', err);
            throw err;
        } finally {
            isSubmitting = false;
            renderTable();
        }
    };

    const EDITOR_BLUR_SETTLE_DELAY_MS = 120;
    const EDITOR_INITIAL_BLUR_GUARD_MS = 400;
    const EDITOR_POINTER_BLUR_GUARD_MS = 250;

    const shouldKeepEditorOpenOnBlur = (inputEl, editingCell, relatedTarget) => {
        const activeElement = document.activeElement;

        if (Date.now() < Number(inputEl._kfIgnoreBlurUntil || 0)) {
            return true;
        }

        if (activeElement === inputEl) {
            return true;
        }

        if (editingCell && activeElement instanceof Node && editingCell.contains(activeElement)) {
            return true;
        }

        if (editingCell && relatedTarget instanceof Node && editingCell.contains(relatedTarget)) {
            return true;
        }

        return false;
    };

    const closeEditor = (inputEl, commit, options = {}) => {
        const restoreFocus = options.restoreFocus !== false;
        const cell = inputEl.closest('.kfInteractiveTable__cell');
        if (!cell) return;

        const rowIndex = Number(cell.getAttribute('data-row-index'));
        const colIndex = Number(cell.getAttribute('data-col-index'));
        const column = columns[colIndex];
        const row = rowsData[rowIndex];
        const previousValue = getCellValue(row, column, colIndex);

        if (commit) {
            const rawValue = column.type === 'checkbox'
                ? !!inputEl.checked
                : column.type === 'search-select'
                    ? String(inputEl._kfSearchSelectedValue ?? '').trim() || resolveSearchSelectValue(inputEl.value, inputEl._kfSearchOptions)
                    : inputEl.value;
            const nextValue = parseCellValue(rawValue, column, row, rowIndex);
            setCellValue(row, column, colIndex, nextValue);
            const appendedRow = ensureTrailingEmptyRow();
            if (appendedRow || isGroupByColumn(column)) {
                renderTable();
            } else {
                renderCell(cell, rowIndex, colIndex);
            }
            emitChange({
                rowIndex,
                columnIndex: colIndex,
                columnKey: column.key,
                column,
                previousValue,
                nextValue,
                row: cloneRow(row),
                data: getData(),
                rawData: getRawData(),
                source: 'editor',
            });
        } else {
            renderCell(cell, rowIndex, colIndex);
        }

        cell.classList.remove('is-editing');
        if (isEditableCell(column, row, rowIndex)) {
            cell.setAttribute('tabindex', '0');
        } else {
            cell.removeAttribute('tabindex');
        }

        if (pendingEditorNavigation) {
            const nextCell = findAdjacentEditableCell(rowIndex, colIndex, pendingEditorNavigation.direction);
            pendingEditorNavigation = null;
            if (nextCell) {
                focusEditableCell(nextCell, { open: true });
                return;
            }
        }

        if (!restoreFocus) return;

        // A regroup or appended row re-renders the table, detaching `cell`.
        const liveCell = cell.isConnected ? cell : getCellElement(rowIndex, colIndex);
        if (!liveCell || liveCell.matches(':focus')) return;
        focusEditableCell(liveCell);
    };

    const isDatepickerOpen = (jq) => {
        if (!jq) return false;
        try {
            return jq('.ui-datepicker:visible').length > 0;
        } catch (_) {
            return false;
        }
    };

    const openEditor = async (cell) => {
        if (!cell || cell.classList.contains('is-editing')) return;

        const rowIndex = Number(cell.getAttribute('data-row-index'));
        const colIndex = Number(cell.getAttribute('data-col-index'));
        const column = columns[colIndex];
        const row = rowsData[rowIndex];

        if (!isEditableCell(column, row, rowIndex)) return;

        const jq = typeof jQuery === 'function' ? jQuery : (typeof $ === 'function' ? $ : null);
        const hasJqDatepicker = !!(jq && jq.fn && typeof jq.fn.datepicker === 'function');
        const currentValue = getCellValue(row, column, colIndex);

        cell.classList.add('is-editing');
        cell.removeAttribute('tabindex');
        cell.textContent = '';

        let inputEl;
        if (column.type === 'select') {
            inputEl = document.createElement('select');
            inputEl.className = ['input', 'kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');
            inputEl.disabled = true;
            const loadingOption = document.createElement('option');
            loadingOption.value = '';
            loadingOption.textContent = 'Loading...';
            inputEl.appendChild(loadingOption);
        } else if (column.type === 'search-select') {
            const wrapperEl = document.createElement('div');
            wrapperEl.className = 'kfInteractiveTable__searchSelect';
            wrapperEl.style.position = 'relative';
            wrapperEl.style.display = 'flex';
            wrapperEl.style.alignItems = 'center';
            wrapperEl.style.width = '100%';

            inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.className = ['input', 'kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');
            inputEl.disabled = true;
            inputEl.placeholder = 'Select...';
            inputEl.autocomplete = 'off';
            inputEl.spellcheck = false;
            inputEl.setAttribute('aria-autocomplete', 'list');
            inputEl.setAttribute('aria-expanded', 'false');
            inputEl.style.paddingRight = '34px';

            const iconEl = document.createElement('span');
            iconEl.textContent = '▾';
            iconEl.style.position = 'absolute';
            iconEl.style.right = '10px';
            iconEl.style.top = '50%';
            iconEl.style.transform = 'translateY(-50%)';
            iconEl.style.pointerEvents = 'none';
            iconEl.style.color = '#64748b';
            iconEl.style.fontSize = '12px';

            wrapperEl.appendChild(inputEl);
            wrapperEl.appendChild(iconEl);
            cell.appendChild(wrapperEl);
            inputEl._kfSearchWrapper = wrapperEl;
        } else if (column.type === 'checkbox') {
            inputEl = document.createElement('input');
            inputEl.type = 'checkbox';
            inputEl.className = ['kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');
            inputEl.checked = !!currentValue;
        } else {
            inputEl = document.createElement('input');
            inputEl.className = ['input', 'kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');

            if (column.type === 'date') {
                const valueDisplay = toDisplayDate(currentValue);
                const valueIso = toIsoDate(currentValue);
                if (hasJqDatepicker) {
                    inputEl.type = 'text';
                    inputEl.value = valueDisplay;
                } else {
                    inputEl.type = 'date';
                    inputEl.value = valueIso;
                }
            } else if (column.type === 'number') {
                inputEl.type = 'number';
                inputEl.value = String(currentValue ?? '');
            } else {
                inputEl.type = 'text';
                inputEl.value = String(currentValue ?? '');
            }
        }

        inputEl.style.width = '100%';
        inputEl.style.minHeight = '30px';
        inputEl.style.maxWidth = '100%';
        inputEl._kfIgnoreBlurUntil = Date.now() + EDITOR_INITIAL_BLUR_GUARD_MS;
        const markInternalPointerInteraction = () => {
            inputEl._kfIgnoreBlurUntil = Date.now() + EDITOR_POINTER_BLUR_GUARD_MS;
        };

        inputEl.addEventListener('mousedown', markInternalPointerInteraction);
        inputEl.addEventListener('pointerdown', markInternalPointerInteraction);
        inputEl.addEventListener('touchstart', markInternalPointerInteraction, { passive: true });

        if (column.type !== 'search-select') {
            cell.appendChild(inputEl);
        }

        if (column.type === 'select' || column.type === 'search-select') {
            const options = await resolveSelectOptions(column, row, rowIndex, colIndex);
            const editingCell = inputEl.closest('.kfInteractiveTable__cell');
            if (!editingCell || !editingCell.classList.contains('is-editing')) return;

            const currentValueText = String(currentValue ?? '');

            if (column.type === 'select') {
                inputEl.innerHTML = '';
                options.forEach((opt) => {
                    const optionEl = document.createElement('option');
                    optionEl.value = opt.value;
                    optionEl.textContent = opt.label;
                    inputEl.appendChild(optionEl);
                });

                if (currentValueText && !options.some((opt) => opt.value === currentValueText)) {
                    const fallbackOption = document.createElement('option');
                    fallbackOption.value = currentValueText;
                    fallbackOption.textContent = currentValueText;
                    inputEl.insertBefore(fallbackOption, inputEl.firstChild);
                }

                inputEl.value = currentValueText;
                inputEl.disabled = false;
            } else {
                const currentOption = options.find((opt) => String(opt.value) === currentValueText);
                inputEl._kfSearchOptions = options;
                inputEl._kfSearchHighlightedIndex = 0;
                inputEl._kfSearchSelectedValue = currentOption ? String(currentOption.value ?? '') : '';
                inputEl.value = currentOption ? currentOption.label : currentValueText;
                inputEl.disabled = false;
                renderSearchSelectDropdown(inputEl, options, inputEl.value);
            }
        }

        if (column.type === 'date' && hasJqDatepicker) {
            const inputJq = jq(inputEl);
            const openDateHint = String(row?.[column.openDateHintKey] || '').trim();
            const dateFormat = String(column.dateFormat || (settings.dateLocale === 'us' ? 'mm/dd/yy' : 'dd/mm/yy'));

            if (!inputJq.hasClass('hasDatepicker')) {
                inputJq.datepicker({
                    dateFormat,
                    changeMonth: true,
                    changeYear: true,
                    defaultDate: openDateHint || null,
                    minDate: column.minDate ?? null,
                    maxDate: column.maxDate ?? null,
                    onSelect: function () {
                        closeEditor(inputEl, true);
                    },
                    onClose: function () {
                        setTimeout(function () {
                            const editingCell = inputEl.closest('.kfInteractiveTable__cell');
                            if (editingCell && editingCell.classList.contains('is-editing')) {
                                closeEditor(inputEl, true, { restoreFocus: false });
                            }
                        }, 0);
                    },
                });
            }

            if (typeof formatDatePicker === 'function') {
                try { formatDatePicker(inputEl); } catch (_) {}
            }

            if (typeof enhanceDateTimePicker === 'function') {
                try {
                    enhanceDateTimePicker(inputEl, {
                        mode: 'date',
                        dateFormat,
                        minDate: column.minDate ?? null,
                        maxDate: column.maxDate ?? null,
                        waitForInit: false,
                    });
                } catch (_) {}
            }

            try {
                if (String(inputEl.value || '').trim()) {
                    inputJq.datepicker('setDate', inputEl.value);
                } else {
                    if (openDateHint) {
                        inputJq.datepicker('option', 'defaultDate', openDateHint);
                    }
                    inputJq.datepicker('setDate', null);
                }
                inputJq.datepicker('show');
            } catch (_) {}
        }

        inputEl.addEventListener('keydown', function (event) {
            if (column.type === 'search-select') {
                const filteredOptions = Array.isArray(inputEl._kfSearchFilteredOptions) ? inputEl._kfSearchFilteredOptions : [];

                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (filteredOptions.length) {
                        const direction = event.key === 'ArrowDown' ? 1 : -1;
                        const currentIndex = Number(inputEl._kfSearchHighlightedIndex);
                        const nextIndex = Number.isFinite(currentIndex)
                            ? (currentIndex + direction + filteredOptions.length) % filteredOptions.length
                            : 0;
                        inputEl._kfSearchHighlightedIndex = nextIndex;
                    } else {
                        inputEl._kfSearchHighlightedIndex = -1;
                    }
                    renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
                    return;
                }

                if (event.key === 'Enter') {
                    const highlightedOption = filteredOptions[inputEl._kfSearchHighlightedIndex] || filteredOptions[0] || null;
                    if (highlightedOption) {
                        event.preventDefault();
                        inputEl.value = String(highlightedOption.label ?? '');
                        inputEl._kfSearchSelectedValue = String(highlightedOption.value ?? '');
                    }
                }

                if (event.key === 'Escape') {
                    closeSearchSelectDropdown(inputEl);
                }
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                closeEditor(inputEl, true);
            }
            if (event.key === 'Tab') {
                const nextCell = findAdjacentEditableCell(rowIndex, colIndex, event.shiftKey ? -1 : 1);
                if (nextCell) {
                    event.preventDefault();
                    pendingEditorNavigation = {
                        direction: event.shiftKey ? -1 : 1,
                    };
                    closeEditor(inputEl, true);
                }
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeEditor(inputEl, false);
            }
        });

        inputEl.addEventListener('change', function () {
            if (column.type === 'checkbox' || column.type === 'select' || column.type === 'search-select') {
                closeEditor(inputEl, true);
            }
        });

        if (column.type === 'search-select') {
            inputEl.addEventListener('input', function () {
                inputEl._kfSearchHighlightedIndex = 0;
                inputEl._kfSearchSelectedValue = '';
                renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
            });

            inputEl.addEventListener('focus', function () {
                renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
            });

            inputEl.addEventListener('click', function () {
                renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
            });
        }

        inputEl.addEventListener('blur', function (event) {
            setTimeout(function () {
                const jq = typeof jQuery === 'function' ? jQuery : (typeof $ === 'function' ? $ : null);
                if (column.type === 'date' && isDatepickerOpen(jq)) {
                    return;
                }
                const editingCell = inputEl.closest('.kfInteractiveTable__cell');
                if (shouldKeepEditorOpenOnBlur(inputEl, editingCell, event.relatedTarget)) {
                    return;
                }

                if (column.type === 'search-select') {
                    closeSearchSelectDropdown(inputEl);
                }
                if (editingCell && editingCell.classList.contains('is-editing')) {
                    closeEditor(inputEl, true, { restoreFocus: false });
                }
            }, EDITOR_BLUR_SETTLE_DELAY_MS);
        });

        inputEl.focus();
        if (typeof inputEl.select === 'function' && column.type !== 'checkbox') {
            inputEl.select();
        }
        if (column.type === 'select') {
            tryOpenSelectMenu(inputEl);
        }
    };

    const handleTableClick = (event) => {
        const submitButton = event.target.closest('[data-kf-interactive-table-submit="true"]');
        if (submitButton && (host.contains(submitButton) || actionContainer?.contains(submitButton))) {
            event.preventDefault();
            void submitTable();
            return;
        }

        const clearButton = event.target.closest('[data-kf-interactive-table-clear="true"]');
        if (clearButton && (host.contains(clearButton) || actionContainer?.contains(clearButton))) {
            event.preventDefault();
            void clearTable();
            return;
        }

        const removeButton = event.target.closest('[data-kf-interactive-table-remove-row="true"]');
        if (removeButton && host.contains(removeButton)) {
            event.preventDefault();
            const rowIndex = Number(removeButton.closest('tr[data-row-index]')?.getAttribute('data-row-index'));
            removeRow(rowIndex, 'button');
            return;
        }

        const editor = event.target.closest('.kfInteractiveTable__editor');
        if (editor && host.contains(editor)) return;

        const cell = event.target.closest('.kfInteractiveTable__cell');
        if (!cell || !host.contains(cell) || cell.classList.contains('is-editing')) return;
        void openEditor(cell);
    };

    const handleTableMouseDown = (event) => {
        const submitButton = event.target.closest('[data-kf-interactive-table-submit="true"]');
        if (submitButton && (host.contains(submitButton) || actionContainer?.contains(submitButton))) return;

        const clearButton = event.target.closest('[data-kf-interactive-table-clear="true"]');
        if (clearButton && (host.contains(clearButton) || actionContainer?.contains(clearButton))) return;

        const removeButton = event.target.closest('[data-kf-interactive-table-remove-row="true"]');
        if (removeButton && host.contains(removeButton)) return;

        const editor = event.target.closest('.kfInteractiveTable__editor');
        if (editor && host.contains(editor)) return;

        const cell = event.target.closest('.kfInteractiveTable__cell');
        if (!cell || !host.contains(cell)) return;

        if (!cell.classList.contains('is-editing')) {
            event.preventDefault();
        }
    };

    const handleTableKeydown = (event) => {
        const cell = event.target.closest('.kfInteractiveTable__cell');
        if (!cell || !host.contains(cell) || cell.classList.contains('is-editing')) return;

        if (event.key === 'Enter' || event.key === ' ' || event.key === 'F2') {
            event.preventDefault();
            void openEditor(cell);
        }
    };

    renderTable();
    host.addEventListener('mousedown', handleTableMouseDown);
    host.addEventListener('click', handleTableClick);
    host.addEventListener('keydown', handleTableKeydown);
    if (usesExternalActionContainer) {
        actionContainer.addEventListener('mousedown', handleTableMouseDown);
        actionContainer.addEventListener('click', handleTableClick);
    }

    if (typeof settings.onRenderComplete === 'function') {
        try {
            settings.onRenderComplete({
                viewId,
                host,
                data: getData(),
                rawData: getRawData(),
            });
        } catch (err) {
            console.error('renderInteractiveTable onRenderComplete error:', err);
        }
    }

    controller = {
        getData(options = {}) {
            return getData(options);
        },
        setData(nextRows) {
            rowsData = Array.isArray(nextRows) ? nextRows.map(cloneRow) : [];
            ensureTrailingEmptyRow();
            renderTable();
        },
        updateCell(rowIndex, columnKeyOrIndex, value, options = {}) {
            const idx = Number(rowIndex);
            if (!Number.isFinite(idx) || idx < 0 || idx >= rowsData.length) return;

            const colIndex = typeof columnKeyOrIndex === 'number'
                ? columnKeyOrIndex
                : colIndexByKey.get(String(columnKeyOrIndex));
            if (!Number.isFinite(colIndex) || colIndex < 0 || colIndex >= columns.length) return;

            const column = columns[colIndex];
            const row = rowsData[idx];
            const previousValue = getCellValue(row, column, colIndex);
            const nextValue = parseCellValue(value, column, row, idx);
            setCellValue(row, column, colIndex, nextValue);
            const appendedRow = ensureTrailingEmptyRow();

            const cell = getCellElement(idx, colIndex);
            if (cell && !appendedRow && !isGroupByColumn(column)) {
                renderCell(cell, idx, colIndex);
            } else {
                renderTable();
            }

            if (options.emit !== false) {
                emitChange({
                    rowIndex: idx,
                    columnIndex: colIndex,
                    columnKey: column.key,
                    column,
                    previousValue,
                    nextValue,
                    row: cloneRow(row),
                    data: getData(),
                    rawData: getRawData(),
                    source: options.source || 'api',
                });
            }
        },
        async submit() {
            await submitTable();
        },
        async clear() {
            await clearTable();
        },
        removeRow(rowIndex) {
            removeRow(rowIndex);
        },
        destroy() {
            selectOptionsCache.clear();
            host.removeEventListener('mousedown', handleTableMouseDown);
            host.removeEventListener('click', handleTableClick);
            host.removeEventListener('keydown', handleTableKeydown);
            if (usesExternalActionContainer) {
                actionContainer.removeEventListener('mousedown', handleTableMouseDown);
                actionContainer.removeEventListener('click', handleTableClick);
                actionContainer.innerHTML = '';
            }
            host.innerHTML = '';
        },
    };

    return controller;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: file-carousel
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// File carousel ported as-is (analysis C24).

let fileCarouselState = null;

/**
 * Creates (once) the shared file-carousel overlay markup and styles, and returns the overlay root.
 * @returns {HTMLElement} The overlay root element.
 */
function ensureFileCarouselOverlay() {
    const existing = document.getElementById('kfnFileCarousel');
    if (existing) return existing;

    const style = document.createElement('style');
    style.id = 'kfnFileCarouselStyles';
    style.textContent = `
        .kfn-file-carousel { position: fixed; inset: 0; z-index: 2147483000; display: none; }
        .kfn-file-carousel.is-open { display: block; }
        .kfn-file-carousel__backdrop { position: absolute; inset: 0; background: rgba(20, 20, 20, 0.9); }
        .kfn-file-carousel__dialog { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 90px; box-sizing: border-box; }
        .kfn-file-carousel__scroll { height: 100%; max-width: 100%; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; align-items: center; }
        .kfn-file-carousel__stage { position: relative; max-width: 100%; flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; border-radius: 4px; overflow: hidden; }
        .kfn-file-carousel__stage img { max-width: 88vw; max-height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.15s ease; }
        .kfn-file-carousel__stage img.is-loaded { opacity: 1; }
        .kfn-file-carousel__stage iframe { width: 88vw; height: 100%; border: 0; background: #fff; }
        .kfn-file-carousel__spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.25); border-top-color: #fff; border-radius: 50%; animation: kfnFileCarouselSpin 0.7s linear infinite; }
        @keyframes kfnFileCarouselSpin { to { transform: rotate(360deg); } }
        .kfn-file-carousel__loading { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .kfn-file-carousel__loading-label { color: #fff; font-size: 13px; opacity: 0.85; text-align: center; }
        .kfn-file-carousel__fallback { color: #fff; text-align: center; padding: 40px; }
        .kfn-file-carousel__fallback .kfn-file-carousel__icon { font-size: 48px; display: block; margin-bottom: 12px; }
        .kfn-file-carousel__close, .kfn-file-carousel__nav { position: absolute; z-index: 2; background: rgba(0, 0, 0, 0.45); color: #fff; border: 0; cursor: pointer; border-radius: 50%; width: 44px; height: 44px; font-size: 24px; line-height: 1; display: flex; align-items: center; justify-content: center; }
        .kfn-file-carousel__close:hover, .kfn-file-carousel__nav:hover { background: rgba(0, 0, 0, 0.65); }
        .kfn-file-carousel__close { top: 16px; right: 16px; }
        .kfn-file-carousel__nav--prev { left: 16px; top: 50%; transform: translateY(-50%); }
        .kfn-file-carousel__nav--next { right: 16px; top: 50%; transform: translateY(-50%); }
        .kfn-file-carousel__nav::before { content: ''; width: 12px; height: 12px; border-style: solid; border-color: #fff; border-width: 0 3px 3px 0; display: block; }
        .kfn-file-carousel__nav--prev::before { transform: rotate(135deg); margin-left: 5px; }
        .kfn-file-carousel__nav--next::before { transform: rotate(-45deg); margin-right: 5px; }
        .kfn-file-carousel__preview { display: flex; flex-direction: column; align-items: center; max-width: 100%; width: 100%; flex: 1 1 auto; min-height: 0; }
        .kfn-file-carousel__filename { flex: 0 0 auto; color: #fff; font-size: 15px; margin: 0 0 10px; text-align: center; word-break: break-all; }
        .kfn-file-carousel__meta { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; margin: 14px 0 0; }
        .kfn-file-carousel__meta .kn-file-download { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: 999px; background: #2563eb; color: #fff; font-weight: 600; font-size: 12px; text-decoration: none; line-height: 1; }
        .kfn-file-carousel__meta .kn-file-download:hover { background: #1d4ed8; }
        .kfn-file-carousel__meta .kn-file-download i { font-size: 12px; }
        .kfn-file-carousel__download-size { opacity: 0.85; font-weight: 400; }
        .kfn-file-carousel__footer { flex: 0 0 auto; color: #fff; margin-top: 2px; text-align: center; max-width: 80vw; }
        .kfn-file-carousel__caption { font-size: 13px; opacity: 0.8; margin-bottom: 4px; }
        .kfn-file-carousel__counter { font-size: 12px; opacity: 0.55; }
        @media (max-width: 640px) {
            .kfn-file-carousel__dialog { padding: 10px 8px; }
            .kfn-file-carousel__stage img, .kfn-file-carousel__stage iframe { max-width: 96vw; }
            .kfn-file-carousel__close, .kfn-file-carousel__nav { width: 34px; height: 34px; font-size: 18px; }
            .kfn-file-carousel__close { top: 6px; right: 6px; }
            .kfn-file-carousel__nav--prev { left: 4px; }
            .kfn-file-carousel__nav--next { right: 4px; }
            .kfn-file-carousel__nav::before { width: 9px; height: 9px; border-width: 0 2px 2px 0; }
            .kfn-file-carousel__nav--prev::before { margin-left: 3px; }
            .kfn-file-carousel__nav--next::before { margin-right: 3px; }
            .kfn-file-carousel__filename { font-size: 13px; margin-bottom: 6px; }
            .kfn-file-carousel__meta { margin-top: 10px; }
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'kfnFileCarousel';
    overlay.className = 'kfn-file-carousel';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
        <div class="kfn-file-carousel__backdrop"></div>
        <div class="kfn-file-carousel__dialog">
            <button type="button" class="kfn-file-carousel__close" aria-label="Close">&times;</button>
            <button type="button" class="kfn-file-carousel__nav kfn-file-carousel__nav--prev" aria-label="Previous file"></button>
            <div class="kfn-file-carousel__scroll">
                <div class="kfn-file-carousel__preview">
                    <h1 id="kn-asset-header" class="kfn-file-carousel__filename"></h1>
                    <div class="kfn-file-carousel__stage"></div>
                    <p class="kfn-file-carousel__meta">
                        <a class="kn-file-download" download target="_blank" rel="noopener noreferrer">Download<span class="kfn-file-carousel__download-size"></span><i class="fa fa-cloud-download"></i></a>
                    </p>
                </div>
                <div class="kfn-file-carousel__footer">
                    <div class="kfn-file-carousel__caption"></div>
                    <div class="kfn-file-carousel__counter"></div>
                </div>
            </div>
            <button type="button" class="kfn-file-carousel__nav kfn-file-carousel__nav--next" aria-label="Next file"></button>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.kfn-file-carousel__backdrop').addEventListener('click', closeFileCarousel);
    overlay.querySelector('.kfn-file-carousel__close').addEventListener('click', closeFileCarousel);
    overlay.querySelector('.kfn-file-carousel__nav--prev').addEventListener('click', () => navigateFileCarousel(-1));
    overlay.querySelector('.kfn-file-carousel__nav--next').addEventListener('click', () => navigateFileCarousel(1));
    // The `download` attribute is ignored on cross-origin links (api.knack.com vs the app's own domain), so force it via fetch+blob.
    overlay.querySelector('.kn-file-download').addEventListener('click', (event) => {
        event.preventDefault();
        const item = fileCarouselState?.items[fileCarouselState.index];
        if (item) forceDownloadFile(item.assetUrl, item.fileName);
    });

    return overlay;
}

/**
 * Preloads an item's image in the background so navigating to it feels instant.
 * @param {Object} [item] - A carousel item.
 * @returns {void}
 */
function preloadFileCarouselImage(item) {
    if (!item || !IMAGE_EXTENSIONS.includes(item.extension)) return;
    new Image().src = item.assetUrl;
}

/**
 * Replaces the stage content with the "can't preview" message. The Download button stays available regardless.
 * @param {HTMLElement} stage - The carousel's stage element.
 * @param {string} [message] - Message to show under the icon.
 * @returns {void}
 */
function showFileCarouselFallback(stage, message = 'No preview available for this file type.') {
    stage.innerHTML = '';
    const fallback = document.createElement('div');
    fallback.className = 'kfn-file-carousel__fallback';
    fallback.innerHTML = `<span class="kfn-file-carousel__icon">\uD83D\uDCC4</span>${message}`;
    stage.appendChild(fallback);
}

/**
 * Renders the file at `index` into the carousel stage (image, PDF, attempted Office embed, or a download-only fallback).
 * @param {number} index - Index into the current carousel's items array.
 * @returns {void}
 */
function renderFileCarouselItem(index) {
    if (!fileCarouselState || !fileCarouselState.items.length) return;
    const overlay = document.getElementById('kfnFileCarousel');
    if (!overlay) return;

    const item = fileCarouselState.items[index];
    if (!item) return;
    fileCarouselState.index = index;

    const stage = overlay.querySelector('.kfn-file-carousel__stage');
    const filename = overlay.querySelector('.kfn-file-carousel__filename');
    const caption = overlay.querySelector('.kfn-file-carousel__caption');
    const counter = overlay.querySelector('.kfn-file-carousel__counter');
    const downloadSize = overlay.querySelector('.kfn-file-carousel__download-size');
    const download = overlay.querySelector('.kn-file-download');

    stage.innerHTML = '';
    if (IMAGE_EXTENSIONS.includes(item.extension)) {
        const loading = document.createElement('div');
        loading.className = 'kfn-file-carousel__loading';
        loading.innerHTML = '<div class="kfn-file-carousel__spinner"></div><div class="kfn-file-carousel__loading-label">Loading file\u2026</div>';
        stage.appendChild(loading);

        // Only reassure the user once it's actually slow, so fast loads stay clean.
        const slowLoadTimer = setTimeout(() => {
            if (!stage.contains(loading)) return;
            loading.querySelector('.kfn-file-carousel__loading-label').textContent = 'Still loading \u2014 this file is large, hang tight\u2026';
        }, 4000);

        const img = document.createElement('img');
        img.alt = item.fileName;
        img.addEventListener('load', () => {
            clearTimeout(slowLoadTimer);
            loading.remove();
            img.classList.add('is-loaded');
        }, { once: true });
        img.addEventListener('error', () => {
            clearTimeout(slowLoadTimer);
            if (stage.contains(img)) showFileCarouselFallback(stage, "This image couldn't be loaded.");
        }, { once: true });
        img.src = item.assetUrl;
        stage.appendChild(img);
    } else if (item.extension === 'pdf') {
        // Browsers render PDFs natively in an iframe, so no external viewer is needed.
        const iframe = document.createElement('iframe');
        iframe.src = item.assetUrl;
        iframe.title = item.fileName;
        stage.appendChild(iframe);
    } else if (fileCarouselState.tryOfficeEmbed && OFFICE_EXTENSIONS.includes(item.extension)) {
        // Office Online needs a publicly reachable src; the download button below is the fallback if this renders blank.
        const iframe = document.createElement('iframe');
        iframe.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(item.assetUrl)}`;
        iframe.title = item.fileName;
        stage.appendChild(iframe);
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'kfn-file-carousel__fallback';
        fallback.innerHTML = '<span class="kfn-file-carousel__icon">\uD83D\uDCC4</span>No preview available for this file type.';
        stage.appendChild(fallback);
    }

    caption.textContent = item.caption || item.fileName;
    counter.textContent = `${index + 1} of ${fileCarouselState.items.length}`;
    filename.textContent = item.fileName;
    const formattedSize = formatFileSizeBytes(item.fileSize);
    downloadSize.textContent = formattedSize ? ` (${formattedSize})` : '';
    download.href = item.assetUrl;
    download.setAttribute('download', item.fileName);

    if (item.fileSize === undefined) {
        fetchFileSizeBytes(item).then((bytes) => {
            // Bail if the carousel moved on or closed while the size request was in flight.
            if (!fileCarouselState || fileCarouselState.items[fileCarouselState.index] !== item) return;
            const sizeText = formatFileSizeBytes(bytes);
            overlay.querySelector('.kfn-file-carousel__download-size').textContent = sizeText ? ` (${sizeText})` : '';
        });
    }

    const showNav = fileCarouselState.items.length > 1 ? 'visible' : 'hidden';
    overlay.querySelector('.kfn-file-carousel__nav--prev').style.visibility = showNav;
    overlay.querySelector('.kfn-file-carousel__nav--next').style.visibility = showNav;

    // Warm the browser cache for adjacent items so Prev/Next feels instant.
    const total = fileCarouselState.items.length;
    preloadFileCarouselImage(fileCarouselState.items[(index + 1) % total]);
    preloadFileCarouselImage(fileCarouselState.items[(index - 1 + total) % total]);
}

/**
 * Moves the open carousel forward/backward by `delta`, wrapping around at either end.
 * @param {number} delta - -1 for previous, 1 for next.
 * @returns {void}
 */
function navigateFileCarousel(delta) {
    if (!fileCarouselState || !fileCarouselState.items.length) return;
    const total = fileCarouselState.items.length;
    const nextIndex = (fileCarouselState.index + delta + total) % total;
    renderFileCarouselItem(nextIndex);
}

/**
 * Closes the carousel when the user presses the browser Back button, since opening the carousel
 * pushed a history entry for exactly this purpose.
 * @returns {void}
 */
function onFileCarouselPopState() {
    closeFileCarousel({ viaPopState: true });
}

/**
 * Opens the shared file carousel overlay at a given item.
 * @param {Array<Object>} items - Ordered list of `{assetId, fileName, extension, assetUrl, caption}` entries.
 * @param {number} startIndex - Index of the item to show first.
 * @param {HTMLElement} [triggerElement] - Element to restore focus to when the overlay closes.
 * @param {{tryOfficeEmbed?: boolean}} [options]
 * @returns {void}
 */
function openFileCarousel(items, startIndex, triggerElement, options = {}) {
    if (!Array.isArray(items) || !items.length) return;
    const overlay = ensureFileCarouselOverlay();

    // Re-opening while open replaces the previous keydown handler (otherwise every arrow key would move twice).
    const wasOpen = Boolean(fileCarouselState);
    if (wasOpen) document.removeEventListener('keydown', fileCarouselState.keydownHandler);

    const onKeydown = (event) => {
        if (event.key === 'Escape') closeFileCarousel();
        else if (event.key === 'ArrowLeft') navigateFileCarousel(-1);
        else if (event.key === 'ArrowRight') navigateFileCarousel(1);
    };

    fileCarouselState = {
        items,
        index: startIndex,
        triggerElement: triggerElement || null,
        tryOfficeEmbed: options.tryOfficeEmbed !== false,
        keydownHandler: onKeydown,
    };

    document.addEventListener('keydown', onKeydown);
    window.addEventListener('popstate', onFileCarouselPopState);
    // One history entry per open (not per Prev/Next) so a single Back press closes the overlay
    // instead of navigating the underlying page away while it stays open on top.
    if (!wasOpen) history.pushState({ kfnFileCarouselOpen: true }, '', location.href);

    document.body.style.overflow = 'hidden';
    overlay.classList.add('is-open');
    renderFileCarouselItem(startIndex);
    overlay.querySelector('.kfn-file-carousel__close').focus();
}

/**
 * Closes the shared file carousel overlay and restores focus/scroll state.
 * @param {{viaPopState?: boolean}} [options] - Set when called from a Back-button popstate, so we don't call history.back() again.
 * @returns {void}
 */
function closeFileCarousel(options = {}) {
    if (!fileCarouselState) return;
    const { triggerElement, keydownHandler } = fileCarouselState;
    fileCarouselState = null;
    document.removeEventListener('keydown', keydownHandler);
    window.removeEventListener('popstate', onFileCarouselPopState);
    document.body.style.overflow = '';

    // Tear the state down first so a consumer-removed overlay cannot leave the listeners behind.
    const overlay = document.getElementById('kfnFileCarousel');
    if (overlay) {
        overlay.classList.remove('is-open');
        overlay.querySelector('.kfn-file-carousel__stage').innerHTML = '';
    }

    // Closed via the X/backdrop/Escape rather than Back: pop the history entry we pushed on open
    // so it doesn't sit there as a stale extra step next time the user presses Back.
    if (!options.viaPopState) history.back();

    if (typeof triggerElement?.focus === 'function') triggerElement.focus();
}

/**
 * Wires a Gmail-style attachment carousel onto a Knack table's file/image column.
 * Clicking any file cell opens an overlay that pages through every file currently rendered in the
 * table, instead of opening each asset in a new tab. Safe to call on every `knack-view-render` for
 * the view; the click listener is only bound once per rendered table element.
 * @param {string} viewId - Table view id (e.g. 'view_2331').
 * @param {string} fileFieldKey - File/image field key backing the column to enable (e.g. 'field_888').
 * @param {Object} [options]
 * @param {string[]} [options.captionFieldKeys] - Field keys shown as caption text under the preview, joined with " · ".
 * @param {boolean} [options.tryOfficeEmbed=true] - Attempt an inline Office Online preview for docx/xlsx/pptx before falling back to a download-only view.
 * @returns {void}
 */
function initFileCarousel(viewId, fileFieldKey, options = {}) {
    const normalizedViewId = knackNavigator.normalizeViewId(viewId);
    const viewElement = document.getElementById(normalizedViewId);
    if (!viewElement || viewElement.dataset.fileCarouselInit === 'true') return;

    const fileColumnSelector = knackNavigator
        .getViewColumnSelectors(normalizedViewId, fileFieldKey)
        .find((selector) => selector.startsWith('td.') || selector.startsWith('td['));
    if (!fileColumnSelector) return;

    const captionFieldKeys = Array.isArray(options.captionFieldKeys) ? options.captionFieldKeys : [];
    const captionSelectors = captionFieldKeys
        .map((fieldKey) => knackNavigator
            .getViewColumnSelectors(normalizedViewId, fieldKey)
            .find((selector) => selector.startsWith('td.') || selector.startsWith('td[')))
        .filter(Boolean);

    /**
     * Extracts asset info from whichever element inside the cell carries Knack's asset identity attributes.
     * @param {HTMLElement} cellElement - The `<td>` for the file column.
     * @returns {{assetId: string, fileName: string, extension: string, assetUrl: string}|null}
     */
    function getCellAssetInfo(cellElement) {
        const assetElement = cellElement.querySelector('[data-asset-id][data-file-name]');
        if (!assetElement) return null;
        const info = buildKnackAssetInfo(
            assetElement.getAttribute('data-asset-id'),
            assetElement.getAttribute('data-file-name')
        );
        if (!info.assetUrl) return null;

        const fileSize = assetElement.getAttribute('data-file-size');
        return fileSize ? { ...info, fileSize: Number(fileSize) } : info;
    }

    /**
     * Builds the caption text for a row from the configured caption columns.
     * @param {HTMLElement} rowElement - The `<tr>` for the record.
     * @returns {string}
     */
    function getRowCaption(rowElement) {
        return captionSelectors
            .map((selector) => rowElement.querySelector(selector)?.textContent.trim())
            .filter(Boolean)
            .join(' · ');
    }

    // Capture phase runs before Knack's own bubble-phase asset click handler, so this pre-empts
    // Knack's native image lightbox from opening behind ours (it isn't rewritten for image extensions).
    viewElement.addEventListener('click', (event) => {
        const fileCell = event.target.closest(fileColumnSelector);
        if (!fileCell || !viewElement.contains(fileCell)) return;

        const clickedInfo = getCellAssetInfo(fileCell);
        if (!clickedInfo) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const items = [];
        let startIndex = 0;

        viewElement.querySelectorAll('tbody tr').forEach((rowElement) => {
            const cell = rowElement.querySelector(fileColumnSelector);
            if (!cell) return;
            const info = getCellAssetInfo(cell);
            if (!info) return;

            if (cell === fileCell) startIndex = items.length;
            items.push({ ...info, caption: getRowCaption(rowElement) });
        });

        if (!items.length) return;
        openFileCarousel(items, startIndex, fileCell, { tryOfficeEmbed: options.tryOfficeEmbed });
    }, true);

    viewElement.dataset.fileCarouselInit = 'true';
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: quick-toggles
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Quick toggles (analysis C26): CAMultiChoiceQuickToggle as-is; CAQuickToggle with its jQuery replaced by native DOM.

function caQuickToggle({ key: viewId }, data = []) {
    // Create an instance of the CAQuickToggle class and initialize it
    const caQuickToggle = new CAQuickToggle(viewId, data);
    caQuickToggle.init();
}

/**
 * Enables quick toggle behaviour for two-option multiple-choice fields in table and search views.
 * Supports either a view-level target reference or field-level keyword usage.
 * @param {{ key: string }} view - Knack view metadata containing the view id.
 * @param {Array<Object>} [data=[]] - Rendered Knack row data for the view.
 * @returns {void}
 */
function caMultiChoiceQuickToggle({ key: viewId }, data = []) {
    const caMultiChoiceQuickToggle = new CAMultiChoiceQuickToggle(viewId, data);
    caMultiChoiceQuickToggle.init();
}

/**
 * Shared behaviour of the quick toggle controllers: a queue of record updates sent one at a time, a progress popup, and
 * a single refresh of the affected views once the queue is empty. Subclasses supply their wording and the data to send.
 */
class QuickToggleQueue {
    /** Sets up the queue state and colour defaults shared by both controllers. */
    constructor() {
        this.quickToggleParams = {
            bgColorTrue: '#e2efda',
            bgColorFalse: '#ffb557',
            bgColorPending: '#ffe699',
            showNotification: false,
            showSpinner: false,
            pendingClass: 'ktlProgress',
        };
        this.qtScanItv = null;
        this.quickToggleObj = {};
        this.numToProcess = 0;
        this.refreshTimer = null;
        this.viewsToRefresh = [];
    }

    /**
     * Wording for logs, error handling and the failure alert.
     * @returns {{failure: string, handler: string, alertAction: string, refresh: string}}
     */
    get toggleMessages() {
        return { failure: 'Quick Toggle operation failed', handler: 'Quick Toggle Error', alertAction: 'Quick Toggle operation', refresh: 'Quick Toggle Refresh' };
    }

    /**
     * Builds the record data to PUT for a queued toggle.
     * @param {{fieldId: string, value: *}} recObj - Queued job.
     * @returns {Object}
     */
    buildToggleApiData(recObj) {
        return { [recObj.fieldId]: recObj.value };
    }

    /**
     * Checks whether a plain object has any enumerable keys.
     * @param {Object|null|undefined} value - Object to inspect.
     * @returns {boolean} True when the object is empty or invalid.
     */
    isToggleQueueEmpty(value) {
        return !value || typeof value !== 'object' || Object.keys(value).length === 0;
    }

    /**
     * Starts the queued PUT processing loop.
     * @returns {void}
     */
    startQtScanning() {
        if (this.quickToggleParams.showNotification) {
            ktl.core.infoPopup();
            this.showProgress();
        }

        if (this.qtScanItv) return;

        ktl.views.autoRefresh(false);
        this.qtScanItv = setInterval(() => {
            if (this.isToggleQueueEmpty(this.quickToggleObj)) return;

            const dt = Object.keys(this.quickToggleObj)[0];
            const { processed } = this.quickToggleObj[dt];
            if (!processed) {
                this.quickToggleObj[dt].processed = true;
                this.doQuickToggle(dt);
            }
        }, 500);
    }

    /**
     * Sends the queued Knack update for one record.
     * @param {string} dt - Queue key.
     * @returns {void}
     */
    doQuickToggle(dt) {
        const recObj = this.quickToggleObj[dt];
        if (this.isToggleQueueEmpty(recObj) || !recObj.viewId || !recObj.fieldId) return;

        const msg = this.toggleMessages;
        const normalisedViewId = knackNavigator.normalizeViewId(recObj.viewId);
        const sceneId = knackNavigator.getSceneInfoForView(normalisedViewId)?.key || '';
        if (!sceneId || !normalisedViewId) {
            ktl.views.autoRefresh();
            console.error(`${msg.failure}: could not resolve scene or view id.`, recObj);
            this.dropFailedToggle(dt);
            return;
        }

        const apiData = this.buildToggleApiData(recObj);
        const apiClient = getKnackApiClient();

        apiClient.updateRecord(sceneId, normalisedViewId, recObj.recId, apiData)
            .then(() => {
                if (this.quickToggleParams.showNotification) {
                    this.showProgress();
                }

                this.numToProcess--;
                delete this.quickToggleObj[dt];

                if (this.isToggleQueueEmpty(this.quickToggleObj)) {
                    clearInterval(this.qtScanItv);
                    this.qtScanItv = null;

                    if (this.quickToggleParams.showSpinner) {
                        Knack.showSpinner();
                    }

                    this.refreshTimer = setTimeout(() => {
                        ktl.core.removeInfoPopup();
                        ktl.views.refreshViewArray(this.viewsToRefresh)
                            .then(() => {
                                Knack.hideSpinner();
                                ktl.views.autoRefresh();
                            })
                            .catch((error) => {
                                errorHandler.handleError(error, { function: 'refreshViewArray' }, msg.refresh);
                                Knack.hideSpinner();
                                ktl.views.autoRefresh();
                            });
                    }, 500);
                }
            })
            .catch((reason) => {
                this.dropFailedToggle(dt);
                ktl.views.autoRefresh();
                const errorMsg = reason ? JSON.stringify(reason) : 'Unknown error';
                console.error(`${msg.failure}:`, reason);
                errorHandler.handleError(reason, { function: 'doQuickToggle' }, msg.handler);
                alert(`Error code KEC_1025 while processing ${msg.alertAction}, reason: ${errorMsg}`);
            });
    }

    /**
     * Removes a job whose update failed, so the queue keeps moving instead of retrying it forever.
     * @param {string} dt - Queue key.
     * @returns {void}
     */
    dropFailedToggle(dt) {
        delete this.quickToggleObj[dt];
        this.numToProcess = Math.max(0, this.numToProcess - 1);
        if (this.isToggleQueueEmpty(this.quickToggleObj)) {
            clearInterval(this.qtScanItv);
            this.qtScanItv = null;
        }
    }

    /**
     * Updates the shared progress popup text.
     * @returns {void}
     */
    showProgress() {
        ktl.core.setInfoPopupText('Toggling... ' + this.numToProcess + ' items remaining.');
    }
}

class CAQuickToggle extends QuickToggleQueue {
    buildToggleApiData(recObj) {
        return { [recObj.fieldId]: recObj.value, ...recObj.additionalData };
    }

    constructor(viewId, data) {
        super();
        // Core properties
        this.viewId = viewId;
        this.data = data;
        this.kw = '_caqt';
        this.kwInstance = null;
        this.viewModel = null;
        this.viewType = '';
        this.inlineEditing = false;
        this.fieldMap = new Map();

        this.viewHasQt = false;
        this.fieldsColor = {};
    }

    init() {
        // Exit early if conditions aren't met
        if (!this.isValidInitialState()) return;

        // Setup keyword instances
        if (!this.setupKeywordInstances()) return;

        // Setup view model and check type
        if (!this.setupViewModel()) return;

        // Setup colors based on keywords
        this.setupColors();

        // Process fields to identify boolean fields
        this.processFields();

        // Update table colors
        this.updateTableColors();

        // Setup cell click handlers
        this.setupCellClickHandlers();
    }

    isValidInitialState() {
        // Exit early if no view ID, no data, or in iFrame window
        return this.viewId && this.data.length > 0 && !ktl.scenes.isiFrameWnd();
    }

    setupKeywordInstances() {
        // Check for the custom keyword specifically
        this.kwInstance = ktlKeywords[this.viewId] && ktlKeywords[this.viewId][this.kw];
        if (this.kwInstance && this.kwInstance.length) {
            this.kwInstance = this.kwInstance[0];
            const { options } = this.kwInstance;
            if (!ktl.core.hasRoleAccess(options)) return false;
        }

        const hasCAQtKeyword = ktl.core.checkIfViewHasKeyword(this.viewId, this.kw);

        // IMPORTANT: Check if the view has both _caqt and _qt keywords - if so, don't process
        const hasOriginalQtKeyword = ktl.core.checkIfViewHasKeyword(this.viewId, '_qt');
        if (hasOriginalQtKeyword) {
            console.log(`View ${this.viewId} has both _caqt and _qt keywords. Using original quickToggle only.`);
            return false;
        }

        // Ensure the view has our custom keyword
        if (!hasCAQtKeyword) return false;

        return true;
    }

    setupViewModel() {
        this.viewModel = knackNavigator.getSceneViewModel(this.viewId);
        if (!this.viewModel) return false;

        const viewAttr = this.viewModel.attributes;
        this.viewType = viewAttr.type;

        // Only work with table and search views
        if (!['table', 'search'].includes(this.viewType)) return false;

        this.inlineEditing = this.viewType === 'table' ?
            (viewAttr.options && viewAttr.options.cell_editor) :
            viewAttr.cell_editor;

        return true;
    }

    setupColors() {
        // Start with hard coded default colors
        let bgColorTrue = this.quickToggleParams.bgColorTrue;
        let bgColorFalse = this.quickToggleParams.bgColorFalse;

        // Override with view-specific colors, if any
        if (this.kwInstance) {
            this.viewHasQt = true; // If view has QT, then all fields inherit also

            if (this.kwInstance.params && this.kwInstance.params.length) {
                const fldColors = this.kwInstance.params[0];
                if (fldColors.length >= 1 && fldColors[0])
                    bgColorTrue = fldColors[0];

                if (fldColors.length >= 2 && fldColors[1])
                    bgColorFalse = fldColors[1];
            }
        }

        // Save colors to instance variables
        this.bgColorTrue = bgColorTrue;
        this.bgColorFalse = bgColorFalse;
    }

    processFields() {
        const viewAttr = this.viewModel.attributes;
        let fieldKeywords = {};
        const cols = this.viewType === 'table' ? viewAttr.columns : viewAttr.results.columns;

        cols.forEach(col => {
            if (col.type === 'field' && col.field && col.field.key) {
                if (!col.connection) { // Field must be local to view's object, not a connected field.
                    if (knackNavigator.getFieldType(col.field.key) === 'boolean') {
                        let fieldHasQt = false;
                        const { key: fieldId } = col.field;

                        // Override with field-specific colors, if any.
                        let tmpFieldColors = {
                            bgColorTrue: this.bgColorTrue,
                            bgColorFalse: this.bgColorFalse
                        }

                        ktl.fields.getFieldKeywords(fieldId, fieldKeywords);
                        const fieldKeyword = fieldKeywords[fieldId] && fieldKeywords[fieldId][this.kw];
                        if (this.viewHasQt || fieldKeyword) {
                            fieldHasQt = true;
                            if (fieldKeyword && fieldKeyword.length && fieldKeyword[0].params && fieldKeyword[0].params.length > 0) {
                                const fldColors = fieldKeyword[0].params[0];
                                if (fldColors.length >= 1 && fldColors[0] !== '')
                                    tmpFieldColors.bgColorTrue = fldColors[0];
                                if (fldColors.length >= 2 && fldColors[1] !== '')
                                    tmpFieldColors.bgColorFalse = fldColors[1];
                            }
                        }

                        if (fieldHasQt) {
                            this.fieldsColor[fieldId] = tmpFieldColors;
                            if (this.inlineEditing && !col.ignore_edit)
                                document.querySelectorAll(`#${this.viewId} td.${fieldId}.cell-edit`).forEach((cell) => cell.classList.add('caQtCellClickable'));
                        }
                    }
                }
                this.fieldMap.set(col.field.key, col.header);
            }
        });
    }

    updateTableColors() {
        if (Object.keys(this.fieldsColor).length) {
            this.data.forEach(row => {
                Object.keys(this.fieldsColor).forEach(fieldId => {
                    // Merge new style with existing one.
                    const style = `background-color:${row[fieldId + '_raw'] === true ?
                        this.fieldsColor[fieldId].bgColorTrue :
                        this.fieldsColor[fieldId].bgColorFalse}`;
                    document.querySelectorAll(`#${this.viewId} tbody tr[id="${row.id}"] .${fieldId}`).forEach((cell) => {
                        const currentStyle = cell.getAttribute('style');
                        cell.setAttribute('style', `${currentStyle ? currentStyle + '; ' : ''}${style}`);
                    });
                });
            });
        }
    }

    setupCellClickHandlers() {
        // Process cell clicks
        // Capture phase so this runs before other click handlers on the cell (jQuery's bindFirst did the same job).
        document.querySelectorAll(`#${this.viewId} .caQtCellClickable`).forEach((cell) => cell.addEventListener('click', (e) => this.handleCellClick(e), { capture: true }));
    }

    handleCellClick(e) {
        if (document.querySelector('.bulkEditCb:checked')) return;

        e.stopImmediatePropagation();

        const fieldId = e.target.dataset.fieldKey || e.target.parentElement?.dataset.fieldKey;
        const viewElement = e.target.closest('.kn-search.kn-view[id], .kn-table.kn-view[id]');

        if (viewElement) {
            const viewId = viewElement.id;
            const dt = Date.now();
            const recId = e.target.closest('tr')?.id;
            let value = ktl.views.getDataFromRecId(viewId, recId)[`${fieldId}_raw`];
            value = (value === true ? false : true);

            if (!this.viewsToRefresh.includes(viewId))
                this.viewsToRefresh.push(viewId);

            this.quickToggleObj[dt] = { viewId, fieldId, value, recId, processed: false };

            const cell = e.target.closest('td');
            cell.style.backgroundColor = this.quickToggleParams.bgColorPending;

            if (this.quickToggleParams.pendingClass) {
                cell.classList.add(this.quickToggleParams.pendingClass);
            }

            clearTimeout(this.refreshTimer);

            // Look for corresponding field for additional updates
            const additionalData = this.findCorrespondingField(fieldId, value);
            if (additionalData) {
                this.quickToggleObj[dt].additionalData = additionalData;
            }

            this.numToProcess++;
            this.startQtScanning();
        }
    }

    findCorrespondingField(fieldId, value) {
        const fieldTitle = this.fieldMap.get(fieldId);
        let correspondingFieldId = '';
        let isName = false;

        for (const [key, header] of this.fieldMap.entries()) {
            if (key !== fieldId &&
                (header === fieldTitle ||
                 header === `${fieldTitle} - Name` ||
                 header.startsWith(`${fieldTitle} `))) {

                isName = header === `${fieldTitle} - Name`;
                correspondingFieldId = key;
                break;
            }
        }

        if (correspondingFieldId) {
            const userAttributes = knackNavigator.getUserAttributes();
            const userAttribute = isName ? userAttributes.name : userAttributes.id;
            return { [correspondingFieldId]: value === false ? null : userAttribute };
        }

        return null;
    }

}

/**
 * Quick-toggle controller for two-option multiple-choice fields.
 */
class CAMultiChoiceQuickToggle extends QuickToggleQueue {
    get toggleMessages() {
        return { failure: 'Multi-choice quick toggle operation failed', handler: 'Multi-choice Quick Toggle Error', alertAction: 'multi-choice quick toggle', refresh: 'Multi-choice Quick Toggle Refresh' };
    }

    /**
     * Creates a controller for one rendered view.
     * @param {string} viewId - Knack view id.
     * @param {Array<Object>} data - Rendered Knack row data.
     */
    constructor(viewId, data) {
        super();
        this.viewId = viewId;
        this.data = data;
        this.kw = '_mqt';
        this.kwInstance = null;
        this.viewModel = null;
        this.viewType = '';
        this.inlineEditing = false;
        this.viewTargets = [];
        this.fieldToggleConfig = {};
    }

    /**
     * Initialises the controller when the view and keyword configuration are valid.
     * @returns {void}
     */
    init() {
        if (!this.isValidInitialState()) return;
        if (!this.setupKeywordInstances()) return;
        if (!this.setupViewModel()) return;

        this.processFields();
        if (this.isToggleQueueEmpty(this.fieldToggleConfig)) return;

        this.updateTableColors();
        this.setupCellClickHandlers();
    }

    /**
     * Confirms the view is in a usable render state.
     * @returns {boolean} True when processing can continue.
     */
    isValidInitialState() {
        return this.viewId && this.data.length > 0 && !ktl.scenes.isiFrameWnd();
    }

    /**
     * Reads the view-level keyword instance and target references.
     * @returns {boolean} True when processing can continue.
     */
    setupKeywordInstances() {
        const keywordInstances = ktlKeywords[this.viewId] && ktlKeywords[this.viewId][this.kw];
        if (Array.isArray(keywordInstances) && keywordInstances.length) {
            this.kwInstance = keywordInstances[0];
            const { options } = this.kwInstance;
            if (!ktl.core.hasRoleAccess(options)) return false;
            this.viewTargets = this.extractViewTargets(this.kwInstance);
        }

        return true;
    }

    /**
     * Resolves the Knack view model and inline-edit capability.
     * @returns {boolean} True when the view is a supported type.
     */
    setupViewModel() {
        this.viewModel = knackNavigator.getSceneViewModel(this.viewId);
        if (!this.viewModel) return false;

        const viewAttr = this.viewModel.attributes;
        this.viewType = viewAttr.type;
        if (!['table', 'search'].includes(this.viewType)) return false;

        this.inlineEditing = this.viewType === 'table'
            ? Boolean(viewAttr.options && viewAttr.options.cell_editor)
            : Boolean(viewAttr.cell_editor);

        return true;
    }

    /**
     * Scans view columns and records the eligible quick-toggle fields.
     * @returns {void}
     */
    processFields() {
        const viewAttr = this.viewModel.attributes;
        const cols = this.viewType === 'table' ? viewAttr.columns : viewAttr.results.columns;
        const fieldKeywords = {};

        cols.forEach((col) => {
            if (col.type !== 'field' || !col.field?.key) return;
            if (col.connection) return;

            const fieldId = knackNavigator.normalizeFieldId(col.field.key);
            if (!fieldId) return;

            const fieldType = knackNavigator.getFieldType(fieldId);
            if (fieldType !== 'multiple_choice') return;

            const toggleChoices = this.resolveToggleChoices(fieldId);
            if (!toggleChoices) return;

            ktl.fields.getFieldKeywords(fieldId, fieldKeywords);
            const fieldKeywordInstances = fieldKeywords[fieldId] && fieldKeywords[fieldId][this.kw];
            const isFieldKeywordEnabled = Array.isArray(fieldKeywordInstances) && fieldKeywordInstances.length > 0;
            const isViewTargetEnabled = this.matchesViewTarget(fieldId, col.header);

            if (!isFieldKeywordEnabled && !isViewTargetEnabled) return;

            const fieldColors = this.resolveFieldColours(fieldKeywordInstances);
            this.fieldToggleConfig[fieldId] = {
                activeValue: toggleChoices.activeValue,
                inactiveValue: toggleChoices.inactiveValue,
                bgColorTrue: fieldColors.bgColorTrue,
                bgColorFalse: fieldColors.bgColorFalse,
            };

            if (this.inlineEditing && !col.ignore_edit) {
                this.getViewRoot()
                    ?.querySelectorAll(`td.${fieldId}.cell-edit`)
                    .forEach((cell) => {
                        if (!(cell instanceof HTMLElement) || cell.classList.contains('ktlNoInlineEdit')) return;
                        cell.classList.add('mqtCellClickable');
                    });
            }
        });
    }

    /**
     * Extracts target field ids or headers from the first keyword parameter group.
     * @param {Object|null} keywordInstance - Parsed KTL keyword instance.
     * @returns {Array<string>} Normalised target references.
     */
    extractViewTargets(keywordInstance) {
        const targetGroup = Array.isArray(keywordInstance?.params?.[0]) ? keywordInstance.params[0] : [];
        return targetGroup
            .map((value) => String(value || '').trim())
            .filter(Boolean);
    }

    /**
     * Resolves field-specific colours from the field keyword, falling back to shared defaults.
     * @param {Array<Object>|undefined} fieldKeywordInstances - Parsed field keyword instances.
     * @returns {{ bgColorTrue: string, bgColorFalse: string }} Resolved colours.
     */
    resolveFieldColours(fieldKeywordInstances) {
        const fieldColors = {
            bgColorTrue: this.quickToggleParams.bgColorTrue,
            bgColorFalse: this.quickToggleParams.bgColorFalse,
        };

        const colorGroup = Array.isArray(fieldKeywordInstances?.[0]?.params?.[0])
            ? fieldKeywordInstances[0].params[0]
            : [];

        if (colorGroup[0]) fieldColors.bgColorTrue = colorGroup[0];
        if (colorGroup[1]) fieldColors.bgColorFalse = colorGroup[1];

        return fieldColors;
    }

    /**
     * Matches a view target reference against a rendered field.
     * @param {string} fieldId - Normalised field id.
     * @param {string} headerText - Raw column header text.
     * @returns {boolean} True when the field was explicitly targeted by the view keyword.
     */
    matchesViewTarget(fieldId, headerText) {
        if (!this.viewTargets.length) return false;

        const normalisedFieldId = knackNavigator.normalizeFieldId(fieldId);
        const normalisedHeader = knackNavigator.normalizeViewColumnHeader(headerText);

        return this.viewTargets.some((target) => {
            const targetFieldId = knackNavigator.normalizeFieldId(target);
            if (targetFieldId && targetFieldId === normalisedFieldId) return true;
            return knackNavigator.normalizeViewColumnHeader(target) === normalisedHeader;
        });
    }

    /**
     * Resolves the two available choice labels from field metadata.
     * @param {string} fieldId - Normalised field id.
     * @returns {{ activeValue: string, inactiveValue: string }|null} Choice labels, or null when unsupported.
     */
    resolveToggleChoices(fieldId) {
        const options = knackNavigator.getFieldChoiceOptions(fieldId);
        if (options.length !== 2) return null;
        return {
            activeValue: options[0],
            inactiveValue: options[1],
        };
    }

    /**
     * Applies state colours to every eligible rendered cell.
     * @returns {void}
     */
    updateTableColors() {
        this.data.forEach((row) => {
            Object.entries(this.fieldToggleConfig).forEach(([fieldId, config]) => {
                const nextState = this.resolveSemanticChoice(row, fieldId, config);
                if (nextState === null) return;

                const cell = this.getViewRoot()?.querySelector(`tbody tr[id="${row.id}"] .${fieldId}`);
                if (!(cell instanceof HTMLElement)) return;

                const backgroundColor = nextState ? config.bgColorTrue : config.bgColorFalse;
                cell.style.backgroundColor = backgroundColor;
            });
        });
    }

    /**
     * Marks eligible cells as clickable and binds the quick-toggle handler.
     * @returns {void}
     */
    setupCellClickHandlers() {
        this.getViewRoot()
            ?.querySelectorAll('.mqtCellClickable')
            .forEach((cell) => {
                if (!(cell instanceof HTMLElement)) return;
                if (cell.classList.contains('ktlNoInlineEdit')) {
                    cell.classList.remove('mqtCellClickable');
                    return;
                }
                if (cell.dataset.mqtBound === 'true') return;
                cell.dataset.mqtBound = 'true';
                cell.addEventListener('click', (e) => this.handleCellClick(e), true);
            });
    }

    /**
     * Handles a click on a supported cell and queues the update.
     * @param {Event} e - Click event.
     * @returns {void}
     */
    handleCellClick(e) {
        if (document.querySelector('.bulkEditCb:checked')) return;

        const eventTarget = e.target instanceof Element ? e.target : null;
        const clickedCell = eventTarget?.closest('td');
        if (clickedCell instanceof HTMLElement && clickedCell.classList.contains('ktlNoInlineEdit')) return;

        e.stopImmediatePropagation();

        const fieldId = knackNavigator.normalizeFieldId(
            clickedCell?.getAttribute('data-field-key')
            || eventTarget?.getAttribute('data-field-key')
            || eventTarget?.parentElement?.getAttribute('data-field-key')
        );
        const fieldConfig = this.fieldToggleConfig[fieldId];
        if (!fieldConfig) return;

        const viewElement = eventTarget?.closest('.kn-search.kn-view[id], .kn-table.kn-view[id]');
        if (!(viewElement instanceof HTMLElement)) return;

        const viewId = viewElement.id;
        const recId = eventTarget?.closest('tr')?.id || '';
        const record = ktl.views.getDataFromRecId(viewId, recId);
        const value = this.getNextChoiceValue(record, fieldId, fieldConfig);
        if (value === undefined) return;

        if (!this.viewsToRefresh.includes(viewId)) {
            this.viewsToRefresh.push(viewId);
        }

        const dt = Date.now();
        this.quickToggleObj[dt] = { viewId, fieldId, value, recId, processed: false };

        if (clickedCell instanceof HTMLElement) {
            clickedCell.style.backgroundColor = this.quickToggleParams.bgColorPending;
            if (this.quickToggleParams.pendingClass) {
                clickedCell.classList.add(this.quickToggleParams.pendingClass);
            }
        }

        clearTimeout(this.refreshTimer);
        this.numToProcess++;
        this.startQtScanning();
    }

    /**
     * Resolves the current two-option state from the rendered record.
     * @param {Object} record - Knack row record.
     * @param {string} fieldId - Normalised field id.
     * @param {{ activeValue: string, inactiveValue: string }} fieldConfig - Field toggle configuration.
     * @returns {boolean|null} True for the first option, false for the second, null when unresolved.
     */
    resolveSemanticChoice(record, fieldId, fieldConfig) {
        const typedValue = knackValueResolver.resolve(record, fieldId, { mode: 'typed', fallback: undefined });
        const values = Array.isArray(typedValue) ? typedValue : [typedValue];
        const normalisedValues = values
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean);

        if (normalisedValues.includes(String(fieldConfig.activeValue).trim().toLowerCase())) return true;
        if (normalisedValues.includes(String(fieldConfig.inactiveValue).trim().toLowerCase())) return false;
        return null;
    }

    /**
     * Builds the next request value while preserving single-value versus array field shapes.
     * @param {Object} record - Knack row record.
     * @param {string} fieldId - Normalised field id.
     * @param {{ activeValue: string, inactiveValue: string }} fieldConfig - Field toggle configuration.
     * @returns {string|Array<string>|undefined} Knack request value for the next state.
     */
    getNextChoiceValue(record, fieldId, fieldConfig) {
        const rawValue = record?.[`${fieldId}_raw`];
        const currentState = this.resolveSemanticChoice(record, fieldId, fieldConfig);
        const nextValue = currentState === true ? fieldConfig.inactiveValue : fieldConfig.activeValue;

        if (Array.isArray(rawValue)) {
            return [nextValue];
        }

        return nextValue;
    }

    /**
     * Returns the rendered root element for the current view.
     * @returns {HTMLElement|null} View root element.
     */
    getViewRoot() {
        const viewRoot = document.getElementById(this.viewId);
        return viewRoot instanceof HTMLElement ? viewRoot : null;
    }

}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: version-refresh
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Version refresh controller ported as-is (analysis C05).

/**
 * Creates a reusable version-refresh controller for Knack apps.
 * Callers provide app-specific storage keys, version normalisation, sync callbacks,
 * and safe-refresh UI hooks while the shared controller handles storage, postMessage,
 * duplicate suppression, and deferred refresh orchestration.
 * @param {Object} [options={}] - Controller options.
 * @returns {{readState: Function, writeState: Function, storeUserVersion: Function, resetState: Function, evaluateIframeVersionState: Function, syncIframeVersion: Function, postRefreshMessage: Function, runRefreshIfSafe: Function, handleRefreshMessage: Function}} Version refresh controller.
 */
function createVersionRefreshController(options = {}) {
    const {
        storageKey = '',
        storageAdapter = createBulkActionStorageAdapter(
            typeof localStorage !== 'undefined' ? localStorage : null,
            { preferKtl: true }
        ),
        messageSource = '',
        messageType = '',
        isIframeWindow = function () {
            return ktl.scenes.isiFrameWnd();
        },
        getCurrentUserId = function () {
            return knackValueResolver.toStringSafe(knackNavigator.getUserAttributes().id);
        },
        normaliseVersion = function (value) {
            return knackValueResolver.toStringSafe(value)
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },
        userVersionIndicatorId = '',
        userVersionIndicatorClassName = '',
        renderUserVersion = function (userVersion) {
            if (isIframeWindow() || !userVersionIndicatorId) {
                return;
            }

            renderVersionIndicator(userVersion, {
                indicatorId: userVersionIndicatorId,
                className: userVersionIndicatorClassName,
            });
        },
        canRefreshNow = null,
        refreshWaitMessage = 'There is a new version available. You will be updated when it is safe to do so.',
        refreshNowMessage = 'There is a new version available. Updating now...',
        refreshNotificationTarget = document.body,
        refreshNotificationClassName = ['notification-fixed-center', 'notification-fixed-center--warning'],
        refreshNotificationDelay = 5000,
        refreshNotificationFadeTime = 300,
        targetVersionItem = '',
        targetVersionItemFieldId = '',
        targetVersionValueFieldId = '',
        syncUserVersionViewId = '',
        syncUserVersionFieldId = '',
        showRefreshWait = function (targetVersion) {
            showNotification({
                message: refreshWaitMessage,
                delay: refreshNotificationDelay,
                target: refreshNotificationTarget,
                fadeTime: refreshNotificationFadeTime,
                className: refreshNotificationClassName,
            });
        },
        showRefreshNow = function (targetVersion) {
            showNotification({
                message: refreshNowMessage,
                delay: refreshNotificationDelay,
                target: refreshNotificationTarget,
                fadeTime: refreshNotificationFadeTime,
                className: refreshNotificationClassName,
            });
        },
        syncUserVersion = async function (targetVersion, context = {}) {
            const userId = knackValueResolver.toStringSafe(context.userId);
            const normalizedViewId = knackNavigator.normalizeViewId(syncUserVersionViewId);
            const normalizedFieldId = knackNavigator.normalizeFieldId(syncUserVersionFieldId);
            const sceneKey = knackNavigator.getSceneInfoForView(normalizedViewId)?.key || '';

            if (!userId || !targetVersion || !normalizedViewId || !normalizedFieldId || !sceneKey) {
                return '';
            }

            await getKnackApiClient().updateRecord(sceneKey, normalizedViewId, userId, {
                [normalizedFieldId]: targetVersion,
            });

            return targetVersion;
        },
        onUserVersionSynced = function (syncedVersion, context) {},
        onSyncError = function (error, context) {
            console.error('[VersionRefreshController] Failed to sync the user version.', error, context);
        },
        reload = function () {
            window.location.reload();
        },
        refreshHoldEventName = 'kf-version-refresh-hold',
        refreshReleaseEventName = 'kf-version-refresh-release',
        reloadDelayMs = 1200,
        recentReloadWindowMs = 15000,
    } = options;

    const internalState = {
        deferredNoticeTargetVersion: '',
        iframeCurrentUserRecord: null,
        iframeTargetRecords: [],
        pendingRequestActive: false,
        reloadTimerId: 0,
        pendingObserver: null,
        pendingCheckTimerId: 0,
        refreshHoldIds: new Set(),
        syncInFlight: false,
    };

    const normalizedSyncUserVersionFieldId = knackNavigator.normalizeFieldId(syncUserVersionFieldId);
    const normalizedTargetVersionItemFieldId = knackNavigator.normalizeFieldId(targetVersionItemFieldId);
    const normalizedTargetVersionValueFieldId = knackNavigator.normalizeFieldId(targetVersionValueFieldId);

    /**
     * Normalises a version string using the configured app callback.
     * @param {string} value - Raw version value.
     * @returns {string} Normalised version value.
     */
    function normalizeVersion(value) {
        return knackValueResolver.toStringSafe(normaliseVersion(value));
    }

    /**
     * Builds a normalised iframe version snapshot.
     * @param {{ userVersion?: string, targetVersion?: string }} [snapshot={}] - Raw iframe version values.
     * @returns {{ userVersion: string, targetVersion: string }} Normalised iframe version values.
     */
    function createIframeVersionSnapshot(snapshot = {}) {
        return {
            userVersion: normalizeVersion(snapshot.userVersion),
            targetVersion: normalizeVersion(snapshot.targetVersion),
        };
    }

    /**
     * Merges a partial stored-state update with the current persisted state.
     * @param {{ targetVersion?: string, lastReloadedTarget?: string, lastReloadedAt?: string, userVersion?: string }} [state={}] - Partial stored state.
     * @param {{ targetVersion: string, lastReloadedTarget: string, lastReloadedAt: string, userVersion: string }} [baseState=readState()] - Base stored state.
     * @returns {{ targetVersion: string, lastReloadedTarget: string, lastReloadedAt: string, userVersion: string }} Merged stored state.
     */
    function mergeStoredState(state = {}, baseState = readState()) {
        return {
            targetVersion: state?.targetVersion ?? baseState.targetVersion,
            lastReloadedTarget: state?.lastReloadedTarget ?? baseState.lastReloadedTarget,
            lastReloadedAt: state?.lastReloadedAt ?? baseState.lastReloadedAt,
            userVersion: state?.userVersion ?? baseState.userVersion,
        };
    }

    /**
     * Caches the current-user record used for iframe version control.
     * @param {Object|Object[]|null} recordOrRecords - Current-user record payload.
     * @returns {Object|null} Cached current-user record.
     */
    function cacheCurrentUserRecord(recordOrRecords) {
        const record = Array.isArray(recordOrRecords) ? recordOrRecords[0] : recordOrRecords;
        internalState.iframeCurrentUserRecord = record && typeof record === 'object' ? record : null;
        return internalState.iframeCurrentUserRecord;
    }

    /**
     * Caches the target-version records used for iframe version control.
     * @param {Object[]|null} records - Target-version records.
     * @returns {Object[]} Cached target-version records.
     */
    function cacheTargetVersionRecords(records) {
        internalState.iframeTargetRecords = Array.isArray(records) ? records : [];
        return internalState.iframeTargetRecords;
    }

    /**
     * Reads the current user version from the cached iframe record.
     * @param {Object|null} [record=internalState.iframeCurrentUserRecord] - Cached current-user record.
     * @returns {string} Normalised cached user version.
     */
    function getCachedUserVersion(record = internalState.iframeCurrentUserRecord) {
        return normalizeVersion(record?.[normalizedSyncUserVersionFieldId]);
    }

    /**
     * Resolves the configured target version from cached or supplied records.
     * @param {Object[]|null} [records=internalState.iframeTargetRecords] - Cached target-version records.
     * @returns {string} Normalised configured target version.
     */
    function getTargetVersion(records = internalState.iframeTargetRecords) {
        const targetItemValue = knackValueResolver.toStringSafe(targetVersionItem);
        if (!targetItemValue || !Array.isArray(records) || !normalizedTargetVersionItemFieldId || !normalizedTargetVersionValueFieldId) {
            return '';
        }

        const matchingRecord = records.find(function (record) {
            return knackValueResolver.toStringSafe(record?.[normalizedTargetVersionItemFieldId]) === targetItemValue;
        });

        return normalizeVersion(matchingRecord?.[normalizedTargetVersionValueFieldId]);
    }

    /**
     * Builds an iframe version snapshot from cached controller state.
     * @returns {{ userVersion: string, targetVersion: string }} Normalised cached iframe versions.
     */
    function createCachedIframeVersionSnapshot() {
        return createIframeVersionSnapshot({
            userVersion: getCachedUserVersion(),
            targetVersion: getTargetVersion(),
        });
    }

    /**
     * Determines whether the current route points at the app home page.
     * @returns {boolean} True when the current hash has no nested route segments.
     */
    function isHomeRoute() {
        const currentHash = knackValueResolver.toStringSafe(window.location.hash).replace(/^#/, '');
        const pathOnly = currentHash.split('?')[0];
        const segments = pathOnly.split('/').map(function (segment) {
            return String(segment || '').trim();
        }).filter(Boolean);
        return segments.length <= 1;
    }

    /**
     * Determines whether a visible non-modal form is present on the page.
     * @returns {boolean} True when a blocking form is visible.
     */
    function hasBlockingForm() {
        return Array.from(document.querySelectorAll('.kn-form.kn-view form, .kn-view.kn-form form')).some(function (formEl) {
            return isElementVisible(formEl) && !formEl.closest('.kn-modal');
        });
    }

    /**
     * Determines whether the current page can safely refresh.
     * @returns {boolean} True when no blocking modal or form is visible.
     */
    function canRefreshPageNow() {
        if (typeof canRefreshNow === 'function') {
            return canRefreshNow();
        }

        if (Array.from(document.querySelectorAll('.kn-modal')).some(function (modalEl) {
            return isElementVisible(modalEl);
        })) {
            return false;
        }

        if (isHomeRoute()) {
            return true;
        }

        return !hasBlockingForm();
    }

    /**
     * Reads the persisted version-refresh state.
     * @returns {{ targetVersion: string, lastReloadedTarget: string, lastReloadedAt: string, userVersion: string }} Stored state.
     */
    function readState() {
        let stored = null;

        try {
            stored = JSON.parse(storageAdapter?.get?.(storageKey) || 'null');
        } catch (error) {
            console.warn('[VersionRefreshController] Ignoring invalid stored version state.', error);
        }

        return {
            targetVersion: normalizeVersion(stored?.targetVersion),
            lastReloadedTarget: normalizeVersion(stored?.lastReloadedTarget),
            lastReloadedAt: knackValueResolver.toStringSafe(stored?.lastReloadedAt),
            userVersion: normalizeVersion(stored?.userVersion),
        };
    }

    /**
     * Persists the supplied version-refresh state when it has changed.
     * @param {{ targetVersion?: string, lastReloadedTarget?: string, lastReloadedAt?: string, userVersion?: string }} state - State to persist.
     * @returns {void}
     */
    function writeState(state) {
        if (!storageKey || !storageAdapter || typeof storageAdapter.set !== 'function') {
            return;
        }

        const nextState = {
            targetVersion: normalizeVersion(state?.targetVersion),
            lastReloadedTarget: normalizeVersion(state?.lastReloadedTarget),
            lastReloadedAt: knackValueResolver.toStringSafe(state?.lastReloadedAt),
            userVersion: normalizeVersion(state?.userVersion),
        };
        const currentState = readState();
        if (currentState.targetVersion === nextState.targetVersion
            && currentState.lastReloadedTarget === nextState.lastReloadedTarget
            && currentState.lastReloadedAt === nextState.lastReloadedAt
            && currentState.userVersion === nextState.userVersion) {
            return;
        }

        storageAdapter.set(storageKey, JSON.stringify(nextState));
    }

    /**
     * Persists and renders the current user version.
     * @param {string} userVersion - Current user version.
     * @returns {void}
     */
    function storeUserVersion(userVersion) {
        const versionText = normalizeVersion(userVersion);
        const storedState = readState();

        if (storedState.userVersion !== versionText) {
            writeState(mergeStoredState({ userVersion: versionText }, storedState));
        }

        if (typeof renderUserVersion === 'function') {
            renderUserVersion(versionText);
        }
    }

    /**
     * Stops any active deferred-refresh observer.
     * @returns {void}
     */
    function stopPendingRefreshWatch() {
        if (!(internalState.pendingObserver instanceof MutationObserver)) {
            internalState.pendingObserver = null;
            return;
        }

        internalState.pendingObserver.disconnect();
        internalState.pendingObserver = null;
        window.clearTimeout(internalState.pendingCheckTimerId);
    }

    /**
     * Returns whether a pending refresh is currently blocked by an app-level hold.
     * @returns {boolean} True when one or more refresh holds are active.
     */
    function hasActiveRefreshHold() {
        return internalState.refreshHoldIds.size > 0;
    }

    /**
     * Creates or renews a refresh hold and cancels any scheduled reload.
     * @param {string} [holdId=''] - Identifier for the hold so it can be released later.
     * @returns {string} Normalised hold identifier.
     * @example
     * const holdId = controller.holdRefresh('post-submit-api');
     *
     * try {
     *     await saveRecord();
     * } finally {
     *     controller.releaseRefresh(holdId);
     * }
     */
    function holdRefresh(holdId = '') {
        const normalizedHoldId = knackValueResolver.toStringSafe(holdId) || `hold_${Date.now()}_${internalState.refreshHoldIds.size + 1}`;
        internalState.refreshHoldIds.add(normalizedHoldId);

        if (internalState.reloadTimerId) {
            window.clearTimeout(internalState.reloadTimerId);
            internalState.reloadTimerId = 0;
        }

        if (internalState.pendingRequestActive) {
            ensurePendingRefreshWatch();
            showDeferredRefreshNotice(readState().targetVersion);
        }

        return normalizedHoldId;
    }

    /**
     * Releases a refresh hold and resumes pending refresh checks when safe.
     * @param {string} holdId - Hold identifier returned by holdRefresh.
     * @returns {boolean} True when the hold existed and was removed.
     */
    function releaseRefresh(holdId) {
        const normalizedHoldId = knackValueResolver.toStringSafe(holdId);
        if (!normalizedHoldId) {
            return false;
        }

        const removed = internalState.refreshHoldIds.delete(normalizedHoldId);
        if (removed && internalState.pendingRequestActive && !internalState.reloadTimerId) {
            ensurePendingRefreshWatch();
            if (canRefreshPageNow()) {
                runRefreshIfSafe();
            }
        }

        return removed;
    }

    /**
     * Releases every active refresh hold.
     * @returns {number} Number of released holds.
     * @example
     * window.dispatchEvent(new CustomEvent('kf-version-refresh-release', {
     *     detail: { all: true },
     * }));
     */
    function releaseAllRefreshHolds() {
        const holdCount = internalState.refreshHoldIds.size;
        internalState.refreshHoldIds.clear();

        if (holdCount && internalState.pendingRequestActive && !internalState.reloadTimerId) {
            ensurePendingRefreshWatch();
            if (canRefreshPageNow()) {
                runRefreshIfSafe();
            }
        }

        return holdCount;
    }

    /**
     * Handles a global refresh-hold event from app code.
     * @param {CustomEvent|Event} event - Browser event containing an optional hold id in detail.
     * @returns {void}
     * @example
     * window.dispatchEvent(new CustomEvent('kf-version-refresh-hold', {
     *     detail: { holdId: 'post-submit-api' },
     * }));
     */
    function handleRefreshHoldEvent(event) {
        const detail = event?.detail;
        const holdId = knackValueResolver.toStringSafe(detail?.holdId);
        holdRefresh(holdId);
    }

    /**
     * Handles a global refresh-release event from app code.
     * @param {CustomEvent|Event} event - Browser event containing a hold id in detail, or detail.all to release every hold.
     * @returns {void}
     * @example
     * window.dispatchEvent(new CustomEvent('kf-version-refresh-release', {
     *     detail: { holdId: 'post-submit-api' },
     * }));
     */
    function handleRefreshReleaseEvent(event) {
        const detail = event?.detail;
        if (detail?.all) {
            releaseAllRefreshHolds();
            return;
        }

        const holdId = knackValueResolver.toStringSafe(detail?.holdId);
        releaseRefresh(holdId);
    }

    /**
     * Resets pending state while preserving the stored user version.
     * @returns {void}
     */
    function resetState() {
        const storedState = readState();
        writeState(mergeStoredState({
            targetVersion: '',
            lastReloadedTarget: '',
            lastReloadedAt: '',
            userVersion: storedState.userVersion,
        }, storedState));
        internalState.deferredNoticeTargetVersion = '';
        internalState.pendingRequestActive = false;
        internalState.refreshHoldIds.clear();
        stopPendingRefreshWatch();
        if (internalState.reloadTimerId) {
            window.clearTimeout(internalState.reloadTimerId);
            internalState.reloadTimerId = 0;
        }
    }

    /**
     * Observes DOM changes until the page is safe to refresh.
     * @returns {void}
     */
    function ensurePendingRefreshWatch() {
        if (isIframeWindow() || internalState.pendingObserver || !internalState.pendingRequestActive) {
            return;
        }

        if (!(document.body instanceof HTMLElement)) {
            return;
        }

        const runPendingRefreshCheck = function () {
            if (!internalState.pendingRequestActive) {
                stopPendingRefreshWatch();
                return;
            }

            if (internalState.reloadTimerId) {
                stopPendingRefreshWatch();
                return;
            }

            if (!hasActiveRefreshHold() && canRefreshPageNow()) {
                stopPendingRefreshWatch();
                runRefreshIfSafe();
            }
        };

        // Page-wide class/style changes are frequent, so check at most once per quiet period rather than on every batch.
        internalState.pendingObserver = new MutationObserver(function () {
            window.clearTimeout(internalState.pendingCheckTimerId);
            internalState.pendingCheckTimerId = window.setTimeout(runPendingRefreshCheck, 250);
        });
        internalState.pendingObserver.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
        });

        runPendingRefreshCheck();
    }

    /**
     * Determines whether the same target was already reloaded recently.
     * @param {{ lastReloadedTarget: string, lastReloadedAt: string }} storedState - Stored state.
     * @param {string} targetVersion - Requested target version.
     * @returns {boolean} True when the same target was reloaded recently.
     */
    function wasTargetReloadedRecently(storedState, targetVersion) {
        if (!targetVersion || !storedState || storedState.lastReloadedTarget !== targetVersion) {
            return false;
        }

        const lastReloadedAt = Date.parse(storedState.lastReloadedAt);
        if (Number.isNaN(lastReloadedAt)) {
            return false;
        }

        return (Date.now() - lastReloadedAt) < recentReloadWindowMs;
    }

    /**
     * Shows the deferred refresh notice once for the pending target.
     * @param {string} targetVersion - Pending target version.
     * @returns {void}
     */
    function showDeferredRefreshNotice(targetVersion) {
        if (!targetVersion || internalState.deferredNoticeTargetVersion === targetVersion) {
            return;
        }

        internalState.deferredNoticeTargetVersion = targetVersion;
        if (typeof showRefreshWait === 'function') {
            showRefreshWait(targetVersion);
        }
    }

    /**
     * Sends the current iframe version state to the main window.
     * @param {string} targetVersion - Version that should be loaded after refresh.
     * @param {string} [userVersion=''] - Current stored user version.
     * @returns {void}
     */
    function postRefreshMessage(targetVersion, userVersion = '') {
        if (typeof window === 'undefined' || window.parent === window) {
            return;
        }

        window.parent.postMessage({
            source: messageSource,
            type: messageType,
            userId: knackValueResolver.toStringSafe(getCurrentUserId()),
            targetVersion: normalizeVersion(targetVersion),
            userVersion: normalizeVersion(userVersion),
        }, window.location.origin);
    }

    /**
     * Evaluates the iframe version snapshot and notifies the main window.
     * @param {{ userVersion?: string, targetVersion?: string }} [snapshot={}] - Current iframe versions.
     * @returns {{ userVersion: string, targetVersion: string }} Normalised iframe versions.
     */
    function evaluateIframeVersionState(snapshot = {}) {
        const versionSnapshot = createIframeVersionSnapshot(snapshot);

        if (versionSnapshot.userVersion) {
            storeUserVersion(versionSnapshot.userVersion);
            postRefreshMessage(
                versionSnapshot.targetVersion && versionSnapshot.userVersion !== versionSnapshot.targetVersion
                    ? versionSnapshot.targetVersion
                    : '',
                versionSnapshot.userVersion
            );
        }

        return versionSnapshot;
    }

    /**
     * Synchronises the user version when the iframe detects a mismatch.
     * @param {{ userVersion?: string, targetVersion?: string }} [snapshot={}] - Current iframe versions.
     * @returns {Promise<string|void>} Synced version when an update was applied.
     */
    async function syncIframeVersion(snapshot = {}) {
        if (!isIframeWindow()) {
            return;
        }

        const userId = knackValueResolver.toStringSafe(getCurrentUserId());
        const versionSnapshot = createIframeVersionSnapshot(snapshot);
        const targetVersion = versionSnapshot.targetVersion;
        const currentUserVersion = versionSnapshot.userVersion;

        // Do not treat an uncached current-user record as a version mismatch.
        if (
            !internalState.iframeCurrentUserRecord
            || !userId
            || !targetVersion
            || currentUserVersion === targetVersion
            || internalState.syncInFlight
            || typeof syncUserVersion !== 'function'
        ) {
            return;
        }

        const syncContext = {
            userId,
            targetVersion,
            userVersion: currentUserVersion,
        };
        internalState.syncInFlight = true;
        try {
            const syncedVersion = normalizeVersion(
                await syncUserVersion(targetVersion, syncContext) || targetVersion
            );
            if (internalState.iframeCurrentUserRecord && normalizedSyncUserVersionFieldId) {
                internalState.iframeCurrentUserRecord[normalizedSyncUserVersionFieldId] = syncedVersion || targetVersion;
            }
            storeUserVersion(syncedVersion || targetVersion);
            if (typeof onUserVersionSynced === 'function') {
                onUserVersionSynced(syncedVersion || targetVersion, syncContext);
            }
            postRefreshMessage('', syncedVersion || targetVersion);
            return syncedVersion || targetVersion;
        } catch (error) {
            if (typeof onSyncError === 'function') {
                onSyncError(error, syncContext);
            }
        } finally {
            internalState.syncInFlight = false;
        }
    }

    /**
     * Evaluates the iframe version snapshot and then applies any required user-version sync.
     * @param {{ userVersion?: string, targetVersion?: string }} [snapshot={}] - Raw iframe versions.
     * @returns {Promise<{ userVersion: string, targetVersion: string }>} Normalised iframe versions.
     */
    async function evaluateAndSyncIframeVersion(snapshot = {}) {
        const versionSnapshot = evaluateIframeVersionState(snapshot);
        await syncIframeVersion(versionSnapshot);
        return versionSnapshot;
    }

    /**
     * Caches a current-user record and then re-evaluates iframe version control.
     * @param {Object|Object[]|null} recordOrRecords - Current-user record payload.
     * @returns {Promise<{ userVersion: string, targetVersion: string }>} Normalised cached iframe versions.
     */
    async function cacheCurrentUserRecordAndSync(recordOrRecords) {
        cacheCurrentUserRecord(recordOrRecords);
        return evaluateAndSyncIframeVersion(createCachedIframeVersionSnapshot());
    }

    /**
     * Caches target-version records and then re-evaluates iframe version control.
     * @param {Object[]|null} records - Target-version records.
     * @returns {Promise<{ userVersion: string, targetVersion: string }>} Normalised cached iframe versions.
     */
    async function cacheTargetVersionRecordsAndSync(records) {
        cacheTargetVersionRecords(records);
        return evaluateAndSyncIframeVersion(createCachedIframeVersionSnapshot());
    }

    /**
     * Applies a pending refresh when the page is safe.
     * @returns {void}
     */
    function runRefreshIfSafe() {
        if (isIframeWindow() || !internalState.pendingRequestActive) {
            return;
        }

        const storedState = readState();
        const targetVersion = storedState.targetVersion;
        if (!targetVersion) {
            return;
        }

        if (hasActiveRefreshHold() || !canRefreshPageNow()) {
            ensurePendingRefreshWatch();
            showDeferredRefreshNotice(targetVersion);
            return;
        }

        if (internalState.reloadTimerId) {
            return;
        }

        stopPendingRefreshWatch();
        internalState.deferredNoticeTargetVersion = '';
        if (typeof showRefreshNow === 'function') {
            showRefreshNow(targetVersion, storedState.userVersion);
        }

        internalState.reloadTimerId = window.setTimeout(function () {
            internalState.reloadTimerId = 0;
            internalState.pendingRequestActive = false;
            stopPendingRefreshWatch();
            writeState(mergeStoredState({
                targetVersion: '',
                lastReloadedTarget: targetVersion,
                lastReloadedAt: new Date().toISOString(),
                userVersion: storedState.userVersion,
            }, storedState));
            if (typeof reload === 'function') {
                reload(targetVersion, storedState.userVersion);
            }
        }, reloadDelayMs);
    }

    /**
     * Handles refresh messages sent from the iframe.
     * @param {MessageEvent} event - PostMessage event.
     * @returns {void}
     */
    function handleRefreshMessage(event) {
        if (isIframeWindow()) {
            return;
        }

        if (event?.origin && event.origin !== window.location.origin) {
            return;
        }

        const payload = event?.data;
        if (!payload || typeof payload !== 'object') {
            return;
        }

        if (payload.source !== messageSource || payload.type !== messageType) {
            return;
        }

        const storedState = readState();
        const userVersion = normalizeVersion(payload.userVersion);
        const targetVersion = normalizeVersion(payload.targetVersion);
        const shouldWaitForUserVersionSync = Boolean(
            normalizedSyncUserVersionFieldId
            && userVersion
            && targetVersion
            && userVersion !== targetVersion
        );
        if (userVersion) {
            storeUserVersion(userVersion);
        }

        if (!targetVersion) {
            if (userVersion && storedState.targetVersion && userVersion === storedState.targetVersion && !internalState.reloadTimerId) {
                internalState.pendingRequestActive = true;
                if (canRefreshPageNow()) {
                    runRefreshIfSafe();
                } else {
                    ensurePendingRefreshWatch();
                }
            }
            return;
        }

        if (wasTargetReloadedRecently(storedState, targetVersion)) {
            return;
        }

        if (internalState.pendingRequestActive && storedState.targetVersion === targetVersion) {
            if (shouldWaitForUserVersionSync) {
                ensurePendingRefreshWatch();
                showDeferredRefreshNotice(targetVersion);
                return;
            }

            ensurePendingRefreshWatch();
            runRefreshIfSafe();
            return;
        }

        internalState.pendingRequestActive = true;
        writeState(mergeStoredState({
            targetVersion,
            userVersion: userVersion || storedState.userVersion,
        }, storedState));

        if (shouldWaitForUserVersionSync) {
            ensurePendingRefreshWatch();
            showDeferredRefreshNotice(targetVersion);
            return;
        }

        ensurePendingRefreshWatch();
        runRefreshIfSafe();
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        if (refreshHoldEventName) {
            window.addEventListener(refreshHoldEventName, handleRefreshHoldEvent);
        }

        if (refreshReleaseEventName) {
            window.addEventListener(refreshReleaseEventName, handleRefreshReleaseEvent);
        }
    }

    return {
        normalizeVersion,
        createIframeVersionSnapshot,
        createCachedIframeVersionSnapshot,
        cacheCurrentUserRecord,
        cacheTargetVersionRecords,
        getCachedUserVersion,
        getTargetVersion,
        isHomeRoute,
        hasBlockingForm,
        canRefreshNow: canRefreshPageNow,
        readState,
        writeState,
        storeUserVersion,
        holdRefresh,
        releaseRefresh,
        releaseAllRefreshHolds,
        hasActiveRefreshHold,
        resetState,
        evaluateIframeVersionState,
        syncIframeVersion,
        evaluateAndSyncIframeVersion,
        cacheCurrentUserRecordAndSync,
        cacheTargetVersionRecordsAndSync,
        postRefreshMessage,
        runRefreshIfSafe,
        handleRefreshHoldEvent,
        handleRefreshReleaseEvent,
        handleRefreshMessage,
    };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Section: knack-error
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// KnackError ported as-is (analysis C27; jQuery only to bind Knack events, which Knack fires through jQuery).

/**
 * KnackError - Comprehensive error handling utility for Knack applications
 *
 * This class captures and logs detailed information about errors that occur in a Knack application.
 * It stores error information in a designated Knack table via the KnackAPI for later analysis.
 *
 * @version 1.3.0
 * @author Craig Winnall, GitHub Copilot
 */
class KnackError {
    /**
     * Creates a new KnackError instance
     * @param {Object} options - Configuration options
     * @param {string} options.sceneId - The scene ID/key for the error logging table
     * @param {string} options.viewId - The view ID/key for the error logging table
     * @param {Object} options.fieldMap - Mapping of error data to Knack field keys
     * @param {boolean} [options.captureUserData=true] - Whether to capture user information
     * @param {boolean} [options.captureSystemInfo=true] - Whether to capture system information
     * @param {boolean} [options.consoleLog=true] - Whether to also log errors to console
     * @param {boolean} [options.groupSimilarErrors=true] - Whether to group similar errors
     * @param {number} [options.maxErrorsPerMinute=10] - Rate limiting for error logging
     * @param {Array} [options.ignoredErrors=[]] - Error messages or patterns to ignore
     * @param {boolean} [options.captureKnackContext=true] - Whether to capture Knack context (scene, view, etc.)
     * @param {boolean} [options.separateContextFields=true] - Whether to store context in separate fields
     */
    constructor(options = {}) {
        this.options = {
            sceneId: options.sceneId || '',
            viewId: options.viewId || '',
            fieldMap: options.fieldMap || {},
            captureUserData: options.captureUserData !== undefined ? options.captureUserData : true,
            captureSystemInfo: options.captureSystemInfo !== undefined ? options.captureSystemInfo : true,
            consoleLog: options.consoleLog !== undefined ? options.consoleLog : true,
            groupSimilarErrors: options.groupSimilarErrors !== undefined ? options.groupSimilarErrors : true,
            maxErrorsPerMinute: options.maxErrorsPerMinute || 10,
            ignoredErrors: options.ignoredErrors || [],
            captureKnackContext: options.captureKnackContext !== undefined ? options.captureKnackContext : true,
            separateContextFields: options.separateContextFields !== undefined ? options.separateContextFields : true
        };

        // Initialize KnackAPI instance with spinner disabled
        this.api = new KnackAPI({ debug: false, showSpinner: false });

        this.boundHandleError = this.handleError.bind(this);

        // Rate limiting data
        this._errorCount = 0;
        this._lastResetTime = Date.now();
        this._errorHashes = new Map();

        // Track the last known context
        this._lastKnownContext = {
            sceneId: null,
            viewId: null,
            eventType: null,
            timestamp: null
        };

        // Setup context tracking if enabled
        if (this.options.captureKnackContext) {
            this._setupContextTracking();
        }

        // Validate required options
        this._validateOptions();

        // Performance metrics
        this.performanceData = {
            javaScriptErrors: 0,
            networkErrors: 0,
            apiErrors: 0,
            totalErrors: 0,
            slowestOperation: null,
            averageResponseTime: 0
        };
    }

    /**
     * Handles an error by logging it to the Knack table and optionally to console
     * @param {Error|string} error - The error object or message
     * @param {Object} [additionalInfo={}] - Additional information to log with the error
     * @param {string} [errorSource='Unknown'] - The source of the error (function name, component, etc)
     * @returns {Promise<Object|null>} - The created error record or null if logging failed
     */
    async handleError(error, additionalInfo = {}, errorSource = 'Unknown') {
        // Quickly check if we should process this error
        if (this._shouldIgnoreError(error) || this._isRateLimited()) {
            return null;
        }

        // Capture context data once
        if (this.options.captureKnackContext) {
            Object.assign(additionalInfo, this._captureContextData());
        }

        // Capture all error data
        const errorData = this._captureErrorData(error, additionalInfo, errorSource);

        // Handle error grouping
        if (this.options.groupSimilarErrors) {
            const existingError = this._processErrorGroup(errorData);
            if (existingError) return existingError.record;
        }

        // Track metrics
        this._updatePerformanceMetrics(errorData);

        // Console logging
        if (this.options.consoleLog) {
            console.error('KnackError:', errorData);
        }

        // Knack table logging
        if (this.options.sceneId && this.options.viewId) {
            try {
                return await this._logToKnackTable(errorData);
            } catch (loggingError) {
                console.error('Error logging to Knack table:', loggingError);
            }
        }

        return null;
    }

    /**
     * Creates a wrapper for Knack event handlers that automatically includes context
     * @param {string} eventType - The type of Knack event (e.g., 'knack-view-render')
     * @param {Function} handler - The event handler function to wrap
     * @returns {Function} - The wrapped handler function
     * @public
     */
    wrapEventHandler(eventType, handler) {
        const self = this;

        return async function (event, view, record) {
            try {
                // Store context information
                const context = {
                    eventType: eventType.replace('knack-', ''),
                    viewId: view ? view.key : null,
                    sceneId: self._getCurrentSceneId(),
                    recordId: record ? record.id : null,
                    timestamp: new Date().toISOString()
                };

                // Update last known context
                self._lastKnownContext = context;

                // Call the original handler
                return await handler.apply(this, arguments);
            } catch (error) {
                // Handle the error with context information
                await self.handleError(error, { knackContext: self._lastKnownContext }, `${eventType} Handler`);

                // Re-throw so the calling code knows an error occurred
                throw error;
            }
        };
    }

    /**
     * Sets up global error handling
     * @param {boolean} [unhandledRejections=true] - Whether to catch unhandled promise rejections
     * @returns {KnackError} - This instance for chaining
     */
    setupGlobalErrorHandling(unhandledRejections = true) {
        // Handle regular errors
        window.addEventListener('error', (event) => {
            this.handleError(
                event.error || event.message,
                {
                    errorFile: event.filename,
                    errorLine: event.lineno,
                    errorColumn: event.colno
                },
                'Global Error Event'
            );
        });

        // Handle unhandled promise rejections if enabled
        if (unhandledRejections) {
            window.addEventListener('unhandledrejection', (event) => {
                const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
                this.handleError(error, {}, 'Unhandled Promise Rejection');
            });
        }

        return this;
    }

    /**
     * Creates a function that wraps another function with error handling
     * @param {Function} fn - The function to wrap
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Wrapped function with error handling
     */
    wrapFunction(fn, source, additionalInfo = {}) {
        return this.executeFunction(fn, {
            source,
            rethrowError: true,
            additionalInfo
        });
    }

    /**
     * Creates a try-catch wrapper for use in async functions
     * @param {Function} fn - The function to wrap
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Function that returns a promise that resolves with the result or rejects with the error
     */
    tryCatch(fn, source, additionalInfo = {}) {
        const self = this;

        return async function (...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                self.handleError(error, {
                    functionArgs: self._serialiseArgs(args),
                    knackContext: self.getCurrentContext(),
                    ...additionalInfo
                }, source || fn.name || 'Anonymous Function');

                return {
                    success: false,
                    error: error,
                    message: error.message
                };
            }
        };
    }

    /**
     * Monitors the performance of function calls and logs errors
     * @param {Function} fn - The function to monitor
     * @param {string} [source] - Source identifier for the error
     * @param {number} [thresholdMs=1000] - Threshold in milliseconds for performance warnings
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Monitored function
     */
    monitorPerformance(fn, source, thresholdMs = 1000, additionalInfo = {}) {
        const self = this;
        return async function(...args) {
            const startTime = performance.now();
            try {
                const result = await fn.apply(this, args);
                const executionTime = performance.now() - startTime;

                // Only log if exceeding threshold
                if (executionTime > thresholdMs) {
                    console.warn(`Performance warning: ${source || fn.name || 'Anonymous'} took ${executionTime.toFixed(2)}ms`);
                    // Could also log this as a special type of "performance warning" error
                }

                return result;
            } catch (error) {
                const executionTime = performance.now() - startTime;
                self.handleError(error, {
                    functionArgs: self._serialiseArgs(args),
                    responseTime: executionTime.toFixed(2),
                    performanceContext: {
                        threshold: thresholdMs,
                        executionTime: executionTime.toFixed(2)
                    },
                    ...additionalInfo
                }, source || fn.name || 'Performance Monitor');

                throw error;
            }
        };
    }

        /**
     * Monitors a Knack API call and logs any errors that occur
     * @param {Function} apiCallFn - The API call function to monitor
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Wrapped API call function
     */
    monitorApiCall(apiCallFn, source = 'Knack API Call', additionalInfo = {}) {
        const self = this;
        return async function (...args) {
            const startTime = performance.now();
            try {
                const result = await apiCallFn.apply(this, args);
                const endTime = performance.now();

                // Log slow API calls (over 2000ms) as warnings
                const executionTime = endTime - startTime;
                if (executionTime > 2000) {
                    console.warn(`KnackError: Slow API call to ${source}: ${executionTime.toFixed(2)}ms`);
                }

                return result;
            } catch (error) {
                const endTime = performance.now();
                const executionTime = endTime - startTime;

                // Get parameters for the API call for better debugging
                let apiParams = {};
                if (args.length >= 2) {
                    apiParams = {
                        sceneKey: args[0] || null,
                        viewId: args[1] || null,
                        recordId: args.length > 2 ? args[2] : null,
                        requestData: args.length > 3 ? args[3] : null
                    };

                    // Determine request type from function name
                    if (apiCallFn.name) {
                        const fnName = apiCallFn.name.toLowerCase();
                        if (fnName.includes('create')) {
                            apiParams.requestType = 'POST';
                        } else if (fnName.includes('update')) {
                            apiParams.requestType = 'PUT';
                        } else if (fnName.includes('delete')) {
                            apiParams.requestType = 'DELETE';
                        } else if (fnName.includes('get')) {
                            apiParams.requestType = 'GET';
                        }
                    }
                }

                self.handleError(error, {
                    apiParams,
                    responseTime: executionTime.toFixed(2),
                    knackContext: self.getCurrentContext(),
                    ...additionalInfo
                }, source);

                throw error;
            }
        };
    }

    /**
     * Gets performance data collected by the error handler
     * @returns {Object} - Performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceData,
            errorRate: {
                total: this.performanceData.totalErrors,
                perMinute: this._errorCount / ((Date.now() - this._lastResetTime) / 60000)
            }
        };
    }

    /**
     * Adds an error pattern to the ignore list
     * @param {string|RegExp} pattern - Error message pattern to ignore
     * @returns {KnackError} - This instance for chaining
     */
    ignoreError(pattern) {
        this.options.ignoredErrors.push(pattern);
        return this;
    }

    /**
     * Wraps all methods of an object with error handling
     * @param {Object} obj - The object whose methods to wrap
     * @param {string} [source] - Source identifier prefix for the errors
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Object} - Object with wrapped methods
     */
    wrapAllMethods(obj, source, additionalInfo = {}) {
        const wrapped = {};

        for (const key in obj) {
            if (typeof obj[key] === 'function') {
                wrapped[key] = this.wrapFunction(obj[key], source ? `${source}.${key}` : key, additionalInfo);
            } else {
                wrapped[key] = obj[key];
            }
        }

        return wrapped;
    }

    /**
     * Safely executes code and returns a result or default value on error
     * @param {Function} fn - Function to execute
     * @param {*} defaultValue - Default value to return on error
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {*} - Result of function or default value on error
     */
    safeExecute(fn, defaultValue, source, additionalInfo = {}) {
        return this.executeFunction(fn, {
            returnDefaultOnError: true,
            defaultValue,
            source,
            immediate: true,
            additionalInfo
        });
    }

    /**
     * Executes a function safely with error handling
     * @param {Function} fn - The function to execute
     * @param {Object} options - Configuration options
     * @param {boolean} [options.returnDefaultOnError=false] - Whether to return default value on error
     * @param {*} [options.defaultValue=null] - Default value to return on error
     * @param {boolean} [options.captureArgs=true] - Whether to capture function arguments in error logs
     * @param {boolean} [options.captureContext=true] - Whether to capture Knack context
     * @param {boolean} [options.rethrowError=true] - Whether to rethrow the error after logging
     * @param {string} [options.source] - Source identifier for the error
     * @param {Object} [options.additionalInfo={}] - Additional information to include in error logs
     * @returns {Function|*} - Either wrapped function or result of immediate execution
     */
    executeFunction(fn, options = {}) {
        const {
            returnDefaultOnError = false,
            defaultValue = null,
            captureArgs = true,
            captureContext = true,
            rethrowError = true,
            source = fn.name || 'Execute Function',
            immediate = false,
            immediateArgs = [],
            additionalInfo = {}
        } = options;

        const self = this;

        const wrappedFn = async function(...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                // Build error context
                const errorInfo = {
                    ...additionalInfo // Include any passed additionalInfo
                };

                if (captureArgs) {
                    errorInfo.functionArgs = self._serialiseArgs(args);
                }

                if (captureContext) {
                    errorInfo.knackContext = self.getCurrentContext();
                }

                // Log the error
                self.handleError(error, errorInfo, source);

                // Either return default value or rethrow
                if (returnDefaultOnError) {
                    return defaultValue;
                } else if (rethrowError) {
                    throw error;
                }
            }
        };

        // Either return the wrapped function or execute immediately
        if (immediate) {
            return wrappedFn(...immediateArgs);
        }

        return wrappedFn;
    }

    /**
     * Creates a wrapper specifically for Knack event listeners
     * @param {string} viewId - The view ID to listen for events on
     * @param {string} eventType - The type of event (e.g., 'knack-view-render')
     * @param {Function} handler - The handler function for the event
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {KnackError} - This instance for chaining
     * @public
     */
    wrapKnackListener(viewId, eventType, handler, additionalInfo = {}) {
        const self = this;

        // Create a wrapped handler that includes error handling with the additionalInfo
        const wrappedHandler = function(event, view, record) {
            // Create a merged info object with dynamic context and passed additionalInfo
            const contextInfo = {
                ...additionalInfo,
                listenerViewId: viewId,
                listenerEventType: eventType
            };

            try {
                // Call the original handler with the original event arguments
                return handler.apply(this, arguments);
            } catch (error) {
                // Use the eventType and viewId to create a source string
                const source = `${eventType} Listener for ${viewId}`;

                // Handle the error with the contextInfo
                self.handleError(error, contextInfo, source);

                // Don't re-throw the error - this allows the view to continue rendering
                console.error(`Error in ${source}: ${error.message}`);
                // Optionally return a value if needed
                return undefined;
            }
        };

        // If viewId is 'any', capture all events of this type
        const eventSelector = `${eventType}.${viewId}`;

        $(document).on(eventSelector, wrappedHandler);

        return this;
    }

    /**
     * Serialises call arguments for an error report, replacing values that can't or shouldn't be stringified.
     * @param {Array} args - Arguments the wrapped function was called with.
     * @returns {string}
     * @private
     */
    _serialiseArgs(args) {
        try {
            return JSON.stringify(args, (key, value) => {
                if (typeof value === 'function') return 'function() { ... }';
                if (value instanceof Node) return value.nodeName;
                if (value instanceof Window) return 'Window';
                return value;
            });
        } catch (error) {
            return '[unserialisable arguments]'; // circular objects or BigInt must not mask the original error
        }
    }

    /**
     * Gets the current Knack context (scene ID, view ID, event type)
     * @returns {Object} The current Knack context
     * @public
     */
    getCurrentContext() {
        const context = {
            ...this._lastKnownContext,
            currentSceneId: this._getCurrentSceneId(),
            currentViewId: this._getCurrentViewId(),
            url: window.location.href
        };

        // If we don't have a tracked scene ID, use the current one from the DOM
        if (!context.sceneId) {
            context.sceneId = context.currentSceneId;
        }

        // If we don't have a tracked view ID, use the current one from the DOM
        if (!context.viewId) {
            context.viewId = context.currentViewId;
        }

        return context;
    }

    /**
     * Sets up tracking for Knack context events
     * @private
     */
    _setupContextTracking() {
        // Handle all Knack events with a single handler
        const knackEvents = ['view-render', 'scene-render', 'form-submit', 'record-update', 'cell-update', 'record-delete'];

        knackEvents.forEach(eventType => {
            $(document).on(`knack-${eventType}.any`, (event, view, record) => {
                this._lastKnownContext = {
                    viewId: view?.key || null,
                    sceneId: this._getCurrentSceneId(),
                    eventType,
                    recordId: record?.id || null,
                    timestamp: new Date().toISOString()
                };
            });
        });
    }

    /**
     * Gets the current scene ID from the DOM
     * @returns {string|null} The current scene ID or null if not found
     * @private
     */
    _getCurrentSceneId() {
        // Try to get from the Knack object first
        const sceneKey = knackNavigator.getCurrentSceneKey();
        if (sceneKey) return sceneKey;

        // Try to get from the DOM
        const sceneElement = document.querySelector('.kn-scene');
        if (sceneElement) {
            const sceneId = sceneElement.id;
            if (sceneId && sceneId.startsWith('kn-scene_')) {
                return sceneId.replace('kn-', '');
            }
        }

        // Try to extract from URL
        return this._extractSceneIdFromUrl();
    }

    /**
     * Gets the current view ID from the DOM
     * @returns {string|null} The current view ID or null if not found
     * @private
     */
    _getCurrentViewId() {
        // Try each view finding method
        return this._getActiveViewId() || this._getFirstViewId();
    }

    /**
     * Gets the active view ID (the one with focus or most recently interacted with)
     * @returns {string|null} The active view ID or null if not found
     * @private
     */
    _getActiveViewId() {
        // Check for active form or last interacted element
        const activeElement = document.activeElement;
        if (activeElement) {
            // Traverse up to find a view container
            let currentElement = activeElement;
            while (currentElement && currentElement !== document.body) {
                // Check if this element is a view
                if (currentElement.id && currentElement.id.startsWith('view_')) {
                    return currentElement.id;
                }
                currentElement = currentElement.parentElement;
            }
        }
        return null;
    }

    /**
     * Gets the first view ID found in the current scene
     * @returns {string|null} The first view ID or null if not found
     * @private
     */
    _getFirstViewId() {
        const viewElement = document.querySelector('[id^="view_"]');
        return viewElement ? viewElement.id : null;
    }

    /**
     * Extracts the scene ID from the URL
     * @returns {string|null} The scene ID or null if not found
     * @private
     */
    _extractSceneIdFromUrl() {
        const url = window.location.href;
        // Knack URLs often follow the pattern /scene_XX/...
        const sceneMatch = url.match(/\/scene_(\d+)/i);
        if (sceneMatch && sceneMatch[1]) {
            return `scene_${sceneMatch[1]}`;
        }
        return null;
    }

    /**
     * Validates that required options are provided
     * @private
     */
    _validateOptions() {
        if (!this.options.sceneId || !this.options.viewId) {
            console.error('KnackError: Missing required options sceneId and viewId');
        }

        const requiredFields = ['errorMessage', 'errorSource', 'errorStack'];
        const missingFields = requiredFields.filter(field => !this.options.fieldMap[field]);

        if (missingFields.length > 0) {
            console.error(`KnackError: Missing required field mappings: ${missingFields.join(', ')}`);
        }
    }

        /**
     * Processes an error to handle grouping of similar errors
     * @param {Object} errorData - Error data to process
     * @returns {Object|null} - Existing error record if found, null otherwise
     * @private
     */
    _processErrorGroup(errorData) {
        // Generate a hash for this error to identify similar ones
        const errorHash = this._generateErrorHash(errorData);

        // Check if we've seen this error recently
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (this._errorHashes.has(errorHash)) {
            const existingError = this._errorHashes.get(errorHash);
            existingError.count++;
            existingError.lastSeen = now;

            // Only log if it's been a while since the last occurrence
            if (now - existingError.firstLogged > oneHour) {
                // Reset to treat as a fresh error after an hour
                this._errorHashes.set(errorHash, {
                    count: 1,
                    firstLogged: now,
                    lastSeen: now,
                    record: null
                });
                return null;
            }

            return existingError;
        } else {
            // New error, add to tracking
            this._errorHashes.set(errorHash, {
                count: 1,
                firstLogged: now,
                lastSeen: now,
                record: null
            });
            return null;
        }
    }

    /**
     * Checks if an error should be ignored based on predefined patterns
     * @param {Error|string} error - The error to check
     * @returns {boolean} - Whether the error should be ignored
     * @private
     */
    _shouldIgnoreError(error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check against ignored error patterns
        return this.options.ignoredErrors.some(pattern => {
            if (pattern instanceof RegExp) {
                return pattern.test(errorMessage);
            } else {
                return errorMessage.includes(pattern);
            }
        });
    }

    /**
     * Checks if error logging is currently rate limited
     * @returns {boolean} - Whether rate limiting is in effect
     * @private
     */
    _isRateLimited() {
        const now = Date.now();
        const oneMinute = 60 * 1000;

        // Reset counter if a minute has passed
        if (now - this._lastResetTime > oneMinute) {
            this._errorCount = 0;
            this._lastResetTime = now;
        }

        // Check if over limit after incrementing
        return ++this._errorCount > this.options.maxErrorsPerMinute;
    }

    /**
     * Generates a hash for an error to identify similar errors
     * @param {Object} errorData - Error data to hash
     * @returns {string} - Hash string representing the error
     * @private
     */
    _generateErrorHash(errorData) {
        // Create a more stable hash by focusing on key properties
        const keyParts = [
            errorData.errorName || '',
            errorData.errorMessage || '',
            errorData.errorSource || '',
            errorData.contextSceneId || '',
            errorData.contextViewId || '',
            errorData.contextEventType || ''
        ];

        return keyParts.join('|');
    }

    /**
     * Updates performance metrics based on error data
     * @param {Object} errorData - Error data to analyze
     * @private
     */
    _updatePerformanceMetrics(errorData) {
        this.performanceData.totalErrors++;

        // Categorize error types
        if (errorData.errorName === 'NetworkError' || errorData.errorMessage.includes('network')) {
            this.performanceData.networkErrors++;
        } else if (errorData.errorMessage.includes('API') ||
            errorData.errorSource.includes('API')) {
            this.performanceData.apiErrors++;
        } else {
            this.performanceData.javaScriptErrors++;
        }

        // Track response time if available
        if (errorData.responseTime) {
            const responseTime = parseFloat(errorData.responseTime);
            if (!isNaN(responseTime)) {
                if (!this.performanceData.slowestOperation ||
                    responseTime > this.performanceData.slowestOperation.time) {
                    this.performanceData.slowestOperation = {
                        time: responseTime,
                        source: errorData.errorSource,
                        timestamp: errorData.errorTime
                    };
                }

                // Update average response time
                const prevTotal = this.performanceData.averageResponseTime *
                    (this.performanceData.totalErrors - 1);
                this.performanceData.averageResponseTime =
                    (prevTotal + responseTime) / this.performanceData.totalErrors;
            }
        }
    }

    /**
     * Captures and formats error data for logging
     * @param {Error|string} error - The error object or message
     * @param {Object} additionalInfo - Additional information to log
     * @param {string} errorSource - The source of the error
     * @returns {Object} - Formatted error data
     * @private
     */
    _captureErrorData(error, additionalInfo, errorSource) {
        // Create the base error object with all essential data
        const errorData = {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : 'CustomError',
            errorStack: error instanceof Error ? error.stack : new Error().stack,
            errorSource: errorSource,
            errorTime: new Date().toISOString(),
            errorUrl: window.location.href
        };

        // Add specific context fields from additionalInfo
        const contextFields = [
            'contextSceneId', 'contextViewId', 'contextEventType',
            'contextRecordId', 'contextUrl', 'contextTimestamp',
            'knackContext', 'knackContextFormatted'
        ];

        contextFields.forEach(field => {
            if (additionalInfo[field]) errorData[field] = additionalInfo[field];
        });

        // Add user data in one step if enabled
        if (this.options.captureUserData) {
            Object.assign(errorData, this._captureUserData());
        }

        // Add system info in one step if enabled
        if (this.options.captureSystemInfo) {
            Object.assign(errorData, this._captureSystemInfo());
        }

        // Add context data in one step if enabled
        if (this.options.captureKnackContext) {
            Object.assign(errorData, this._captureContextData());
        }

        // Keep a clean copy of additionalInfo
        errorData.additionalInfo = { ...additionalInfo };

        return errorData;
    }

    /**
     * Captures user data if enabled
     * @returns {Object} - User data
     * @private
     * */
    _captureUserData() {
        const errorData = {};
        // User information if enabled
        if (this.options.captureUserData && Knack && Knack.getUserAttributes) {
            try {
                const userAttributes = Knack.getUserAttributes();
                errorData.userName = userAttributes.name || 'Unknown User';
                errorData.userId = userAttributes.id || 'Unknown ID';

                if (Knack.getUserRoleNames) {
                    errorData.userRoles = Knack.getUserRoleNames();
                }
            } catch (userInfoError) {
                errorData.userInfoError = 'Failed to capture user data';
            }
        }
        return errorData;
    }

    /**
     * Captures system information if enabled
     * @returns {Object} - System information
     * @private
     * */
    _captureSystemInfo() {
        const errorData = {};
        // System/browser information if enabled
        if (this.options.captureSystemInfo) {
            try {
                const userAgent = navigator.userAgent;
                errorData.userAgent = userAgent;
                errorData.browserName = this._getBrowserInfo(userAgent).name;
                errorData.browserVersion = this._getBrowserInfo(userAgent).version;
                errorData.deviceType = this._getDeviceType(userAgent);
                errorData.operatingSystem = this._getOperatingSystem(userAgent);
                errorData.screenSize = `${window.innerWidth}x${window.innerHeight}`;
                errorData.viewportSize = `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`;
                errorData.knackAppId = Knack ? Knack.application_id : 'Unknown';

                // Add network information
                if (navigator.connection) {
                    errorData.networkType = navigator.connection.effectiveType;
                    errorData.downlink = navigator.connection.downlink;
                }

                // Add memory information if available
                if (window.performance && window.performance.memory) {
                    const memory = window.performance.memory;
                    errorData.jsHeapSizeLimit = memory.jsHeapSizeLimit;
                    errorData.totalJSHeapSize = memory.totalJSHeapSize;
                    errorData.usedJSHeapSize = memory.usedJSHeapSize;
                }

                // Add timing information
                if (window.performance && window.performance.timing) {
                    const timing = window.performance.timing;
                    errorData.pageLoadTime = timing.loadEventEnd - timing.navigationStart;
                    errorData.domReadyTime = timing.domComplete - timing.domLoading;
                }
            } catch (systemInfoError) {
                errorData.systemInfoError = 'Failed to capture system data';
            }
        }
        return errorData;
    }

    /**
     * Captures context data if enabled
     * @returns {Object} - Context data
     * @private
     * */
    _captureContextData() {
        const errorData = {};
        // Knack context information if enabled
        if (this.options.captureKnackContext && this.options.separateContextFields) {
            try {
                const context = this.getCurrentContext();

                // Extract context into separate fields for better filtering and sorting in Knack
                errorData.contextSceneId = context.sceneId || context.currentSceneId || null;
                errorData.contextViewId = context.viewId || context.currentViewId || null;
                errorData.contextEventType = context.eventType || null;
                errorData.contextRecordId = context.recordId || null;
                errorData.contextTimestamp = context.timestamp || null;
                errorData.contextUrl = context.url || window.location.href;

                // If the event was a form submit or record action, include any record ID
                if (context.recordId) {
                    errorData.contextRecordId = context.recordId;
                }

                // Create a formatted context string for easy reading
                errorData.knackContextFormatted = this._formatKnackContext(context);
            } catch (contextError) {
                errorData.contextError = 'Failed to capture Knack context';
            }
        }

        return errorData;
    }

    /**
     * Formats Knack context into a readable string
     * @param {Object} context - The Knack context object
     * @returns {string} - Formatted context string
     * @private
     */
    _formatKnackContext(context) {
        const parts = [];

        if (context.eventType) {
            parts.push(`Event: ${context.eventType}`);
        }

        if (context.sceneId || context.currentSceneId) {
            parts.push(`Scene: ${context.sceneId || context.currentSceneId}`);
        }

        if (context.viewId || context.currentViewId) {
            parts.push(`View: ${context.viewId || context.currentViewId}`);
        }

        if (context.recordId) {
            parts.push(`Record: ${context.recordId}`);
        }

        if (context.timestamp) {
            // Format timestamp to be more readable
            const date = new Date(context.timestamp);
            const formattedDate = date.toLocaleString();
            parts.push(`Time: ${formattedDate}`);
        }

        return parts.join(' | ');
    }

        /**
     * Logs the error data to a Knack table
     * @param {Object} errorData - The error data to log
     * @returns {Promise<Object>} - The created record
     * @private
     */
    _logToKnackTable(errorData) {
        // Map the error data to Knack fields
        const recordData = {};

        // First handle all direct mappings from errorData (excluding additionalInfo)
        Object.entries(this.options.fieldMap).forEach(([errorKey, fieldId]) => {
            if (errorKey !== 'additionalInfo' && errorData[errorKey] !== undefined) {
                recordData[fieldId] = errorData[errorKey];
            }
        });

        // Handle the additionalInfo field specially - but first remove fields that already exist in the main record
        if (this.options.fieldMap.additionalInfo && errorData.additionalInfo) {
            const additionalInfoField = this.options.fieldMap.additionalInfo;

            // Create a copy of additionalInfo that doesn't include fields already captured elsewhere
            const filteredAdditionalInfo = { ...errorData.additionalInfo };

            // Remove fields that are already captured in dedicated fields
            Object.keys(this.options.fieldMap).forEach(key => {
                if (key !== 'additionalInfo') {
                    delete filteredAdditionalInfo[key];
                }
            });

            // Additional fields to exclude that might be in additionalInfo but are already in errorData
            const fieldsToExclude = [
                'contextSceneId', 'contextViewId', 'contextEventType',
                'contextRecordId', 'contextUrl', 'contextTimestamp',
                'knackContext', 'knackContextFormatted'
            ];

            fieldsToExclude.forEach(field => {
                delete filteredAdditionalInfo[field];
            });

            // Only include additionalInfo if it has content after filtering
            if (Object.keys(filteredAdditionalInfo).length > 0) {
                const stringifiedInfo = JSON.stringify(filteredAdditionalInfo, null, 2);
                recordData[additionalInfoField] = stringifiedInfo;
            }
        }

        // Create the error record in Knack
        return this.api.createRecord(this.options.sceneId, this.options.viewId, recordData);
    }

    /**
     * Extracts browser name and version from user agent
     * @param {string} userAgent - Browser user agent string
     * @returns {Object} - Object containing browser name and version
     * @private
     */
    _getBrowserInfo(userAgent) {
        const browsers = [
            { name: 'Edge', pattern: /Edge|Edg/i },
            { name: 'Chrome', pattern: /Chrome/i },
            { name: 'Firefox', pattern: /Firefox/i },
            { name: 'Safari', pattern: /Safari/i },
            { name: 'Opera', pattern: /Opera|OPR/i },
            { name: 'Internet Explorer', pattern: /Trident|MSIE/i }
        ];

        let browserInfo = { name: 'Unknown', version: 'Unknown' };

        for (const browser of browsers) {
            if (browser.pattern.test(userAgent)) {
                browserInfo.name = browser.name;

                // Extract version based on browser
                let versionMatch;
                switch (browser.name) {
                    case 'Edge':
                        versionMatch = userAgent.match(/Edge?\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Chrome':
                        versionMatch = userAgent.match(/Chrome\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Firefox':
                        versionMatch = userAgent.match(/Firefox\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Safari':
                        versionMatch = userAgent.match(/Version\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Opera':
                        versionMatch = userAgent.match(/OPR\/(\d+(\.\d+)?)/i) || userAgent.match(/Opera\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Internet Explorer':
                        versionMatch = userAgent.match(/(?:MSIE |rv:)(\d+(\.\d+)?)/i);
                        break;
                }

                if (versionMatch && versionMatch[1]) {
                    browserInfo.version = versionMatch[1];
                }

                break;
            }
        }

        return browserInfo;
    }

    /**
     * Determines the device type from user agent
     * @param {string} userAgent - Browser user agent string
     * @returns {string} - Device type (Mobile, Tablet, Desktop)
     * @private
     */
    _getDeviceType(userAgent) {
        if (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
            if (/Tablet|iPad/i.test(userAgent)) {
                return 'Tablet';
            }
            return 'Mobile';
        }
        return 'Desktop';
    }

    /**
     * Determines the operating system from user agent
     * @param {string} userAgent - Browser user agent string
     * @returns {string} - Operating system name
     * @private
     */
    _getOperatingSystem(userAgent) {
        const systems = [
            { name: 'Windows', pattern: /Windows NT/i },
            { name: 'Windows Phone', pattern: /Windows Phone/i },
            { name: 'macOS', pattern: /Macintosh/i },
            { name: 'iOS', pattern: /iPhone|iPad|iPod/i },
            { name: 'Android', pattern: /Android/i },
            { name: 'Linux', pattern: /Linux/i }
        ];

        for (const system of systems) {
            if (system.pattern.test(userAgent)) {
                return system.name;
            }
        }

        return 'Unknown OS';
    }
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

/**
 * @deprecated Use setVisibility() or toggleVisibility().
 * @param {string|Element|Array} selectors - Element reference(s); an array is handled one entry at a time.
 * @param {boolean|boolean[]} [show] - Show/hide (per entry when an array); omit to toggle.
 */
function toggleElements(selectors, show) {
    warnDeprecated('toggleElements', 'setVisibility() or toggleVisibility()');
    if (!Array.isArray(selectors)) return toggleVisibility(selectors, show);
    selectors.forEach((selector, index) => toggleVisibility(selector, Array.isArray(show) ? show[index] : show));
}

/**
 * @deprecated Use csvToArray().
 * @param {string} fieldValue - Comma-separated text.
 * @returns {string[]} Trimmed items; empty array for empty input.
 */
function splitAndTrimField(fieldValue) {
    warnDeprecated('splitAndTrimField', 'csvToArray()');
    return fieldValue ? csvToArray(fieldValue) : [];
}

/**
 * @deprecated Use knackNavigator.isUserRole().
 * @param {string|string[]} userRoleArr - Role id(s) or name(s).
 * @returns {boolean}
 */
function isUserRole(userRoleArr) {
    warnDeprecated('isUserRole', 'knackNavigator.isUserRole()');
    return knackNavigator.isUserRole(userRoleArr);
}

/**
 * @deprecated Use knackNavigator.isUserName().
 * @param {string} nameToMatch - Name to compare.
 * @returns {boolean}
 */
function isUserName(nameToMatch) {
    warnDeprecated('isUserName', 'knackNavigator.isUserName()');
    return knackNavigator.isUserName(nameToMatch);
}

/**
 * @deprecated Use resolveElements(), which also drops non-elements.
 * @param {Element|Element[]|NodeList|string|JQuery} target - Inputs or selector.
 * @returns {Element[]} V1 result: arrays are returned unchanged and anything else unrecognised is wrapped.
 */
function normaliseInputs(target) {
    warnDeprecated('normaliseInputs', 'resolveElements()');
    if (!target) return [];
    if (Array.isArray(target)) return target;
    return target instanceof Element || typeof target === 'string' || isjQueryInstance(target) || isNodeList(target) ? resolveElements(target) : [target];
}

/**
 * @deprecated Use knackNavigator.getCurrentSceneInfo().
 * @param {string} viewId - View id.
 * @param {number|{historyIndex?: number}} [options] - Optional history lookup.
 * @returns {{recordId: string, sceneId: string, sceneSlug: string}|null} Null (with a console error) on failure.
 */
function getCurrentSceneInfo(viewId, options) {
    warnDeprecated('getCurrentSceneInfo', 'knackNavigator.getCurrentSceneInfo()');
    try {
        return knackNavigator.getCurrentSceneInfo(viewId, options);
    } catch (error) {
        console.error(`Error retrieving scene information for view ID ${viewId}:`, error);
        return null;
    }
}

/**
 * @deprecated V1 returned the URL unchanged for every extension; use the URL directly.
 * @param {string} extension - File extension (ignored).
 * @param {string} url - File URL.
 * @returns {string} The URL.
 */
function fileViewer(extension, url) {
    warnDeprecated('fileViewer', 'the file URL directly');
    return url;
}



// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Not yet ported (kept here so the globals list stays complete; each line is removed as its item lands)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

// Format: TODO(v2-wave-N): globalName  - tests/v2/v2-structure.test.cjs reads these lines.
