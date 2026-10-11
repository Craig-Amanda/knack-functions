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
        const eventSelector = `${eventType}.${viewId}`;

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
