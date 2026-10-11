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
