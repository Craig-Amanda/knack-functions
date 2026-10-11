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
    const modalActive = Boolean(modalElement || closeButton || Knack?.router?.scene_view?.model?.attributes?.modal);
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
    if (typeof Knack?.router?.navigate === 'function') {
        Knack.router.navigate(routerTarget, false);
        Knack.setHashVars?.();
        return true;
    }

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

    const canUseRouterNavigate = typeof Knack?.router?.navigate === 'function';
    const routerTarget = targetHash.startsWith('#') ? targetHash.slice(1) : targetHash;

    if (canUseRouterNavigate) {
        Knack.router.navigate(routerTarget, true);
        return;
    }

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
        mutations.forEach((mutation) => restoreCell(mutation.target));
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
        // this.actions was filtered to actions with a key in the constructor.
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
