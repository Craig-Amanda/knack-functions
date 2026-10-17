// Date/time pickers, select options and menu link filters ported as-is (jQuery only for the Knack datepicker/timepicker plugins and Chosen). Analyses C11, C12, C13.

/**
 * Attaches an accessible, dependency-free time picker to one or more text inputs.
 * The selected value is written as `HH:mm` and dispatched through normal input/change
 * events, so it can be used with native fields as well as custom application forms.
 *
 * @param {HTMLElement|string|Array|NodeList} inputOrSelector - Input(s) or selector.
 * @param {Object} [opts={}] - Picker options.
 * @param {number} [opts.step=15] - Minutes between displayed choices; must divide 60.
 * @param {string} [opts.placeholder='HH:MM'] - Input placeholder when none is set.
 * @param {string|Function|null} [opts.minTime=null] - Earliest time, or a function returning one when the picker opens.
 * @param {boolean} [opts.allowNextDay=false] - Keep earlier clock times as `+1 day` choices for overnight ranges.
 * @param {Function|null} [opts.onChange=null] - Called with `(value, input)` after selection.
 * @returns {Function} Removes the pickers and listeners.
 */
function attachTimePicker(inputOrSelector, opts = {}) {
    const options = Object.assign({ step: 15, placeholder: 'HH:MM', minTime: null, allowNextDay: false, onChange: null }, opts || {});
    const step = Number.isFinite(Number(options.step)) && Number(options.step) > 0 && 60 % Number(options.step) === 0
        ? Number(options.step)
        : 15;
    const inputs = typeof inputOrSelector === 'string'
        ? Array.from(document.querySelectorAll(inputOrSelector))
        : (NodeList.prototype.isPrototypeOf(inputOrSelector) || Array.isArray(inputOrSelector))
            ? Array.from(inputOrSelector)
            : inputOrSelector instanceof HTMLElement ? [inputOrSelector] : [];
    const cleanups = [];

    if (!document.getElementById('shared-time-picker-styles')) {
        const style = document.createElement('style');
        style.id = 'shared-time-picker-styles';
        style.textContent = `
            .sharedTimePicker { position: fixed; z-index: 10050; width: min(380px, calc(100vw - 24px)); max-height: 280px; overflow: auto; padding: 8px; border: 1px solid #78919a; border-radius: 4px; background: #fff; box-shadow: 0 10px 28px rgba(0, 0, 0, .22); }
            .sharedTimePicker[hidden] { display: none; }
            .sharedTimePicker__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
            .sharedTimePicker__option { min-height: 32px; border: 1px solid #c9d8dc; border-radius: 3px; background: #fff; color: #18323c; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
            .sharedTimePicker__option:hover, .sharedTimePicker__option:focus { border-color: #007f86; background: #e8f7f8; outline: 0; }
            .sharedTimePicker__option[aria-selected="true"] { border-color: #005f66; background: #007f86; color: #fff; font-weight: 700; }
        `;
        document.head.appendChild(style);
    }

    const normaliseTime = function (value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const match = raw.match(/^(?:([01]?\d|2[0-3])(?::?([0-5]\d)?)?)$/);
        if (!match) return '';
        const hour = Number(match[1]);
        const minute = Number(match[2] || 0);
        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    };
    const getMinutes = function (value) {
        const normalized = normaliseTime(value);
        if (!normalized) return null;
        const [hours, minutes] = normalized.split(':').map(Number);
        return (hours * 60) + minutes;
    };

    inputs.forEach(function (input, index) {
        if (!(input instanceof HTMLInputElement)) return;
        const pickerId = `shared-time-picker-${Date.now()}-${index}`;
        const picker = document.createElement('div');
        picker.className = 'sharedTimePicker';
        picker.id = pickerId;
        picker.hidden = true;
        picker.setAttribute('role', 'listbox');
        picker.setAttribute('aria-label', 'Choose a time');
        const times = Array.from({ length: (24 * 60) / step }, function (_, timeIndex) {
            const totalMinutes = timeIndex * step;
            return { value: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`, totalMinutes };
        });
        document.body.appendChild(picker);

        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = input.placeholder || options.placeholder;
        input.setAttribute('aria-haspopup', 'listbox');
        input.setAttribute('aria-controls', pickerId);
        input.setAttribute('aria-expanded', 'false');
        let suppressNextFocusOpen = false;

        const positionPicker = function () {
            const rect = input.getBoundingClientRect();
            picker.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(380, window.innerWidth - 24) - 12))}px`;
            picker.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 292)}px`;
        };
        const closePicker = function () {
            picker.hidden = true;
            input.setAttribute('aria-expanded', 'false');
        };
        const renderOptions = function () {
            const configuredMinTime = typeof options.minTime === 'function' ? options.minTime(input) : options.minTime;
            const minimumMinutes = getMinutes(configuredMinTime);
            const orderedTimes = minimumMinutes === null
                ? times.map(function (time) { return { ...time, nextDay: false }; })
                : options.allowNextDay
                    ? times.map(function (time) {
                        return { ...time, nextDay: time.totalMinutes < minimumMinutes };
                    }).sort(function (left, right) {
                        return (left.totalMinutes + (left.nextDay ? 1440 : 0)) - (right.totalMinutes + (right.nextDay ? 1440 : 0));
                    })
                    : times.filter(function (time) { return time.totalMinutes >= minimumMinutes; }).map(function (time) {
                        return { ...time, nextDay: false };
                    });
            picker.innerHTML = `<div class="sharedTimePicker__grid">${orderedTimes.map(function (time) {
                const label = `${time.value}${time.nextDay ? ' +1' : ''}`;
                const accessibleLabel = `${time.value}${time.nextDay ? ', next day' : ''}`;
                return `<button type="button" class="sharedTimePicker__option" role="option" data-time="${time.value}" aria-label="${accessibleLabel}" aria-selected="false">${label}</button>`;
            }).join('')}</div>`;
        };
        const openPicker = function () {
            renderOptions();
            positionPicker();
            picker.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            const selected = normaliseTime(input.value);
            picker.querySelectorAll('[data-time]').forEach(function (button) {
                button.setAttribute('aria-selected', String(button.dataset.time === selected));
            });
        };
        const writeValue = function (value) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof options.onChange === 'function') options.onChange(value, input);
        };
        const focusInputWithoutOpeningPicker = function () {
            suppressNextFocusOpen = true;
            input.focus();
        };
        const onFocus = function () {
            if (suppressNextFocusOpen) {
                suppressNextFocusOpen = false;
                return;
            }
            openPicker();
        };
        const onBlur = function () {
            const normalised = normaliseTime(input.value);
            if (input.value && normalised) input.value = normalised;
        };
        const onPickerClick = function (event) {
            const button = event.target.closest('.sharedTimePicker__option[data-time]');
            if (!button) return;
            writeValue(button.dataset.time || '');
            closePicker();
            focusInputWithoutOpeningPicker();
        };
        const onPickerKeyDown = function (event) {
            const options = Array.from(picker.querySelectorAll('.sharedTimePicker__option'));
            const currentIndex = options.indexOf(event.target);
            if (currentIndex < 0) return;
            const moveFocus = function (index) {
                event.preventDefault();
                options[Math.max(0, Math.min(options.length - 1, index))]?.focus();
            };
            if (event.key === 'ArrowRight') moveFocus(currentIndex + 1);
            else if (event.key === 'ArrowLeft') moveFocus(currentIndex - 1);
            else if (event.key === 'ArrowDown') moveFocus(currentIndex + 4);
            else if (event.key === 'ArrowUp') moveFocus(currentIndex - 4);
            else if (event.key === 'Home') moveFocus(0);
            else if (event.key === 'End') moveFocus(options.length - 1);
            else if (event.key === 'Escape') {
                event.preventDefault();
                closePicker();
                focusInputWithoutOpeningPicker();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                writeValue(event.target.dataset.time || '');
                closePicker();
                focusInputWithoutOpeningPicker();
            }
        };
        const onDocumentPointerDown = function (event) {
            if (event.target !== input && !picker.contains(event.target)) closePicker();
        };
        const onKeyDown = function (event) {
            if (event.key === 'Escape') closePicker();
            if (event.key === 'ArrowDown' && picker.hidden) {
                event.preventDefault();
                openPicker();
                picker.querySelector('.sharedTimePicker__option[aria-selected="true"], .sharedTimePicker__option')?.focus();
            }
        };
        input.addEventListener('focus', onFocus);
        input.addEventListener('blur', onBlur);
        input.addEventListener('keydown', onKeyDown);
        picker.addEventListener('click', onPickerClick);
        picker.addEventListener('keydown', onPickerKeyDown);
        document.addEventListener('pointerdown', onDocumentPointerDown, true);
        cleanups.push(function () {
            input.removeEventListener('focus', onFocus);
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('keydown', onKeyDown);
            picker.removeEventListener('click', onPickerClick);
            picker.removeEventListener('keydown', onPickerKeyDown);
            document.removeEventListener('pointerdown', onDocumentPointerDown, true);
            picker.remove();
        });
    });

    return function () { cleanups.forEach(function (cleanup) { cleanup(); }); };
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
 * Updates the "Add Option" button and default/placeholder text for a select field.
 * This updates the underlying `<select>` `data-placeholder`, any placeholder `<option>`,
 * and the visible elements rendered by Chosen/Chosen-like containers. When `disableInitially`
 * is true the add-option button is kept disabled until the user interacts with the select.
 *
 * The function includes a short retry loop to update Chosen's visible elements because
 * Chosen may re-render shortly after initialization and overwrite the display text.
 *
 * @param {HTMLElement} fieldEle - The field container element (e.g. `.kn-input`)
 * @param {string} btnStr - The button label to show for the add-option link
 * @param {string} defaultVal - The placeholder / default text to display for the select
 * @param {boolean} disableInitially - Whether to disable the add-option button initially
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
            // Enable when user interacts with the select field. Remove listeners once fired.
            const searchInput = container.querySelector('.chzn-search input, .chosen-search input, .search-field input');
            const select = fieldEle.querySelector('select');

            const enableButton = () => {
                addOption.classList.remove(CLASS_DISABLED);
                // Remove attached listeners to avoid leaks
                container.removeEventListener('click', enableButton);
                if (searchInput) {
                    searchInput.removeEventListener('focus', enableButton);
                    searchInput.removeEventListener('input', enableButton);
                }
                if (select) {
                    select.removeEventListener('change', enableButton);
                    select.removeEventListener('focus', enableButton);
                }
            };

            // Attach listeners
            container.addEventListener('click', enableButton);
            if (searchInput) {
                searchInput.addEventListener('focus', enableButton);
                searchInput.addEventListener('input', enableButton);
            }
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

    const selectEl = fieldEle.querySelector('select');
    // Preserve the rendered selection on edit forms and any prefilled selects.
    // The custom prompt should only be pushed into Chosen when the field is blank.
    const hasSelectedValue = selectEl
        ? Array.from(selectEl.selectedOptions || []).some((option) => String(option?.value || '').trim())
            || Boolean(String(selectEl.value || '').trim())
        : false;

    // Set default/placeholder on select element for Chosen and native selects
    if (selectEl) {
        selectEl.setAttribute('data-placeholder', defaultVal);

        // If there's an explicit placeholder option, update its text/value
        if (defaultOpt) {
            if (defaultOpt.tagName && defaultOpt.tagName.toLowerCase() === 'option') {
                defaultOpt.textContent = defaultVal;
                defaultOpt.value = defaultOpt.value || '';
            } else {
                defaultOpt.value = defaultVal;
            }
        }
    } else if (defaultOpt) {
        defaultOpt.value = defaultVal;
    }

    // Update visible placeholder text for Chosen/Chosen-like containers
    if (container) {
        // Only show the custom default text when Chosen does not already have a real selection.
        // Otherwise we can overwrite the visible label while the underlying value remains selected.
        // Single-select chosen: update the display span and mark as default
        const singleSpan = container.querySelector('.chzn-single span, .chosen-single span');
        const singleAnchor = container.querySelector('.chzn-single, .chosen-single');
        if (!hasSelectedValue && singleSpan) {
            singleSpan.textContent = defaultVal;
            if (singleAnchor) singleAnchor.classList.add('chzn-default', 'chosen-default');
        } else if (hasSelectedValue && singleAnchor) {
            singleAnchor.classList.remove('chzn-default', 'chosen-default');
        }

        // Multi-select chosen: update the default search-field input value
        const multiDefaultInput = container.querySelector('.chzn-choices .search-field input.default, .chzn-choices .search-field input, .chosen-choices .search-field input.default, .chosen-choices .search-field input');
        if (!hasSelectedValue && multiDefaultInput) {
            try {
                multiDefaultInput.value = defaultVal;
                multiDefaultInput.setAttribute('value', defaultVal);
            } catch (err) {
                // ignore
            }
        }

        // Update placeholder on the search input if present
        const placeholderInput = container.querySelector('.chzn-search input, .chosen-search input, .search-field input');
        if (placeholderInput && placeholderInput.placeholder !== undefined) {
            placeholderInput.placeholder = defaultVal;
        }

        // Chosen may re-render after this function runs; retry a few times to ensure visible text is updated.
        // Use named constants for clarity and keep retries bounded.
        const MAX_TRIES = 6;
        const TRY_INTERVAL = 100; // ms

        const trySetChosenDisplay = (attempt = 0) => {
            const singleSpanRetry = container.querySelector('.chzn-single span, .chosen-single span');
            if (!hasSelectedValue && singleSpanRetry) singleSpanRetry.textContent = defaultVal;

            const multiInputRetry = container.querySelector('.chzn-choices .search-field input.default, .chzn-choices .search-field input, .chosen-choices .search-field input.default, .chosen-choices .search-field input');
            if (!hasSelectedValue && multiInputRetry) {
                try { multiInputRetry.value = defaultVal; } catch (e) { /* ignore */ }
            }

            if (attempt < MAX_TRIES) {
                setTimeout(() => trySetChosenDisplay(attempt + 1), TRY_INTERVAL);
            }
        };
        trySetChosenDisplay();
    }

    // Add one-time event listener for registration handler. Use `once` so it auto-removes.
    addOption.addEventListener('mousedown', (e) => {
        waitSelector({ selector: 'li.kn-form-col', timeout: 3000 })
            .then(() => registrationHandler(e))
            .catch(() => {});
    }, { once: true });
};

/**
 * Applies menu-based filters to any target view with app-configurable behavior.
 * Designed for generic use across table/list/details/calendar targets.
 *
 * @param {object} params
 * @param {string|number} params.menuViewId - Source menu view id.
 * @param {string|number} params.targetViewId - Target view id to filter.
 * @param {Array<object>} [params.rules=[]] - Rule list keyed by button text or explicit ruleKey.
 * @param {object} [params.app={}] - App-specific behavior configuration.
 * @param {string} [params.app.namespace='kf'] - Namespace for data attributes / wire marker.
 * @param {string} [params.app.linkSelector='a'] - Trigger selector within menu view.
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
 * @param {(element: HTMLElement) => string} [params.app.getRuleKeyFromElement] - Optional rule-key resolver for non-text triggers.
 * @param {(ctx: { targetId: string, filter: object|null, page: number, rule: object|null, triggerElement: HTMLElement|null }) => void} [params.app.onBeforeApply]
 * @param {(ctx: { targetId: string, filter: object|null, page: number, targetType: string, rule: object|null, triggerElement: HTMLElement|null }) => void} [params.app.onAfterApply]
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
        getRuleKeyFromElement: null,
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

    const getRuleKeyForRule = (rule) => {
        if (!rule || typeof rule !== 'object') return null;
        if (rule.ruleKey !== undefined && rule.ruleKey !== null) return String(rule.ruleKey);

        const buttonText = String(rule.buttonText || '').trim();
        return buttonText.length ? buttonText : null;
    };

    const getRuleKeyFromElement = (element) => {
        if (!(element instanceof HTMLElement)) return null;

        if (typeof config.getRuleKeyFromElement === 'function') {
            const customRuleKey = config.getRuleKeyFromElement(element);
            return customRuleKey === undefined || customRuleKey === null ? null : String(customRuleKey);
        }

        const buttonText = element.textContent?.trim() || '';
        return buttonText.length ? buttonText : null;
    };

    const ruleMap = new Map(
        (Array.isArray(rules) ? rules : [])
            .map((rule) => [getRuleKeyForRule(rule), rule])
            .filter(([label]) => label !== null)
    );
    if (!ruleMap.size) return;

    const targetViewKey = targetId.replace('view_', '');
    const wireAttr = `data-${config.namespace}-menu-filter-wired`;
    let hasAppliedOnce = false;

    const getTargetViewContext = () => {
        const targetView = knackNavigator.getRenderedView(targetId);
        const targetModel = knackNavigator.getViewModel(targetId);
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

    const applyFilterInPlace = (filter, page = 1, rule = null, triggerElement = null) => {
        const sceneHash = knackNavigator.getSceneHash();
        const query = filter && Array.isArray(filter.rules) && filter.rules.length
            ? `view_${targetViewKey}_filters=${encodeURIComponent(JSON.stringify(filter))}&view_${targetViewKey}_page=${page}`
            : `view_${targetViewKey}_page=${page}`;

        if (typeof config.onBeforeApply === 'function') {
            try { config.onBeforeApply({ targetId, filter, page, rule, triggerElement }); } catch (_) {}
        }

        if (config.syncHash) {
            knackNavigator.navigateToHash(query ? `${sceneHash}?${query}` : sceneHash, { syncVars: true });
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
                        try { config.onAfterApply({ targetId, filter, page, targetType, rule, triggerElement }); } catch (_) {}
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

    const triggers = Array.from(viewElement.querySelectorAll(linkSelector));
    triggers.forEach((triggerElement) => {
        const ruleKey = getRuleKeyFromElement(triggerElement);
        if (ruleKey === null || !ruleMap.has(ruleKey)) return;

        const rule = ruleMap.get(ruleKey);
        const fieldId = rule?.fieldId ? knackNavigator.normalizeFieldId(rule.fieldId) : '';
        const operator = String(rule?.operator || '').trim();
        const value = rule?.value;
        const page = Number.isFinite(Number(rule?.page)) ? Number(rule.page) : 1;
        const filter = buildFilterFn({ rule, fieldId, operator, value });

        if (!filter) {
            if (triggerElement instanceof HTMLAnchorElement) {
                triggerElement.setAttribute('href', buildHref(''));
            }
            triggerElement.dataset.filterTarget = targetId;
            triggerElement.dataset.filter = '';
            triggerElement.dataset.filterPage = String(page);
            triggerElement.dataset.filterRuleKey = ruleKey;
            return;
        }

        const filterParam = encodeURIComponent(JSON.stringify(filter));
        const query = `view_${targetViewKey}_filters=${filterParam}&view_${targetViewKey}_page=${page}`;
        if (triggerElement instanceof HTMLAnchorElement) {
            triggerElement.setAttribute('href', buildHref(query));
        }
        triggerElement.dataset.filterTarget = targetId;
        triggerElement.dataset.filter = JSON.stringify(filter);
        triggerElement.dataset.filterPage = String(page);
        triggerElement.dataset.filterRuleKey = ruleKey;
    });

    if (viewElement.getAttribute(wireAttr) === 'true') return;

    viewElement.addEventListener('click', (event) => {
        const triggerElement = event.target.closest(linkSelector);
        if (!(triggerElement instanceof HTMLElement) || triggerElement.dataset.filterTarget !== targetId) return;

        event.preventDefault();
        if (config.stopPropagation) {
            event.stopPropagation();
        }
        if (config.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        }

        const page = Number(triggerElement.dataset.filterPage) || 1;
        const filterJson = triggerElement.dataset.filter || '';
        const filter = filterJson ? JSON.parse(filterJson) : null;
        const ruleKey = triggerElement.dataset.filterRuleKey;
        const rule = typeof ruleKey === 'string' && ruleMap.has(ruleKey) ? ruleMap.get(ruleKey) : null;

        applyFilterInPlace(filter, page, rule, triggerElement);

        if (config.buttonSelector) {
            viewElement.querySelectorAll(config.buttonSelector).forEach((btn) => {
                btn.classList.remove(config.activeClass);
            });
            triggerElement.classList.add(config.activeClass);
        }
    }, !!config.captureClick);

    viewElement.setAttribute(wireAttr, 'true');
}
