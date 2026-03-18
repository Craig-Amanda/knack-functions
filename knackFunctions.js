//Global Const
const CLASS_HIDDEN = 'ktlHidden';
const CLASS_DISPLAY_NONE = 'ktlDisplayNone';
const INPUT_CHECKBOX_SELECTOR = 'input[type="checkbox"]';
const INPUT_RADIO_SELECTOR = 'input[type="radio"]';
const INPUT_CHECKBOX_CHECKED_SELECTOR = `${INPUT_CHECKBOX_SELECTOR}:checked`;
const INPUT_RADIO_CHECKED_SELECTOR = `${INPUT_RADIO_SELECTOR}:checked`;
const HEADER_CHECKBOX_SELECTOR = 'th input[type="checkbox"]';
const CLASS_DISABLED = 'disabled';

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
        this._fieldMetaCache = new Map();
        this._fieldTypeCache = new Map();
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

/**
 * Knack field value resolver for display/raw/typed/API output modes.
 * Handles per-field-type normalization using Knack object metadata.
 */
class KnackValueResolver {
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
            const choiceValues = this.toStringArray(rawValue ?? sourceValue);
            return choiceValues.length <= 1 ? (choiceValues[0] ?? '') : choiceValues;
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
        const displayString = typeof displayValue === 'string' ? displayValue.trim() : '';

        if (fieldType === 'connection') {
            const ids = this.toConnectionIds(rawValue);
            if (!ids.length) return undefined;
            return ids.length === 1 ? ids[0] : ids;
        }

