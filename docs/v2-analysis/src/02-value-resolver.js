// KnackValueResolver: V1 lines 799-1787 ported as-is (analysis C03: no signature change). Value coercion and Knack record values go through knackValueResolver.
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
        const displayString = typeof displayValue === 'string' ? displayValue.trim() : '';

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
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (!item) return '';
                    if (typeof item === 'object') return String(item.id || '').trim();
                    return String(item || '').trim();
                })
                .filter(Boolean);
        }
        if (typeof value === 'object') {
            const id = String(value.id || '').trim();
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
        return ['auto_increment', 'equation', 'concatenation', 'count', 'max', 'min', 'average'].includes(String(fieldType || '').trim().toLowerCase());
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
        if (Array.isArray(value)) {
            const first = value[0];
            const firstId = String(first?.id || '').trim();
            if (!firstId) return null;
            return {
                id: firstId,
                identifier: String(first?.identifier || '').trim()
            };
        }

        if (value && typeof value === 'object') {
            const id = String(value.id || '').trim();
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
     * Normalises text for stable comparisons by collapsing repeated whitespace.
     * @param {*} value - Value to normalise.
     * @returns {string} Comparable text value.
     */
    normalizeComparableText(value) {
        return this.toStringSafe(value).replace(/\s+/g, ' ').trim();
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
