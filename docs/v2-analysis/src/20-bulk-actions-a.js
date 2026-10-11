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