        if (fieldType === 'multiple_choice') {
            const values = this.toStringArray(rawValue ?? displayValue);
            return values.length ? values : undefined;
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
     * @returns {*} A type-aware request value, or undefined when the field should not be written.
     */
    toRequestValue({ rawValue, displayValue, fieldType }) {
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
            const values = this.toStringArray(sourceValue);
            if (!values.length) return undefined;
            return Array.isArray(sourceValue) ? values : (values[0] ?? undefined);
        }

        if (fieldType === 'boolean') {
            return this.toBooleanValue(sourceValue);
        }

        if (fieldType === 'number' || fieldType === 'currency') {
            return this.toNumberValue(sourceValue);
        }

        if (fieldType === 'date_time') {
            return this.toDateTimeRequestValue(rawValue, displayValue);
        }

        if (this.isStructuredFieldType(fieldType)) {
            const structuredValue = this.toStructuredValue(sourceValue, displayValue);
            return structuredValue === undefined ? undefined : structuredValue;
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
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (!item) return '';
                    if (typeof item === 'object') return String(item.id || item.record_id || item._id || '').trim();
                    return String(item || '').trim();
                })
                .filter(Boolean);
        }
        if (typeof value === 'object') {
            const id = String(value.id || value.record_id || value._id || '').trim();
            return id ? [id] : [];
        }
        const primitiveId = String(value || '').trim();
        return primitiveId ? [primitiveId] : [];
    }

    /**
     * Returns true when the field type is calculated or otherwise not suitable for direct writes.
     * @param {string} fieldType - Knack field type.
     * @returns {boolean} Whether the field should be omitted from POST/PUT payloads.
     */
    isReadOnlyFieldType(fieldType) {
        return ['auto_increment', 'equation', 'concatenation'].includes(String(fieldType || '').trim().toLowerCase());
    }

    /**
     * Returns true when the field uses a structured object value in `_raw` form.
     * @param {string} fieldType - Knack field type.
     * @returns {boolean} Whether the request should preserve object-like structure.
     */
    isStructuredFieldType(fieldType) {
        return ['date_time', 'name', 'address', 'phone', 'email', 'file', 'image', 'signature'].includes(String(fieldType || '').trim().toLowerCase());
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
        if (fieldType === 'connection') return 'array<object{id,identifier}>';
        if (fieldType === 'multiple_choice') return 'string|array<string>';
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
        if (fieldType === 'connection') return 'recordId|array<recordId>';
        if (fieldType === 'multiple_choice') return 'string|array<string>';
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
        if (Array.isArray(value)) {
            const first = value[0];
            const firstId = String(first?.id || first?.record_id || first?._id || '').trim();
            if (!firstId) return null;
            return {
                id: firstId,
                identifier: String(first?.identifier || '').trim()
            };
        }

        if (value && typeof value === 'object') {
            const id = String(value.id || value.record_id || value._id || '').trim();
            if (!id) return null;
            return {
                id,
                identifier: String(value.identifier || '').trim()
            };
        }

        return null;
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
 * @returns {{recordFieldId: string, dataCallbackName: string}} Parsed definition.
 */
function parseBulkActionDefinition(params, operation, options = {}) {
    const { resolveFieldId = (value) => knackNavigator.normalizeFieldId(value) } = options;
    const op = String(operation || '').toLowerCase() === 'update' ? 'update' : 'create';
    const third = params?.[2];
    const fourth = params?.[3];

    if (op === 'create') {
        return {
            recordFieldId: resolveFieldId(third),
            dataCallbackName: knackValueResolver.toStringSafe(fourth)
        };
    }

    const thirdAsField = resolveFieldId(third);
    if (third != null && !thirdAsField) {
        return {
            recordFieldId: '',
            dataCallbackName: knackValueResolver.toStringSafe(third)
        };
    }

    return {
        recordFieldId: thirdAsField,
        dataCallbackName: knackValueResolver.toStringSafe(fourth)
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

        actions.push({
            key: `${operation}:${formViewId}`,
            label,
            targetType: 'form',
            target: formViewId,
            operation,
            recordFieldId: parsed.recordFieldId || defaultRecordFieldId,
            dataCallback: resolvedDataCallback
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
 * Normalises stored basket items so each item has a valid string record id.
 * @param {Array<Object>} [items=[]] - Basket items to normalise.
 * @returns {Array<Object>} Normalised basket items.
 */
function bulkActionNormalizeBasketItems(items = []) {
    return (Array.isArray(items) ? items : [])
        .filter((item) => knackValueResolver.toStringSafe(item?.recordId))
        .map((item) => ({ ...item, recordId: knackValueResolver.toStringSafe(item.recordId) }));
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
        memory.items = envelope.items.slice();
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

    return document.getElementById(normalizedViewId)
        || document.querySelector(`#connection-form-view:has(input[value="${normalizedViewId}"])`);
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
    const recordPath = normalizedRecordId ? `/${normalizedRecordId}` : '';
    const queryParams = new URLSearchParams();

    Object.entries(params && typeof params === 'object' ? params : {}).forEach(([key, value]) => {
        const paramKey = knackValueResolver.toStringSafe(key);
        const paramValue = knackValueResolver.toStringSafe(value);
        if (!paramKey || !paramValue) return;
        queryParams.set(paramKey, paramValue);
    });

    const query = String(queryParams.toString() || '').trim();
    return `#${slug}${recordPath}${query ? `?${query}` : ''}`;
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
 * Captures the current visible and empty-field form payload for update replication.
 * @param {Object} [options={}] - Capture options.
 * @returns {void}
 */
function bulkActionCaptureEmptyFieldPayload({ sessionKey, viewElement, activeFormViewId = '' } = {}) {
    if (!(viewElement instanceof Element)) return;

    const latestState = bulkActionReadFormFlowState(sessionKey);
    if (!latestState) return;
    if (String(latestState.formMode || 'create').toLowerCase() !== 'update') return;

    const includeFieldKeys = bulkActionGetFormFieldKeys(viewElement);
    const submittedFieldPayload = bulkActionBuildVisibleFormRequestPayload(viewElement, includeFieldKeys, { includeEmpty: true });
    const emptyFieldPayload = bulkActionBuildVisibleEmptyFieldPayload(viewElement, includeFieldKeys);
    bulkActionMergeFormFlowState(sessionKey, {
        activeFormViewId: knackNavigator.normalizeViewId(activeFormViewId) || latestState.activeFormViewId || '',
        submittedFieldPayload,
        emptyFieldPayload,
        emptyFieldPayloadCapturedAt: Date.now()
    }, latestState);
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
 * Resolves write concurrency metadata for progress reporting and logging.
 * @param {Object} [api={}] - API client.
 * @param {number} [total=0] - Total queued writes.
 * @returns {{configured: number, atOnce: number, queueActive: number, queuedWrites: number, total: number}} Concurrency metadata.
 */
function bulkActionResolveApiConcurrency(api = {}, total = 0) {
    const normalizedTotal = Math.max(0, Number(total || 0));
    const queue = api?._writeQueue || {};
    const configured = queue.current === Infinity
        ? Infinity
        : Math.max(1, Math.floor(queue.current || api?.options?.writeConcurrency || 1));
    const atOnce = configured === Infinity
        ? normalizedTotal
        : Math.max(1, Math.min(normalizedTotal, configured));

    return {
        configured,
        atOnce,
        queueActive: Math.max(0, Number(queue.active || 0)),
        queuedWrites: Array.isArray(queue.queue) ? queue.queue.length : 0,
        total: normalizedTotal
    };
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

        try {
            if (mode === 'update') {
                await api.updateRecord(sceneId, apiViewId, targetId, operation.data);
            } else {
                await api.createRecord(sceneId, apiViewId, operation.data);
            }

            sourceStore?.removeItems?.([targetId]);
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
 * Resolves the writable field ids present in a form.
 * @param {*} viewRef - View id, key, element, or view object.
 * @returns {Array<string>} Form field ids.
 */
function bulkActionGetFormFieldKeys(viewRef) {
    const { viewElement, viewId } = bulkActionResolveViewContext(viewRef);
    const viewFieldIds = knackNavigator.getViewFieldIds(viewId);

    if (viewFieldIds.length) {
        return viewFieldIds;
    }

    if (!viewElement) return [];

    return bulkActionNormalizeFieldKeys(
        Array.from(viewElement.querySelectorAll(BULK_ACTION_DEFAULT_CONFIG.constants.selectors.formField))
            .map((element) => String(element.id || '').replace(/^kn-input-/, ''))
    );
}

/**
 * Returns true when a form field wrapper is visible to the user.
 * @param {*} element - Field wrapper candidate.
 * @returns {boolean} Whether the field is visible.
 */
function bulkActionIsVisibleFormField(element) {
    const resolvedElement = bulkActionResolveElement(element);
    if (!(resolvedElement instanceof Element)) return false;
    if (resolvedElement.hidden) return false;
    if (resolvedElement.closest(`.${CLASS_HIDDEN}, .${CLASS_DISPLAY_NONE}, [hidden], [aria-hidden="true"]`)) return false;

    const computedStyle = window.getComputedStyle ? window.getComputedStyle(resolvedElement) : null;
    if (computedStyle && (computedStyle.display === 'none' || computedStyle.visibility === 'hidden')) {
        return false;
    }

    return resolvedElement.getClientRects().length > 0;
}

/**
 * Returns true when a field wrapper contains a writable control.
 * @param {Element} fieldWrapper - Form field wrapper element.
 * @returns {boolean} Whether the field contains a writable control.
 */
function bulkActionHasWritableFormControl(fieldWrapper) {
    if (!(fieldWrapper instanceof Element)) return false;

    return Boolean(fieldWrapper.querySelector(BULK_ACTION_DEFAULT_CONFIG.constants.selectors.writableControl));
}

/**
 * Returns true when all writable controls in a field are empty.
 * @param {Element} fieldWrapper - Form field wrapper.
 * @param {string} [fieldType=''] - Knack field type.
 * @returns {boolean} Whether the field is empty.
 */
function bulkActionIsFormFieldEmpty(fieldWrapper, fieldType = '') {
    if (!(fieldWrapper instanceof Element)) return false;

    let sawWritableControl = false;

    const radioInputs = Array.from(fieldWrapper.querySelectorAll('input[type="radio"]:not([disabled])'));
    if (radioInputs.length) {
        sawWritableControl = true;
        return !radioInputs.some((input) => input.checked);
    }

    const checkboxInputs = Array.from(fieldWrapper.querySelectorAll('input[type="checkbox"]:not([disabled])'));
    if (checkboxInputs.length) {
        sawWritableControl = true;
        if (String(fieldType || '').trim().toLowerCase() === 'boolean' && checkboxInputs.length === 1) {
            return !checkboxInputs[0].checked;
        }
        return !checkboxInputs.some((input) => input.checked);
    }

    const selectInputs = Array.from(fieldWrapper.querySelectorAll('select:not([disabled])'));
    if (selectInputs.length) {
        sawWritableControl = true;
        const hasSelectedValue = selectInputs.some((select) => {
            if (select.multiple) {
                return Array.from(select.selectedOptions || []).some((option) => knackValueResolver.toStringSafe(option?.value).trim());
            }
            return knackValueResolver.toStringSafe(select.value).trim() !== '';
        });
        if (hasSelectedValue) return false;
    }

    const textInputs = Array.from(fieldWrapper.querySelectorAll(BULK_ACTION_DEFAULT_CONFIG.constants.selectors.textInput));
    if (textInputs.length) {
        sawWritableControl = true;
        if (textInputs.some((input) => knackValueResolver.toStringSafe(input.value).trim() !== '')) {
            return false;
        }
    }

    const richTextInput = fieldWrapper.querySelector(BULK_ACTION_DEFAULT_CONFIG.constants.selectors.richText);
    if (richTextInput instanceof Element) {
        sawWritableControl = true;
        if (knackValueResolver.toStringSafe(richTextInput.textContent).trim() !== '') {
            return false;
        }
    }

    // Distinguish between fields that are genuinely empty and wrappers that never exposed a writable control in the first place.
    return sawWritableControl;
}

/**
 * Returns the empty request value that should be written for a field type.
 * @param {Element} fieldWrapper - Form field wrapper.
 * @param {string} [fieldType=''] - Knack field type.
 * @returns {string|boolean|Array<string>} Empty request value.
 */
function bulkActionGetEmptyRequestValue(fieldWrapper, fieldType = '') {
    const normalizedFieldType = String(fieldType || '').trim().toLowerCase();

    if (normalizedFieldType === 'boolean') return false;

    if (normalizedFieldType === 'connection') {
        const selectInput = fieldWrapper instanceof Element ? fieldWrapper.querySelector('select') : null;
        return selectInput?.multiple ? [] : '';
    }

    if (normalizedFieldType === 'multiple_choice') {
        const selectInput = fieldWrapper instanceof Element ? fieldWrapper.querySelector('select') : null;
        const checkboxInputs = fieldWrapper instanceof Element
            ? fieldWrapper.querySelectorAll('input[type="checkbox"]:not([disabled])')
            : [];
        return selectInput?.multiple || checkboxInputs.length > 1 ? [] : '';
    }

    return '';
}

/**
 * Builds the structured request value expected by Knack date-time fields.
 * @param {Element} fieldWrapper - Date-time field wrapper.
 * @returns {string|Object} Date-time request value.
 */
function bulkActionBuildDateTimeRequestValue(fieldWrapper) {
    const parts = getDateTimeParts(fieldWrapper);
    const hasDate = knackValueResolver.toStringSafe(parts?.date);
    const hasTime = knackValueResolver.toStringSafe(parts?.time);
    if (!hasDate && !hasTime) return '';

    const parsed = parseDateTimeParts(parts);
    if (!parsed) {
        return hasDate && hasTime ? `${hasDate} ${hasTime}`.trim() : (hasDate || hasTime);
    }

    const hours24 = parsed.getHours();
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    const amPm = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = String((hours24 % 12) || 12).padStart(2, '0');

    return {
        date: parts.date,
        date_formatted: parts.date,
        hours: hours12,
        minutes,
        am_pm: amPm,
        time: `${hours12}:${minutes} ${amPm}`
    };
}

/**
 * Reads the current request-ready value from a visible form field.
 * @param {Element} fieldWrapper - Form field wrapper.
 * @param {string} [fieldType=''] - Knack field type.
 * @returns {*} Request-ready field value.
 */
function bulkActionReadFormFieldRequestValue(fieldWrapper, fieldType = '') {
    if (!(fieldWrapper instanceof Element)) return undefined;

    const normalizedFieldType = String(fieldType || '').trim().toLowerCase();

    if (normalizedFieldType === 'date_time') {
        return bulkActionBuildDateTimeRequestValue(fieldWrapper);
    }

    const radioInputs = Array.from(fieldWrapper.querySelectorAll('input[type="radio"]:not([disabled])'));
    if (radioInputs.length) {
        const checked = radioInputs.find((input) => input.checked);
        return checked ? checked.value : '';
    }

    const checkboxInputs = Array.from(fieldWrapper.querySelectorAll('input[type="checkbox"]:not([disabled])'));
    if (checkboxInputs.length) {
        if (normalizedFieldType === 'boolean' && checkboxInputs.length === 1) {
            return checkboxInputs[0].checked;
        }

        const checkedValues = checkboxInputs.filter((input) => input.checked).map((input) => input.value).filter((value) => value !== '');
        return checkboxInputs.length > 1 ? checkedValues : (checkedValues[0] || '');
    }

    const selectInput = fieldWrapper.querySelector('select:not([disabled])');
    if (selectInput instanceof HTMLSelectElement) {
        if (selectInput.multiple) {
            return Array.from(selectInput.selectedOptions || []).map((option) => option.value).filter((value) => knackValueResolver.toStringSafe(value) !== '');
        }
        return selectInput.value;
    }

    const textInput = fieldWrapper.querySelector(BULK_ACTION_DEFAULT_CONFIG.constants.selectors.textInput);
    if (textInput instanceof HTMLInputElement || textInput instanceof HTMLTextAreaElement) {
        return textInput.value;
    }

    const richTextInput = fieldWrapper.querySelector(BULK_ACTION_DEFAULT_CONFIG.constants.selectors.richText);
    if (richTextInput instanceof HTMLElement) {
        return richTextInput.innerHTML || richTextInput.textContent || '';
    }

    return undefined;
}

/**
 * Builds a request payload from the visible fields in a form.
 * @param {*} viewRef - View id, key, element, or view object.
 * @param {Array<string|number>} [includeFieldKeys=[]] - Field ids to include.
 * @param {Object} [options={}] - Payload options.
 * @returns {Object} Request payload.
 */
function bulkActionBuildVisibleFormRequestPayload(viewRef, includeFieldKeys = [], { includeEmpty = false } = {}) {
    const { viewElement } = bulkActionResolveViewContext(viewRef);
    const normalizedFieldKeys = bulkActionNormalizeFieldKeys(includeFieldKeys);

    if (!viewElement || !normalizedFieldKeys.length) return {};

    return normalizedFieldKeys.reduce((payload, fieldKey) => {
        const fieldWrapper = knackNavigator.getFieldWrapper(viewElement, fieldKey);
        const fieldType = knackValueResolver.getFieldType(fieldKey);

        if (!fieldWrapper || !bulkActionIsVisibleFormField(fieldWrapper) || !bulkActionHasWritableFormControl(fieldWrapper)) {
            return payload;
        }

        const requestValue = bulkActionReadFormFieldRequestValue(fieldWrapper, fieldType);
        if (requestValue === undefined) {
            return payload;
        }

        const isEmptyString = typeof requestValue === 'string' && requestValue === '';
        const isEmptyArray = Array.isArray(requestValue) && requestValue.length === 0;
        if (!includeEmpty && (isEmptyString || isEmptyArray)) {
            return payload;
        }

        payload[fieldKey] = requestValue;
        return payload;
    }, {});
}

/**
 * Builds a payload of visible fields that are currently empty.
 * @param {*} viewRef - View id, key, element, or view object.
 * @param {Array<string|number>} [includeFieldKeys=[]] - Field ids to inspect.
 * @returns {Object} Empty-field payload.
 */
function bulkActionBuildVisibleEmptyFieldPayload(viewRef, includeFieldKeys = []) {
    const { viewElement } = bulkActionResolveViewContext(viewRef);
    const normalizedFieldKeys = bulkActionNormalizeFieldKeys(includeFieldKeys);

    if (!viewElement || !normalizedFieldKeys.length) return {};

    return normalizedFieldKeys.reduce((payload, fieldKey) => {
        const fieldWrapper = knackNavigator.getFieldWrapper(viewElement, fieldKey);
        const fieldType = knackValueResolver.getFieldType(fieldKey);

        if (!fieldWrapper || !bulkActionIsVisibleFormField(fieldWrapper) || !bulkActionHasWritableFormControl(fieldWrapper)) {
            return payload;
        }

        if (!bulkActionIsFormFieldEmpty(fieldWrapper, fieldType)) {
            return payload;
        }

        payload[fieldKey] = bulkActionGetEmptyRequestValue(fieldWrapper, fieldType);
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
    const payload = knackValueResolver.buildRequestPayload(record, Array.isArray(includeFieldKeys) && includeFieldKeys.length ? includeFieldKeys : undefined);
    const exclude = new Set((Array.isArray(excludeFieldKeys) ? excludeFieldKeys : []).map((fieldKey) => knackNavigator.normalizeFieldId(fieldKey)).filter(Boolean));
    exclude.forEach((fieldKey) => delete payload[fieldKey]);
    return payload;
}

/**
 * Builds the base payload used when replicating a submitted form across basket items.
 * @param {Object} [options={}] - Replication payload options.
 * @returns {Object} Base replication payload.
 */
function bulkActionBuildReplicateBasePayload({ mode = 'create', bulkState = {}, formViewRef = null, record = null, includeFieldKeys = [], excludeFieldKeys = [] } = {}) {
    const dynamicPayload = bulkActionBuildDynamicRequestPayload(record, { includeFieldKeys, excludeFieldKeys });
    if (mode !== 'update') {
        return dynamicPayload;
    }

    const submittedFieldPayload = {
        ...bulkActionObjectOrEmpty(bulkState?.submittedFieldPayload),
        ...bulkActionBuildVisibleFormRequestPayload(formViewRef, includeFieldKeys, { includeEmpty: true })
    };
    const emptyFieldPayload = {
        ...bulkActionObjectOrEmpty(bulkState?.emptyFieldPayload),
        ...bulkActionBuildVisibleEmptyFieldPayload(formViewRef, includeFieldKeys)
    };

    return Object.keys(submittedFieldPayload).length
        ? {
            ...submittedFieldPayload,
            ...emptyFieldPayload
        }
        : {
            ...dynamicPayload,
            ...emptyFieldPayload
        };
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

    const rawReference = knackValueResolver.toConnectionRef(record?.[`${normalizedFieldKey}_raw`] ?? record?.[normalizedFieldKey]);
    if (rawReference?.id) return rawReference.id;
    return knackValueResolver.toStringSafe(record?.[normalizedFieldKey]);
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
    if (typeof document === 'undefined') return;
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

        const list = document.createElement('div');
        list.dataset.knackBulkBasketList = '1';
        list.className = 'knackBulkActionModalList';

        body.appendChild(meta);
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
    render({ items = [] } = {}) {
        const modal = document.getElementById(this.modalId);
        if (!modal) return;

        const meta = modal.querySelector('[data-knack-bulk-basket-meta="1"]');
        if (meta) {
            meta.textContent = `${items.length} item${items.length === 1 ? '' : 's'} in basket`;
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

    viewElement.querySelectorAll(`tbody .${rowCheckboxClass}`).forEach((checkbox) => {
        bulkActionGetRowCheckboxRecordId(checkbox);
    });
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
            this.labelById.set(recordId, this.bulkActionsApi.getRecordLabel(record, this.labelFieldIds) || recordId);
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

        return Array.from(viewElement.querySelectorAll(`tbody .${this.bulkActionConfig.selection.rowCheckboxClass}:checked`))
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

        return Array.from(viewElement.querySelectorAll(`tbody .${this.bulkActionConfig.selection.rowCheckboxClass}`)).find((checkbox) => {
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
        const availableActions = this.actions.filter((action) => action?.key);
        if (!availableActions.length) return null;

        if (this.activeActionKey) {
            const match = availableActions.find((action) => action.key === this.activeActionKey);
            if (match) return match;
        }

        return availableActions[0] || null;
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
     * Returns the action configuration shown in the basket modal.
     * @returns {Array<Object>} Modal action configuration.
     */
    getBasketActionConfigs() {
        const activeAction = this.resolveActiveAction();
        if (!activeAction) return [];

        return [{
            key: activeAction.key,
            label: activeAction.label,
            active: true,
            disabled: this.runState.isRunning || !this.basketItems.length
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
            this.basketModal.render({ items: this.basketItems });
            this.basketModal.renderActions(this.getBasketActionConfigs());
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
        viewElement.querySelectorAll(`tbody .${this.bulkActionConfig.selection.rowCheckboxClass}`).forEach((checkbox) => {
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

        const rowCheckboxes = Array.from(viewElement.querySelectorAll(`tbody .${this.bulkActionConfig.selection.rowCheckboxClass}`));
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

        const rowCheckboxes = Array.from(viewElement.querySelectorAll(`tbody .${this.bulkActionConfig.selection.rowCheckboxClass}`));
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

        bulkActionWriteFormFlowState(sessionKey, {
            sourceViewId: this.viewId,
            recordIds,
            actionKey: knackValueResolver.toStringSafe(action?.key),
            recordFieldId: action.recordFieldId || '',
            firstRecordLabel: knackValueResolver.toStringSafe(firstItem?.label),
            formMode: String(action.operation || 'create').toLowerCase() === 'update' ? 'update' : 'create',
            sceneSlug,
            navToken,
            createdAt: Date.now(),
            activeFormViewId: ''
        });

        this.replaceRunState({
            isRunning: true,
            total: recordIds.length,
            completionMessage: 'Waiting for form submission...'
        });

        if (String(action.operation || '').toLowerCase() === 'update') {
            bulkActionNavigateToSceneSlug(sceneSlug, { recordId: firstRecordId, params: { coBulkToken: navToken } });
            return;
        }

        bulkActionNavigateToSceneSlug(sceneSlug, { params: { coBulkToken: navToken } });
    }

    /**
     * Runs the selected bulk action.
     * @param {string} actionKey - Action key to run.
     * @returns {Promise<void>}
     */
    async runAction(actionKey) {
        const action = this.actions.find((candidate) => knackValueResolver.toStringSafe(candidate?.key) === knackValueResolver.toStringSafe(actionKey));
        if (!action || this.runState.isRunning) return;

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
        ? knackValueResolver.toStringSafe(record?.id) || recordIds[0] || ''
        : bulkActionResolveConnectionFieldRecordId(record, recordFieldId) || recordIds[0] || '';

    const formViewRef = options.formViewId || action.target;
    const includeFieldKeys = mode === 'update' ? bulkActionGetFormFieldKeys(action.target) : [];
    const excludeFieldKeys = mode === 'create' && recordFieldId ? [recordFieldId] : [];
    const basePayload = bulkActionBuildReplicateBasePayload({
        mode,
        bulkState,
        formViewRef,
        record,
        includeFieldKeys,
        excludeFieldKeys
    });

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

    const sceneId = knackNavigator.normalizeSceneId(action?.sceneId || knackNavigator.getSceneInfoForView(action?.target)?.key);
    const apiViewId = knackNavigator.normalizeViewId(action?.target);
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

    const onBatchProgress = (progress = {}) => {
        if (!sourceController) return;

        const targetId = mode === 'update'
            ? knackValueResolver.toStringSafe(progress.recordId)
            : knackValueResolver.toStringSafe(preparedOperations[Number(progress.index)]?.id);

        if (targetId && !progress.error) {
            sourceStore.removeItems([targetId]);
        }

        if (targetId && progress.error) {
            failedIds.push(targetId);
            sourceController.setBasketItemFailure(targetId, progress.error);
            bulkActionReportError(progress.error, { sourceViewId, targetViewId: apiViewId, targetId, mode }, 'Bulk form replicate failed', options);
        }

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
    const concurrencyInfo = bulkActionResolveApiConcurrency(apiClient, preparedOperations.length);
    bulkActionLog('Starting bulk form replication', {
        mode,
        sourceViewId,
        targetViewId: apiViewId,
        totalSelected: recordIds.length,
        alreadyProcessed: processedRecordId ? 1 : 0,
        queuedForReplication: preparedOperations.length,
        preparationFailures: preparationFailedIds.length,
        method: canUseBatchApi ? 'batch-api' : 'fallback-sequential',
        apiSource: apiClient._source || 'unknown',
        concurrencyConfigured: concurrencyInfo.configured,
        recordsAtOnce: canUseBatchApi ? concurrencyInfo.atOnce : 1,
        queueActive: concurrencyInfo.queueActive,
        queuedWritesAhead: concurrencyInfo.queuedWrites
    });

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
                options
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

    $(document).on(viewRenderEvent, function (_, view) {
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
            activeFormViewId: renderedViewId
        }, bulkState);

        bulkActionRenderFormNotice({
            viewElement,
            bulkState,
            messages: action?.messages?.formReplicate || {},
            noticeClass: config.form.noticeClass
        });

        if (String(bulkState.formMode || 'create').toLowerCase() === 'update') {
            const form = viewElement.querySelector('form');
            if (form && !form.dataset.knackBulkEmptyCaptureBound) {
                const captureFormFieldPayload = () => bulkActionCaptureEmptyFieldPayload({
                    sessionKey,
                    viewElement,
                    activeFormViewId: renderedViewId
                });

                form.addEventListener('input', captureFormFieldPayload, true);
                form.addEventListener('change', captureFormFieldPayload, true);
                form.addEventListener('submit', captureFormFieldPayload, true);
                form.dataset.knackBulkEmptyCaptureBound = 'true';

                window.setTimeout(captureFormFieldPayload, 0);
            }
        }

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
        const tokenVerifiedAt = Number(bulkState.tokenVerifiedAt || 0);
        const tokenVerifiedRecently = tokenVerifiedAt && Date.now() - tokenVerifiedAt < config.constants.formFlowTtlMs;
        if ((!stateToken || !hashToken || stateToken !== hashToken) && !tokenVerifiedRecently) return;

        const submitViewId = knackNavigator.normalizeViewId(view?.key);
        const activeFormViewId = knackNavigator.normalizeViewId(bulkState.activeFormViewId || formViewId);
        if (activeFormViewId && submitViewId !== activeFormViewId) return;

        bulkActionClearFormFlowState(sessionKey);

        const resolvedApi = bulkActionResolveReplicationApi(config.action.api);
        const mode = String(bulkState.formMode || 'create').toLowerCase() === 'update' ? 'update' : 'create';
        const hasRequiredApi = mode === 'update'
            ? (typeof resolvedApi.updateRecords === 'function' || typeof resolvedApi.updateRecord === 'function')
            : (typeof resolvedApi.createRecords === 'function' || typeof resolvedApi.createRecord === 'function');
        if (!hasRequiredApi) {
            bulkActionNotify(`Bulk action API callbacks are missing ${mode} handlers.`, 'error', config.action);
            return;
        }

        const actionWithApi = {
            ...action,
            sceneId: knackNavigator.getSceneInfoForView(submitViewId)?.key || '',
            bulkActionsApi: KnackBulkActions
        };

        try {
            const result = await replicateBulkActionSubmittedRecord({
                action: actionWithApi,
                bulkState: { ...bulkState, namespace },
                record,
                api: resolvedApi,
                options: { ...config.action, namespace, formViewId: submitViewId }
            });

            const successCount = Math.max(0, Number(result?.total || 0) - Number(result?.failedIds?.length || 0));
            if (result?.failedIds?.length) {
                bulkActionNotify(`Completed ${successCount} item(s); ${result.failedIds.length} failed.`, 'warning', config.action);
            } else {
                bulkActionNotify(`Completed ${successCount} item(s).`, 'success', config.action);
            }
        } catch (error) {
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

/**
 * Gets an element by ID scoped to an optional context.
 * @param {string|number} id - The ID of the element, with or without leading '#'.
 * @param {Object} [options] - Optional parameters.
 * @param {string|HTMLElement} [options.context] - The context to scope the search to. Can be a selector or an element. Defaults to `document`.
 * @returns {HTMLElement|null} The found element or null if not found.
 */
function getById(id, { context } = {}) {
    if (!id && id !== 0) return null;
    const root = context ? resolveElement(context) : document;
    if (!root) return null;
    const idStr = String(id).replace(/^#/, '');
    if (root === document && typeof document.getElementById === 'function') {
        return document.getElementById(idStr);
    }
    // For element roots use querySelector to scope the lookup
    try {
        return root.querySelector(`[id="${idStr.replace(/"/g, '\\"')}"]`);
    } catch (e) {
        return null;
    }
}

/**
 * Extracts id and identifier from a Knack connection value.
 * @param {Array|Object|null|undefined} value - Connection field value
 * @returns {{id: string, identifier: string}|null} Extracted reference or null
 * @example
 * const ref = getConnectionRef(record.field_1234_raw);
 * const name = ref ? ref.identifier : '';
 */
const getConnectionRef = (value) => {
    return knackValueResolver.toConnectionRef(value);
};

//jQuery extensions - BEGIN
//Searches a selector for text like : contains, but with an exact match, and after a spaces trim.
$.expr[':'].textEquals = function (el, i, m) {
    let searchText = m[3];
    let elementText = $(el).text().replace('*', '').trim(); //Remove * for Required fields.
    return elementText === searchText;
}

const evaluate = a => operator => b => { //an example of currying evaluate(oxygenField)('<')(90))
    switch (operator) {
        case '+': return a + b;
        case '-': return a - b;
        case '/': return a / b;
        case '*': return a * b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '==': return a == b;
        case '===': return a === b;
        case '!=': return a != b;
        case '!==': return a !== b;
        case '%': return a % b;
        default: return 'Invalid operation';
    }
}

/** Get a finite number from an input element (or selector).
 * If `stripNonNumeric` is true, all characters except digits, '.', '+', and '-' are removed before parsing.
 * Returns NaN if the element is missing or the result is not a finite number.
 * @param {string|HTMLElement} selOrEl - A CSS selector string or an element with a `.value` property.
 * @param {boolean} [stripNonNumeric=false] - Whether to strip non-numeric characters before parsing.
 * @returns {number} A finite number, or NaN if parsing fails.*/
function getNumericValue(selOrEl, stripNonNumeric = false) {
    let el;

    if (typeof selOrEl === 'string') {
        el = document.querySelector(selOrEl);
        if (!el) return NaN;
    } else if (selOrEl && typeof selOrEl === 'object' && 'value' in selOrEl) {
        el = selOrEl;
    } else {
        return NaN;
    }

    const raw = String(el.value ?? '').trim();
    const cleaned = stripNonNumeric ? raw.replace(/[^\d.+-]/g, '') : raw;
    const n = Number(cleaned);

    return Number.isFinite(n) ? n : NaN;
}

/**
 * Show or hide one or more elements.
 * @param {Element|NodeList|string|Array} elements - DOM element(s), selector, or array of elements/selectors.
 * @param {boolean} show - true to show, false to hide.
 */
function setVisibility(elements, show) {
    if (typeof elements === 'string') elements = document.querySelectorAll(elements);
    if (elements instanceof Element) elements = [elements];
    if (NodeList.prototype.isPrototypeOf(elements) || Array.isArray(elements)) {
        elements.forEach(el => {
            if (el) el.style.display = show ? '' : 'none';
        });
    }
}

/**
 * Show or hide elements based on a condition.
 * @param {Element|NodeList|string|Array} elements - DOM element(s), selector, or array of elements/selectors.
 * @param {Function|boolean} condition - Boolean or function returning boolean.
 */
function showIf(elements, condition) {
    const result = (typeof condition === 'function') ? condition() : condition;
    setVisibility(elements, !!result);
}

/**
 * Toggle element(s) visibility based on a condition.
 * @param {Element|NodeList|string|Array} elements - DOM element(s), selector, or array of elements/selectors.
 * @param {Function|boolean} [condition] - If provided, toggles to that state; if omitted, toggles current state.
 */
function toggleVisibility(elements, condition) {
    if (typeof elements === 'string') elements = document.querySelectorAll(elements);
    if (elements instanceof Element) elements = [elements];
    if (NodeList.prototype.isPrototypeOf(elements) || Array.isArray(elements)) {
        elements.forEach(el => {
            if (!el) return;
            let show;
            if (typeof condition === 'undefined') {
                show = el.style.display === 'none';
            } else {
                show = (typeof condition === 'function') ? condition() : !!condition;
            }
            el.style.display = show ? '' : 'none';
        });
    }
}

/**
 * Find an element by its text content within a given selector.
 * @param {string} selector - CSS selector to search within.
 * @param {string} text - Text content to match.
 * @param {boolean} [exact=true] - If true, match exact text; if false, match partial (includes).
 * @returns {Element|undefined} The first matching element, or undefined if not found.
 */
function getElementByText(selector, text, exact = true) {
    const elements = document.querySelectorAll(selector);
    return Array.from(elements).find(el => {
        const content = el.textContent.trim();
        return exact ? content === text : content.includes(text);
    });
}

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
                    <input type="url" id="ql-link-url" placeholder="https://example.com" value="${url}" required>
                    <small>
                        If you omit https:// it will be added automatically.
                    </small>
                </label>
                <label>
                    Link Text:
                    <input type="text" id="ql-link-label" placeholder="Link text" value="${label}" required>
                </label>
            `;
            unlinkBtn.style.display = '';
        } else if (type === 'image') {
            title.textContent = 'Insert Image';
            fields.innerHTML = `
                <label>
                    Image URL:
                    <input type="url" id="ql-image-url" placeholder="https://example.com/image.jpg" value="${url}" required>
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
                    let savedRange = quill.getSelection();

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
                        const isEmpty = !content || content.replace(/<[^>]+>/g, '').trim() === '';                        textarea.value = isEmpty ? '' : content;
                        if (knackEditor) {
                            knackEditor.innerHTML = isEmpty ? '' : content;
                        }
                        // Trigger events to notify Knack
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        textarea.blur();
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
            const revertContainer = container.querySelectorAll ? container : document;
            revertContainer.querySelectorAll('.redactor-editor')
                .forEach(editor => editor.classList.remove(CLASS_HIDDEN));
            revertContainer.querySelectorAll('.my-react-editor')
                .forEach(div => div.remove());
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

/**
 * Adds a "View More / View Less" toggle to table cells in a given view and field(s) if their text exceeds a threshold.
 * @param {string} viewId - The ID of the view containing the table.
 * @param {Object} fieldThresholds - Object where keys are character thresholds and values are arrays of field IDs.
 *   Example: { 75: [4907, 4915], 120: [4920] }
 */
function truncateColumnsInGrid(viewId, fieldThresholds) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    // Iterate over each threshold and its associated field IDs
    Object.entries(fieldThresholds).forEach(([thresholdStr, fieldIds]) => {
        const threshold = parseInt(thresholdStr, 10);
        const ids = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
        ids.forEach(fieldId => {
        const selector = `td.field_${fieldId}`;
        const tempDiv = document.createElement('div');
        viewElement.querySelectorAll(selector).forEach(container => {
            const fullHTML = container.innerHTML;

            // Replace <br> and block tags with a space before extracting text
            let htmlWithSpaces = fullHTML
                .replace(/<\/(p|div|li|h[1-6]|tr|td|th)>/gi, ' ')
                .replace(/<(p|div|li|h[1-6]|tr|td|th)[^>]*>/gi, ' ')
                .replace(/<\/(p|div|li|h[1-6]|tr|td|th)>/gi, ' ')
                .replace(/<(ul|ol|table|thead|tbody|tfoot|section|article)[^>]*>/gi, ' ');

            // Create a temporary element to get textContent with spaces
            tempDiv.innerHTML = htmlWithSpaces;
            const textContent = tempDiv.textContent;

            if (textContent.length > threshold) {
                const truncatedText = textContent.substring(0, threshold) + '...';
             const truncatedSpan = document.createElement('span');
                    truncatedSpan.textContent = truncatedText;

                    const fullSpan = document.createElement('span');
                    fullSpan.innerHTML = fullHTML;
                    fullSpan.style.display = 'none';

                    const toggleLink = document.createElement('a');
                    toggleLink.href = '#';
                    toggleLink.className = 'text-expand';
                    toggleLink.textContent = 'View More';

                    toggleLink.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent cell click event
                        const isHidden = fullSpan.style.display === 'none';
                        fullSpan.style.display = isHidden ? '' : 'none';
                        truncatedSpan.style.display = isHidden ? 'none' : '';
                        toggleLink.textContent = isHidden ? 'View Less' : 'View More';
                    });

                    // Clear and append
                    container.innerHTML = '';
                    container.appendChild(truncatedSpan);
                    container.appendChild(fullSpan);
                    container.appendChild(document.createTextNode(' '));
                    container.appendChild(toggleLink);
                }
            });
        });
    });
}

/**
 * Selects all text in input elements when they receive focus
 * @param {string} viewId - The ID of the view containing input elements to modify
 * @param {string} [selector='.kn-input-number input'] - Optional CSS selector to target specific inputs within the view
 */
function selectTextOnFocus(viewId, selector = '.kn-input-number input') {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const inputs = viewElement.querySelectorAll(selector);

    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            // Use setTimeout to ensure selection happens after the browser's default focus behavior
            setTimeout(() => {
                this.select();
            }, 0);
        });
    });
}

/**
 * Simple debounce function to prevent rapid consecutive calls
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Resolves a selector string or Element into an Element (or null).
 * @param {string|Element|null|undefined} input - Selector or Element
 * @returns {Element|null}
 */
function resolveElement(input) {
    if (!input) return null;
    if (typeof input === 'string') return document.querySelector(input);
    if (input instanceof Element) return input;
    return null;
}

/**
 * Resolves a selector string, Element, NodeList, or Array into an array of Elements.
 * @param {string|Element|NodeList|Array<Element>|null|undefined} input
 * @returns {Element[]}
 */
function resolveElements(input) {
    if (!input) return [];

    if (typeof input === 'string') {
        return Array.from(document.querySelectorAll(input));
    }

    if (input instanceof Element) {
        return [input];
    }

    if (NodeList.prototype.isPrototypeOf(input) || Array.isArray(input)) {
        return Array.from(input).filter((el) => el instanceof Element);
    }

    return [];
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
 * Updates the "Add Option" button and default value for a Knack select field.
 * @param {HTMLElement} fieldEle - The field container element
 * @param {string} btnStr - The button label
 * @param {string} defaultVal - The default value for the select
 * @param {boolean} disableInitially - Whether to disable the button initially
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
            // Enable when user interacts with the select field
            const enableButton = () => {
                addOption.classList.remove(CLASS_DISABLED);
            };

            // Listen for multiple interaction events to ensure button gets enabled
            container.addEventListener('click', enableButton);

            // Also listen for the Chosen dropdown opening
            const searchInput = container.querySelector('.chzn-search input');
            if (searchInput) {
                searchInput.addEventListener('focus', enableButton);
                searchInput.addEventListener('input', enableButton);
            }

            // Listen for changes on the actual select element
            const select = fieldEle.querySelector('select');
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

    // Set default value for the select
    if (defaultOpt) {
        defaultOpt.value = defaultVal;
    }

    // Add event listener for registration handler (one-time)
    addOption.addEventListener('mousedown', function handler(e) {
        waitSelector({ selector: 'li.kn-form-col', timeout: 3000 })
            .then(() => registrationHandler(e));
        addOption.removeEventListener('mousedown', handler);
    }, { once: true });
};

/** Get value from a detail field
 * @param {string} fieldID - ID of the field where the value is located.
 * @param {boolean} [returnHtml=false] - Whether to return HTML instead of plain text.
 * @returns {string|null} - The text or HTML content of the specified field. */
function getValueFromDetailBody(fieldID, returnHtml = false) {
    const fieldElement = document.querySelector(`.field_${fieldID} .kn-detail-body`);

    if (!fieldElement) {
        console.log(`Error: Element with field_${fieldID} not found.`);
        return null;
    }

    return returnHtml ? fieldElement.innerHTML.trim() : fieldElement.textContent.trim();
}

/**
 * Finds the index(es) of column header(s) in a table based on field ID(s)
 * @param {HTMLElement} viewElement - The parent view element containing the table
 * @param {number|string|Array<number|string>} fieldIds - One or more Knack field IDs to search for in the header
 * @returns {number|Array<number>} The zero-based index(es) of the column header(s), or -1 if not found
 * @example
 * const viewElement = document.getElementById('view_123');
 * const [colA, colB] = getIndexOfColumnHeader(viewElement, [1507, 1508]);
 * const colSingle = getIndexOfColumnHeader(viewElement, 1507);
 */
function getIndexOfColumnHeader(viewElement, fieldIds) {
    if (!viewElement) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: viewElement is undefined'), { fieldIds });
        return Array.isArray(fieldIds) ? fieldIds.map(() => -1) : -1;
    }
    if (typeof fieldIds === 'undefined' || fieldIds === null) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: fieldIds is undefined or null'), { viewElement });
        return -1;
    }

    const headerRow = viewElement.querySelector('table thead tr');
    if (!headerRow) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: headerRow not found'), { viewElement, fieldIds });
        return Array.isArray(fieldIds) ? fieldIds.map(() => -1) : -1;
    }

    // Support single fieldId or array of fieldIds
    if (Array.isArray(fieldIds)) {
        return fieldIds.map(fieldId =>
            Array.from(headerRow.children).findIndex(child => child.classList.contains(`field_${fieldId}`))
        );
    }
    return Array.from(headerRow.children).findIndex(child => child.classList.contains(`field_${fieldIds}`));
}

/** Retrieves the rows of a table's tbody within a specified view and applies a callback to each row.
 * @param {string} viewId - The ID of the Knack view containing the table
 * @param {Function} callback - Function to execute on each row. Receives (index, rowElement) as arguments
 * @param {boolean} [includeHeader=false] - Whether to include header rows in the processing
 * @param {boolean} [includeGroup=false] - Whether to include group rows in the processing
 * @returns {void}
 * @example
 * getTableRows('view_123', (index, row) => {
 *   console.log(`Processing row ${index}:`, row);
 * }, true, false);
 */
function getAllTableRows(viewId, callback, includeHeader = false, includeGroup = false, excludeSelector = null) {
    if (!viewId) return;

    const tableElement = document.querySelector(`#${viewId} table`);
    if (!tableElement) return;

    // Start with body rows (excluding group rows)
    let tableRows = Array.from(tableElement.querySelectorAll('tbody tr:not(.kn-table-group)'));

    // Include header rows if specified
    if (includeHeader) {
        const headerRows = Array.from(tableElement.querySelectorAll('thead tr'));
        tableRows = [...headerRows, ...tableRows];
    }

    // Include group rows if specified
    if (includeGroup) {
        const groupRows = Array.from(tableElement.querySelectorAll('tbody tr.kn-table-group'));
        tableRows = [...tableRows, ...groupRows];
    }

    // Exclude rows matching the excludeSelector if provided
    if (excludeSelector) {
        tableRows = tableRows.filter(row => !row.matches(excludeSelector));
    }

    // Iterate over each row and execute the callback
    tableRows.forEach((row, index) => {
        callback(index, row);
    });
}

/**
 * Returns the scene metadata for a given view id.
 * Falls back to scanning scenes if direct lookup is missing.
 *
 * @param {string} viewId - Knack view id (with or without `view_` prefix)
 * @returns {{ key: string, slug: (string|null) }|null} Scene info or null if not found
 */
function getSceneFromViewId(viewId) {
    if (!viewId) return null;
    const vid = knackNavigator.normalizeViewId(viewId);

    const directScene = Knack?.views?.[vid]?.model?.view?.scene;
    if (directScene?.key) {
        const key = knackNavigator.normalizeSceneId(directScene.key);
        const slug = directScene.slug ? String(directScene.slug) : null;
        return { key, slug };
    }

    const scenes = Knack?.scenes?.models || [];
    for (const scene of scenes) {
        const views = scene?.views?.models || [];
        for (const v of views) {
            if (v?.attributes?.key === vid) {
                const key = knackNavigator.normalizeSceneId(scene?.attributes?.key) || null;
                if (!key) return null;
                const slug = scene?.attributes?.slug ? String(scene.attributes.slug) : null;
                return { key, slug };
            }
        }
    }

    return null;
}

/**
 * Normalises text for reliable comparisons:
 * - converts to string
 * - converts <br> / <br/> to a space
 * - strips any remaining HTML tags
 * - lowercases
 * - removes ALL whitespace (spaces, tabs, newlines)
 * @param {string} value - The text to normalize.
 * @returns {string} The normalized text.
 */
//ANCHOR - Helpers - Text Normalization
function normaliseText(value) {
    const str = String(value ?? '');

    return str
        .replace(/<br\s*\/?>/gi, ' ')     // treat <br> as a space
        .replace(/<[^>]*>/g, '')         // strip other tags
        .toLowerCase()
        .replace(/\s+/g, '');            // remove all whitespace
}

/**
 * Applies menu-based filters to any target view with app-configurable behavior.
 * Designed for generic use across table/list/details/calendar targets.
 *
 * @param {object} params
 * @param {string|number} params.menuViewId - Source menu view id.
 * @param {string|number} params.targetViewId - Target view id to filter.
 * @param {Array<object>} [params.rules=[]] - Rule list keyed by button text.
 * @param {object} [params.app={}] - App-specific behavior configuration.
 * @param {string} [params.app.namespace='kf'] - Namespace for data attributes / wire marker.
 * @param {string} [params.app.linkSelector='a'] - Link selector within menu view.
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
 * @param {(ctx: { targetId: string, filter: object|null, page: number }) => void} [params.app.onBeforeApply]
 * @param {(ctx: { targetId: string, filter: object|null, page: number, targetType: string }) => void} [params.app.onAfterApply]
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

    const ruleMap = new Map(
        (Array.isArray(rules) ? rules : [])
            .map((rule) => [String(rule?.buttonText || '').trim(), rule])
            .filter(([label]) => Boolean(label))
    );
    if (!ruleMap.size) return;

    const targetViewKey = targetId.replace('view_', '');
    const wireAttr = `data-${config.namespace}-menu-filter-wired`;
    let hasAppliedOnce = false;

    const getTargetViewContext = () => {
        const targetView = Knack?.views?.[targetId];
        const targetModel = targetView?.model || Knack?.models?.[targetId];
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

    const applyFilterInPlace = (filter, page = 1) => {
        const sceneHash = Knack.getSceneHash();
        const query = filter && Array.isArray(filter.rules) && filter.rules.length
            ? `view_${targetViewKey}_filters=${encodeURIComponent(JSON.stringify(filter))}&view_${targetViewKey}_page=${page}`
            : `view_${targetViewKey}_page=${page}`;

        if (typeof config.onBeforeApply === 'function') {
            try { config.onBeforeApply({ targetId, filter, page }); } catch (_) {}
        }

        if (config.syncHash) {
            Knack.router.navigate(query ? `${sceneHash}?${query}` : sceneHash, false);
            Knack.setHashVars();
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
                        try { config.onAfterApply({ targetId, filter, page, targetType }); } catch (_) {}
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

    const links = Array.from(viewElement.querySelectorAll(linkSelector));
    links.forEach((link) => {
        const text = link.textContent?.trim();
        if (!text || !ruleMap.has(text)) return;

        const rule = ruleMap.get(text);
        const fieldId = rule?.fieldId ? knackNavigator.normalizeFieldId(rule.fieldId) : '';
        const operator = String(rule?.operator || '').trim();
        const value = rule?.value;
        const page = Number.isFinite(Number(rule?.page)) ? Number(rule.page) : 1;
        const filter = buildFilterFn({ rule, fieldId, operator, value });

        if (!filter) {
            link.setAttribute('href', buildHref(''));
            link.dataset.filterTarget = targetId;
            link.dataset.filter = '';
            link.dataset.filterPage = String(page);
            return;
        }

        const filterParam = encodeURIComponent(JSON.stringify(filter));
        const query = `view_${targetViewKey}_filters=${filterParam}&view_${targetViewKey}_page=${page}`;
        link.setAttribute('href', buildHref(query));
        link.dataset.filterTarget = targetId;
        link.dataset.filter = JSON.stringify(filter);
        link.dataset.filterPage = String(page);
    });

    if (viewElement.getAttribute(wireAttr) === 'true') return;

    viewElement.addEventListener('click', (event) => {
        const link = event.target.closest(linkSelector);
        if (!link || link.dataset.filterTarget !== targetId) return;

        event.preventDefault();
        if (config.stopPropagation) {
            event.stopPropagation();
        }
        if (config.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        }

        const page = Number(link.dataset.filterPage) || 1;
        const filterJson = link.dataset.filter || '';
        const filter = filterJson ? JSON.parse(filterJson) : null;

        applyFilterInPlace(filter, page);

        if (config.buttonSelector) {
            viewElement.querySelectorAll(config.buttonSelector).forEach((btn) => {
                btn.classList.remove(config.activeClass);
            });
            link.classList.add(config.activeClass);
        }
    }, !!config.captureClick);

    viewElement.setAttribute(wireAttr, 'true');
}

function ensureMenuButtonActiveStyles() {
    if (document.getElementById('kf-menu-button-active-style')) return;

    const style = document.createElement('style');
    style.id = 'kf-menu-button-active-style';
    style.textContent = `
        .kf-menu-button.is-active {
            border-color: rgba(0, 0, 0, 0.45) !important;
            filter: brightness(0.92);
            transform: translateY(1px);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Render menu buttons inside a menu view.
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {Array<{label: string, id?: string, isActive?: boolean, className?: string, colors?: {baseColor?: string, activeColor?: string, textColor?: string}, data?: Record<string, string>}>} [options.menuItems=[]]
 * @param {string} [options.buttonClass=''] - Optional class to apply to every generated button (in addition to default classes)
 * @returns {void}
 * @example
 * renderMenuButtons({
 *   root,
 *   menuItems: [
 *   { label: 'All Platforms', isActive: true, colors: { baseColor: 'var(--knack-color-secondary)', activeColor: 'var(--knack-color-primary)' } },
 *   { label: 'Prime', id: 'rec123' }
 *   ],
 *   buttonClass: 'my-custom-button-class'
 * });
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
    const fragment = document.createDocumentFragment();
    const globalCustomClass = String(buttonClass || '').trim();

    (Array.isArray(menuItems) ? menuItems : []).forEach((item) => {
        const label = String(item?.label || '').trim() || 'Menu';
        if (!label) return;

        const menuItem = document.createElement('li');
        menuItem.className = 'kf-menu-item menu-links__list-item';

        const link = document.createElement('a');
        const extraClass = String(item?.className || '').trim();
        link.className = `${linkClassName} kn-button kf-menu-button${globalCustomClass ? ` ${globalCustomClass}` : ''}${extraClass ? ` ${extraClass}` : ''}`;
        link.textContent = label;
        link.href = '#';

        if (item?.isActive) link.classList.add('is-active');
        if (item?.id) link.dataset.platformId = String(item.id);

        if (item?.data && typeof item.data === 'object') {
            Object.entries(item.data).forEach(([key, value]) => {
                if (!key) return;
                link.dataset[key] = String(value);
            });
        }

        const colors = item?.colors;

        if (colors?.baseColor) {
            link.style.setProperty('--kf-menu-color', colors.baseColor);
            link.style.setProperty('--kf-menu-color-active', colors.activeColor || colors.baseColor);
            if (colors.textColor) link.style.setProperty('--kf-menu-text-color', colors.textColor);
        }

        menuItem.appendChild(link);
        fragment.appendChild(menuItem);
    });

    list.appendChild(fragment);
}

/** Update button color on form completion
 * @param {string} completedField - The field containing completed forms
 * @param {object} mappingObject - The mapping object for view IDs
 * @param {string} buttonColour - The color to set for the button */
function updateButtonColourOnFormComplete(completedField, mappingObject, buttonColour) {
    const formsCompleted = getValueFromDetail(completedField);
    if (!formsCompleted || !formsCompleted.length) return;

    const formsCompletedArray = formsCompleted.split(',');
    for (const form of formsCompletedArray) {
        const viewId = mappingObject[form.trim()];
        if (viewId) {
            ktl.core.waitSelector(`#view_${viewId} .view-header:has(.ktlHideShowButton), #view_${viewId} a.knViewLink`).then(() => {
                $(`#view_${viewId} .view-header:has(.ktlHideShowButton), #view_${viewId} a.knViewLink`).css('background-color', buttonColour);
            }).catch(error => {
                console.error(`Error waiting for selector in view_${viewId}:`, error);
            });
        }
    }
}

function removeElement (selector) {

    if (Array.isArray(selector)) {
        selector.forEach((element) => {
            removeElement(element);
        });
        return;
    }

    // Check if the selector is a jQuery object
    const element = selector instanceof jQuery ? selector : $(selector);
    element.remove();
};

function addClassToSelector (selector, classes) {
    if (Array.isArray(selector)) {
        selector.forEach((element) => {
            addClassToSelector(element, classes);
        });
        return;
    }

    const element = selector instanceof jQuery ? selector : $(selector);
    element.addClass(classes);
    return element;
};

function removeClassFromSelector (selector, classes) {
    if (Array.isArray(selector)) {
        selector.forEach((element) => {
            removeClassFromSelector(element, classes);
        });
        return;
    }

    const element = selector instanceof jQuery ? selector : $(selector);
    element.removeClass(classes);
    return element;
};

//Keydown event, with the convenient F2 as an example to debug or do other action.
$(document).keydown(function (e) {
    if (e.keyCode === 113) { // F2
        debugger;
    }
});

function escapeHTML(text) {
    return text.replace(/[&<>"']/g, function (match) {
        return `&#${match.charCodeAt(0)};`;
    });
}

/** Get checked row IDs from the grid
 * @param {string} viewId
 * @returns {string[]} Array of checked row IDs. */
function getCheckedRowIds(viewId) {
    return $(`#${viewId} tbody ${INPUT_CHECKBOX_CHECKED_SELECTOR}`).map(function() {
        return $(this).closest('tr').attr('id');
    }).get();
}

/** Get checked rows from the grid
 * @param {string} viewId
 * @returns {JQuery<HTMLElement>[]} Array of checked rows. */
function getCheckedRows(viewId) {
    return $(`#${viewId} tbody ${INPUT_CHECKBOX_CHECKED_SELECTOR}`).map(function() {
        return $(this).closest('tr');
    }).get();
}

/** Shows a notification and returns it's ID.
 * @param {jQuery} inputElement
 * @param {string} message - The message to display in the notification.
 * @param {string} backgroundColor - The background color of the notification.
 * @param {number} timeout - Duration in milliseconds before the notification is automatically removed.
 * @returns {string} - An ID for the notification.
 */
function showInputNotification(inputElement, message, backgroundColor, timeout = null) {
    const notificationId = `notif_${Date.now()}`; // Unique ID based on timestamp
    const knInputElement = inputElement.closest('.kn-input');
    const notification = $('<div>', {
        id: notificationId,
        class: 'input-notification',
        text: message,
        css: { backgroundColor }
    }).insertAfter(knInputElement);

    // Automatically remove the notification after a timeout
    if (timeout !== null) {
        setTimeout(() => {
            removeInputNotification(notificationId);
        }, timeout);
    }

    return notificationId;
}

/* Updates the content of an existing notification.
    * @param {string} notificationId - The ID of the notification to update.
    * @param {string} newMessage - The new message to display. */
function updateInputNotification(notificationId, newMessage) {
    $(`#${notificationId}`).text(newMessage);
}

/** Removes a notification by its ID.
 * @param {string} notificationId - The ID of the notification to remove. */
function removeInputNotification(notificationId) {
    $(`#${notificationId}`).remove();
}

// Returns a Promise that resolves after "ms" Milliseconds
const API_TIMER = (ms) => new Promise((res) => setTimeout(res, ms));

const getMax = object => {
    return Object.keys(object).filter(x => {
        return object[x] == Math.max.apply(null,
        Object.values(object));
    });
};

/** Get the textAreas from the views
* @param {string} viewId - view.key of the view */
function getTextArea(viewId) { //knack
    return $(`#${viewId} textarea`);
}

/** Get the ID of inputs NOT SELECTS
* @param {selector} input - selector */
function getFieldId(input) { //knack
    return input.attr('id');
}

/** Update user fields and date fields in the form.
    * @param {string} viewId - The ID of the view. */
function updateFieldsInArrays(viewId) {
    const viewSelector = $(`#${viewId}`).length > 0 ? viewId : `connection-form-view:has(input[value="${viewId}"])`;
    const userFieldIds = FIELD_IDS_FOR_LOGGED_IN_USER.filter(fieldId => $(`#${viewSelector} #kn-input-field_${fieldId}`).length > 0);
    const dateFieldIds = SET_CURRENT_DATE_FIELDS.filter(fieldId => $(`#${viewSelector} #kn-input-field_${fieldId}`).length > 0);

    if (userFieldIds.length > 0) {
        updateUserFields(viewId, userFieldIds);
    }

    if (dateFieldIds.length > 0) {
        updateDateFields(viewId, dateFieldIds);
    }
}

/** Update user fields with the logged-in user's name.
 * @param {string} viewId - The ID of the view.
 * @param {Array} fieldIds - Array of user field IDs.*/
function updateUserFields(viewId, fieldIds) {
    const userName = Knack.getUserAttributes().name;
    fieldIds.forEach(foundFieldId => {
        const userField = $(`#kn-input-field_${foundFieldId}`);
        const userInput = userField.find('input');

        userField.addClass(CLASS_HIDDEN);
        userInput.val(userName);
    });
}

/** Update date fields with the current date and time.
 * @param {string} viewId - The ID of the view.
 * @param {Array} fieldIds - Array of date field IDs.*/
function updateDateFields(viewId, fieldIds) {
    const currentDate = new Date();
    fieldIds.forEach(foundFieldId => {
        if ($('#view_3404').length > 0) return false; // Submit Support Request Form

        const dateField = $(`#${viewId}-field_${foundFieldId}`);
        const timeField = $(`#${viewId}-field_${foundFieldId}-time`);

        if (!dateField.val()) {
            dateField.val(getDateUKFormat(currentDate));
        }

        if (!timeField.val()) {
            const timeString = `${currentDate.getHours()}:${currentDate.getMinutes()}`;
            timeField.val(timeString);
        }
    });
}

/**
 * Copies text to clipboard and shows a notification.
 * @param {HTMLElement} element - The element to attach the notification to.
 * @param {string} text - The text to copy.
 * @param {string} message - The message to show in the notification.
 */
function copyTextToClipboard(element, text, message) {
    if (!navigator.clipboard) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(textarea);
    } else {
        navigator.clipboard.writeText(text);
    }

    // Ensure parent is positioned for notification
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
        delay: 1000
    });

    // Optional: adjust notification position for non-table views
    if (parent && !parent.closest('table')) {
        const notif = parent.querySelector('.ca-notification-copy');
        if (notif) {
            notif.style.left = '120px';
            notif.style.opacity = '0.85';
        }
    }
}

/*** Adds click-to-copy functionality to all .kn-detail-body elements within a view.
 * @param {HTMLElement} viewEle - The DOM element of the view.
 * @param {Object} [options] - Optional configuration object.
 * @param {boolean} [options.addIcon=true] - Whether to add a 📋 icon next to the copied text.
 * @param {string} [options.message='Text Copied'] - The notification message to show.
 * @param {string[]} [options.excludeFieldIds=[]] - Array of field to exclude (e.g. ['field_9389']).
 * @param {boolean} [options.includeLabels=false] - Whether to prepend the field label to the copied text.
 */
function addCopyToDetails(viewEle, options = {}) {
    if (!viewEle) return;

    const {
        addIcon = true,
        message = 'Text Copied',
        excludeFieldIds = [],
        includeLabels = false
    } = options;
    const details = viewEle.querySelectorAll('.kn-detail-body');

    details.forEach(detail => {

        if (detail.closest('.kn-details-link')) return; // skip if a link

        const fieldWrapper = detail.closest('[class*="field_"]');
        if (fieldWrapper) {  // Skip if inside an excluded field
            const fieldClasses = Array.from(fieldWrapper.classList);
            if (fieldClasses.some(cls => excludeFieldIds.includes(cls))) return;
        }

        const originalText = detail.textContent.trim();
        if (!originalText) return;

        // Prevent duplicate setup
        if (detail.dataset.copyEnabled === 'true') return;
        detail.dataset.copyEnabled = 'true';

        // Get label text if requested
        let finalText = originalText;
        if (includeLabels && fieldWrapper) {
            const fieldClass = [...fieldWrapper.classList].find(cls => cls.startsWith('field_'));
            let labelText = '';

            if (fieldClass) {
                const labelFieldWrapper = viewEle.querySelector(`.kn-label-top.${fieldClass}, .kn-detail.${fieldClass}`);
                const labelEl = labelFieldWrapper?.querySelector('.kn-detail-label');
                labelText = labelEl?.textContent.trim() || '';
                console.log(`Label wrapper for ${fieldClass}:`, labelEl);
            }

            if (labelText) {
                finalText = `${labelText}: ${originalText}`;
            }
        }

        // Add 📋 icon if enabled
        if (addIcon) {
            const icon = document.createElement('span');
            icon.textContent = ' 📋';
            icon.style.userSelect = 'none';
            detail.appendChild(icon);
        }

        // Attach click-to-copy behaviour
        detail.style.cursor = 'pointer';
        detail.addEventListener('click', () => {
            copyTextToClipboard(detail, finalText, message);
        });
    });
}

/**
 * Sets up click-to-copy functionality for elements with .ca-click-to-copy in a view.
 * @param {string} viewId - The ID of the view.
 */
function setupClickToCopy(viewId) {
    const elements = document.querySelectorAll(`#${viewId} .ca-click-to-copy`);
    elements.forEach(el => {
        let text = el.textContent.trim();

        // Hide if only clipboard emoji
        if (text === '📋' || text === '') {
            el.style.display = 'none';
            return;
        }

        // Remove clipboard emoji from text
        text = text.replace(' 📋', '');

        // Add 📋 if not already there
        if (!el.textContent.includes('📋')) {
            el.textContent = text + ' 📋';
        }

        let message = 'Text Copied';
        if (el.classList.contains('client-contact-num')) message = 'Client Number Copied';
        else if (el.classList.contains('funder-email')) message = 'Funder Email Copied';
        else if (el.classList.contains('funder-contact-num')) message = 'Funder Number Copied';
        else if (el.classList.contains('funder-office-num')) message = 'Funder Office Number Copied';
        else if (el.classList.contains('client-email')) message = 'Client Email Copied';

        el.addEventListener('click', function () {
            copyTextToClipboard(el, text, message);
        });
    });
}

/** Gets the week commencing date for a given date.
 * @param {Date} date - The date to calculate the week commencing date for.
 * @returns {string} The week commencing date in the format "DD MMM YYYY". */
function getWeekCommencingDate(date) {
    const currentDayIndex = date.getDay();
    const daysToAdd = (currentDayIndex === 0 ? -6 : 1) - currentDayIndex; // If it's Sunday, subtract 6 days, otherwise subtract the current day index from 1
    const weekCommencingDate = new Date(date);
    weekCommencingDate.setDate(date.getDate() + daysToAdd);
    return weekCommencingDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function scheduleDailyRefresh(viewId, hours, minutes) {
    const now = new Date();
    const nextRefresh = new Date();

    // Set the next refresh time to HH:mm
    nextRefresh.setHours(hours, minutes, 0, 0);

    // If the current time is past HH:mm AM, set the next refresh to tomorrow
    if (now > nextRefresh) {
        nextRefresh.setDate(nextRefresh.getDate() + 1);
    }

    // Calculate the time difference in milliseconds
    const timeToNextRefresh = nextRefresh - now;

    // Set a timeout to refresh the view at HH:mm AM
    setTimeout(function() {
        ktl.views.refreshView(viewId);

        // Set an interval to refresh the view every 24 hours
        setInterval(function() {
            ktl.views.refreshView(viewId);

        }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    }, timeToNextRefresh);
}

function getCurrentYear() {
    const date = new Date();
    return date.getFullYear();
}

/** Constructs a human-readable list from an array of strings. Takes an array of strings
 * and a string to use before the last item (typically 'and' or 'or') to construct a list that is more
 * natural for reading. For example, given an array ['apple', 'banana', 'cherry'] and the string 'and',
 * it returns 'apple, banana and cherry'.
 * @param {string[]} stringsArr - An array of strings to be joined into a list.
 * @param {string} joinStr - A string to insert before the last item in the list. Typically 'and' or 'or'.
 * @returns {string} A string representing the joined list.
     */
function constructList(stringsArr, joinStr) {
    let list = stringsArr.join(', ');
    if (stringsArr.length > 1) {
        let lastComma = list.lastIndexOf(',');
        list = list.slice(0, lastComma) + ' ' + joinStr + list.slice(lastComma + 1);
    }
    return list;
}

/** Convert CSV string to an array
 * @param {string} csvString - CS string
 * @param {Boolean} [removeDuplicates] */
function csvToArray(csvString, removeDuplicates = false) {
    if (!csvString || typeof csvString !== 'string') {
        console.error('Invalid input. Please provide a non-empty string.');
        return [];
    }

    let newArray = csvString.split(',').map(item => item.trim());

    if (removeDuplicates) {
        newArray = [...new Set(newArray)];
    }
    return newArray;
}

/**
 * Checks if a given word starts with a vowel (a, e, i, o, u, A, E, I, O, U).
 * @param {string} word - The word to check.
 * @returns {boolean} True if the word starts with a vowel, false otherwise.
 */
function startsWithVowel(word){
    const vowels = ("aeiouAEIOU");
    return vowels.indexOf(word[0]) !== -1;
}

/** Change View Title if Selector Found
 * @param {string} viewId - Knack view id
 * @param {string} selector - jQuery selector
 * @param {string} newTitle - new title to set */
function updateViewTitleIfSelectorFound(viewId, selector, newTitle) {
    ktl.core.waitSelector(selector, 10000).then(() => {
        const viewTitle = $(`#${viewId} h3.kn-title:first`);
        if ($(selector).length > 0) {
            viewTitle.text(newTitle);
        }
    });
}

/** Add Change Event Listener to Input Element pass in callback function
 * @param {jQuery} inputElement - jQuery input element
 * @param {function} callback - callback function to run on change
 * @param {boolean} [onload] - whether to trigger the change event when the view loads */
function onInputChange(inputElement, callback, onload = true) {
    inputElement.on('change', function () {
        callback(this);
    });
    if (onload) {
        inputElement.change();
    }
}

/**
 * Toggle a message in a tile/copy, can be used as callback or standalone
 * @param {boolean} shouldShow - true to show false to hide
 * @param {string} eleSelector - id or class of message to toggle
 */
function toggleMessage(shouldShow, eleSelector) {
    // Select elements that contain the target element
    const messageElements = document.querySelectorAll(
        `.kn-input:has(${eleSelector}), .kn-special-title:has(${eleSelector})`
    );

    if (messageElements.length === 0) {
        // Fallback for browsers that don't support :has()
        const allContainers = document.querySelectorAll('.kn-input, .kn-special-title');
        allContainers.forEach(container => {
            if (container.querySelector(eleSelector)) {
                container.style.display = shouldShow ? 'block' : 'none';
            }
        });
    } else {
        messageElements.forEach(element => {
            element.style.display = shouldShow ? 'block' : 'none';
        });
    }
}

/** Replace Text in One Field with Text from Another Field in a Grid
 * @param {string} viewId
 * @param {string} sourceField ID
 * @param {string} targetField ID or column header */
function replaceTextInGrid(viewId, sourceField, targetField) {
    const targetIndex = targetField.startsWith('field_') ?
                        $(`#${viewId} .kn-table thead th.${targetField}`).index() :
                        $(`#${viewId} .kn-table thead th:textEquals('${targetField}')`).index();
    const rows = $(`#${viewId} .kn-table tbody tr`);

    rows.each(function() {
        const span = $(this).find(`td:eq(${targetIndex}) span.knViewLink__label`);
        const text = $(this).find(`td.${sourceField}`).find('span').html();
        span.html(text).find('span').css('text-decoration', 'none');
    });
}

/** Removes blank data from df where blanks to be removed are in <span class='removeIfBlank'>
 * @param {object} dfData jquery object with the df could be a td
 * @param {string} [seperator] could be :, - or null if no data before etc func will check if any data after the seperator */
function removeBlanksFromDF(dfData, separator) {
    // Regex pattern to match a single dash or multiple dashes
    const dashPattern = /^-+\s*-*$/;

    dfData.find('.removeIfBlank').each(function() {
        let spanText = $(this).text().trim();
        let textToCheck = spanText; // Default is the full text, used if no separator is provided

        // If a separator is provided, extract the text after the separator
        if (separator) {
            const splitText = spanText.split(separator);
            textToCheck = splitText.length > 1 ? splitText[1].trim() : '';
        }

        // Remove span if the text is blank, or matches the dash pattern
        if (textToCheck === '' || dashPattern.test(textToCheck)) {
            removeElement(this);
        }
    });
}

/** Hides empty list container */
function hideEmptyListItems(viewId) {
    const viewElement = $(`#${viewId}`);
    const listContainer = viewElement.find('.kn-list-container');
    listContainer.each(function() {
        const text = $(this).text().trim();

        if (text === '') {
            $(this).hide();
        }
    });
}

/**** Utility function to handle mapping of date to how long ago
 * @param {string} dateStr - date in dd/mm/yyyy
 * @param {object} ranges - object holding the range label with there max months (see SUICIDE_SELFHARM_RANGES)
 * @return the range for the date passed in or false if no range found*/
function mapDateToRange(dateStr, ranges) {
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();

    // Calculate the difference in months
    const diffYears = now.getFullYear() - date.getFullYear();
    const diffMonths = diffYears * 12 + (now.getMonth() - date.getMonth());

    for (const range of ranges) {
        if (diffMonths < range.max) {
            return range.label;
        }
    }
    console.error(`No match found in range "${ranges}" for date "${dateStr}".`);
    return false;
}

/** Parse a value into a Date object (or null if invalid).
 * Accepts: Date (cloned), millisecond timestamp (number), ISO string, or dd/mm/yyyy or yy string (cleaned via removeHtml)
 * @param {string|Date|number} input
 * @returns {Date|null} - New Date instance, or null if unparseable.
 */
function parseDateObject(input) {
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
    }

    if (typeof input === 'number') {
        const dateFromNumber = new Date(input);
        return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
    }

    if (typeof input === 'string') {
        const cleanDate = removeHtml(input).trim();

        // dd/mm/yyyy OR dd/mm/yy
        const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(cleanDate);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10);
            let year = parseInt(dmyMatch[3], 10);

            // Interpret 2-digit years as 2000–2099 (tweak if you prefer a different pivot)
            if (year < 100) year += 2000;

            const dateFromDmy = new Date(year, month - 1, day);
            return (dateFromDmy.getFullYear() === year &&
                    dateFromDmy.getMonth() === month - 1 &&
                    dateFromDmy.getDate() === day)
                ? dateFromDmy
                : null;
        }

        // Fallback: ISO/RFC-like
        const dateFromString = new Date(cleanDate);
        return Number.isNaN(dateFromString.getTime()) ? null : dateFromString;
    }

    return null;
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
    return {
        date: dateInput ? dateInput.value : '',
        time: timeInput ? timeInput.value : '',
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
 * Format a Date into UK date/time parts.
 * @param {Date} dateObj
 * @returns {{date: string, time: string}}
 */
function formatDateTimeParts(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');

    return {
        date: `${day}/${month}/${year}`,
        time: `${hours}:${minutes}`,
    };
}

/** Offset a date and return a UK date string (dd/mm/yyyy).
 * Accepts an ISO string, Date object, dd/mm/yyyy or millisecond timestamp - uses parseDateObject.
 * @param {string|Date|number} inputDate - ISO string, dd/mm/yyyy string, Date object, or ms since epoch.
 * @param {number} [daysOffset=0] - Days to add (use negative to subtract).
 * @returns {string} - Formatted date string (dd/mm/yyyy) or '' if invalid.
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

/** Format Date as dd/mm/yyyy
 *  @param {Date|string|number} inputDate - Date object or parsable date value.
 *  @return {string} - Formatted date string (dd/mm/yyyy) or '' if invalid. */
function getDateUKFormat(inputDate) {
    const date = inputDate instanceof Date ? inputDate : parseDateObject(inputDate);
    if (!date) {
        console.warn('getDateUKFormat: cannot parse date:', inputDate);
        return '';
    }
    return date.toLocaleDateString('en-GB');
}

/**
 * Converts a given date input into an ISO string representing
 * the very end of that day (23:59:59.999).
 * @param {string|Date} inputDate - Date to convert (ISO string or Date)
 * @returns {string} ISO string for end of day, or empty string if invalid
 */
function getEndOfDayIso(inputDate) {
    const dateObj = parseDateObject(inputDate);
    if (!dateObj) return '';

    dateObj.setHours(23, 59, 59, 999);
    return dateObj.toISOString();
}

/** Calcualate How many weeks ago a date was
 * @param {number} weeksAgo - Number of weeks ago
 * @returns {string} */
function getWeeksAgoDate(weeksAgo) {
    const today = new Date(); // Get today's date
    const weeksInMillis = weeksAgo * 7 * 24 * 60 * 60 * 1000; // Convert weeks to milliseconds
    const targetDate = new Date(today.getTime() - weeksInMillis); // Calculate the target date
    return getDateUKFormat(targetDate); // Return the date string in UK format
}

/**  get array of week numbers and fields
 * @param {number} startFieldNum - Starting field number
 * @returns {array} Array of week numbers and fields */
function getArrayOfWeekNumbersAndFields(startFieldNum) { //knack
    return Array.from({length: 52}, (_, i) => `field_${startFieldNum + i}`);
}

/**  Get Week Number from given date
     * @param {object} date - Date object
     * @returns {number} Week number */
function getWeekNumber(date) { //knack
    const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
    // Get first day of the year
    const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

/**  Update the week number grid
 * @param {string} viewId
 * @param {string} bcgGridColour - background colour of current week */
async function updateWeekNumberObject( conxId, formDate, value, typeValue ) { //knack
    const sGrid = WEEK_NUM_SHARED_AREA_GRID;
    const api = getKnackApiClient();

    const weekNumber = getWeekNumber(convertToDateObj(formDate));
    const weekNumberField = sGrid.weekNumberFields[weekNumber - 1];

    const filter = createFilterForWeekObj(sGrid, conxId, typeValue);
    const weeklyTasks = await api.getRecords(sGrid.sceneId, sGrid.viewId, { filters: filter });
    const weeklyTaskId = weeklyTasks?.[0]?.id;

    if (weeklyTaskId) {
        await api.updateRecord(sGrid.sceneId, sGrid.viewId, weeklyTaskId, {[weekNumberField]: value});
    }
}

function createFilterForWeekObj(sGrid, recordId, value) { //knack
    return {
        'match': 'and',
        'rules': [
            {'field': sGrid.conxField, 'operator': 'is', 'value': [recordId]},
            {'field': sGrid.typeField, 'operator': 'is', 'value': value},
        ]
    };
}

/**
 * Shows only relevant weeks in the Week Number Grid with improved performance and readability
 * @param {string} viewId - The ID of the view containing the grid
 * @param {string} bgGridColor - Background color for the current week
 * @param {number} [weeksToShow=11] - Total number of weeks to display
 * @param {number} [pastWeeksToShow=7] - Number of weeks before the current week to show
 */
function showRelevantWeeks(viewId, bgGridColor, weeksToShow = 11, pastWeeksToShow = 7) {
    const sGrid = window.WEEK_NUM_SHARED_AREA_GRID;
    const currentWeek = getWeekNumber(new Date());
    const weekNumberFields = sGrid.weekNumberFields; // field ids

    // Cache DOM elements to improve performance
    const viewElement = document.getElementById(viewId);
    if (!viewElement) {
        console.warn(`View element with ID ${viewId} not found`);
        return;
    }

    // Get all headers and rows once
    const thead = viewElement.querySelector('thead');
    const tbody = viewElement.querySelector('tbody');
    if (!thead || !tbody) {
        console.warn(`Table header or body not found in view ${viewId}`);
        return;
    }

    // Hide all columns first
    weekNumberFields.forEach(field => {
        const columnElements = viewElement.querySelectorAll(`.${field}`);
        columnElements.forEach(el => el.style.display = 'none');
    });

    // Show and reorder relevant columns
    const weeksToProcess = [];
    for (let i = 0; i < weeksToShow; i++) {
        // Calculate week index with proper wrapping for year boundaries
        const weekIndex = (currentWeek - pastWeeksToShow + i + 52) % 52 || 52; // Use 52 instead of 0
        const adjustedIndex = weekIndex - 1; // Convert to 0-based index
        weeksToProcess.push({
            field: weekNumberFields[adjustedIndex],
            isCurrentWeek: weekIndex === currentWeek
        });
    }

    // Process header cells
    const headerRow = thead.querySelector('tr');
    if (headerRow) {
        weeksToProcess.forEach(weekData => {
            const headerCell = headerRow.querySelector(`.${weekData.field}`);
            if (headerCell) {
                headerCell.style.display = '';
                headerRow.appendChild(headerCell);
            }
        });
    }

    // Process all data rows
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        weeksToProcess.forEach(weekData => {
            const cell = row.querySelector(`.${weekData.field}`);
            if (cell) {
                cell.style.display = '';
                if (weekData.isCurrentWeek) {
                    cell.style.backgroundColor = bgGridColor;
                }
                row.appendChild(cell);
            }
        });
    });
}

/* Compare Ages Function
 * @param {string} dob - Date of Birth
 * @param {number} age - Age to compare
 * @param {string} operator - Comparison operator
 * @returns {boolean} */
function compareAge(dob, age, operator) {
    const dateDOB = convertToDateObj(dob);
    const ageDifMs = Date.now() - dateDOB.getTime();
    const ageDate = new Date(ageDifMs);
    const calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970);
    return evaluate(calculatedAge)(operator)(age);
}

/** Add related field values from a Knack view (list or detail) into an HTML list.
 * @param {string} listId - The ID of the <ul> or <ol> element to populate.
 * @param {string} fieldId - The field class (e.g. 'field_3473') from which to extract values.
 * @param {string} [defaultText=''] - Text to show if no values are found.
 * @param {string} [viewType='detail'] - Type of view: 'detail' or 'list'.
 * @param {number} [delay=20000] - Time to wait (ms) for field selector to appear.*/
async function addConxDetailsToList(listId, fieldId, defaultText = '', viewType = 'detail', delay = 20000) {
    try {
        const list = $(listId).addClass('custom-list');
        if (list.find('li').length > 0) return;

        const itemSelector = viewType === 'list'
            ? `.kn-list-item-container .${fieldId} .kn-detail-body span`
            : `.${fieldId} .kn-detail-body span`;

        await ktl.core.waitSelector(itemSelector, delay);

        const elements = $(itemSelector);

        const items = [];
        elements.each(function (index) {
            const $el = $(this);
            const text = $el.text().trim();
            const hasSpanChildren = $el.children('span').length > 0;

            if (text && !hasSpanChildren) {
                items.push(text);
            }
        });

        if (items.length === 0 && defaultText) {
            list.append(`<li>${defaultText}</li>`);
        } else {
            const addedItems = new Set();
            items.forEach((text, i) => {
                if (!addedItems.has(text)) {
                    list.append(`<li>${text}</li>`);
                    addedItems.add(text);
                }
            });
        }
    } catch (error) {
        throw new Error(`Failed to add details to list: ${error}`);
    }
}

/** Map fields from one view to another view with the same fields
 * @param {string[]} textFields - Array of text field ids, maybe empty
 * @param {string[]} radioFields - Array of radio field ids, maybe empty
 * @param {string[]} selectFields - Array of select field ids, maybe empty
 * @param {string} targetViewId - Target view id
 * TO DO: add other field types if needed */
function mapFieldsToView(textFields, radioFields, selectFields, sourceViewId, targetViewId) {
    const mapField = (fieldId, fieldType, event) => {
        const fieldSelector = `#${sourceViewId} #kn-input-field_${fieldId} ${fieldType}`;
        const targetFieldSelector = `#${targetViewId} #kn-input-field_${fieldId} ${fieldType}`;

        // Check if the element exists before trying to use it
        if ($(fieldSelector).length === 0 || $(targetFieldSelector).length === 0) {
            console.error(`Element not found: ${fieldSelector} or ${targetFieldSelector}`);
            return;
        }

        $(targetFieldSelector).closest('.kn-input').addClass('ktlHidden');

        $(fieldSelector).on(event, function() {
            const value = fieldType === INPUT_RADIO_SELECTOR
                ? $(`#kn-input-field_${fieldId} ${INPUT_RADIO_CHECKED_SELECTOR}`).val()
                : $(this).val();

            if (fieldType === INPUT_RADIO_SELECTOR) {
                $(`${targetFieldSelector}`).filter(`[value="${value}"]`).trigger('click');
            } else {
                $(targetFieldSelector).val(value);
                if (fieldType === 'select') {
                    $(targetFieldSelector).trigger('liszt:updated');
                }
            }
        });
    };

    textFields.forEach(fieldId => mapField(fieldId, 'textarea', 'blur'));
    radioFields.forEach(fieldId => mapField(fieldId, INPUT_RADIO_SELECTOR, 'change'));
    selectFields.forEach(fieldId => mapField(fieldId, 'select', 'change'));
}

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
 *     closeModalAfterSubmit: true,
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
     * @param {boolean} [config.closeModalAfterSubmit=false] - Close modal after successful submission
     * @param {Function} [config.onAutoFormsComplete=null] - Callback after auto forms complete
     * @param {Object} [config.timeouts] - Override default timeout values
     * @param {Object} [config.selectors] - Override default selector strings
     */
    constructor(config) {
        this.manualSubmitViewId = config.manualSubmitViewId;
        this.autoSubmitViewIds = config.autoSubmitViewIds || [];
        this.closeModalAfterSubmit = config.closeModalAfterSubmit || false;
        this.onAutoFormsComplete = config.onAutoFormsComplete || null;

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
        manualSubmitBtn.disabled = true;
        this._setFormInputsDisabled(manualForm, true);

        let outcomes = [];
        try {
            outcomes = await this._submitAutoForms();

            if (this.onAutoFormsComplete) {
                this.onAutoFormsComplete(outcomes);
            }

            this._setFormInputsDisabled(manualForm, false);
            manualSubmitBtn.disabled = false;

            await this._submitManualForm(manualForm);

        } catch (err) {
            errorHandler.handleError(err, {
                manualSubmitViewId: this.manualSubmitViewId,
                autoSubmitViewIds: this.autoSubmitViewIds,
                outcomes
            }, 'MultiFormCoordinator:HandleSubmission');

            this._setFormInputsDisabled(manualForm, false);
            manualSubmitBtn.disabled = false;
        }
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

        for (const autoViewId of this.autoSubmitViewIds) {
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

            const cleanup = () => {
                if (cleanupDone) return;
                cleanupDone = true;
                if (timeoutId) clearTimeout(timeoutId);
                if (pollIntervalId) clearInterval(pollIntervalId);
                if (observer) observer.disconnect();
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

            // Initial check and delayed check
            checkOutcome();
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
            setTimeout(() => {
                try {
                    $(manualForm).submit();

                    if (this.closeModalAfterSubmit && document.querySelector(this.selectors.MODAL)) {
                        setTimeout(() => {
                            document.querySelector(this.selectors.MODAL_CLOSE)?.click();
                        }, this.timeouts.MODAL_CLOSE_DELAY);
                    }

                    resolve();
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
        this.eventHandlers.forEach((eventNamespace) => {
            $(document).off(eventNamespace);
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
 * @param {boolean} [closeModalAfterSubmit=false] - If true, closes modal after successful submission.
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

/** Function to select an item in a Knack connection dropdown.
 * @param {string} viewId - The ID of the view element.
 * @param {string} conxFieldIdInput - The ID of the connection field input.
 * @param {string|null} connectionId - The ID of the connection to select (optional).
 * @param {string} connectionObject - The connection object to use for API calls. */
async function addConnectionIdToRecord(viewId, conxFieldIdInput, connectionId = null, connectionObject) {
    const api = getKnackApiClient();
    const viewElement = $(`#${viewId}`).length > 0 ? $(`#${viewId}`) : $(`#connection-form-view:has(input[value="${viewId}"])`);

    const connectionField = viewElement.find(`#kn-input-field_${conxFieldIdInput}`);
    const connectionSelect = connectionField.find('select');
    const conxId = connectionId || getRecordID();
    const timeoutDuration = 10000; // 10 seconds
    const pollingInterval = 500; // 500 milliseconds
    connectionField.addClass(CLASS_HIDDEN);

    const setConnectionId = (conxId) => {
        connectionSelect.val(conxId).trigger('liszt:updated');
    };

    await ktl.core.waitSelector(`${viewElement.selector} #kn-input-field_${conxFieldIdInput} select option`, 20000);
    const optionsLength = connectionSelect.find('option').length;

    if (optionsLength > 1) {
        setConnectionId(conxId);
    } else {
        const { sceneIdAPI, viewIdAPI, clientPKField } = CONNECTION_FIELDS_OBJECT[connectionObject];
        try {
            const response = await api.getRecord(sceneIdAPI, viewIdAPI, connectionId);
            const optionText = response[`${clientPKField}_raw`];
            const searchInput = connectionField.find('.chzn-search input');

            searchInput.trigger('focus').val(optionText).trigger('input');

            const interval = setInterval(() => {
                const option = connectionSelect.find('option').filter((_, el) => $(el).text() === optionText);

                if (option.length > 0) {
                    setConnectionId(option.val());
                    searchInput.trigger('blur');
                    clearInterval(interval);
                    clearTimeout(timeout);
                }
            }, pollingInterval);

            const timeout = setTimeout(() => {
                clearInterval(interval);
                console.log(`Timeout: Could not find item "${optionText}" in the dropdown.`);
            }, timeoutDuration);
        } catch (error) {
            console.error('Error fetching data from API:', error);
        }
    }
}

/**
 * Validates if the input field specified by the inputId is empty. If the field is empty, it adds a class
 * 'inputInvalid' to visually indicate an invalid input and scrolls the input into view. Additionally, it
 * attaches a 'blur' event listener to the input field to remove or add the 'inputInvalid' class based on
 * the input's value when the field loses focus.
 * @param {string} inputId - The ID of the input field to be validated.
 * @returns {boolean} Returns true if the input field is not empty, otherwise false.
 */
function validateInputEmpty(inputId) {
    const input = $(`#${inputId}`);

    input.on('blur', function() {
        if (input.val()) {
            removeClassFromSelector(input, 'inputInvalid');
        } else input.addClass('inputInvalid');
    });

    if (!input.val()) {
        input.addClass('inputInvalid').focus();
        input[0].scrollIntoView({behavior: "smooth", block: "center", inline: "nearest"});
        return false;
    }
    return true;
}

/** Disable ALL cells in a column based on colHead id
 * @param {string} viewId - ID of the view (e.g., 'view_123')
 * @param {integer} colHeadID - field id of the column
 * @param {boolean} doRestyle - true to add CLASS_DISABLED to cell, false by default
 */
function disableCellsByColHead(viewId, colHeadID) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;
    const table = viewElement.querySelector('table');
    if (!table) return;
    const headerCells = table.querySelectorAll('thead th');
    let colIndex = -1;
    headerCells.forEach((th, idx) => {
        if (th.classList.contains(`field_${colHeadID}`)) colIndex = idx;
    });
    if (colIndex === -1) return;
    getAllTableRows(viewId, (i, row) => {
        const cell = row.children[colIndex];
        if (!cell) return;
        cell.classList.add(CLASS_DISABLED);
    });
}

/**
 * Checks whether the current time is within office hours (Mon - Fri).
 * By default, office hours are Monday to Friday, 08:30 to 16:30.
 * You can optionally provide custom start and end times in 24-hour 'HH:mm' format.
 * @param {string} [startTime='08:30'] - Optional start time in 'HH:mm' format (24-hour clock).
 * @param {string} [endTime='16:30'] - Optional end time in 'HH:mm' format (24-hour clock).
 * @returns {boolean} True if current time is within office hours on a weekday; otherwise false.
 */
function isInOfficeHours(startTime = '08:30', endTime = '16:30') { // ARC
    const toMinutes = timeStr => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);

    const date = new Date();
    const now = date.getHours() * 60 + date.getMinutes();

    if (date.getDay() === 0 || date.getDay() === 6) {
        return false; // it's the weekend
    }
    return start <= now && now <= end;
}

/** Setup the local storage minutes for a meeting
* @param {string} storageKey - the key to the storage
* @param {array} viewsToAddLocalStorage - the views to add local storage to */
function setupLocalStorageMinutes(storageKey, viewsToAddLocalStorage, buttonText) { //ARC
    const meetingId = getRecordID();
    initSecureStorage(storageKey);

    viewsToAddLocalStorage.forEach(view => {
        const textarea = getTextArea(view);
        textarea.on('blur', function() {
            const fieldId = getFieldId($(this));
            setSecureStorage(storageKey, meetingId, fieldId, $(this).val());
        });

        $(`#${view} .redactor-editor`).on('blur', function() {
            const fieldId = getFieldId($(this).closest('.kn-input'));
            setSecureStorage(storageKey, meetingId, fieldId, $(this).html());
        });
    });

    ktl.core.waitSelector(`.kn-details-link a:contains("${buttonText}")`, 5000).then(() => {
        $(`.kn-details-link a:contains("${buttonText}")`).on('click', function (e) {
            e.preventDefault();
            getSecureStorage(storageKey, meetingId).then(minutes => {
                if (!minutes) return;
                reloadMinutes(viewsToAddLocalStorage, minutes);
            });
        });
    });
}

/** Reload the minutes from local storage
* @param {array} viewsToAddLocalStorage - the views to add local storage to
* @param {object} minutes - the minutes from local storage */
function reloadMinutes(viewsToAddLocalStorage, minutes) { //ARC
    viewsToAddLocalStorage.forEach(view => {
        const textarea = getTextArea(view);
        textarea.each(function() {
            const fieldId = getFieldId($(this));
            const text = minutes[fieldId];
            if (text) $(`#${fieldId}`).val(text);
        });

        $(`#${view} .redactor-editor`).each(function () {
            const fieldId = getFieldId($(this).closest('.kn-input'));
            const richText = minutes[fieldId];
            if (richText) {
                $(`#${fieldId} .redactor-editor`).html(richText);
                $(`#${fieldId} textarea`).val(richText);
            }
        });
    });
}

/** showHideGroup - show hide a group of views together
 * @param {string} viewsToInclude- FIRST must be the first view and will be used for the button */
function showHideGroup(viewsToInclude, flexOn) {
    // Create an array of promises for each view
    const viewsReadyArr = viewsToInclude.map(view => waitSelector({
        selector: `#view_${view}`
    }));

        Promise.all(viewsReadyArr).then(() => {
        const delay = 1000;
        const mainViewId = `view_${viewsToInclude[0]}`;
        const showHideId = `showHide_${mainViewId}`;
        const showHideClass = `.${showHideId}`;
        const shrinkLinkHTML = `<a class="ktlShrinkLink" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="ktlArrow ktlUp" id="arrow_${showHideId}">◀</span></a>`;

        waitSelector({ selector: `#${mainViewId} h2.kn-title` }).then((viewTitle) => {
            const titleText = viewTitle.textContent.trim();
            const showHideBtnHTML = `<div class="ktlHideShowButton" id="${showHideId}">${titleText} &nbsp;<span class="ktlArrow ktlDown" id="arrow_${showHideId}">◀</span></div>`;
            const mainViewElem = document.getElementById(mainViewId);

            // Only wrap and add controls if not already present
            let wrapper = document.getElementById(`${mainViewId}_wrapper`);
            if (!document.getElementById(showHideId)) {
                viewTitle.style.display = 'none';
                if (mainViewElem) {
                    mainViewElem.insertAdjacentHTML('beforebegin', showHideBtnHTML);
                }
                wrapContentForShowHideGroup(viewsToInclude, showHideId);
                wrapper = document.getElementById(`${mainViewId}_wrapper`);
                if (wrapper && !document.getElementById(`shrink-link_${showHideId}`)) {
                    wrapper.insertAdjacentHTML('beforeend', shrinkLinkHTML);
                }
            }

            // Move description if needed
            if (mainViewElem) {
                const description = mainViewElem.querySelector('.kn-description');
                if (
                    description &&
                    description.textContent.trim() !== '' &&
                    !document.querySelector(`${showHideClass} .kn-description`)
                ) {
                    const showHideSection = document.querySelector(showHideClass);
                    if (showHideSection) {
                        showHideSection.insertBefore(description, showHideSection.firstChild);
                        description.style.display = '';
                    }
                }
            }

            showHideViewGroupContent(showHideId, delay, flexOn);
            if (wrapper) wrapper.style.marginTop = '13px';
        });
    })
    .catch((error) => {
       if (isDeveloper){ console.warn('view/s missing from page', viewsToInclude, error); }
    });
}

/**  wrap content for show/hide group
 * so view types don't matter anymore?
 * @param {array} viewsArr - views to include in the show/hide first must be the main view
 * @param {string} showHideId - unique id for show/hide content */
function wrapContentForShowHideGroup(viewsArr, showHideId) {
    const mainViewId = `view_${viewsArr[0]}`;
    const mainView = document.getElementById(mainViewId);

    // If already wrapped, do nothing
    if (document.getElementById(`${mainViewId}_wrapper`)) return;

    // Create wrapper section
    const wrapper = document.createElement('section');
    wrapper.className = `${showHideId} ktlBoxWithBorder ktlHideShowSection`;
    wrapper.id = `${mainViewId}_wrapper`;
    wrapper.style.display = 'none'; // Show by default

    // Create view-wrapper div
    const viewWrapper = document.createElement('div');
    viewWrapper.className = 'view-wrapper';

    // Insert wrapper before mainView and move mainView inside viewWrapper
    mainView.parentNode.insertBefore(wrapper, mainView);
    wrapper.appendChild(viewWrapper);
    viewWrapper.appendChild(mainView);

    // Append other views
    viewsArr.slice(1).forEach(view => {
        const otherView = document.getElementById(`view_${view}`);
        if (otherView) {
            viewWrapper.appendChild(otherView);
        }
    });
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
                    if (
                        signatureElements.length &&
                        window.Knack &&
                        Knack.views &&
                        Knack.views[viewId] &&
                        typeof Knack.views[viewId].renderSignatures === 'function'
                    ) {
                        Knack.views[viewId].renderSignatures();
                    }

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

/** Add given text in fron of value in grouped by table rows
 * @param {string} txtToAdd
 * @param {string} viewId
 * @param {integer} groupLevel - Opiontal add group level if not 1 */
function prependTextToGroupBy(txtToAdd, viewId, groupLevel = 1) {
    const selector = `#${viewId} .kn-group-level-${groupLevel} td`;
    $(selector).prepend(`${txtToAdd} `);
}

/**
 * Retrieves the rows of a table's tbody within a specified view and applies a callback to each row.
 * @param {string} viewId
 * @param {function} callback - Receives the index of the row and the jQuery-wrapped row element as arguments.
 */
function getTableRows(viewId, callback, includeHeader = false, includeGroup = false) {
    if (!viewId) return;

    const tableElement = $(`#${viewId} table`);
    let tableRows = tableElement.find('tbody tr:not(.kn-table-group)');

    // Include header rows if specified
    if (includeHeader) {
        const headerRows = tableElement.find('thead tr');
        tableRows = tableRows.add(headerRows);
    }

    // Include group rows if specified
    if (includeGroup) {
        const groupRows = tableElement.find('tbody tr.kn-table-group');
        tableRows = tableRows.add(groupRows);
    }

    // Iterate over each row and execute the callback
    tableRows.each((index, row) => {
        callback(index, $(row));
    });
}

/**
 * Extract a UK postcode from an address string.
 * @param {string} address - The address string, possibly containing HTML tags.
 * @returns {string} The extracted postcode in uppercase, or an empty string if not found.
 * @example <span>312 Fawcett Road Portsmouth, Hampshire PO4 0LG</span> Returns: "PO4 0LG"*/
function extractPostcode(address) {
    if (!address) return '';
    const cleanAddress = removeHtml(address).trim();
    // Match UK postcode pattern (case-insensitive)
    const match = cleanAddress.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i);
    return match ? match[0].toUpperCase() : '';
}

/**
 * Returns the URL to open for a file type.
 * Uses direct asset URLs to avoid external viewer blank-screen/network issues.
 * @param {string} extension - File extension (lowercase, no dot)
 * @param {string} url - Direct asset URL
 * @return {string} - URL to open
 */
function fileViewer(extension, url) {
    const ext = String(extension || '').toLowerCase();
    if (OFFICE_EXTENSIONS.includes(ext) || ext === "pdf") {
        return url;
    }
    return url;
}

/**num of whole weeks between two dates
 * @param {Date} date1 - 24/05/2023
 * @param {Date} date2 - 24/05/2023 **/
 function weeksBetween(date1, date2) {
    var WEEK = 1000 * 60 * 60 * 24 * 7;
    var diff = Math.abs(date2 - date1);
    return Math.ceil(diff / WEEK);
}

/** Returns A date object from a uk date string
 * @param {string} date - 24/05/2023
 * @return {Date} dateObj **/
function convertToDateObj (date) {
    var dateArr = date.split("/");
    return new Date(dateArr[2],	dateArr[1] - 1,	dateArr[0]);
}

/** Determine whether an element is visible in the DOM.
 * Accepts either an element reference or a selector string, Visibility checks include inline/computed styles and hidden ancestors.
 *
 * @param {HTMLElement|string} target - The element itself, or a selector string.
 * @param {ParentNode} [root=document] - Optional root to scope selector queries (e.g., a view container).
 * @returns {boolean} True if the element is visible, false otherwise. */
function isElementVisible(target, root = document) {
    const context = root && typeof root.querySelector === 'function' ? root : document;
    const el = typeof target === 'string' ? context.querySelector(target) : target;

    if (!el || !el.isConnected) return false;

    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;

    // When the element or any ancestor has display:none, offsetParent is null.
    if (el.offsetParent === null) return false;

    return true;
}


/** Checks if all inputs on a view are empty.
 * @param {string} viewId - The ID of the view (e.g., view_xxxx).
 * @param {Array} fieldsToIgnore - An array of field IDs to ignore when checking for empty inputs.
 * @return {boolean} - Returns true if all inputs are empty, false otherwise. */
function areAllInputsEmpty(viewId, fieldsToIgnore = []) {
    if (!viewId) return true;

    const viewElement = $(`#${viewId}`);
    const textInputs = viewElement.find('input[type="text"]:not(.search-field input[type="text"]), input[type="number"], input[type="email"], textarea');
    const selectInputs = viewElement.find('select');

    // Check if any text input has a non-empty value
    for (let i = 0; i < textInputs.length; i++) {
        const input = $(textInputs[i]);
        const inputId = input.attr('id');
        if (fieldsToIgnore.includes(inputId)) continue;

        const inputValue = input.val();
        if (inputValue.trim() !== '') {
            return false;
        }
    }

    // Check if any select input has a selected option
    for (let i = 0; i < selectInputs.length; i++) {
        const select = $(selectInputs[i]);
        const selectId = select.attr('id');
        if (fieldsToIgnore.includes(selectId)) continue;

        const selectedOptions = select.find('option:selected');
        if (selectedOptions.length > 0 && selectedOptions.val() !== '') {
            return false;
        }
    }

    // Check if any radio or checkbox input is checked
    const checkedInputs = viewElement.find('input[type="radio"]:checked, input[type="checkbox"]:checked');
    for (let i = 0; i < checkedInputs.length; i++) {
        const input = $(checkedInputs[i]);
        const inputId = input.attr('name').split('-').pop();
        if (fieldsToIgnore.includes(inputId)) continue;

        return false;
    }

    return true; // All inputs are empty
}

/** Check whether a form input is empty.
 * @param {HTMLElement|string} fieldEleOrId - The field element or the field ID string.
 * @param {string} type - The type of field to check. Supported values:
 *        - 'choice': Radio buttons or checkboxes — returns true if none are selected.
 *        - 'textarea': Text, number, email inputs, or textarea — returns true if empty.
 *        - 'dropdown': Select dropdown — returns true if no option is selected.
 * @returns {boolean} True if the field is empty, false otherwise.*/
const isInputEmpty = (fieldEleOrId, type) => {
    const fieldEle = typeof fieldEleOrId === 'string'
        ? document.getElementById(fieldEleOrId)
        : fieldEleOrId;

    if (!fieldEle) {
        console.warn(`isInputEmpty: element not found for`, fieldEleOrId);
        return null;
    }

    switch (type) {
        case 'choice': {
            const checked = fieldEle.querySelectorAll('input:checked');
            return checked.length === 0;
        }
        case 'textarea': {
            const input = fieldEle.querySelector('textarea, input[type="text"], input[type="number"], input[type="email"]');
            return !input || input.value.trim() === '';
        }
        case 'dropdown': {
            const select = fieldEle.querySelector('select');
            const value = select ? select.value : '';
            return value === '' || value === null;
        }
        default:
            console.warn(`isInputEmpty: unknown field type "${type}"`);
            return false;
    }
};

/**
 * Replace value in table cell if match found - replaces if matchTxt is ANYWHERE in the TD.
 * @param {string} viewId - ID of the view containing the table.
 * @param {number|string} colHeadID - Field ID of the column header.
 * @param {string} matchTxt - Text to match anywhere in the cell.
 * @param {string} replaceTxt - Text to replace the matched cell with.
 */
function replaceValueInTD(viewId, colHeadID, matchTxt, replaceTxt) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const table = viewElement.querySelector('table');
    if (!table) return;

    const colIndex = getIndexOfColumnHeader(table, colHeadID);
    if (colIndex === -1) return;

    getAllTableRows(viewId, (index, row) => {
        const cell = row.querySelectorAll('td')[colIndex];
        if (cell && cell.textContent.trim().includes(matchTxt)) {
            cell.textContent = replaceTxt;
        }
    });
}

/** Filter values from dropdown based on text to match, if item contains the text show it else hide
 * @param {integer} viewID - view id where select is
 * @param {integer} fieldTofilter - ID of field to filter
 * @param {string} textToMatch - ID of conx field to filter to**/
function filterSelectByText(viewId, fieldTofilter, textToMatch){
    $('#' + viewId + `_field_${fieldTofilter}_chzn li`).each(function () {
        if ($(this).text().indexOf(textToMatch) != -1) {
            $(this).show(); //match found so show the list item
        } else {
            $(this).hide(); //match match so hide
        }
    });
}

   /** Trigger a webhook
     * @param {string} webhookURL - Webhook URL including any params to pass in
     * @param {object} data - data object to be sent to the webhook
     * @param {string} [webhookName='Unnamed Webhook'] - Name for webhook used for console log
     * @param {boolean} [isSecure=false] - Optional flag to indicate if user token should be included
     * @returns {Promise<{success: boolean, data: object|string|null, error: string|null}>} */
   async function triggerWebhook(webhookURL, data, webhookName = 'Unnamed Webhook', isSecure = false) {
    if (!webhookURL.startsWith('https://')) {
        const errorMsg = `Invalid webhook URL: ${webhookURL} in webhook: ${webhookName}`;
        console.error(errorMsg);
        return { error: errorMsg };
    }

    const parseResponse = async (response) => {
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    };

    let responseData = null;
    try {
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                userToken: isSecure ? Knack.getUserToken() : '',
            },
            body: JSON.stringify(data),
        });

        responseData = await parseResponse(response);

        if (!response.ok) {
            console.error(`Webhook (${webhookName}) failed with status ${response.status}:`, responseData);
            throw new Error(`Network response was not ok: ${responseData}`);
        }

        console.log(`Webhook (${webhookName}) sent successfully with response:`, responseData);
        return { success: true, data: responseData, error: null };
    } catch (error) {
        console.error(`Error triggering webhook: ${webhookName}`, error);
        throw {
            success: false,
            data: responseData,
            error: error.message,
            webhookName: webhookName,
        };
    }
}

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
        const opts = options || {};
        const rows = Number.isFinite(opts.rows) ? opts.rows : 1000;
        const pageConcurrency = Number.isFinite(opts.pageConcurrency) && opts.pageConcurrency > 0
            ? Math.floor(opts.pageConcurrency)
            : 5;
        const pageOpts = { filters: opts.filters, sorters: opts.sorters, rows, rawResponse: true, timeout: opts.timeout };
        const failOnPageError = Boolean(opts.failOnPageError);

        const firstPage = await this.getRecords(sceneId, viewId, { ...pageOpts, page: 1 });
        const totalPages = Number(firstPage?.total_pages || 0);
        const totalRecords = Number(firstPage?.total_records || 0);
        const allRecords = Array.isArray(firstPage?.records) ? [...firstPage.records] : [];

        this._log('Fetching all records', { totalPages, totalRecords });

        if (totalRecords === 0 || totalPages <= 1) {
            return allRecords;
        }

        for (let batchStart = 2; batchStart <= totalPages; batchStart += pageConcurrency) {
            const batchEnd = Math.min(totalPages, batchStart + pageConcurrency - 1);
            const pageNumbers = [];
            for (let page = batchStart; page <= batchEnd; page++) pageNumbers.push(page);

            const batchResults = await Promise.allSettled(
                pageNumbers.map(page => this.getRecords(sceneId, viewId, { ...pageOpts, page }))
            );

            for (let index = 0; index < batchResults.length; index++) {
                const result = batchResults[index];
                const page = pageNumbers[index];

                if (result.status === 'fulfilled') {
                    const nextPage = result.value;
                    if (Array.isArray(nextPage?.records)) allRecords.push(...nextPage.records);
                    continue;
                }

                this._log('Page fetch failed', {
                    sceneId,
                    viewId,
                    page,
                    error: result.reason?.message || result.reason
                }, 'warn');

                if (failOnPageError) {
                    throw result.reason;
                }
            }

            if (typeof opts.onProgress === 'function') {
                opts.onProgress({
                    page: batchEnd,
                    totalPages,
                    recordsLoaded: allRecords.length,
                    totalRecords,
                    percentage: Math.round((batchEnd / totalPages) * 100)
                });
            }
        }

        return allRecords;
    }

    /**
     * Retrieves child records connected to a parent record
     * @param {string} sceneId - The scene ID/key/slug where the parent record is displayed
     * @param {string} viewId - The view ID/key where the parent record is displayed
     * @param {string} recordId - The ID of the parent record
     * @param {string} connectionFieldKey - The field key that connects child records to the parent
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
    async getRecordChildren(sceneId, viewId, recordId, connectionFieldKey, options = {}) {
        const opts = options || {};
        const params = this._buildQueryParams(opts);

        // Format URL for child records
        // For view-based API, we use the pattern:
        // /pages/{scene_slug}/views/{view_key}/records?{scene_slug}_id={record_id}
        const url = this._formatApiUrl(sceneId, viewId);

        // Add the parent record ID as a parameter
        params[`${connectionFieldKey}_id`] = recordId;

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
     * @param {string} connectionFieldKey - The field key that connects child records to the parent
     * @param {Object} [options] - Optional parameters
     * @param {number} [options.rows=1000] - Number of rows per page
     * @param {Function} [options.onProgress] - Optional progress callback
     * @returns {Promise<Array<Object>>} - All connected child records
     * @public
     */
    async getAllRecordChildren(sceneId, viewId, recordId, connectionFieldKey, options = {}) {
        const opts = options || {};
        const rows = Number.isFinite(opts.rows) ? opts.rows : 1000;
        const pageConcurrency = Number.isFinite(opts.pageConcurrency) && opts.pageConcurrency > 0
            ? Math.floor(opts.pageConcurrency)
            : 5;
        const pageOpts = { filters: opts.filters, sorters: opts.sorters, rows, rawResponse: true, timeout: opts.timeout };
        const failOnPageError = Boolean(opts.failOnPageError);

        const firstPage = await this.getRecordChildren(sceneId, viewId, recordId, connectionFieldKey, { ...pageOpts, page: 1 });
        const totalPages = Number(firstPage?.total_pages || 0);
        const totalRecords = Number(firstPage?.total_records || 0);
        const allRecords = Array.isArray(firstPage?.records) ? [...firstPage.records] : [];

        this._log('Fetching all child records', { totalPages, totalRecords });

        if (totalRecords === 0 || totalPages <= 1) {
            return allRecords;
        }

        for (let batchStart = 2; batchStart <= totalPages; batchStart += pageConcurrency) {
            const batchEnd = Math.min(totalPages, batchStart + pageConcurrency - 1);
            const pageNumbers = [];
            for (let page = batchStart; page <= batchEnd; page++) pageNumbers.push(page);

            const batchResults = await Promise.allSettled(
                pageNumbers.map(page => this.getRecordChildren(sceneId, viewId, recordId, connectionFieldKey, { ...pageOpts, page }))
            );

            for (let index = 0; index < batchResults.length; index++) {
                const result = batchResults[index];
                const page = pageNumbers[index];

                if (result.status === 'fulfilled') {
                    const nextPage = result.value;
                    if (Array.isArray(nextPage?.records)) allRecords.push(...nextPage.records);
                    continue;
                }

                this._log('Child page fetch failed', {
                    sceneId,
                    viewId,
                    recordId,
                    connectionFieldKey,
                    page,
                    error: result.reason?.message || result.reason
                }, 'warn');

                if (failOnPageError) {
                    throw result.reason;
                }
            }

            if (typeof opts.onProgress === 'function') {
                opts.onProgress({
                    page: batchEnd,
                    totalPages,
                    recordsLoaded: allRecords.length,
                    totalRecords,
                    percentage: Math.round((batchEnd / totalPages) * 100)
                });
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
    * @param {boolean} [options.autoUploadAssets=false] - Upload File/Blob values and replace with Knack asset IDs before create.
    * @param {string[]} [options.assetFieldIds] - Optional allow-list of asset field keys.
    * @param {Object<string, 'file'|'image'>} [options.assetTypesByField] - Optional per-field upload type override.
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

        let created = 0;
        let failed = 0;
        let rateLimit429Count = 0;
        let firstError = null;
        const failedIndices = [];
        const createdRecords = [];
        const effectiveRefresh = this._normalizeRefreshViews(options?.refreshViews);
        const batchOptions = { ...(options || {}) };
        delete batchOptions.refreshViews;
        const { opts, staggerMs, workerCount, requestOptions } = this._buildBatchContext(total, batchOptions, () => {
            rateLimit429Count += 1;
        });

        try {
            const batchResult = await this._runBatchWorkers({
                total,
                workerCount,
                staggerMs,
                continueOnError: opts.continueOnError,
                execute: async (index) => {
                    try {
                        const record = await this.createRecord(sceneId, viewId, payloads[index], requestOptions);
                        created += 1;
                        createdRecords[index] = record;
                        if (typeof opts.onProgress === 'function') {
                            opts.onProgress({ created, failed, total, index, record });
                        }
                    } catch (error) {
                        failed += 1;
                        failedIndices.push(index);
                        if (typeof opts.onProgress === 'function') {
                            opts.onProgress({ created, failed, total, index, error });
                        }
                        if (!opts.continueOnError) {
                            throw error;
                        }
                    }
                }
            });
            firstError = batchResult.firstError;

            await this._refreshAfterWrite(effectiveRefresh);
            this._logBatchFailures('KNF_1028', 'create', `${sceneId}/${viewId}`, failedIndices.length, total, `at indices: ${failedIndices.join(', ')}`);

            if (firstError && !opts.continueOnError) {
                throw firstError;
            }

            return { total, created, failed, records: createdRecords.filter(Boolean) };
        } finally {
            const processed = created + failed;
            this._logBatchSummary('create', `${sceneId}/${viewId}`, processed, total, rateLimit429Count);
        }
    }

    /**
     * Uploads a File/Blob as a Knack asset and returns the uploaded asset payload.
     * @param {File|Blob} file
     * @param {Object} [options]
     * @param {'file'|'image'} [options.assetType] - Optional override. Auto-detected from mime type when omitted.
     * @param {number} [options.timeout] - Optional timeout override.
     * @returns {Promise<Object>} Uploaded asset payload (must include id).
     * @public
     */
    async uploadAsset(file, options = {}) {
        if (!(file instanceof Blob)) {
            throw new Error('KnackAPI uploadAsset requires a File/Blob.');
        }

        const opts = options || {};
        const appId = Knack?.application_id;
        if (!appId) {
            throw new Error('KnackAPI uploadAsset missing Knack application id.');
        }

        const inferredType = (file?.type || '').startsWith('image/') ? 'image' : 'file';
        const assetType = opts.assetType === 'image' || opts.assetType === 'file' ? opts.assetType : inferredType;
        const base = String(Knack?.api_dev || '').replace(/\/$/, '');
        const url = `${base}/applications/${appId}/assets/${assetType}/upload`;
        const uploadFileName = typeof file?.name === 'string' && file.name.length ? file.name : 'upload.bin';

        const formData = new FormData();
        formData.append('files', file, uploadFileName);

        return this._enqueueWrite(async () => {
            const result = await this._request(
                url,
                {
                    method: 'POST',
                    headers: this._buildUploadHeaders(),
                    body: formData,
                    rateLimitHandler: (delayMs) => this._notifyWriteRateLimit(delayMs),
                    onRateLimit429: typeof opts._on429 === 'function' ? opts._on429 : null
                },
                opts.timeout
            );

            const asset = Array.isArray(result) ? result[0] : result;
            if (!asset || !asset.id) {
                throw new Error('KnackAPI uploadAsset succeeded but no asset id was returned.');
            }

            return asset;
        });
    }

    /**
     * Replaces File/Blob field values with uploaded Knack asset IDs when autoUploadAssets is enabled.
     * @param {Object} recordData
     * @param {Object} [options]
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

        for (const [fieldKey, value] of Object.entries(data)) {
            if (!(value instanceof Blob)) continue;
            if (allowList && !allowList.has(fieldKey)) continue;
            if (!allowList && !this._isAssetField(fieldKey)) continue;

            const assetType = typesByField[fieldKey];
            const asset = await this.uploadAsset(value, {
                timeout: options.timeout,
                assetType
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

        const normalizedKey = typeof knackNavigator?.normalizeFieldId === 'function'
            ? knackNavigator.normalizeFieldId(fieldKey)
            : fieldKey;
        const fromNavigator = typeof knackNavigator?.getFieldType === 'function'
            ? knackNavigator.getFieldType(normalizedKey)
            : null;
        if (fromNavigator === 'file' || fromNavigator === 'image') {
            return true;
        }

        const fieldModel = Knack?.objects?.getField?.(normalizedKey);
        const fieldType = fieldModel?.attributes?.type || null;
        return fieldType === 'file' || fieldType === 'image';
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
                const requestedKeys = Object.keys(recordData || {});
                const failed = [];
                for (const key of requestedKeys) {
                    const sentVal = recordData[key];
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

        const effectiveRefresh = this._normalizeRefreshViews(opts.refreshViews);
        const batchOptions = { ...opts };
        delete batchOptions.refreshViews;
        let updated = 0;
        let failed = 0;
        let rateLimit429Count = 0;
        let firstError = null;
        const failedRecordIds = [];
        const { opts: batchOpts, staggerMs, workerCount, requestOptions } = this._buildBatchContext(total, batchOptions, () => {
            rateLimit429Count += 1;
        });

        try {
            const batchResult = await this._runBatchWorkers({
                total,
                workerCount,
                staggerMs,
                continueOnError: batchOpts.continueOnError,
                execute: async (index) => {
                    const { id: recordId, data } = records[index];
                    try {
                        await this.updateRecord(sceneId, viewId, recordId, data, requestOptions);
                        updated += 1;
                        if (typeof batchOpts.onProgress === 'function') {
                            batchOpts.onProgress({ updated, failed, total, recordId });
                        }
                    } catch (error) {
                        failed += 1;
                        failedRecordIds.push(recordId);
                        if (typeof batchOpts.onProgress === 'function') {
                            batchOpts.onProgress({ updated, failed, total, recordId, error });
                        }
                        if (!batchOpts.continueOnError) {
                            throw error;
                        }
                    }
                }
            });
            firstError = batchResult.firstError;

            await this._refreshAfterWrite(effectiveRefresh);
            this._logBatchFailures('KNF_1029', 'update', `${sceneId}/${viewId}`, failedRecordIds.length, total, `: ${failedRecordIds.join(', ')}`);

            if (firstError && !batchOpts.continueOnError) {
                throw firstError;
            }

            return { total, updated, failed };
        } finally {
            const processed = updated + failed;
            this._logBatchSummary('update', `${sceneId}/${viewId}`, processed, total, rateLimit429Count);
        }
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

        let deleted = 0;
        let failed = 0;
        let rateLimit429Count = 0;
        let firstError = null;
        const failedRecordIds = [];
        const effectiveRefresh = this._normalizeRefreshViews(options?.refreshViews);
        const batchOptions = { ...(options || {}) };
        delete batchOptions.refreshViews;
        const { opts: batchOpts, staggerMs, workerCount, requestOptions } = this._buildBatchContext(total, batchOptions, () => {
            rateLimit429Count += 1;
        });

        try {
            const batchResult = await this._runBatchWorkers({
                total,
                workerCount,
                staggerMs,
                continueOnError: batchOpts.continueOnError,
                execute: async (index) => {
                    const recordId = ids[index];
                    try {
                        await this.deleteRecord(sceneId, viewId, recordId, requestOptions);
                        deleted += 1;
                        if (typeof batchOpts.onProgress === 'function') {
                            batchOpts.onProgress({ deleted, failed, total, recordId });
                        }
                    } catch (error) {
                        failed += 1;
                        failedRecordIds.push(recordId);
                        if (typeof batchOpts.onProgress === 'function') {
                            batchOpts.onProgress({ deleted, failed, total, recordId, error });
                        }
                        if (!batchOpts.continueOnError) {
                            throw error;
                        }
                    }
                }
            });
            firstError = batchResult.firstError;

            await this._refreshAfterWrite(effectiveRefresh);
            this._logBatchFailures('KNF_1030', 'delete', `${sceneId}/${viewId}`, failedRecordIds.length, total, `: ${failedRecordIds.join(', ')}`);

            if (firstError && !batchOpts.continueOnError) {
                throw firstError;
            }

            return { total, deleted, failed };
        } finally {
            const processed = deleted + failed;
            this._logBatchSummary('delete', `${sceneId}/${viewId}`, processed, total, rateLimit429Count);
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
     * Creates an AbortController with timeout
     * @param {number} [timeout] - Optional timeout override in milliseconds
     * @returns {Object} - Object containing controller and signal
     * @private
     */
    _createAbortController(timeout) {
        const controller = new AbortController();
        const timeoutMs = timeout ?? this.options.timeout;

        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        return {
            controller,
            signal: controller.signal,
            clear: () => clearTimeout(timeoutId)
        };
    }

    /**
     * Get the authorization token for API requests
     * @returns {string} - Knack authorization token
     * @private
     */
    _getAuthToken() {
        return Knack.getUserToken();
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
     * Handles API response and extracts data
     * @param {Response} response - Fetch API response
     * @returns {Promise<Object>} - Parsed response data
     * @throws {Error} If response is not OK
     * @private
     */
    async _handleResponse(response) {
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ message: "Unknown error" }));
            throw new Error(`API error ${response.status}: ${errorBody.message || response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Executes an API request with proper error handling.
     * @param {string} url - The API URL
     * @param {Object} options - Fetch options
     * @param {AbortSignal} signal - AbortController signal
     * @returns {Promise<Object>} - Response data
     * @private
     */
    async _executeRequest(url, options, signal) {
        return this._request(url, options, signal ? undefined : this.options.timeout);
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
     * Builds headers for API requests
     * @param {boolean} withAuth - Whether to include authorization header
     * @returns {Object} - Headers object
     * @private
     */
    _buildHeaders(withAuth = true) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Knack-Application-ID': Knack.application_id,
            'X-Knack-REST-API-Key': 'knack'
        };

        if (withAuth) {
            const token = this._getAuthToken();
            if (token) {
                headers['Authorization'] = token;
            }
        }

        return headers;
    }

    /**
     * Builds headers for multipart upload requests.
     * Content-Type is intentionally omitted so the browser can set the proper boundary.
     * @param {boolean} withAuth - Whether to include authorization header
     * @returns {Object} Headers object
     * @private
     */
    _buildUploadHeaders(withAuth = true) {
        const headers = {
            'X-Knack-Application-ID': Knack.application_id,
            'X-Knack-REST-API-Key': 'knack'
        };

        if (withAuth) {
            const token = this._getAuthToken();
            if (token) {
                headers['Authorization'] = token;
            }
        }

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
     * Builds sort parameters for API requests
     * @param {Array<Object>|Object} sorters - Sort specifications
     * @returns {Object} - Formatted sort parameters
     * @public
     */
    buildSorters(sorters) {
        if (!sorters) return {};

        // Handle single sorter object case
        if (!Array.isArray(sorters)) {
            sorters = [sorters];
        }

        const formattedSorters = {};

        sorters.forEach((sorter, index) => {
            const sorterKey = `sort[${index}]`;

            if (sorter.field) {
                formattedSorters[`${sorterKey}[field]`] = sorter.field;
            }

            if (sorter.direction) {
                formattedSorters[`${sorterKey}[direction]`] = sorter.direction;
            } else {
                formattedSorters[`${sorterKey}[direction]`] = 'asc';
            }
        });

        return formattedSorters;
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
                const view = Knack.views[viewId];

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

                // Search views: skip fetch/render, just use renderResults
                if (viewType === 'search') {
                    if (typeof view.renderResults === 'function') {
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
     * Backward-compatible alias for older internals.
     * @param {Function} task
     * @returns {Promise<*>}
     * @private
     */
    _scheduleWrite(task) {
        return this._enqueueWrite(task);
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

        const maxRetries = this.options.maxRetries;
        const maxAttempts = 1 + maxRetries;
        const retryOnStatus = this.options.retryOnStatus;
        const baseDelay = this.options.retryDelayBase;
        const maxDelay = this.options.retryDelayMax;
        const min429Delay = this.options.retryDelayMin429;
        const timeoutMs = Number.isFinite(timeoutOverride) ? timeoutOverride : this.options.timeout;

        let attempt = 0;
        const { rateLimitHandler, onRateLimit429, headers, ...requestOptions } = options || {};

        this._toggleSpinner(true);

        try {
            while (attempt < maxAttempts) {
                attempt += 1;
                const method = (requestOptions.method || 'GET').toUpperCase();
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

                try {
                    const fetchOptions = {
                        method,
                        headers: headers || (requestOptions.body instanceof FormData ? this._buildUploadHeaders() : this._buildHeaders()),
                        signal: controller.signal
                    };

                    if (requestOptions.body !== undefined && requestOptions.body !== null && !['GET', 'HEAD'].includes(method)) {
                        fetchOptions.body = requestOptions.body;
                    }

                    const response = await fetch(url, fetchOptions);
                    const responseText = await response.text();

                    if (response.ok) {
                        const result = responseText ? (() => {
                            try {
                                return JSON.parse(responseText);
                            } catch (error) {
                                return responseText;
                            }
                        })() : {};

                        this._log('API response', result);
                        return result;
                    }

                    const status = response?.status;

                    if (status === 429 && typeof onRateLimit429 === 'function') {
                        onRateLimit429();
                    }

                    const isRetryable = retryOnStatus.includes(status);
                    if (!isRetryable || attempt >= maxAttempts) {
                        throw this._buildRequestError({
                            status,
                            statusText: response?.statusText,
                            responseText,
                            headers: response?.headers
                        });
                    }

                    const retryIndex = attempt - 1;
                    const backoffDelay = this._computeBackoffMs(baseDelay, maxDelay, retryIndex);
                    const retryAfterDelay = this._getRetryAfterDelayMs(response);
                    const delay = status === 429
                        ? Math.max(backoffDelay, Number(min429Delay) || 0, retryAfterDelay)
                        : backoffDelay;

                    if (status === 429 && typeof rateLimitHandler === 'function') {
                        rateLimitHandler(delay);
                    }

                    this._log('Retrying request', { status, attempt, delay }, 'warn');
                    await new Promise(resolve => setTimeout(resolve, delay));
                } catch (error) {
                    const isTimeout = error?.name === 'AbortError';
                    if (isTimeout) {
                        throw this._buildRequestError({
                            status: 0,
                            statusText: 'Request timeout',
                            responseText: ''
                        });
                    }

                    if (error instanceof Error && error.status !== undefined) {
                        throw error;
                    }

                    const status = error?.status;
                    const isRetryable = retryOnStatus.includes(status);
                    if (!isRetryable || attempt >= maxAttempts) {
                        throw this._buildRequestError(error);
                    }

                    const retryIndex = attempt - 1;
                    const delay = this._computeBackoffMs(baseDelay, maxDelay, retryIndex);
                    this._log('Retrying request', { status, attempt, delay }, 'warn');
                    await new Promise(resolve => setTimeout(resolve, delay));
                } finally {
                    clearTimeout(timeoutId);
                }
            }
        } finally {
            this._toggleSpinner(false);
        }

        throw new Error('Max retries exceeded');
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
            message = json?.message || json?.error || message;
        } catch (error) {
            // ignore parse errors
        }

        const requestError = new Error(`API error ${status}: ${message}`);
        requestError.status = status;
        requestError.body = responseText || null;
        return requestError;
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
    }

    return fallbackClient;
}

/** Retrieves a nested value from an object using a dot-separated path.
 * Example: const obj = { a: { b: { c: 123 } } }; getNestedValue(obj, 'a.b.c'); // returns 123
 * @param {Object} obj - The object to extract the value from.
 * @param {string} path - Dot-separated path string (e.g. 'field_2398_raw.street').
 * @returns {*} - The value at the given path, or undefined if any level is missing. */
function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/** Extracts plain text from an HTML string.
 * @param {string} htmlString - The HTML content.
 * @returns {string} Text content without HTML tags.*/
function removeHtml(htmlString) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    return tempDiv.textContent;
}

/** Searches for an element containing the exact text provided.
 * Can optionally filter by tag name and class name, within a specific root element.
 * @param {string} text - The exact text content to search for.
 * @param {Element|Document} [root=document] - The root element to search within.
 * @param {Object} [filter={}] - Optional filters: { tag, class }
 * @returns {Element|null} - The found element or null if no match is found.
 */
function findElementByText(text, root = document, filter = {}) {
    const { tag, class: classFilter } = filter;

    const elements = tag ? root.querySelectorAll(tag) : root.querySelectorAll('*');

    for (let element of elements) {
        const matchesClass = classFilter
            ? classFilter.split(/\s+/).every(cls => element.classList.contains(cls))
            : true;

        if (matchesClass && element.textContent.trim() === text) {
            return element;
        }
    }
    console.warn(`[findElementByText] No element found with text "${text}"` +
        (tag ? `, tag "${tag}"` : '') +
        (classFilter ? `, class "${classFilter}"` : ''));

    return null;
}

/**
 * Gets the selected radio value for a given Knack field ID.
 * @param {string|number} fieldId - Knack field ID
 * @param {ParentNode} [root=document] - Optional root element to scope the lookup.
 * @returns {string} The trimmed value of the selected radio input, or an empty string if none selected*/
function getSelectedRadioValue(fieldId, root = document) {
    const containerId = `kn-input-field_${fieldId}`;
    const container = root?.querySelector ? root.querySelector(`#${containerId}`) : document.getElementById(containerId);
    const checked = container?.querySelector('input[type="radio"]:checked');
    return checked?.value?.trim() || '';
}

/**
 * Gets the selected value/s for a Knack select field.
 * Returns a string for single selects and an array of strings for multi-selects.
 * @param {string|number} fieldId - Knack field ID
 * @param {ParentNode} [root=document] - Optional root element to scope the lookup.
 * @returns {string|string[]} The selected option value(s).
 */
function getSelectedValue(fieldId, root = document) {
    const containerId = `kn-input-field_${fieldId}`;
    const container = root?.querySelector ? root.querySelector(`#${containerId}`) : document.getElementById(containerId);
    const selectEl = container?.querySelector('select');

    if (!selectEl) {
        return '';
    }

    if (selectEl.multiple) {
        return Array.from(selectEl.selectedOptions || []).map(function (option) {
            return option.value.trim();
        }).filter(Boolean);
    }

    return selectEl.value?.trim() || '';
}

/** Replace text in given selector or td (using field ID) with that passed in when regex matched
 * @param {string|integer} selectorOrFieldID - selector or ID of td field where text to replace is
 * @param {regex} regex - regex to match
 * @param {string} replaceTxt - text to replace matched text with
 * @param {boolean} replaceAll - if true, replace all occurrences of the matched text */
function replaceTextRegex(selectorOrFieldID, regex, replaceTxt, replaceAll = false) {
    const selector = typeof selectorOrFieldID === 'number' ? `td.field_${selectorOrFieldID}` : selectorOrFieldID;

    $(selector).each(function () {
        const oldText = $(this).text();
        const newText = replaceAll ? oldText.replaceAll(regex, replaceTxt) : oldText.replace(regex, replaceTxt);
        $(this).text(newText);
    });
}

/**
 * Show/hide message based on value(s) of selected option in one or more dropdowns
 * @param {string} viewId - View ID where select element(s) are located
 * @param {number|number[]} fieldIds - ID or array of select field IDs
 * @param {string|string[]} valuesToMatch - Value or array of values to match to show the message
 * @param {string} msgSelector - CSS selector for the message element to show/hide
 * @param {boolean} isConxSelect - Whether this is a connection field select
 *
 * @example
 * // Show message if any of the selects has value 'Yes' or 'Maybe'
 * showHideMsgBasedOnSelect('view_123', [456, 789], ['Yes', 'Maybe'], '#myMsg');
 */
function showHideMsgBasedOnSelect(viewId, fieldIds, valuesToMatch, msgSelector, isConxSelect = false) {
    // Normalize fieldIds and valuesToMatch to arrays for consistent handling
    const fieldIdArr = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
    const matchValues = Array.isArray(valuesToMatch) ? valuesToMatch : [valuesToMatch];

    // Helper to get selected value for a field
    function getSelectedValue(fieldId) {
        if (isConxSelect) {
            const selectedItem = document.querySelector(`#${viewId}_field_${fieldId}_chzn li.result-selected`);
            return selectedItem ? selectedItem.textContent.trim() : '';
        } else {
            const selectElement = document.getElementById(`${viewId}-field_${fieldId}`);
            return selectElement ? selectElement.value : '';
        }
    }

    // Function to check all fields and toggle message
    const toggleMessageBasedOnSelect = () => {
        const hasMatch = fieldIdArr.some(fieldId => matchValues.includes(getSelectedValue(fieldId)));
        toggleMessage(hasMatch, msgSelector);
    };

    // Attach listeners to all select elements
    fieldIdArr.forEach(fieldId => {
        const selectElement = document.getElementById(`${viewId}-field_${fieldId}`);
        if (!selectElement) {
            console.error(`Select element not found: ${viewId}-field_${fieldId}`);
            return;
        }
        addInputEventListener(selectElement, toggleMessageBasedOnSelect, { runOnInit: true });
    });
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

/** Show/Hide message based on value(s) of radio button(s), optional callback fnc.
 * @param {integer|array} fieldID - Field ID(s) of the radio button or an array of field IDs
 * @param {string|array} valuesToMatch - Value(s) to match to show the message
 * @param {string} selector - Selector for the message to show/hide
 * @param {function} [callback] - Optional callback function to execute on change
 * @param {object} [params] - Optional object containing additional parameters to pass to the callback*/
function showHideEleBasedOnRadios(fieldID, valuesToMatch, selector, isMultiple = false) {
    const fieldSelector = `#kn-input-field_${fieldID}`;

    if ($(fieldSelector).length === 0) { // Check field exsists
        console.error(`Field with ID ${fieldID} not found on the page.`);
        return;
    }

    if ($(selector).length === 0) {  // Check target selector exists
        console.error(`Target selector "${selector}" not found on the page.`);
        return;
    }

    $(fieldSelector).change(function () {
        const selectVal = $(`${fieldSelector} :checked`).val();
        const matchCondition = isMultiple
            ? $.inArray(selectVal, valuesToMatch) !== -1
            : selectVal == valuesToMatch;
        $(selector).toggle(matchCondition);
    }).change();
}

/** show or hide element if match to key found in string in key/vale object
 * @param {string} searchStr - string to search for match
 * @param {object} selectorMap - key/value pairs {string : selector} */
function showHideEleBasedOnString(searchStr, selectorMap) {
    Object.entries(selectorMap).forEach(([key, selector]) => {
        const shouldShow = searchStr.includes(key);
        $(selector).toggle(shouldShow);
    });
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

const isNodeList = val => NodeList.prototype.isPrototypeOf(val);
const isjQueryInstance = val => window.jQuery && val instanceof window.jQuery;

/**
 * Normalises any supported selector/collection into a flat array of HTMLElements.
 * @param {HTMLElement|HTMLElement[]|NodeList|string|jQuery} target - Inputs or selector to resolve
 * @returns {HTMLElement[]} Array of matched elements (possibly empty)
 * @example
 * const inputs = normaliseInputs('#view_123 input');
 */
function normaliseInputs(target) {
    if (!target) return [];
    if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
    if (isjQueryInstance(target)) return target.toArray();
    if (Array.isArray(target)) return target;
    if (isNodeList(target)) return Array.from(target);
    return [target];
}

/**
 * Escapes a string for safe use inside CSS selectors.
 * Falls back to a manual escape when CSS.escape is unavailable.
 * @param {string} value - Raw selector fragment
 * @returns {string} Escaped selector fragment
 * @example
 * const safeName = cssEscape('[field]');
 */
function cssEscape(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_\-])/g, '\\$1');
}

/** Clear the value(s) of a given input or array of inputs.
 * Supports text/date/select/textarea/checkbox/radio.
 * @param {HTMLElement|HTMLElement[]|NodeList|string|jQuery} input - Input(s) or selector to clear
 * @param {boolean} triggerChange - whether to trigger change/input events*/
function clearInput(inputContainer, triggerChange = false) {
    const normalisedInputs = normaliseInputs(inputContainer);

    normalisedInputs.forEach(field => {
        if (!field) return;

        const inputs = field.matches && field.matches('input, select, textarea')
            ? [field]
            : Array.from(field.querySelectorAll('input, select, textarea'));

        if (!inputs.length) return;

        const processedRadioGroups = new Set();

        inputs.forEach(input => {
            if (!input) return;

            const targetInputs = (() => {
                if (input.type !== 'radio' || !input.name) {
                    return [input];
                }

                if (processedRadioGroups.has(input.name)) {
                    return [];
                }
                processedRadioGroups.add(input.name);

                const scoped = field.querySelectorAll
                    ? field.querySelectorAll(`${INPUT_RADIO_SELECTOR}[name="${cssEscape(input.name)}"]`)
                    : [];
                if (scoped.length) return Array.from(scoped);

                const globalRadios = document.querySelectorAll(`${INPUT_RADIO_SELECTOR}[name="${cssEscape(input.name)}"]`);
                return globalRadios.length ? Array.from(globalRadios) : [input];
            })();

            targetInputs.forEach(targetInput => {
                const hadValue = (targetInput.type === 'checkbox' || targetInput.type === 'radio')
                    ? targetInput.checked
                    : targetInput.value !== '';

                if (targetInput.type === 'checkbox' || targetInput.type === 'radio') {
                    targetInput.checked = false;
                } else if (targetInput.tagName === 'SELECT') {
                    if (targetInput.multiple) {
                        Array.from(targetInput.options).forEach(option => option.selected = false);
                    } else {
                        targetInput.selectedIndex = -1;
                    }

                    if (typeof window !== 'undefined' && window.jQuery) {
                        const selectEl = $(targetInput);
                        if (selectEl.data('chosen')) {
                            selectEl.trigger('liszt:updated');
                        }
                    }
                } else {
                    targetInput.value = '';
                }

                if (triggerChange && hadValue) {
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    });
}

/**
 * Hides or shows a checkbox option by its value or label text.
 * Works with both connection-picker checkboxes and multiple-choice checkboxes.
 * @param {string} fieldId - The Knack field ID (e.g. 'field_2071').
 * @param {string} identifier - The checkbox value (connection ID) or label text to match.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleCheckboxOption(fieldId, identifier, show) {
    const fieldContainer = document.getElementById(`kn-input-${fieldId}`);
    if (!fieldContainer) {
        console.warn(`toggleCheckboxOption: Field container not found for ${fieldId}`);
        return;
    }

    // Try matching by value first, then fall back to matching by label text
    let checkbox = fieldContainer.querySelector(`input[type="checkbox"][value="${identifier}"]`);
    if (!checkbox) {
        const labels = fieldContainer.querySelectorAll('label.option, label.checkbox');
        for (const label of labels) {
            if (label.textContent.trim() === identifier) {
                checkbox = label.querySelector('input[type="checkbox"]');
                break;
            }
        }
    }
    if (!checkbox) {
        console.warn(`toggleCheckboxOption: No checkbox found for "${identifier}" in ${fieldId}`);
        return;
    }

    const optionLabel = checkbox.closest('label');
    if (optionLabel) {
        optionLabel.classList.toggle(CLASS_DISPLAY_NONE, !show);
    }
}

/**** Function to change the label text of a radio button
 * @param {integer} fieldId - field id of radio
 * @param {string} originalLabelText - current label text
 * @param {integer} newLabelTex - new text for label */
function changeRadioButtonLabel(fieldId, originalLabelText, newLabelText) {
    const field = $(`#kn-input-field_${fieldId}`);
    const label = field.find('label.option.radio').filter(function() {
        return $(this).text().trim() === originalLabelText;
    });

    const detachedInput = label.find('input').detach();
    label.text(` ${newLabelText}`);
    label.prepend(detachedInput);
}

/** Setup status field, set background color based on status
 * @param {string} fieldId - field ID number (without 'field_' prefix) that holds the status
 * @param {boolean} isAmber - default false, true if bg color should be amber if not complete/requested
 */
function setupFieldStatus(fieldId, isAmber = false) {
    // Find all elements with the given field class
    const fieldElements = document.querySelectorAll(`.field_${fieldId}`);

    if (!fieldElements.length) return;

    // Process each matching element
    fieldElements.forEach(element => {
        const fieldStatus = element.textContent.trim();
        // Apply appropriate background color based on status
        if (isAmber && fieldStatus.includes("Not")) {
            element.style.backgroundColor = "var(--warning)";
        }
        else if (!fieldStatus.includes("Not") && !isAmber) {
            element.style.backgroundColor = "var(--success)";
        }
    });
}

/** Remove 'null' from span
* @param {string} spanID - class of span to remove null from */
function removeNull(spanID) {
   removeElement(`span.${spanID}:contains("null")`);
}

/** Select val dropdown
 * @param {string} fieldID - ID of select field
 * @param {string} value - text to select */
function selectFromSelect(fieldID, value) {
    const optionExists = $(`${fieldID} option[value="${value}"]`).length > 0;
    if (optionExists) {
        $(`${fieldID} option[value="${value}"]`).prop("selected", true);
    } else {
        console.error(`Option "${value}" does not exist in the dropdown with ID "${fieldID}".`);
    }
}

/** Select val from conx dropdown
 * @param {string} viewId- ID of view where conx is
 * @param {integer} fieldID - ID of conx field
 * @param {string} txtVal - text to select */
function selectFromConx(viewId, fieldID, txtVal) {
    var selectArr = $('#' + viewId + `-field_${fieldID} option`);
    selectArr.each(function () {
        //console.log('Option Val: ' + $(this).val()); console.log('Option Txt: ' + $(this).text());
        if ($(this).text() == txtVal) {
            selectFromSelect('#' + viewId + `-field_${fieldID}`, $(this).val());
            return false;
        }
    });
}

/**** Add Placeholder to Field Input
 * @param {integer} fieldID - field ID
 * @param {string} placeholder - placeholder to put in input */
function addPlaceholderToInput(fieldID, placeholder) {
    const input = document.getElementById(`field_${fieldID}`);
    if (input) {
        input.setAttribute("placeholder", placeholder);
    }
}

/**
 * Waits for one or more fields in a Knack detail view to be available and retrieves their values.
 * * @param {object} options - The options for the function.
 * @param {string} options.viewId - The ID of the Knack view to wait for.
 * @param {number|number[]} options.fieldIds - The field ID(s) to retrieve values from.
 * @param {number} [options.delay=20000] - Maximum time to wait for the field(s) in milliseconds.
 * @param {boolean} [options.returnHtml=false] - If true, returns the HTML content; otherwise, returns text.
 * @returns {Promise<string|object|null>} - Field value(s) or null if not found.
 */
async function waitGetValueFromDetail({viewId, fieldIds, delay = 20000, returnHtml = false}) {
    // Normalize fieldIds to always be an array for uniform handling
    const fieldIdArray = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
    const fieldValues = {};

    try {
        // Attempt to wait for all fields and track missing fields
        const fieldStatuses = await Promise.all(
            fieldIdArray.map(async fieldId => {
                // Use viewId if provided; otherwise search globally
                const selector = viewId
                    ? `#${viewId} .field_${fieldId} .kn-detail-body span`
                    : `.field_${fieldId} .kn-detail-body span`;

                try {
                    const element = await waitSelector({
                        selector,
                        delay
                    });
                    return { fieldId, found: true, element };
                } catch (error) {
                    console.warn(`Field ${fieldId} not found ${viewId ? `in view ${viewId}` : 'globally'} within ${delay}ms.`);
                    return { fieldId, found: false, element: null };
                }
            })
        );

        // Retrieve values for all fields (or set null for missing fields)
        fieldStatuses.forEach(({ fieldId, found, element }) => {
            if (found && element) {
                const value = returnHtml
                    ? element.innerHTML?.trim() || null
                    : element.textContent?.trim() || null;
                fieldValues[fieldId] = value;
            } else {
                fieldValues[fieldId] = null;
            }
        });

        // If only one field ID was provided, return its value directly
        if (!Array.isArray(fieldIds)) {
            return fieldValues[fieldIds];
        }

        return fieldValues;
    } catch (error) {
        console.error(`Error retrieving values for fields in view ${viewId}:`, error);

        // Preserve already-found values and only set null for missing ones
        fieldIdArray.forEach(fieldId => {
            if (fieldValues[fieldId] === undefined) {
                fieldValues[fieldId] = null;
            }
        });

        return Array.isArray(fieldIds) ? fieldValues : null;
    }
}

/** Get value from a detail field
 * @param {string} fieldID - ID of the field where the value is located.
 * @param {boolean} [returnHtml=false] - Whether to return HTML instead of plain text.
 * @returns {string|null} - The text or HTML content of the specified field. */
function getValueFromDetail(fieldID, returnHtml = false) {
    const fieldElement = $(`.field_${fieldID} .kn-detail-body`).first();

    if (fieldElement.length === 0) {
        console.log(`Error: Element with field_${fieldID} not found.`);
        return null;
    }
    return returnHtml ? fieldElement.html().trim() : fieldElement.text().trim();
}

/**
 * Inserts the value from a detail field into a span or element.
 * @param {integer|string} fieldID - id of field where value is
 * @param {string} insertSpan - selector for the span/element to insert data into (e.g. "#mySpan" or ".myClass")
 */
function insertValFromDetail(fieldID, insertSpan) {
    const value = getValueFromDetail(fieldID);
    const elements = document.querySelectorAll(insertSpan);
    elements.forEach(el => {
        el.textContent = value;
    });
}

/**
 * Inserts the logged-in user's name into the specified element(s)
 * @param {string|Element|NodeList} selector - CSS selector, DOM element, or NodeList to insert the user name into
 * @param {Function} [callback] - Optional callback function to execute after inserting the username
 * @returns {string} - The inserted username
 */
function insertLoggedInUser(selector, callback) {
    try {
        // Get the current user's name from Knack
        const userName = Knack.getUserAttributes()?.name || 'Unknown User';

        // Handle different selector types
        if (typeof selector === 'string') {
            // CSS selector: Find all matching elements
            const elements = document.querySelectorAll(selector);
            if (elements.length === 0) {
                console.warn(`No elements found matching selector: ${selector}`);
                return userName;
            }

            // Insert the user name into each matching element
            elements.forEach(element => {
                element.textContent = userName;
            });
        } else if (selector instanceof Element) {
            // Single DOM element
            selector.textContent = userName;
        } else if (selector instanceof NodeList) {
            // NodeList of elements
            selector.forEach(element => {
                element.textContent = userName;
            });
        } else {
            console.error('Invalid selector type provided to insertLoggedInUser');
            return userName;
        }

        // Execute callback if provided
        if (typeof callback === 'function') {
            callback(userName);
        }

        return userName;
    } catch (error) {
        console.error('Error inserting logged in user:', error);
        return 'User Unknown';
    }
}

function borderRadiusLastVisible(viewId, delay) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const menuList = viewElement.querySelector('.menu-links__list');
    if (!menuList) return;

    const visibleLis = Array.from(menuList.children).filter(
        li => window.getComputedStyle(li).display !== 'none' && li.offsetParent !== null
    );

    if (visibleLis.length === 0) return;

    // Remove border-radius from all <a> first
    visibleLis.forEach(li => {
        const a = li.querySelector('a');
        if (a) a.style.borderRadius = '';
    });

    // Add border-radius to the last visible <a>
    const lastLi = visibleLis[visibleLis.length - 1];
    const lastA = lastLi.querySelector('a');
    if (lastA) lastA.style.borderRadius = '0 .35em .35em 0';

    if (delay) {
        setTimeout(() => borderRadiusLastVisible(viewId), delay);
    }
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
 * Opens a kn-asest file from a button click, either by redirecting or in an overlay/new window
 * @param {string} viewId - ID of view where button is located
 * @param {string} btnText - Text on the button to target
 * @param {string} filePath - Path to the file to open
 * @param {boolean} [openInNewWindow=false] - Whether to open in new window
 */
function openFileFromBtn(viewId, btnText, filePath, openInNewWindow = false) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) {
        console.error(`View element with ID ${viewId} not found`);
        return;
    }

    // Find all potential button elements in the view
    const allButtons = [];
    allButtons.push(...viewElement.querySelectorAll('a'));
    allButtons.push(...viewElement.querySelectorAll('button'));

    // Filter buttons by text content
    const matchingButtons = Array.from(allButtons).filter(btn => {
        return btn.textContent.trim().includes(btnText);
    });

    if (matchingButtons.length === 0) {
        console.error(`Button with text "${btnText}" not found in view ${viewId}`);
        return;
    }
    // Add click event listeners to all matching buttons
    matchingButtons.forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();

            if (openInNewWindow) {

                    // Parse the file extension from the path
                    const arr = filePath.split('.');
                    const extension = (arr[arr.length - 1] || '').toLowerCase();

                    // Generate API URL to access the file
                    const url = `https://api.knack.com/v1/applications/${Knack.application_id}/download/asset/${filePath}`;

                    // Get appropriate viewer URL based on file type
                    const viewerUrl = fileViewer(extension, url);

                    // Open in new window
                    window.open(viewerUrl, '_blank');

            } else {
                // Direct navigation by appending filePath to sanitised current URL
                window.location.href = sanitiseURL(window.location.href) + KN_ASSET_PREFIX + filePath;
            }
        });
    });

}

/***** Redirect to Prev pop-up from frm after close unless scene to ignore in  background
 * Note - more selectors can be added to listener
 * @param {object}  event - calling event
 * @param {string} newURL - url to redirect to */
function handleRedirect(event, newURL) {
    if (event.type === 'knack-form-submit') {
        setTimeout(() => {
            window.location.href = newURL;
        }, 300);
    } else if (event.type === 'knack-scene-render' || event.type === 'knack-view-render') {
        document.querySelectorAll('button.close-modal').forEach(btn => {
            btn.addEventListener('click', function () {
                setTimeout(() => {
                    window.location.href = newURL;
                }, 300);
            }, { once: true });
        });
    }
}

/** Get new url based on number of / to remove
* @param {string} currURL - The current URL */
function getNewURL(currURL, numPops = 3) {
    const urlSegments = sanitiseURL(currURL).split('/');
    for (let i = 1; i <= numPops; i++) {
        urlSegments.pop(); // Remove segment
    }
    return urlSegments.join('/');
}

/** Get the background scene ID (ignores any scenes inside a modal).
 * @returns {string|null} The DOM id of the background scene (e.g. 'kn-scene_1151'), or null if none found. */
function getBackgroundSceneId() {
    const allScenes = document.querySelectorAll('#knack-body .kn-scenes .kn-scene');
    for (const scene of allScenes) {
        if (!scene.closest('.kn-modal')) {
            return scene.id || null;
        }
    }
    return null;
}

/**
 * Check whether the current background scene should be ignored. Used in handleRedirect to prevent redirecting
 * @param {(number|string)[]} scenes - Array of scene IDs (can be numbers or strings).
 * @returns {boolean} True if the background scene matches one of the scenes to ignore.
 */
function isSceneToIgnore(scenes) {
    const backgroundSceneId = getBackgroundSceneId();

    if (!backgroundSceneId || !scenes.length) return false;
    const backgroundSceneNumber = Number(backgroundSceneId.replace('kn-scene_', ''));
    const sceneNumbers = scenes.map(scene => Number(scene)).filter(scene => !Number.isNaN(scene));

    return sceneNumbers.includes(backgroundSceneNumber);
}

/** Check if current user role  match for given user role/s will match if any ONE matches
     * @param {array} userRole - array of userroles
     * @return {boolean} - true if match found false otherwise */
function isUserRole(userRoleArr) {
    var matchFound = false;
    $(userRoleArr).each(function (i, val) {
        if (Knack.getUserRoles(val)) {
            matchFound = true;
            return false;
        }
    });
    return matchFound;
}

/** Check if current user name matches the given user name
 * @param {string} nameToMatch - Name to match against current user name
 * @return {boolean} - true if match found, false otherwise */
function isUserName(nameToMatch) {
    const userName = Knack.getUserAttributes()?.name;
    return userName === nameToMatch;
}

/**
 * Replace large numbers in table cells.
 * If isLink is true, finds <span class="knViewLink__label"> containing cellIdent as text.
 * If isLink is false, finds <td class="field_{cellIdent}">.
 * If the cell's number is greater than maxNum, replaces it with replaceTxt.
 * @param {string|number} cellIdent - Field ID (number or string) or text to match in cell.
 * @param {number} maxNum - Maximum allowed number before replacement.
 * @param {string} replaceTxt - Text to replace the number with.
 * @param {boolean} isLink - If true, search for link label spans; if false, search for field class tds.
 */
function replaceLargeNo(cellIdent, maxNum, replaceTxt, isLink) {
    let cells = [];
    if (isLink) {
        // Find all spans with class knViewLink__label containing cellIdent as text
        cells = Array.from(document.querySelectorAll('span.knViewLink__label'))
            .filter(span => span.textContent.includes(cellIdent));
    } else {
        // Find all td elements with class field_{cellIdent}
        cells = Array.from(document.querySelectorAll(`td.field_${cellIdent}`));
    }

    cells.forEach(cell => {
        // Get the text content, parse as integer
        const intVal = parseInt(cell.textContent.replace(/,/g, ''), 10);
        if (!isNaN(intVal) && intVal > maxNum) {
            cell.textContent = replaceTxt;
        }
    });
}

/**
 * Normalise an Element or HTML string into a real DOM Element, ready for use by other functions.
 * @param {Element|string|null} input
 * @returns {Element|null}
 */
function normaliseToElement(input) {
    if (!input) return null;
    if (input instanceof Element) return input;

    if (typeof input === 'string') {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = input.trim();
        return wrapper;
    }

    return null;
}

 /** Retrieves the current scene information for a given view ID.
 * @param {string} viewId - The ID of the view for which to retrieve the scene information.
 * @returns {Object|null} An object containing the scene information, or null if the view ID is invalid:
 *   - recId: The scene's record ID.
 *   - sceneId: The scene's key.
 *   - sceneSlug: The scene's slug. */
function getCurrentSceneInfo(viewId) {
    try {
        const { scene } = Knack.views[viewId].model.view;
        const { scene_id: recordId, key: sceneId, slug: sceneSlug } = scene;
        return { recordId, sceneId, sceneSlug };
    } catch (error) {
        console.error(`Error retrieving scene information for view ID ${viewId}:`, error);
        return null;
    }
}

/**
 * Get a 24-character hex ID from an element’s id or class tokens.
 * Checks the element’s `id` first, then each token in `classList`,
 * and returns the first value that matches a 24-char hex pattern.
 *
 * @param {Element|null} eleOrHtml - The DOM element to inspect.
 * @returns {string|null} The first matching 24-char hex ID, or null if none found.
 */
function getIdFromElement(eleOrHtml) {
    const el = normaliseToElement(eleOrHtml);
    if (!el) return null;

    const HEX24 = /^[a-fA-F0-9]{24}$/;

    // If a wrapper was created, the actual node will be inside it
    const candidates = el.matches && el.matches('span, div, a')
        ? [el]
        : Array.from(el.querySelectorAll('span, div, a'));

    for (const node of candidates) {
        if (node.id && HEX24.test(node.id)) return node.id;

        for (const token of node.classList || []) {
            if (HEX24.test(token)) return token;
        }
    }

    return null;
}

/**
 * Extract the connected record ID from a Knack table cell.
 * Targets the canonical connection node: `span[data-kn="connection-value"]`.
 * If not found, falls back to scanning descendant <span> elements for a 24-char hex token in id/class.
 * @param {HTMLTableCellElement|Element|null} cellElOrHtml - Accepts a <td>/<div> element OR an HTML string.
 * @returns {string|null} The connected record’s 24-char hex ID, or null if not found.
 *
 * @example
 * // <td class="field_196"><span><span class="673c...737f" data-kn="connection-value">JON DOE</span></span></td>
 */
function getConnectionIdFromHtml(cellElOrHtml) {
    const root = normaliseToElement(cellElOrHtml);
    if (!root) return null;

    // Primary: explicit connection value node
    const conn = root.querySelector('span[data-kn="connection-value"]');
    const idFromConn = getIdFromElement(conn);
    if (idFromConn) return idFromConn;

    // Fallback: any descendant <span>
    const spans = root.querySelectorAll('span');
    for (const s of spans) {
        const id = getIdFromElement(s);
        if (id) return id;
    }

    return null;
}

/* get current record id */
function getRecordID(part = null) {
    const urlStr = sanitiseURL(window.location.href);
    const parts = urlStr.split("/");
    if (!part) return parts[parts.length - 2];
    return parts[parts.length - part];
}

/****Display Notifications
 * @param {string} insertNotificationAfter - The selctor to attach the notification too
 * @param {string} notificationTxt - text of notification
 * @param {string} notificationCol - Background colour of the notification
 * @param {string} ca_class - classes to use for the notification
 * @param {integer} delay - length of delay */
function showPopUpNotification(insertNotificationAfter, notificationTxt, notificationCol, ca_class, delay) {
    Knack.showSpinner();
    $(`<div class="${ca_class}">${notificationTxt}</div>`).css({"background-color": notificationCol,})
        .insertAfter(insertNotificationAfter)
        .delay(delay)
        .fadeOut(function () {
            removeElement(this);
        });
}

/** Remove query string from URL
* @param {string} urlToClean - URL to clean pass in window.location.href
* @return {string} cleanURL */
function sanitiseURL(urlToClean) {
    return urlToClean.toString().split('?')[0];
}

/**
 * Initializes secure local storage with proper error handling
 * @param {string} storageKey - The key under which data will be stored in secure local storage
 * @returns {Promise<Object>} A promise that resolves to the storage content object, or an empty object if storage doesn't exist
 *
 * @example
 * // Initialize secure storage for meeting minutes
 * initSecureStorage('meetingMinutes').then(storage => {
 *     console.log('Storage initialized:', storage);
 * }).catch(error => {
 *     console.error('Failed to initialize storage:', error);
 * });
 */
async function initSecureStorage(storageKey) {
    if (!storageKey || typeof storageKey !== 'string') {
        return Promise.reject(new Error('Invalid storage key provided. Must be a non-empty string.'));
    }

    return ktl.storage.initSecureLs()
        .then(() => {
            try {
                const storageContent = ktl.storage.lsGetItem(storageKey, false, false, true);

                // If storage is empty, create a new empty object and store it
                if (!storageContent) {
                    console.log(`Storage '${storageKey}' doesn't exist yet, initializing empty storage.`);
                    const emptyStorage = '{}';
                    ktl.storage.lsSetItem(storageKey, emptyStorage, false, false, true);
                    return {};
                }

                // Parse the storage content
                try {
                    return JSON.parse(storageContent);
                } catch (parseError) {
                    console.warn(`Error parsing content of '${storageKey}', returning empty object:`, parseError);
                    // Reset the storage to a valid state if parsing fails
                    ktl.storage.lsSetItem(storageKey, '{}', false, false, true);
                    return {};
                }
            } catch (getItemError) {
                console.error(`Error accessing storage '${storageKey}':`, getItemError);
                throw new Error(`Failed to get item from secure storage: ${getItemError.message}`);
            }
        })
        .catch(initError => {
            console.error('Failed to initialize secure storage:', initError);
            throw new Error(`Secure storage initialization failed: ${initError.message}`);
        });
}

/** Set secure local storage item
* @param {string} storageKey - the key to the storage
* @param {string} recordKey - the key to store the items under
* @param {string} fieldId - the fieldId of the input
* @param {string} valueToStore - the value of the input
* @param {number} daysUntilExpiry - the number of days until the item expires
* @returns {object} - the items from local storage */
function setSecureStorage(storageKey, recordKey, fieldId, valueToStore, daysUntilExpiry = 5) {
    initSecureStorage(storageKey).then(currentStorage => {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + daysUntilExpiry);
        currentStorage[recordKey] = currentStorage[recordKey] || {};
        currentStorage[recordKey].expirationDate = expirationDate.getTime();
        currentStorage[recordKey][fieldId] = valueToStore;
        ktl.storage.lsSetItem(storageKey, JSON.stringify(currentStorage), false, false, true);
    });
}

/** Gets item from local storage if key exists
* @param {string} storageKey - the key to the storage
* @param {string} recordKey - the key to store the items under
* @returns {object} - the items from local storage*/
function getSecureStorage(storageKey, recordKey) {
    return initSecureStorage(storageKey).then(currentStorage => {
        const now = new Date().getTime();
        for (let id in currentStorage) {
            if (now > currentStorage[id].expirationDate) {
                delete currentStorage[id];
            }
        }
        ktl.storage.lsSetItem(storageKey, JSON.stringify(currentStorage), false, false, true);
        return currentStorage[recordKey] ? currentStorage[recordKey] : '';
    });
}

/** Check all radio groups have been answered on given view
 * @param {string} viewId - view containing radio buttons
 * @param {Array} fieldToExclude - array of field IDs to exclude
 * @returns {boolean} - true if all visible radio groups are answered, false otherwise */
function checkAllRadioAnswered(viewId, fieldToExclude = []) {
    const names = new Set();

    // Collect unique group names for visible radio buttons only, excluding specified fields
    $(`#${viewId} :radio:visible`).each(function () {
        const parentFieldId = parseInt($(this).closest('[id^="kn-input-field_"]').attr('id').split('_')[1]);
        if (!fieldToExclude.includes(parentFieldId)) {
            names.add($(this).attr('name'));
        }
    });

    // Compare the count of checked visible radios with the count of visible groups
    const checkedVisibleRadios = $(`#${viewId} :radio:visible:checked`).filter(function () {
        const parentFieldId = parseInt($(this).closest('[id^="kn-input-field_"]').attr('id').split('_')[1]);
        return !fieldToExclude.includes(parentFieldId);
    }).length;

    return checkedVisibleRadios === names.size;
}

/**Change a tables cell text based on another cell
 * @param {object} view - the view object
 * @param {object} records - the records object
 * @param {string} fieldIdToMatch - the field id to match
 * @param {string} fieldIdToChange - the field id to change
 * @param {string} textToMatch - the text to match
 * @param {string} newText - the new text to change to
 * @param {string} bkgColor - the background color to change to */
function changeCellTextBasedOnCellContent(viewId, records, fieldIdToMatch, fieldIdToChange, textToMatch, newText, bkgColor = 'success') {
    records.forEach(record => {
        if (record[fieldIdToMatch].includes(textToMatch)) {
            const row = $(`tr[id=${record.id}]`);
            const cell = row.find(`td:eq(${$(`#${viewId} th.${fieldIdToChange}`).index()})`);
            cell.css({
                'background-color': `var(--${bkgColor})`,
                'font-weight': '700',
                'color': 'black'
            }).find('.knViewLink__label').text(newText);
        }
    });
}

/**  toggle the show/hide content
 * @param {object} buttonSelector - jQuery selector for button
 * @param {object} hiddenSelector - jQuery selector for hidden content
 * @param {object} arrowSelector - jQuery selector for arrow
 * @param {number} delay - delay in ms
 * @param {boolean} flexOn - true if flex display is required */
function toggleShowHideViewContent(buttonSelector, hiddenSelector, arrowSelector, delay, flexOn = false) {
    buttonSelector.off('click.showHide').on('click.showHide', function() {
        hiddenSelector.slideToggle(delay);
        arrowSelector.toggleClass('down up');
        buttonSelector.toggleClass('active');
        flexOn && hiddenSelector.css('display', 'flex');
    });
}

/** Shrink view back to hidden state
 * @param {object} shrinkLinkSelector
 * @param {object} hiddenSelector
 * @param {object} arrowSelector
 * @param {number} delay
 * @param {object} buttonSelector */
function shrinkContent(shrinkLinkSelector, hiddenSelector, arrowSelector, delay, buttonSelector) {
    shrinkLinkSelector.off('click.shrinkLink').on('click.shrinkLink', function() {
        hiddenSelector.slideUp(delay);
        removeClassFromSelector(arrowSelector, 'up').addClass('down');
        removeClassFromSelector(buttonSelector, 'active');
    });
}

/**  Show/Hide content
 * @param {string} showHideId - unique id for show/hide content
 * @param {number} delay - delay in ms
 * @param {boolean} flexOn - true if flex display is required */
function showHideViewContent(showHideId, delay, flexOn = false) {
    const buttonSelector = $(`#show-hide_${showHideId}`);
    const arrowSelector = $(`#arrow_${showHideId}`);
    const shrinkLinkSelector = $(`#shrink-link_${showHideId}`);
    const hiddenSelector = $(`.${showHideId}`);
    toggleShowHideViewContent(buttonSelector, hiddenSelector, arrowSelector, delay, flexOn);
    shrinkContent(shrinkLinkSelector, hiddenSelector, arrowSelector, delay, buttonSelector);
}

/**  append shrink link
 * @param {string} appendToId - unique ID to append shrink link to
 * @param {string} showHideId - unique id for show/hide content*/
    function appendShrinkLink(wrapperId, showHideId, showHideGroup = false) {
    const shrinkLinkHTML = `<a class="show-hide-btn shrink-link" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="arrow up" id="arrow_${showHideId}">◀</span></a>`;
    const shrinkLinkSelector = $(`#shrink-link_${showHideId}`);

    // Check if the shrink link already exists
    if (shrinkLinkSelector.length === 0) {
        if (showHideGroup) {
            $(`#${wrapperId}`).append(shrinkLinkHTML);
        } else {
            $(`#${wrapperId}`).find('.show-hide-section').append(shrinkLinkHTML);
        }
    }
}

/**  replace title with button
 * @param {string} viewId
 * @param {string} showHideId - unique id for show/hide content */
function replaceTitleWithButton(viewId, showHideId) {
    const viewTitle = $(`#${viewId} h2.kn-title`);
    const titleText = viewTitle.text();
    const showHideBtnHTML = `<div class="show-hide-btn" id="show-hide_${showHideId}">${titleText} &nbsp;<span class="arrow down" id="arrow_${showHideId}">◀</span></div>`;

    if ($(`#show-hide_${showHideId}`).length === 0) {
        viewTitle.html(showHideBtnHTML);
    }
}

/**  wrap content for show/hide
 * @param {string} viewId
 * @param {string} viewType
 * @param {string} showHideId - unique id for show/hide content */
function wrapContentForShowHide(viewId, viewType, showHideId) {
    const wrappers = {
        'table': '.kn-table-wrapper, .kn-records-nav',
        'form': 'form, .kn-form-confirmation',
        'list': '.kn-list-content, .kn-records-nav',
    };

    const wrapper = wrappers[viewType];
    const viewElement = $(`#${viewId}`);
    const sectionElement = viewElement.find('section');

    if (wrapper) {
        const wrapperElement = viewElement.find(wrapper);
        // Check if the wrapper element is already wrapped
        if (!wrapperElement.parent().is('section')) {
            wrapperElement.wrapAll(`<section class='${showHideId} show-hide-section box-with-border' />`);
        }
    } else {
        // Check if the section element already has the classes
        if (!sectionElement.hasClass(`${showHideId} show-hide-section box-with-border`)) {
            sectionElement.addClass(`${showHideId} show-hide-section box-with-border`);
        }
    }
}

/** Toggle elements
 * @param {Array|jQuery|string} selectors - Single or multiple jQuery selectors/elements
 * @param {boolean|Array} show - Single boolean or an array of booleans for each selector
 * i.e. toggleElements([ele1, ele2, [false, true]); hide ele1 show ele2*/
function toggleElements(selectors, show) {
    if (Array.isArray(selectors)) {
        selectors.forEach((selector, index) => {
            const shouldShow = Array.isArray(show) ? show[index] : show;
            $(selector).toggle(shouldShow);
        });
    } else {
        $(selectors).toggle(show);
    }
}

/** returns the form id of the current view
 * @param {string} viewId */
function getFormId(viewId) {
    return $(`#${viewId} .kn-submit input[name="id"]`).val();
}

/**
 * Helper function to split a comma-separated string into a trimmed array
 * @param {string} fieldValue - The field value to split
 * @returns {string[]} Array of trimmed values
 */
function splitAndTrimField(fieldValue) {
    if (!fieldValue) return [];
    return fieldValue.split(",").map(item => item.trim());
}

/**
 * Keep two text inputs synchronised in both directions - Updates in one are mirrored to the other.
 * - Guards against infinite loops with an internal flag.
 * - Fires 'input' and 'change' events so Knack detects updates.
 * - Marks elements with data-notes-sync-bound to avoid duplicate binding.
 * - On init, the non-empty value (if any) is copied across.
 *
 * @param {HTMLInput} textInputA - First text input.
 * @param {HTMLInput} textInputB - Second text input.
 */
function syncTextInputs(textInputA, textInputB) {
    // Prevent duplicate binding if Knack re-renders and elements are reused
    if (textInputA.dataset.notesSyncBound === '1' && textInputB.dataset.notesSyncBound === '1') return;
    textInputA.dataset.notesSyncBound = '1';
    textInputB.dataset.notesSyncBound = '1';

    let isSyncing = false;

    function propagate(sourceInput, targetInput) {
        if (isSyncing) return; //prevent loops
        const next = sourceInput.value;
        if (targetInput.value === next) return;

        isSyncing = true;
        targetInput.value = next;

        // Notify any listeners (including Knack) that the value changed
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));

        isSyncing = false;
    }

    function onInputA() { propagate(textInputA, textInputB); }
    function onInputB() { propagate(textInputB, textInputA); }

    textInputA.addEventListener('input', onInputA);
    textInputA.addEventListener('change', onInputA);
    textInputB.addEventListener('input', onInputB);
    textInputB.addEventListener('change', onInputB);

    // Initial reconciliation: prefer the non-empty one
    const aVal = (textInputA.value || '').trim();
    const bVal = (textInputB.value || '').trim();
    if (aVal && aVal !== bVal) {
        propagate(textInputA, textInputB);
    } else if (bVal && bVal !== aVal) {
        propagate(textInputB, textInputA);
    }
}

/**
 * Creates an HTML button element with specified attributes.
 * @param {Object} options - Configuration for the button
 * @param {string} options.id - The ID to assign to the button (optional)
 * @param {string} options.html - The HTML content to set inside the button
 * @param {string} options.className - CSS class(es) to assign to the button (will be added to default "kn-button" class)
 * @param {string} options.type - Button type (default: 'button')
 * @param {Object} options.attributes - Additional attributes to set on the button
 * @param {Function} options.onClick - Click event handler for the button
 * @return {HTMLElement} - The created button element
 */
function createButton(options) {
    // Allow simple signature for backward compatibility
    if (typeof arguments[0] === 'string') {
        options = {
            id: arguments[0],
            html: arguments[1],
            className: arguments[2]
        };
    }

    // Set defaults
    options = Object.assign({
        id: '',
        html: '',
        className: '',
        type: 'button',
        attributes: {},
        onClick: null
    }, options);

    // Create button element
    const button = document.createElement('button');

    // Set basic attributes
    if (options.id) button.id = options.id;

    // Always add kn-button class, then add any additional classes
    button.className = 'kn-button' + (options.className ? ' ' + options.className : '');

    button.type = options.type;
    button.innerHTML = options.html;

    // Add any additional attributes
    for (const [key, value] of Object.entries(options.attributes)) {
        button.setAttribute(key, value);
    }

    // Add click handler if provided
    if (typeof options.onClick === 'function') {
        button.addEventListener('click', options.onClick);
    }

    return button;
}

/**  Add Buttons to Scroll to Top and Close Modal */
function addModalNavigationButtons() {
    // Create the button container to hold both buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-control-buttons';

    // Create the scroll to top button
    const scrollToTopBtn = createButton({
        id: 'scrollToTopBtn',
        html: '<i class="fa fa-arrow-up"></i>',
        className: 'modalButton success-bkgd scroll-to-top-btn',
        onClick: function() {
            document.querySelector('.modal-card-head').scrollIntoView({
                behavior: 'auto',
                block: 'start'
            });
        }
    });

    // Create the close modal button
    const closeModalBtn = createButton({
        id: 'closeModalBtn',
        html: '<i class="fa fa-times"></i>',
        className: 'modalButton warning-bkgd close-modal-btn',
        onClick: function() {
            // Find and click the existing close modal button
            const knackCloseBtn = document.querySelector('button.close-modal');
            if (knackCloseBtn) {
                knackCloseBtn.click();
            } else {
                // Fallback approach if the standard close button isn't found
                const modalBg = document.getElementById('kn-modal-bg-0');
                if (modalBg) {
                    modalBg.style.display = 'none';
                }
            }
        }
    });

    // Add buttons to the container
    buttonContainer.appendChild(scrollToTopBtn);
    buttonContainer.appendChild(closeModalBtn);

    // Find the modal background and append the button container
    const modalBg = document.getElementById('kn-modal-bg-0');
    if (modalBg) {
        modalBg.appendChild(buttonContainer);

        // Initially hide the button container
        buttonContainer.style.display = 'none';

        // Add scroll event listener to the modal background
        modalBg.addEventListener('scroll', function() {
            const modalCard = document.querySelector(".modal-card-body");
            if (!modalCard) return;

            const rect = modalCard.getBoundingClientRect();

            buttonContainer.style.left = `${rect.right}px`;

            // Show/hide the button based on scroll position
            if (modalBg.scrollTop > 100) {
                buttonContainer.style.display = 'flex';
                // Fade-in effect
                buttonContainer.style.opacity = '1';
                buttonContainer.style.transition = 'opacity 0.3s';
            } else {
                // Fade-out effect
                buttonContainer.style.opacity = '0';
                buttonContainer.style.transition = 'opacity 0.3s';

                // Set a timeout to actually hide the element after the transition
                setTimeout(function() {
                    if (modalBg.scrollTop <= 100) {
                        buttonContainer.style.display = 'none';
                    }
                }, 300);
            }
        });
    }
}

/**
 * Capitalises the input text based on the specified criteria.
 * @param {string} viewId - The ID of the view containing the input element.
 * @param {string} inputSelector - The selector for the input element within the view.
 * @param {Object} [options] - Optional settings.
 * @param {string} [options.mode='title'] - 'all' for ALL CAPS, 'title' for Title Case, 'sentence' for Sentence case.
 * @param {boolean} [options.trim=true] - Whether to trim whitespace.
 * @param {boolean} [options.smartWords=true] - If true, don't capitalise short words (like "of", "and") in title mode.
 */
function capitaliseInput(viewId, inputSelector, options = { mode: 'title', trim: true, smartWords: true }) {
    let viewElement = document.getElementById(viewId);
    if (!viewElement) viewElement = document.querySelector(`#connection-form-view:has(input[value="${viewId}"])`);
    if (!viewElement) return;

    const input = viewElement.querySelector(inputSelector);
    if (!input) return;

    // List of words to ignore in title case (unless first/last)
    const minorWords = ['and', 'or', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'a', 'an', 'but', 'nor', 'as'];

    addInputEventListener(input, function (e, inputElement) {
        let str = inputElement.value;
        if (!str) return;

        const { mode = 'title', trim = true, smartWords = true } = options || {};

        // Only trim on blur, not on input
        let isBlur = e && e.type === 'blur';
        if (trim && isBlur) str = str.trim();

        let result = str;

        if (mode === 'all') {
            result = str.toUpperCase();
        } else if (mode === 'sentence') {
            result = str.charAt(0).toUpperCase() + str.slice(1);
        } else if (mode === 'title') {
            // Only process if not just typing a space
            if (!e || e.inputType !== 'insertText' || e.data !== ' ') {
                result = str.replace(/\b[\w'-]+\b/g, function (word, idx, full) {
                    // Capitalise first letter and any letter after - or '
                    let capitalised = word.replace(/(^|[-'])\w/g, function (match) {
                        return match.toUpperCase();
                    }).replace(/(?<!^|[-'])\w/g, function (match) {
                        return match.toLowerCase();
                    });
                    // Smart words logic
                    if (
                        smartWords &&
                        minorWords.includes(capitalised.toLowerCase()) &&
                        idx !== 0 &&
                        idx + word.length !== full.length
                    ) {
                        return capitalised.toLowerCase();
                    }
                    return capitalised;
                });
            }
        }

        // Only update if changed, and preserve caret position if possible
        if (inputElement.value !== result) {
            const pos = inputElement.selectionStart;
            inputElement.value = result;
            if (typeof pos === 'number' && inputElement === document.activeElement) {
                inputElement.setSelectionRange(pos, pos);
            }
        }
    }, { events: ['input', 'blur'] });
}

/** Capitalises a string.
 * @param {string} str - The string to be capitalised.
 * @param {Object} [options] - Optional settings.
 * @param {boolean} [options.allCaps=true] - If true, capitalise the whole string; if false, capitalise first letter of each word.
 * @returns {string} - The capitalised string.
 */
function capitaliseString(str, options = { allCaps: true }) {
    if (typeof str !== 'string' || !str.trim()) return '';
    const { allCaps = true } = options;

    if (allCaps) {
        return str.trim().toUpperCase();
    } else {
        // Capitalise first letter of each word, preserving other characters
        return str.trim().replace(/\b\w/g, char => char.toUpperCase());
    }
}

/**
 * Wait for a details view to load and get the connection ID(s) from the detail element
 * @param {object} options - The options for the function
 * @param {string} options.viewId - The ID of the view to wait for
 * @param {number} options.fieldId - The ID of the field to get the conxId from
 * @param {number} [options.delay=5000] - The delay in milliseconds to wait for the selector
 * @return {Promise<string|string[]|null>} - A promise that resolves to the conxId(s) or null if not found
 */
async function waitGetConxIdFromDetailId({ viewId, fieldId, delay = 5000 }) {
    try {
        const selector = `#${viewId} .field_${fieldId} .kn-detail-body > span > span > span`;

        // Wait for the elements to be available
        const elements = await waitSelector({
            selector,
            delay,
            returnType: 'elements'
        });

        if (!elements || elements.length === 0) {
            console.log(`No connection elements found with selector: ${selector}`);
            return null;
        }

        // Give the DOM a moment to fully render the spans with IDs
        return new Promise(resolve => {
            setTimeout(() => {
                const ids = Array.from(elements).map(element => element.id).filter(Boolean);

                if (ids.length === 0) {
                    console.log('No connection IDs found in elements');
                    resolve(null);
                } else {
                    // Return a single ID or array depending on number of results
                    resolve(ids.length === 1 ? ids[0] : ids);
                }
            }, 100);
        });
    } catch (error) {
        console.error(`Error getting connection ID from detail view: ${error}`);
        return null;
    }
}

/**
 * Creates a dropdown HTML structure compatible with Knack forms
 * @param {string} dropName - ID for the dropdown element
 * @param {boolean} [isRequired=true] - Whether the dropdown is required
 * @param {string} [labelText='Select'] - The label text to display
 * @returns {HTMLDivElement} - The created dropdown container element
 */
function createDropdownHTML(dropName, isRequired = true, labelText = 'Select') {
    // Create container element
    const container = document.createElement('div');
    container.className = 'kn-input kn-input-multiple_choice control';

    // Create label and its child elements
    const label = document.createElement('label');
    label.setAttribute('for', dropName);
    label.className = 'label kn-label';

    const labelTextSpan = document.createElement('span');
    labelTextSpan.textContent = `${labelText} `;

    const selectTextSpan = document.createElement('span');
    selectTextSpan.className = 'selectText';

    // Append elements to label
    label.appendChild(labelTextSpan);
    label.appendChild(selectTextSpan);

    // Add required asterisk if needed
    if (isRequired) {
        const requiredSpan = document.createElement('span');
        requiredSpan.className = 'kn-required';
        requiredSpan.textContent = '*';
        label.appendChild(requiredSpan);
    }

    // Create select container
    const selectContainer = document.createElement('div');
    selectContainer.className = 'kn-select';

    const innerSelectContainer = document.createElement('div');
    innerSelectContainer.className = 'kn-select';

    // Create select element
    const select = document.createElement('select');
    select.setAttribute('data-placeholder', 'Select');
    select.setAttribute('name', dropName);
    select.setAttribute('id', dropName);
    select.className = 'select';
    select.style.verticalAlign = 'bottom';

    // Build the component hierarchy
    innerSelectContainer.appendChild(select);
    selectContainer.appendChild(innerSelectContainer);
    container.appendChild(label);
    container.appendChild(selectContainer);

    return container;
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
        if (!fileName || !assetId) return {};
        const extMatch = fileName.match(/\.([^.]+)$/);
        const extension = extMatch ? extMatch[1].toLowerCase() : '';
        const assetUrl = `https://api.knack.com/v1/applications/${Knack.application_id}/download/asset/${assetId}/${encodeURIComponent(fileName)}`;
        return { assetId, fileName, extension, assetUrl };
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
            fullFormURL += `${formName}/${Knack.getUserAttributes()?.id}`;
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
        setFileViewerLink(a, info, true);
        assetEl.replaceWith(a);
    });
}

/**
 * Inserts the logged-in user's name or the staff name from the detail view into the specified element(s).
 * @param {HTMLElement|string} target - The element(s) or selector to insert the name into.
 */
function insertStaffName(target) {
    try {
        const staffFieldSelector = '.kn-detail-label';
        const userName = Knack.getUserAttributes()?.name || '';

        waitSelector({
            selector: staffFieldSelector,
            textCondition: { text: 'Staff Name', exact: true },
            timeout: 5000,
        }).then((staffField) => {
            const staffNameText = staffField.nextElementSibling.textContent.trim() || userName;

            // Support DOM element, NodeList, or selector string
            if (typeof target === 'string') {
                document.querySelectorAll(target).forEach(el => el.textContent = staffNameText);
            } else if (target instanceof Element) {
                target.textContent = staffNameText;
            } else if (target instanceof NodeList || Array.isArray(target)) {
                Array.from(target).forEach(el => el.textContent = staffNameText);
            }
        })
        .catch(err => {
            console.error(`Error finding staff field: ${err}`);
            // Fallback to using the user name if the field is not found
            if (typeof target === 'string') {
                document.querySelectorAll(target).forEach(el => el.textContent = userName);
            } else if (target instanceof Element) {
                target.textContent = userName;
            } else if (target instanceof NodeList || Array.isArray(target)) {
                Array.from(target).forEach(el => el.textContent = userName);
            }
        });
    } catch (err) {
        errorHandler.handle(err, { function: 'insertStaffName', target }, 'insertStaffName');
    }
}

//KTL Functions

/**
 * Updates the label text for a field in a Knack view.
 * Works with regular views and connection-form-views.
 * Supports HTML replacements using placeholder syntax: {br}, {strong}, {/strong}, {em}, {/em}, {hr}.
 *
 * @param {string} viewId - The ID of the view containing the field.
 * @param {string} viewType - The type of view ('form', 'details', 'list', 'table', 'search').
 * @param {string} fieldId - The field ID (e.g., 'field_1234').
 * @param {object} options - Configuration object.
 * @param {Array} options.params - Array containing label text and optional type specifier.
 *
 * @example
 * // Update a form field label
 * updateLabelText('view_1234', 'form', 'field_5678', { params: [['New Label Text']] });
 *
 * @example
 * // Update with HTML formatting
 * updateLabelText('view_1234', 'form', 'field_5678', { params: [['Enter {strong}Client Name{/strong}{br}(First and Last)']] });
 *
 * @example
 * // Update with type specifier
 * updateLabelText('view_1234', 'form', 'field_5678', { params: [['New Label'], ['form']] });
 */
function updateLabelText(viewId, viewType, fieldId, { params }) {
    // Determine if we're working with a connection form or regular view
    const viewElement = document.getElementById(viewId)

    if (!viewElement) {
        console.warn(`View ${viewId} not found for updateLabelText`);
        return;
    }


    let labelTxt, type, selector;
    const selectors = {
        form: `#${viewElement.id} #kn-input-${fieldId} .kn-label span:not(.kn-required)`,
        details: `#${viewElement.id} .${fieldId} .kn-detail-label > span`,
        list: `#${viewElement.id} .${fieldId} .kn-detail-label > span`,
        table: `#${viewElement.id} th.${fieldId} > span > a > span:not(span.icon)`,
        search: `#${viewElement.id} th.${fieldId} > span > a > span:not(span.icon)`
    };

    if (params.length === 2) {
        [labelTxt, type] = params.map(param => param);
        labelTxt = labelTxt.join(', ');
        selector = selectors[viewType] && type[0].includes(viewType[0]) ? selectors[viewType] : null;
    } else {
        labelTxt = params[0].join(', ');
        selector = selectors[viewType];
    }

    // Do replacements AFTER labelTxt is set
    const replacements = {
        '{br}': '<br>',
        '{strong}': '<strong>',
        '{/strong}': '</strong>',
        '{em}': '<em>',
        '{/em}': '</em>',
        '{hr}': '<hr>',
    };
    const originalText = Object.entries(replacements).reduce(
        (text, [pattern, replacement]) => text.replaceAll(pattern, replacement),
        labelTxt || ''
    );

    if (selector) {
        const targetElement = document.querySelector(selector);
        if (targetElement) {
            targetElement.innerHTML = originalText || '';
        } else {
            // console.warn(`Label element not found for selector: ${selector}`);
        }
    }
}

function idleWatchDogTimeout() {
    if (document.querySelector('.kn-login')) return;

    const ID_PREFIX = 'ktl-idle-';
    const overlayId = ID_PREFIX + 'overlay';
    const dialogId = ID_PREFIX + 'dialog';
    const logoutBtnId = ID_PREFIX + 'logout-btn';
    const stayBtnId = ID_PREFIX + 'stay-btn';

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
                    Knack.user.destroy(); // try again
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
            Knack.user.destroy();
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
}

function setViewMaxWidth({ key: viewId }) {
    const kw = '_vmxw';
    const viewElement = $(`#${viewId}`);
    const kwList = ktl.core.getKeywordsByType(viewId, kw);

    kwList.forEach(({ options, params }) => {
        if (!ktl.core.hasRoleAccess(options)) return;

        const width = params[0][0];
        let maxWidth;
        const parsedWidth = parseFloat(width);
        // Check if width includes units
        if (width.includes('%') || width.includes('px') || isNaN(parsedWidth)) {
            maxWidth = width; // Use the width as is
        } else {
            if (!isNaN(parsedWidth)) {
                maxWidth = `${parsedWidth}px`; // Assume it's a number and add 'px'
            } else {
                console.error(`Invalid width value: ${width}`);
                return;
            }
        }

        viewElement.css('max-width', maxWidth);
    });
}

function hideEmptyFields(view) {
    //used when label still needed but don't want extra space if no details - used in view meeting agenda/past minutes
    $(`#${view.key} .kn-detail-body`).each(function () {
        if ($.trim($(this).text()) === '') {
            removeElement(this);
        }
    });
}

// _hebv = Hide Elements By Value param[0] = fieldId, param[1] = valueToMatch, param.slice(2) = elementsToHide
function hideElementsByValue (view, keywords) {
    const kw = '_hebv';
    const { key: viewId } = view;
    if (!viewId || !keywords[kw]) return;

    const kwList = ktl.core.getKeywordsByType(viewId, kw);
    kwList.forEach(kwInstance => {
        const { options, params: paramGroups } = kwInstance;
        if (!ktl.core.hasRoleAccess(options) || paramGroups.length === 0) return;

        paramGroups.forEach(params => {
            if (params.length < 3) return;

            const [fieldId, valToMatch, ...elesToHide] = params;
            const fieldValue = $.trim($(`.${fieldId} .kn-detail-body`).text());

            const shouldHide = valToMatch.startsWith('!')
                ? fieldValue !== valToMatch.slice(1)
                : fieldValue === valToMatch;

            if (shouldHide) {
                $(elesToHide.join()).hide();
                borderRadiusLastVisible();
            }
        });
    });
}

function buttonToUrl({ key: viewId }, keywords) {
    const btnUrl = '_btnurl';
    if (!keywords[btnUrl]) return;

    const viewType = ktl.views.getViewType(viewId);

            if (['list', 'form'].includes(viewType)) return;

    const viewElement = $(`#${viewId}`);
    const keywordList = ktl.core.getKeywordsByType(viewId, btnUrl);

    keywordList.forEach(({ options, params: paramGroups }) => {
        if (!paramGroups.length) {
            console.error('Button URL Params Error - No parameter groups found.');
            return;
        }

        paramGroups.forEach(params => {
            if (params.length < 2) {
                console.error('Button URL Params Error - Insufficient parameters found.');
                return;
            }

            if (!ktl.core.hasRoleAccess(options)) {
                removeElement(viewElement.find(linkSelector));
                return;
            }

            const currentUrl = sanitiseURL(window.location.href);
            const [linkText, pageUrl, isChildPageParam, urlPartParam] = params;
            const linkSelector = viewType === 'menu' ? `li:textEquals("${linkText}")` : `a:textEquals("${linkText}")`;

            const handleLinkClick = (e, targetUrl) => {
                e.preventDefault();
                window.location.href = targetUrl;
            };

            const processLinkElement = (linkElement, targetUrl) => {
                if (!linkElement.length) {
                    console.error(`buttonURL Error - Button with text "${linkText}" not found.`);
                    return;
                }
                linkElement.off('click').on('click', e => handleLinkClick(e, targetUrl));
            };

            if (['table', 'search'].includes(viewType)) {
                getTableRows(viewId, (i, row) => {
                    const knackId = row.find('td.field_6087').text().trim();
                    const linkElement = row.find(linkSelector);
                    const targetUrl = `${currentUrl}${pageUrl}/${knackId}/`;

                    processLinkElement(linkElement, targetUrl);
                });
            } else {
                const linkElement = viewElement.find(linkSelector);
                const isChildPage = isChildPageParam !== 'false';
                const urlPart = urlPartParam || null;
                const targetUrl = isChildPage
                    ? `${currentUrl}${pageUrl}/${getRecordID(urlPart)}/`
                    : `${currentUrl}${pageUrl}/`;

                processLinkElement(linkElement, targetUrl);
            }
        });
    });
}

function caQuickToggle({ key: viewId }, data = []) {
    // Create an instance of the CAQuickToggle class and initialize it
    const caQuickToggle = new CAQuickToggle(viewId, data);
    caQuickToggle.init();
}

class CAQuickToggle {
    constructor(viewId, data) {
        // Core properties
        this.viewId = viewId;
        this.data = data;
        this.kw = '_caqt';
        this.kwInstance = null;
        this.viewModel = null;
        this.viewType = '';
        this.inlineEditing = false;
        this.fieldMap = new Map();

        // State properties
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
        this.viewModel = Knack.router.scene_view.model.views._byId[this.viewId];
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
                const field = Knack.objects.getField(col.field.key);
                if (field && !col.connection) { // Field must be local to view's object, not a connected field.
                    if (field.attributes.type === 'boolean') {
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
                                $(`#${this.viewId} td.${fieldId}.cell-edit`).addClass('caQtCellClickable');
                        }
                    }
                }
                this.fieldMap.set(col.field.key, col.header);
            }
        });
    }

    updateTableColors() {
        if (!$.isEmptyObject(this.fieldsColor)) {
            this.data.forEach(row => {
                Object.keys(this.fieldsColor).forEach(fieldId => {
                    // Merge new style with existing one.
                    const cell = $(`#${this.viewId} tbody tr[id="${row.id}"] .${fieldId}`);
                    const currentStyle = cell.attr('style');
                    const style = `background-color:${row[fieldId + '_raw'] === true ?
                        this.fieldsColor[fieldId].bgColorTrue :
                        this.fieldsColor[fieldId].bgColorFalse}`;
                    cell.attr('style', `${currentStyle ? currentStyle + '; ' : ''}${style}`);
                });
            });
        }
    }

    setupCellClickHandlers() {
        // Process cell clicks
        $(`#${this.viewId} .caQtCellClickable`).bindFirst('click', (e) => this.handleCellClick(e));
    }

    handleCellClick(e) {
        if ($('.bulkEditCb:checked').length) return;

        e.stopImmediatePropagation();

        const fieldId = $(e.target).data('field-key') || $(e.target).parent().data('field-key');
        const viewElement = $(e.target).closest('.kn-search.kn-view[id], .kn-table.kn-view[id]');

        if (viewElement.length) {
            const viewId = viewElement.attr('id');
            const dt = Date.now();
            const recId = $(e.target).closest('tr').attr('id');
            let value = ktl.views.getDataFromRecId(viewId, recId)[`${fieldId}_raw`];
            value = (value === true ? false : true);

            if (!this.viewsToRefresh.includes(viewId))
                this.viewsToRefresh.push(viewId);

            this.quickToggleObj[dt] = { viewId, fieldId, value, recId, processed: false };

            const cell = $(e.target).closest('td');
            cell.css('background-color', this.quickToggleParams.bgColorPending);

            if (this.quickToggleParams.pendingClass) {
                cell.addClass(this.quickToggleParams.pendingClass);
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
            const userAttributes = Knack.getUserAttributes();
            const userAttribute = isName ? userAttributes.name : userAttributes.id;
            return { [correspondingFieldId]: value === false ? null : userAttribute };
        }

        return null;
    }

    startQtScanning() {
        if (this.quickToggleParams.showNotification) {
            ktl.core.infoPopup();
            this.showProgress();
        }

        if (this.qtScanItv) return;

        ktl.views.autoRefresh(false);
        this.qtScanItv = setInterval(() => {
            if (!$.isEmptyObject(this.quickToggleObj)) {
                const dt = Object.keys(this.quickToggleObj)[0];
                const { processed } = this.quickToggleObj[dt];
                if (!processed) {
                    this.quickToggleObj[dt].processed = true;
                    this.doQuickToggle(dt);
                }
            }
        }, 500);
    }

    doQuickToggle(dt) {
        const recObj = this.quickToggleObj[dt];
        if ($.isEmptyObject(recObj) || !recObj.viewId || !recObj.fieldId) return;

        const apiData = { [recObj.fieldId]: recObj.value, ...recObj.additionalData };

        ktl.core.knAPI(recObj.viewId, recObj.recId, apiData, 'PUT', [], false /*must be false otherwise spinner blocks click events*/)
            .then(() => {
                if (this.quickToggleParams.showNotification) {
                    this.showProgress();
                }
                this.numToProcess--;
                delete this.quickToggleObj[dt];

                if ($.isEmptyObject(this.quickToggleObj)) {
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
                            .catch(() => { })
                    }, 500);
                }
            })
            .catch(reason => {
                ktl.views.autoRefresh();
                const errorMsg = reason ? JSON.stringify(reason) : 'Unknown error';
                console.error('Quick Toggle operation failed:', reason);
                errorHandler.handleError(reason, {function: 'doQuickToggle'}, 'Quick Toggle Error')
                alert(`Error code KEC_1025 while processing Quick Toggle operation, reason: ${errorMsg}`);
            });
    }

    showProgress() {
        ktl.core.setInfoPopupText('Toggling... ' + this.numToProcess + ' items remaining.');
    }
}

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
                    functionArgs: JSON.stringify(args, (key, value) => {
                        if (typeof value === 'function') return 'function() { ... }';
                        if (value instanceof Node) return value.nodeName;
                        if (value instanceof Window) return 'Window';
                        return value;
                    }),
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
                    functionArgs: JSON.stringify(args, (_, v) =>
                        typeof v === 'function' ? '[Function]' : v
                    ),
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
                    errorInfo.functionArgs = JSON.stringify(args, (key, value) => {
                        if (typeof value === 'function') return 'function() { ... }';
                        if (value instanceof Node) return value.nodeName;
                        if (value instanceof Window) return 'Window';
                        return value;
                    });
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
        const eventSelector = viewId === 'any' ?
            `${eventType}.any` :
            `${eventType}.${viewId}`;

        $(document).on(eventSelector, wrappedHandler);

        return this;
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
        if (typeof Knack !== 'undefined' && Knack.router && Knack.router.current_scene_key) {
            return Knack.router.current_scene_key;
        }

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
            errorData.errorSource.includes('API') ||
            errorData.errorSource.includes('caAPI')) {
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
            Object.assign(errorData, this._captureContextData(additionalInfo));
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
     * @param {Object} additionalInfo - Additional information to log
     * * @returns {Object} - Context data
     * @private
     * */
    _captureContextData(additionalInfo) {
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
