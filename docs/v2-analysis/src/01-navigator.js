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
        this._fieldTypeCache = new Map();
        this._fieldChoiceOptionsCache = new Map();
    }

    /**
     * Normalises an id to the expected prefixed Knack format.
     * @param {string|number} value - Id value with or without the prefix.
     * @param {string} prefix - Expected prefix, such as `view_` or `field_`.
     * @returns {string} Normalised id, or an empty string.
     */
    normalizePrefixedId(value, prefix) {
        const normalizedValue = String(value ?? '').trim().toLowerCase();
        if (!normalizedValue) return '';

        if (new RegExp(`^${prefix}\\d+$`, 'i').test(normalizedValue)) {
            return normalizedValue;
        }

        return /^\d+$/.test(normalizedValue) ? `${prefix}${normalizedValue}` : '';
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
        return Object.fromEntries(
            Object.entries(fieldMap || {}).map(([fieldKey, fieldValue]) => [
                fieldKey,
                this.normalizeFieldId(fieldValue),
            ])
        );
    }

    /**
     * Normalises every field reference in a field map to its `_raw` companion key.
     * @param {Object} [fieldMap={}] - Field map keyed by logical names.
     * @returns {Object} Field map with normalised raw field ids.
     */
    normalizeRawFieldMap(fieldMap = {}) {
        return Object.fromEntries(
            Object.entries(fieldMap || {}).map(([fieldKey, fieldValue]) => [
                fieldKey,
                this.normalizeRawFieldId(fieldValue),
            ])
        );
    }

    /**
     * Normalises every view reference in a view map.
     * @param {Object} [viewMap={}] - View map keyed by logical names where each value is a view id or array of view ids.
     * @returns {Object} View map with normalised view ids (string or array).
     */
    normaliseViewMap(viewMap = {}) {
        return Object.fromEntries(
            Object.entries(viewMap || {}).map(([key, value]) => {
                if (Array.isArray(value)) {
                    const normalized = value.map((v) => this.normalizeViewId(v)).filter(Boolean);
                    // Return a single string (first normalized id) or empty string
                    return [key, normalized[0] || ''];
                }

                return [key, this.normalizeViewId(value) || ''];
            })
        );
    }

    /**
     * Returns the DOM wrapper for a Knack field inside a view.
     * @param {Element} viewRoot - Root element for the view.
     * @param {string|number} fieldId - Field id to resolve.
     * @returns {Element|null} Field wrapper element.
     */
    getFieldWrapper(viewRoot, fieldId) {
        if (!(viewRoot instanceof Element)) return null;
        const normalizedFieldId = this.normalizeFieldId(fieldId);
        if (!normalizedFieldId) return null;
        return viewRoot.querySelector(`#kn-input-${normalizedFieldId}`);
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

        const direct = Knack?.views?.[vid]?.model?.view;
        if (direct) {
            this._viewCache.set(vid, direct);
            return direct;
        }

        const scenes = Knack?.scenes?.models || [];
        for (const scene of scenes) {
            const views = scene?.views?.models || [];
            for (const viewModel of views) {
                if (viewModel?.attributes?.key === vid) {
                    this._viewCache.set(vid, viewModel.attributes);
                    return viewModel.attributes;
                }
            }
        }

        this._viewCache.set(vid, null);
        return null;
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
        const columnIndex = column ? columns.findIndex((candidate) => candidate === column) + 1 : 0;

        this._viewColumnIndexCache.set(cacheKey, columnIndex > 0 ? columnIndex : 0);
        return columnIndex > 0 ? columnIndex : 0;
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

        const viewElement = typeof document !== 'undefined'
            ? document.getElementById(normalizedViewId)
            : null;
        if (!(viewElement instanceof HTMLElement)) return 0;

        const headerCells = Array.from(viewElement.querySelectorAll('thead tr:last-child > th'));
        if (!headerCells.length) return 0;

        const resolvedColumn = this.getViewColumn(normalizedViewId, columnRef);
        const resolvedFieldId = this.normalizeFieldId(resolvedColumn?.field?.key || resolvedColumn?.id || columnRef);
        const resolvedHeader = this.normalizeViewColumnHeader(resolvedColumn?.header || columnRef);

        const matchingIndex = headerCells.findIndex((headerCell) => {
            if (!(headerCell instanceof HTMLElement)) return false;

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
        const key = this.normalizeFieldId(fieldKey);
        if (!key) return '';
        if (this._fieldTypeCache.has(key)) return this._fieldTypeCache.get(key);

        const fieldMeta = this.getFieldMeta(key);
        const fieldType = String(fieldMeta?.type || '').trim().toLowerCase();
        this._fieldTypeCache.set(key, fieldType);
        return fieldType;
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
