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
