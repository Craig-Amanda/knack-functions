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
        const opts = options || {};
        const rows = Number.isFinite(opts.rows) ? opts.rows : 1000;
        const pageConcurrency = Number.isFinite(opts.pageConcurrency) && opts.pageConcurrency > 0
            ? Math.floor(opts.pageConcurrency)
            : 5;
        const pageOpts = { filters: opts.filters, sorters: opts.sorters, rows, rawResponse: true, timeout: opts.timeout };
        const failOnPageError = Boolean(opts.failOnPageError);

        const firstPage = await this.getRecordChildren(sceneId, viewId, recordId, parentSceneSlug, { ...pageOpts, page: 1 });
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
                pageNumbers.map(page => this.getRecordChildren(sceneId, viewId, recordId, parentSceneSlug, { ...pageOpts, page }))
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
                    parentSceneSlug,
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
                        if (opts.requireRecordId && !this._extractRecordId(record)) {
                            throw new Error(`Create response did not include a record id at index ${index}.`);
                        }
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
     * @param {Function} [options.onProgress] - Receives { loaded, total, percent, file, assetType } during upload.
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
            const result = await this._uploadAssetRequest(url, formData, {
                timeout: opts.timeout,
                headers: this._buildUploadHeaders(),
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
     * Creates an empty rate-limit snapshot.
     * @returns {{available: boolean, reason: string|null, limit: number|null, remaining: number|null, used: number|null, reset: number|null, status: number|null, observedAt: number|null, headerNames: Array<string>, headers: Object}}
     * @private
     */
    _createEmptyRateLimitSnapshot() {
        return {
            available: false,
            reason: 'No rate-limit headers observed yet.',
            limit: null,
            remaining: null,
            used: null,
            reset: null,
            status: null,
            observedAt: null,
            headerNames: [],
            headers: {}
        };
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
        return {
            available: false,
            reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'Rate-limit data is unavailable.',
            limit: null,
            remaining: null,
            used: null,
            reset: null,
            status: Number.isFinite(status) ? status : null,
            observedAt: Date.now(),
            headerNames: Object.keys(normalizedHeaders).sort(),
            headers: normalizedHeaders
        };
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
        const normalized = {};
        if (!headersLike) return normalized;

        if (typeof headersLike.forEach === 'function') {
            headersLike.forEach((value, key) => {
                normalized[String(key).toLowerCase()] = value;
            });
            return normalized;
        }

        Object.entries(headersLike).forEach(([key, value]) => {
            normalized[String(key).toLowerCase()] = value;
        });
        return normalized;
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
        const remaining = this._parseRateLimitHeaderInt(headers['x-planlimit-remaining'] || headers['x-rate-limit-remaining']);
        const limit = this._parseRateLimitHeaderInt(headers['x-planlimit-limit'] || headers['x-rate-limit-limit']);
        const reset = this._parseRateLimitHeaderInt(headers['x-planlimit-reset'] || headers['x-rate-limit-reset']);

        if (remaining === null && limit === null && reset === null) {
            return {
                available: false,
                reason: headerNames.length
                    ? 'The browser can read response headers, but Knack did not expose any rate-limit headers on this response.'
                    : 'The browser could not read any response headers for this request. Knack may not expose rate-limit headers to browser JavaScript for this endpoint.',
                limit: null,
                remaining: null,
                used: null,
                reset: null,
                status: Number.isFinite(status) ? status : null,
                observedAt: Date.now(),
                headerNames,
                headers
            };
        }

        return {
            available: true,
            reason: null,
            limit,
            remaining,
            used: Number.isFinite(limit) && Number.isFinite(remaining) ? Math.max(0, limit - remaining) : null,
            reset,
            status: Number.isFinite(status) ? status : null,
            observedAt: Date.now(),
            headerNames,
            headers
        };
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
        const applicationId = String(Knack?.application_id || '').trim();
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
            throw new Error(`API error ${response.status}: ${this._extractErrorMessage(errorBody) || response.statusText}`);
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
                        headers: headers || (requestOptions.body instanceof FormData ? this._buildUploadHeaders() : this._buildHeaders()),
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
