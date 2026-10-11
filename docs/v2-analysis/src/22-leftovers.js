// Leftover helpers ported as-is (V1 already native; jQuery only where Knack forces it: pickers, Chosen, Knack events). Analyses C11, C12, C16, C18, C19, C21, C22, C24, C25.

/**
 * Renders or removes a lightweight floating version indicator.
 * Callers provide the already-normalised text plus any app-specific id or class names.
 * @param {string} text - Version text to display. Empty text removes the indicator.
 * @param {Object} [options={}] - Rendering options.
 * @returns {void}
 */
function renderVersionIndicator(text, options = {}) {
    const {
        indicatorId = 'kf-version-indicator',
        className = 'kf-version-indicator',
        container = document.body,
    } = options;

    if (!(container instanceof HTMLElement)) {
        return;
    }

    const versionText = knackValueResolver.toStringSafe(text);
    let versionElement = document.getElementById(String(indicatorId || '').trim());

    if (!versionText) {
        if (versionElement instanceof HTMLElement) {
            versionElement.remove();
        }
        return;
    }

    if (!(versionElement instanceof HTMLElement)) {
        versionElement = document.createElement('div');
        versionElement.id = String(indicatorId || '').trim() || 'kf-version-indicator';
        container.appendChild(versionElement);
    }

    versionElement.className = String(className || '').trim() || 'kf-version-indicator';
    versionElement.textContent = versionText;
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
 * Read date/time values from a Knack datetime wrapper.
 * @param {HTMLElement|null} fieldWrap
 * @returns {{date: string, time: string}}
 */
function getDateTimeParts(fieldWrap) {
    if (!fieldWrap) return { date: '', time: '' };
    const dateInput = fieldWrap.querySelector('.kn-datetime input[name="date"], input.knack-date-input, input[name="date"]');
    const timeInput = fieldWrap.querySelector('.kn-datetime input[name="time"], input.kn-time-input, input[name="time"]');
    const hoursSelect = fieldWrap.querySelector('select[name="hours"]');
    const minutesSelect = fieldWrap.querySelector('select[name="minutes"]');
    const amPmSelect = fieldWrap.querySelector('select[name="am_pm"]');
    const dateValue = dateInput ? String(dateInput.value || '').trim() : '';

    if (timeInput) {
        return {
            date: dateValue,
            time: String(timeInput.value || '').trim().replace(/\s+/g, ''),
        };
    }

    if (hoursSelect instanceof HTMLSelectElement && minutesSelect instanceof HTMLSelectElement) {
        const hours = String(hoursSelect.value || '').trim();
        const minutes = String(minutesSelect.value || '').trim();
        const amPm = amPmSelect instanceof HTMLSelectElement ? String(amPmSelect.value || '').trim().toLowerCase() : '';
        return {
            date: dateValue,
            time: hours && minutes ? `${hours}:${minutes}${amPm}` : '',
        };
    }

    return {
        date: dateValue,
        time: '',
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
 * Parse a Knack from/to date-time wrapper into local start and end dates.
 * Supports both single and range layouts that expose one or two date/time inputs.
 * @param {HTMLElement|null} fieldWrap
 * @returns {{startDate: Date|null, endDate: Date|null}} Parsed inclusive range.
 * Example return with times:
 * { startDate: new Date(2026, 6, 24, 10, 0, 0, 0), endDate: new Date(2026, 6, 27, 23, 30, 0, 0) }
 * Example return with date-only values:
 * { startDate: new Date(2026, 6, 24, 0, 0, 0, 0), endDate: new Date(2026, 6, 27, 23, 59, 59, 999) }
 */
function parseFromToDate(fieldWrap) {
    if (!(fieldWrap instanceof HTMLElement)) {
        return { startDate: null, endDate: null };
    }

    const dateInputs = Array.from(fieldWrap.querySelectorAll('input.knack-date'));
    const timeInputs = Array.from(fieldWrap.querySelectorAll('input.kn-time'));
    const fromDateText = String(dateInputs?.[0]?.value || '').trim();
    const hasExplicitToDateInput = dateInputs.length > 1;
    const toDateText = hasExplicitToDateInput
        ? String(dateInputs?.[1]?.value || '').trim()
        : String(dateInputs?.[0]?.value || '').trim();
    const fromTimeText = String(timeInputs?.[0]?.value || '').trim();
    const toTimeText = String(timeInputs?.[1]?.value || '').trim();

    if (!fromDateText || !toDateText) {
        return { startDate: null, endDate: null };
    }

    if (hasExplicitToDateInput && !String(dateInputs?.[1]?.value || '').trim()) {
        return { startDate: null, endDate: null };
    }

    const parseBoundaryDate = function (value, endOfDay = false) {
        const parsedDate = parseDateObject(value);
        if (!(parsedDate instanceof Date) || Number.isNaN(parsedDate.getTime())) {
            return null;
        }

        return endOfDay
            ? new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999)
            : new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0);
    };

    const parsedStartDate = parseDateTimeParts({ date: fromDateText, time: fromTimeText }) || parseBoundaryDate(fromDateText, false);
    const parsedEndDate = toTimeText
        ? parseDateTimeParts({ date: toDateText, time: toTimeText }) || parseBoundaryDate(toDateText, true)
        : parseBoundaryDate(toDateText, true);

    if (!(parsedStartDate instanceof Date) || Number.isNaN(parsedStartDate.getTime()) || !(parsedEndDate instanceof Date) || Number.isNaN(parsedEndDate.getTime())) {
        return { startDate: null, endDate: null };
    }

    if (parsedStartDate.getTime() > parsedEndDate.getTime()) {
        return { startDate: parsedEndDate, endDate: parsedStartDate };
    }

    return {
        startDate: parsedStartDate,
        endDate: parsedEndDate,
    };
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
                    if (signatureElements.length) knackNavigator.getRenderedView(viewId)?.renderSignatures?.();

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

/**
 * Wire a form so a controlling input can temporarily hide empty required fields.
 * Required fields are detected from Knack view metadata and rendered required markers.
 * @param {string} viewId - Knack view id.
 * @param {Object} [options={}] - Visibility configuration.
 * @param {string|number} options.controllerFieldId - Field id for the controlling input.
 * @param {Function} [options.isEnabled] - Optional predicate returning whether hiding is active.
 * @param {Function} [options.fieldHasValue] - Optional predicate `(fieldWrap, context) => boolean`.
 * @param {Function} [options.resolveVisibilityTarget] - Optional target resolver `(fieldWrap, context) => HTMLElement`.
 * @param {Array<string|number>} [options.excludeFieldIds=[]] - Additional field ids to exclude.
 * @param {string|string[]} [options.events=['change','input']] - Events that should recalculate visibility.
 * @param {string} [options.delegate='input, select, textarea'] - Delegated selector for input changes.
 * @param {string} [options.submitNamespace='conditionalRequiredFieldVisibility'] - Namespace for the submit handler.
 * @returns {{viewElement: HTMLElement, formElement: HTMLFormElement, apply: Function}|null}
 */
function initialiseConditionalRequiredFieldVisibility(viewId, options = {}) {
    const viewElement = getById(viewId);
    const formElement = viewElement?.querySelector('form');
    if (!(viewElement instanceof HTMLElement) || !(formElement instanceof HTMLFormElement)) {
        return null;
    }

    const {
        controllerFieldId,
        isEnabled,
        fieldHasValue,
        resolveVisibilityTarget,
        excludeFieldIds = [],
        events = ['change', 'input'],
        delegate = 'input, select, textarea',
        submitNamespace = 'conditionalRequiredFieldVisibility',
    } = options;

    const getRequiredFieldIds = () => {
        const fieldDefinitions = knackNavigator.getViewFieldDefinitions(viewElement.id);

        return new Set(fieldDefinitions.filter((fieldDefinition) => fieldDefinition?.required).map((fieldDefinition) => {
            return knackNavigator.normalizeFieldId(
                fieldDefinition?.key
                || fieldDefinition?.id
                || fieldDefinition?.field_key
                || ''
            );
        }).filter(Boolean));
    };

    const hasVisibleInputValue = (fieldWrap) => {
        if (!(fieldWrap instanceof HTMLElement)) {
            return false;
        }

        const dateInput = fieldWrap.querySelector('.kn-datetime input[name="date"], input.knack-date-input, input[name="date"]');
        const timeInput = fieldWrap.querySelector('.kn-datetime input[name="time"], input.kn-time-input, input[name="time"]');
        const hoursSelect = fieldWrap.querySelector('select[name="hours"]');
        const minutesSelect = fieldWrap.querySelector('select[name="minutes"]');
        if (dateInput || timeInput || hoursSelect || minutesSelect) {
            return Boolean(getDateTimeParts(fieldWrap).date);
        }

        if (fieldWrap.querySelector('input[type="checkbox"]:checked, input[type="radio"]:checked')) {
            return true;
        }

        const fileInput = fieldWrap.querySelector('input[type="file"]');
        if (fileInput?.files?.length) {
            return true;
        }

        const typedInput = Array.from(fieldWrap.querySelectorAll('textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select'))
            .find(function (inputElement) {
                return elementHasMeaningfulValue(inputElement);
            });

        return Boolean(typedInput);
    };

    const getRequiredFieldWraps = (controllerFieldWrap) => {
        const requiredFieldIds = getRequiredFieldIds();
        const excludedIds = new Set([controllerFieldId, ...(Array.isArray(excludeFieldIds) ? excludeFieldIds : [excludeFieldIds])]
            .map((fieldId) => knackNavigator.normalizeFieldId(fieldId))
            .filter(Boolean));

        return Array.from(viewElement.querySelectorAll('[id^="kn-input-field_"]')).filter((fieldWrap) => {
            if (!(fieldWrap instanceof HTMLElement) || fieldWrap === controllerFieldWrap) return false;
            if (fieldWrap.closest('.is-hidden, [hidden]')) return false;

            const fieldId = knackNavigator.normalizeFieldId(fieldWrap.id.replace(/^kn-input-/, ''));
            if (fieldId && excludedIds.has(fieldId)) return false;

            return Boolean(
                fieldWrap.querySelector('.kn-label .kn-required')
                || fieldWrap.querySelector('[required], [aria-required="true"]')
                || (fieldId ? requiredFieldIds.has(fieldId) : false)
                || fieldWrap.querySelector('input[required], select[required], textarea[required]')
            );
        });
    };

    const resolveTarget = (fieldWrap, context) => {
        if (typeof resolveVisibilityTarget === 'function') {
            return resolveVisibilityTarget(fieldWrap, context);
        }

        return fieldWrap.closest('.kn-input') || fieldWrap;
    };

    const hideField = (fieldWrap, context) => {
        const target = resolveTarget(fieldWrap, context);
        if (!(target instanceof HTMLElement) || target.dataset.conditionalRequiredHidden === 'true') return;

        target.dataset.conditionalRequiredHidden = 'true';
        target.dataset.conditionalRequiredPreviousDisplay = target.style.display || '';
        setVisibility(target, false);

        fieldWrap.querySelectorAll('input, select, textarea, button').forEach((controlElement) => {
            controlElement.dataset.conditionalRequiredWasDisabled = controlElement.disabled ? 'true' : 'false';
            controlElement.disabled = true;
        });
    };

    const restoreField = (fieldWrap, context) => {
        const target = resolveTarget(fieldWrap, context);
        if (!(target instanceof HTMLElement) || target.dataset.conditionalRequiredHidden !== 'true') return;

        const previousDisplay = target.dataset.conditionalRequiredPreviousDisplay || '';
        delete target.dataset.conditionalRequiredHidden;
        delete target.dataset.conditionalRequiredPreviousDisplay;
        target.style.display = previousDisplay;

        fieldWrap.querySelectorAll('input, select, textarea, button').forEach((controlElement) => {
            const wasDisabled = controlElement.dataset.conditionalRequiredWasDisabled === 'true';
            controlElement.disabled = wasDisabled;
            delete controlElement.dataset.conditionalRequiredWasDisabled;
        });
    };

    const apply = () => {
        const controllerFieldWrap = controllerFieldId == null
            ? null
            : knackNavigator.getFieldWrapper(viewElement, controllerFieldId);
        if (controllerFieldId != null && !controllerFieldWrap) {
            return [];
        }

        const context = { viewElement, formElement, controllerFieldWrap, controllerFieldId };
        const visibilityEnabled = typeof isEnabled === 'function'
            ? Boolean(isEnabled(context))
            : (controllerFieldId != null && getFormFieldCheckboxValues(controllerFieldId, viewElement).length > 0);
        const requiredFieldWraps = getRequiredFieldWraps(controllerFieldWrap);

        requiredFieldWraps.forEach((fieldWrap) => {
            const hasValue = typeof fieldHasValue === 'function'
                ? Boolean(fieldHasValue(fieldWrap, context))
                : hasVisibleInputValue(fieldWrap);

            if (visibilityEnabled && !hasValue) {
                hideField(fieldWrap, context);
                return;
            }

            restoreField(fieldWrap, context);
        });

        return requiredFieldWraps;
    };

    apply();

    addInputEventListener(formElement, apply, {
        events,
        delegate,
    });

    if (typeof window.jQuery === 'function') {
        window.jQuery(formElement)
            .off(`submit.${submitNamespace}`)
            .on(`submit.${submitNamespace}`, function () {
                apply();
            });
    }

    return {
        viewElement,
        formElement,
        apply,
    };
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
 * Adds floating scroll-to-top and close controls to the active Knack modal.
 * Repeated modal render events reuse the existing controls rather than adding duplicates.
 * @return {void}
 */
function addModalNavigationButtons() {
    const modalBg = Array.from(document.querySelectorAll('[id^="kn-modal-bg-"]')).pop();
    if (!modalBg || modalBg.querySelector(':scope > .modal-control-buttons')) return;

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-control-buttons';
    buttonContainer.setAttribute('role', 'group');
    buttonContainer.setAttribute('aria-label', 'Modal controls');

    const scrollToTopBtn = createButton({
        html: '<i class="fa fa-arrow-up"></i>',
        className: 'modalButton success-bkgd scroll-to-top-btn',
        attributes: {
            'aria-label': 'Scroll to top of modal',
            title: 'Scroll to top'
        },
        onClick: function() {
            modalBg.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    const closeModalBtn = createButton({
        html: '<i class="fa fa-times"></i>',
        className: 'modalButton warning-bkgd close-modal-btn',
        attributes: {
            'aria-label': 'Close modal',
            title: 'Close'
        },
        onClick: function() {
            modalBg.querySelector('button.close-modal, .close-modal')?.click();
        }
    });

    buttonContainer.appendChild(scrollToTopBtn);
    buttonContainer.appendChild(closeModalBtn);
    modalBg.appendChild(buttonContainer);

    /** Positions the controls beside the modal without allowing viewport overflow. */
    const updatePosition = () => {
        if (!modalBg.isConnected) {
            window.removeEventListener('resize', updatePosition);
            window.visualViewport?.removeEventListener('resize', updatePosition);
            return;
        }

        const modalCard = modalBg.querySelector('.modal-card, .modal-card-body');
        if (!modalCard) return;

        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const viewportEdge = 12;
        const modalGap = 8;
        const preferredLeft = modalCard.getBoundingClientRect().right + modalGap;
        const minimumLeft = viewportLeft + viewportEdge;
        const maximumLeft = viewportLeft + viewportWidth - buttonContainer.offsetWidth - viewportEdge;
        buttonContainer.style.left = `${Math.max(minimumLeft, Math.min(preferredLeft, maximumLeft))}px`;
    };

    /** Updates the controls when the modal crosses the scroll threshold. */
    const updateVisibility = () => {
        buttonContainer.classList.toggle('is-visible', modalBg.scrollTop > 100);
        updatePosition();
    };

    modalBg.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    window.visualViewport?.addEventListener('resize', updatePosition, { passive: true });
    updateVisibility();
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
        return buildKnackAssetInfo(assetId, fileName);
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
            fullFormURL += `${formName}/${knackNavigator.getUserAttributes().id}`;
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
        // Preserve asset identity so other features (e.g. initFileCarousel) can still identify this cell's file.
        a.setAttribute('data-asset-id', info.assetId);
        a.setAttribute('data-file-name', info.fileName);
        setFileViewerLink(a, info, true);
        assetEl.replaceWith(a);
    });
}

/**
 * Adds KTL-style copy-to-clipboard behaviour for a view while excluding grid headers.
 * Use the `_copybody` view keyword to enable it. The keyword honours the same
 * role options as KTL's `_copy` keyword.
 *
 * @param {{key?: string}} view - Knack view metadata.
 * @param {Object} keywords - Parsed KTL keywords for the view.
 * @returns {void}
 */
function copyViewBodyToClipboard(view, keywords) {
    const keywordName = '_copybody';
    const viewId = knackNavigator.normalizeViewId(view?.key);
    if (!viewId || !keywords?.[keywordName]) return;

    const viewType = ktl.views.getViewType(viewId);
    const selectors = {
        table: `#${viewId} .kn-table-wrapper tbody`,
        search: `#${viewId} .kn-table-wrapper tbody`,
        details: `#${viewId}.kn-details section`,
        list: `#${viewId}.kn-list .columns`
    };
    const contentSelector = selectors[viewType];
    if (!contentSelector) {
        console.log('copyViewBodyToClipboard error. Unsupported view type:', viewId);
        return;
    }

    const buttonSelector = `#${viewId} .knackCopyBodyButton`;
    let button = document.querySelector(buttonSelector);

    if (!button) {
        const keywordOptions = keywords[keywordName][0]?.options;
        if (keywordOptions && !ktl.core.hasRoleAccess(keywordOptions)) return;

        button = document.createElement('button');
        button.className = 'kn-button knackCopyBodyButton';
        button.type = 'button';
        button.textContent = 'Copy to Clipboard';
        Object.assign(button.style, {
            marginBottom: '10px',
            width: 'fit-content'
        });

        let buttonContainer = null;
        if (viewType === 'table' || viewType === 'search') {
            buttonContainer = document.querySelector(`#${viewId} .table-keyword-search`);
            if (buttonContainer) {
                buttonContainer.style.display = 'inline-flex';
                button.style.marginLeft = '10%';
                buttonContainer.appendChild(button);
            }
        }

        if (!buttonContainer) {
            buttonContainer = document.querySelector(
                `#${viewId}.kn-table .kn-records-nav, #${viewId} .kn-list-content, #${viewId} .kn-details section`
            );
            if (!buttonContainer) return;

            buttonContainer.style.flexDirection = 'column';
            button.style.marginLeft = '8px';
            buttonContainer.prepend(button);
        }

        button.addEventListener('click', function () {
            const content = document.querySelector(contentSelector);
            if (!content) {
                ktl.core.timedPopup('Unable to copy', 'error', 2000);
                return;
            }

            ktl.core.selectElementContents(content);
            try {
                const successful = document.execCommand('copy');
                const message = successful
                    ? `${viewType.charAt(0).toUpperCase()}${viewType.slice(1)} copied to clipboard`
                    : 'Error copying to clipboard';
                ktl.core.timedPopup(message, successful ? 'success' : 'error', 1000);
            } catch (error) {
                ktl.core.timedPopup('Unable to copy', 'error', 2000);
            } finally {
                ktl.core.selectElementContents();
            }
        });
    }

    const content = document.querySelector(contentSelector);
    const hasData = Boolean(content) && !content.querySelector('.kn-tr-nodata');
    button.disabled = !hasData;
}

function idleWatchDogTimeout() {
    if (document.querySelector('.kn-login')) return;

    const ID_PREFIX = 'ktl-idle-';
    const overlayId = ID_PREFIX + 'overlay';
    const dialogId = ID_PREFIX + 'dialog';
    const logoutBtnId = ID_PREFIX + 'logout-btn';
    const stayBtnId = ID_PREFIX + 'stay-btn';

    // A second call replaces the first dialog completely, including its auto-logout timer and resize listener.
    idleWatchDogTimeout.teardown?.();

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
                    knackNavigator.logout(); // try again
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
            knackNavigator.logout();
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
    idleWatchDogTimeout.teardown = () => {
        clearTimeout(autoLogoutTimeout);
        window.removeEventListener('resize', setDialogWidth);
    };
}

/**
 * Show a generic confirmation dialog with app-provided content and styling hooks.
 * @param {Object} [options={}] Dialog options.
 * @param {string} [options.title='Confirmation'] Dialog title.
 * @param {string|string[]} [options.message='Are you sure you want to continue?'] Message paragraph(s). HTML is allowed.
 * @param {string} [options.contentHtml=''] Additional HTML appended after the message block.
 * @param {Array<{ text: string, className?: string, value?: string, action?: Function, closeOnClick?: boolean }>} [options.buttons=[]] Button definitions.
 * @param {Object} [options.styling={}] Styling hooks.
 * @param {string} [options.styling.overlayClass=''] Overlay class name.
 * @param {string} [options.styling.containerClass=''] Optional inner container class name.
 * @param {string} [options.styling.dialogClass=''] Dialog class name.
 * @param {string} [options.styling.titleClass=''] Title class name.
 * @param {string} [options.styling.messageClass=''] Message class name.
 * @param {string} [options.styling.contentClass=''] Content wrapper class name.
 * @param {string} [options.styling.buttonsClass=''] Buttons wrapper class name.
 * @param {boolean} [options.closeOnOverlay=true] Whether clicking the overlay should close the dialog.
 * @param {boolean} [options.closeOnEscape=true] Whether pressing Escape should close the dialog.
 * @returns {Promise<{ value: string, button: Object }|null>} Selected button result, or null when dismissed.
 */
function showConfirmationDialog(options = {}) {
    const defaultButtons = [
        { text: 'Cancel', className: 'kn-button is-secondary', value: 'cancel' },
        { text: 'OK', className: 'kn-button is-primary', value: 'confirm' },
    ];
    const config = {
        title: knackValueResolver.toStringSafe(options?.title) || 'Confirmation',
        message: options?.message ?? 'Are you sure you want to continue?',
        contentHtml: knackValueResolver.toStringSafe(options?.contentHtml),
        buttons: Array.isArray(options?.buttons) && options.buttons.length ? options.buttons : defaultButtons,
        styling: {
            overlayClass: knackValueResolver.toStringSafe(options?.styling?.overlayClass),
            containerClass: knackValueResolver.toStringSafe(options?.styling?.containerClass),
            dialogClass: knackValueResolver.toStringSafe(options?.styling?.dialogClass),
            titleClass: knackValueResolver.toStringSafe(options?.styling?.titleClass),
            messageClass: knackValueResolver.toStringSafe(options?.styling?.messageClass),
            contentClass: knackValueResolver.toStringSafe(options?.styling?.contentClass),
            buttonsClass: knackValueResolver.toStringSafe(options?.styling?.buttonsClass),
        },
        closeOnOverlay: options?.closeOnOverlay !== false,
        closeOnEscape: options?.closeOnEscape !== false,
    };

    return new Promise(function (resolve) {
        const titleId = `knack-confirm-title-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const overlay = document.createElement('div');
        const dialog = document.createElement('div');
        const titleEl = document.createElement('h2');
        const messages = (Array.isArray(config.message) ? config.message : [config.message]).filter(function (messagePart) {
            return messagePart !== null && messagePart !== undefined && String(messagePart).trim() !== '';
        });
        const buttonsWrap = document.createElement('div');
        const previousActiveElement = document.activeElement;
        let isClosed = false;
        const containerClass = config.styling.containerClass;

        overlay.className = config.styling.overlayClass;
        dialog.className = config.styling.dialogClass;
        titleEl.className = config.styling.titleClass;
        titleEl.id = titleId;
        titleEl.textContent = config.title;

        if (!config.styling.overlayClass) {
            Object.assign(overlay.style, {
                position: 'fixed',
                inset: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                zIndex: '2010',
                boxSizing: 'border-box',
            });
        }

        if (!containerClass) {
            Object.assign(dialog.style, {
                width: 'min(100%, 520px)',
                maxHeight: 'calc(100vh - 48px)',
                overflowY: 'auto',
                background: '#ffffff',
                color: '#1f2937',
                borderRadius: '12px',
                boxShadow: '0 20px 55px rgba(15, 23, 42, 0.28)',
                padding: '24px',
                boxSizing: 'border-box',
            });
        }

        if (!config.styling.titleClass) {
            Object.assign(titleEl.style, {
                margin: '0 0 12px',
                fontSize: '20px',
                lineHeight: '1.3',
            });
        }

        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', titleId);
        dialog.setAttribute('tabindex', '-1');
        dialog.appendChild(titleEl);

        messages.forEach(function (messagePart) {
            const paragraph = document.createElement('p');
            paragraph.className = config.styling.messageClass;
            if (!config.styling.messageClass) {
                Object.assign(paragraph.style, {
                    margin: '0 0 12px',
                    lineHeight: '1.5',
                });
            }
            paragraph.innerHTML = String(messagePart);
            dialog.appendChild(paragraph);
        });

        if (config.contentHtml) {
            const contentEl = document.createElement('div');
            contentEl.className = config.styling.contentClass;
            if (!config.styling.contentClass) {
                contentEl.style.marginBottom = '16px';
            }
            contentEl.innerHTML = config.contentHtml;
            dialog.appendChild(contentEl);
        }

        buttonsWrap.className = config.styling.buttonsClass;
        if (!config.styling.buttonsClass) {
            Object.assign(buttonsWrap.style, {
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                flexWrap: 'wrap',
                marginTop: '20px',
            });
        }
        dialog.appendChild(buttonsWrap);

        function cleanup(result) {
            if (isClosed) {
                return;
            }

            isClosed = true;
            document.removeEventListener('keydown', handleKeydown);
            overlay.remove();
            if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
                previousActiveElement.focus();
            }
            resolve(result);
        }

        function handleKeydown(event) {
            if (config.closeOnEscape && event.key === 'Escape') {
                event.preventDefault();
                cleanup(null);
            }
        }

        config.buttons.forEach(function (buttonConfig, index) {
            const buttonEl = document.createElement('button');
            buttonEl.type = 'button';
            buttonEl.className = knackValueResolver.toStringSafe(buttonConfig?.className || buttonConfig?.class) || 'kn-button';
            buttonEl.textContent = knackValueResolver.toStringSafe(buttonConfig?.text) || `Option ${index + 1}`;
            buttonEl.addEventListener('click', function (event) {
                event.preventDefault();
                const result = {
                    value: knackValueResolver.toStringSafe(buttonConfig?.value) || knackValueResolver.toStringSafe(buttonConfig?.text),
                    button: buttonConfig,
                };

                if (typeof buttonConfig?.action === 'function') {
                    buttonConfig.action(result);
                }

                if (buttonConfig?.closeOnClick === false) {
                    return;
                }

                cleanup(result);
            });
            buttonsWrap.appendChild(buttonEl);
        });

        if (config.closeOnOverlay) {
            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) {
                    cleanup(null);
                }
            });
        }

        document.addEventListener('keydown', handleKeydown);
        if (containerClass) {
            const container = document.createElement('div');
            container.className = containerClass;
            container.appendChild(dialog);
            overlay.appendChild(container);
        } else {
            overlay.appendChild(dialog);
        }
        document.body.appendChild(overlay);
        dialog.focus();
    });
}
