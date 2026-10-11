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
            if (Object.keys(this.quickToggleObj).length) {
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
        if (!Object.keys(recObj).length || !recObj.viewId || !recObj.fieldId) return;

        const normalizedViewId = knackNavigator.normalizeViewId(recObj.viewId);
        const sceneId = knackNavigator.getSceneInfoForView(normalizedViewId)?.key || '';
        if (!sceneId || !normalizedViewId) {
            ktl.views.autoRefresh();
            console.error('Quick Toggle operation failed: could not resolve scene or view id.', recObj);
            this.dropFailedToggle(dt);
            return;
        }

        const apiData = { [recObj.fieldId]: recObj.value, ...recObj.additionalData };
        const apiClient = getKnackApiClient();

        apiClient.updateRecord(sceneId, normalizedViewId, recObj.recId, apiData)
            .then(() => {
                if (this.quickToggleParams.showNotification) {
                    this.showProgress();
                }
                this.numToProcess--;
                delete this.quickToggleObj[dt];

                if (!Object.keys(this.quickToggleObj).length) {
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
                                errorHandler.handleError(error, { function: 'refreshViewArray' }, 'Quick Toggle Refresh');
                                Knack.hideSpinner();
                                ktl.views.autoRefresh();
                            })
                    }, 500);
                }
            })
            .catch(reason => {
                this.dropFailedToggle(dt);
                ktl.views.autoRefresh();
                const errorMsg = reason ? JSON.stringify(reason) : 'Unknown error';
                console.error('Quick Toggle operation failed:', reason);
                errorHandler.handleError(reason, {function: 'doQuickToggle'}, 'Quick Toggle Error')
                alert(`Error code KEC_1025 while processing Quick Toggle operation, reason: ${errorMsg}`);
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
        if (!Object.keys(this.quickToggleObj).length) {
            clearInterval(this.qtScanItv);
            this.qtScanItv = null;
        }
    }

    showProgress() {
        ktl.core.setInfoPopupText('Toggling... ' + this.numToProcess + ' items remaining.');
    }
}

/**
 * Quick-toggle controller for two-option multiple-choice fields.
 */
class CAMultiChoiceQuickToggle {
    /**
     * Creates a controller for one rendered view.
     * @param {string} viewId - Knack view id.
     * @param {Array<Object>} data - Rendered Knack row data.
     */
    constructor(viewId, data) {
        this.viewId = viewId;
        this.data = data;
        this.kw = '_mqt';
        this.kwInstance = null;
        this.viewModel = null;
        this.viewType = '';
        this.inlineEditing = false;
        this.viewTargets = [];
        this.fieldToggleConfig = {};
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
        this.viewModel = Knack.router.scene_view.model.views._byId[this.viewId];
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

        const normalisedViewId = knackNavigator.normalizeViewId(recObj.viewId);
        const sceneId = knackNavigator.getSceneInfoForView(normalisedViewId)?.key || '';
        if (!sceneId || !normalisedViewId) {
            ktl.views.autoRefresh();
            console.error('Multi-choice quick toggle operation failed: could not resolve scene or view id.', recObj);
            this.dropFailedToggle(dt);
            return;
        }

        const apiData = { [recObj.fieldId]: recObj.value };
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
                                errorHandler.handleError(error, { function: 'refreshViewArray' }, 'Multi-choice Quick Toggle Refresh');
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
                console.error('Multi-choice quick toggle operation failed:', reason);
                errorHandler.handleError(reason, { function: 'doQuickToggle' }, 'Multi-choice Quick Toggle Error');
                alert(`Error code KEC_1025 while processing multi-choice quick toggle, reason: ${errorMsg}`);
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
        if (!Object.keys(this.quickToggleObj).length) {
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

    /**
     * Returns the rendered root element for the current view.
     * @returns {HTMLElement|null} View root element.
     */
    getViewRoot() {
        const viewRoot = document.getElementById(this.viewId);
        return viewRoot instanceof HTMLElement ? viewRoot : null;
    }

    /**
     * Checks whether a plain object has any enumerable keys.
     * @param {Object|null|undefined} value - Object to inspect.
     * @returns {boolean} True when the object is empty or invalid.
     */
    isToggleQueueEmpty(value) {
        return !value || typeof value !== 'object' || Object.keys(value).length === 0;
    }
}
