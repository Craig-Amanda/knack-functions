// Batch 11: V1 lines 8212-8252, 9525-9594, 9712-9720 (getAllTableRows 9093-9123), 12155-12265, 14107-14151, 18551-18627, 18690-18717, 19143-19252, 22919-23034.
// Native DOM; modern fetch/async. getKnackApiClient and KnackAPI are copied as-is in the previous section.

/**
 * Posts data to a webhook.
 * @param {string} webhookURL - HTTPS URL.
 * @param {*} data - JSON body.
 * @param {string} [webhookName='Unnamed Webhook'] - Name used in logs.
 * @param {boolean} [isSecure=false] - Send the user's token in a `userToken` header.
 * @returns {Promise<{success: true, data: *, error: null}|{error: string}>} `{error}` for a non-HTTPS URL.
 * @throws {{success: false, data: *, error: string, webhookName: string}} On a network error or non-OK response.
 */
async function triggerWebhook(webhookURL, data, webhookName = 'Unnamed Webhook', isSecure = false) {
    if (!webhookURL.startsWith('https://')) {
        const errorMsg = `Invalid webhook URL: ${webhookURL} in webhook: ${webhookName}`;
        console.error(errorMsg);
        return { error: errorMsg };
    }
    let responseData = null;
    try {
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', userToken: isSecure ? Knack.getUserToken() : '' },
            body: JSON.stringify(data),
        });
        responseData = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : await response.text();
        if (!response.ok) {
            console.error(`Webhook (${webhookName}) failed with status ${response.status}:`, responseData);
            throw new Error(`Network response was not ok: ${responseData}`);
        }
        console.log(`Webhook (${webhookName}) sent successfully with response:`, responseData);
        return { success: true, data: responseData, error: null };
    } catch (error) {
        console.error(`Error triggering webhook: ${webhookName}`, error);
        throw { success: false, data: responseData, error: error.message, webhookName };
    }
}

/**
 * For a bank holiday date, gives the long weekend it belongs to (Monday: from the Saturday; Friday: to the Sunday).
 * @param {string} dateIso - `yyyy-mm-dd`.
 * @returns {{from: string, to: string, dayName: string}} UK dates (`dd/mm/yyyy`) and the weekday name.
 */
function getBankHolidayWeekendRange(dateIso) {
    const date = new Date(`${dateIso}T00:00:00Z`);
    const day = date.getUTCDay();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    const format = (value) => [value.getUTCDate(), value.getUTCMonth() + 1].map((part) => String(part).padStart(2, '0')).concat(value.getUTCFullYear()).join('/');
    return {
        from: format(day === 1 ? new Date(date.getTime() - twoDays) : date),
        to: format(day === 5 ? new Date(date.getTime() + twoDays) : date),
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day],
    };
}

/**
 * Fetches UK bank holidays from gov.uk for a year.
 * @param {Object} options
 * @param {number|string} options.targetYear - Year (required).
 * @param {number} [options.monthNumber] - Only this month (1-12).
 * @param {string} [options.titleContains] - Only holidays whose title contains this (case-insensitive).
 * @param {'eng'|'scotland'|'ireland'} [options.region='eng'] - `ireland` means Northern Ireland.
 * @returns {Promise<Array<{dateIso: string, dateUk: string, title: string, weekend: Object}>>}
 */
async function getGovBankHolidays(options = {}) {
    const { targetYear, monthNumber, titleContains } = options;
    const region = String(options.region || 'eng').toLowerCase();
    if (targetYear === undefined || targetYear === null) throw new Error('getGovBankHolidays requires options.targetYear');
    const year = Number(targetYear);
    if (!Number.isFinite(year)) throw new Error('getGovBankHolidays: targetYear must be a valid number');

    try {
        const response = await fetch('https://www.gov.uk/bank-holidays.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const division = { scotland: 'scotland', ireland: 'northern-ireland' }[region] ?? 'england-and-wales';
        return (payload?.[division]?.events ?? [])
            .filter((event) => {
                if (!event?.date) return false;
                const date = new Date(`${event.date}T00:00:00Z`);
                return date.getUTCFullYear() === year
                    && (!monthNumber || date.getUTCMonth() + 1 === monthNumber)
                    && (!titleContains || event.title.toLowerCase().includes(titleContains.toLowerCase()));
            })
            .map((event) => ({ dateIso: event.date, dateUk: getDateUKFormat(event.date), title: event.title, weekend: getBankHolidayWeekendRange(event.date) }));
    } catch (error) {
        console.error('getGovBankHolidays error:', error);
        throw error;
    }
}

/**
 * Redirects after a form submit or click, or when a modal's close button is clicked after a view or scene renders.
 * @param {Event|{type: string}} event - Knack event or DOM event.
 * @param {string} newURL - Where to go (after 300ms).
 */
function handleRedirect(event, newURL) {
    if (!event || !newURL) return;
    const go = () => setTimeout(() => { window.location.href = newURL; }, 300);
    if (['knack-form-submit', 'click'].includes(event.type)) go();
    else if (['knack-scene-render', 'knack-view-render'].includes(event.type)) {
        document.querySelectorAll('.kn-modal button.close-modal, .kn-modal .close-modal').forEach((button) => button.addEventListener('click', go, { once: true }));
    }
}

/**
 * Calls `callback(index, row)` for each row of a view's first table, in the order body, then (optionally) header and group rows.
 * @param {string} viewId - View id.
 * @param {(index: number, row: HTMLTableRowElement) => void} callback - Row callback.
 * @param {boolean} [includeHeader=false] - Put `thead` rows first.
 * @param {boolean} [includeGroup=false] - Add group rows last.
 * @param {string|null} [excludeSelector=null] - Skip rows matching this selector.
 */
function getAllTableRows(viewId, callback, includeHeader = false, includeGroup = false, excludeSelector = null) {
    const table = viewId && document.querySelector(`#${viewId} table`);
    if (!table) return;
    const rows = [
        ...(includeHeader ? table.querySelectorAll('thead tr') : []),
        ...table.querySelectorAll('tbody tr:not(.kn-table-group)'),
        ...(includeGroup ? table.querySelectorAll('tbody tr.kn-table-group') : []),
    ];
    rows.filter((row) => !excludeSelector || !row.matches(excludeSelector)).forEach((row, index) => callback(index, row));
}

/**
 * Shows only the week columns around the current week (moved to the end of each row), highlighting this week's cells.
 * Needs the app global WEEK_NUM_SHARED_AREA_GRID (`weekNumberFields`: 52 field classes).
 * @param {string} viewId - View id.
 * @param {string} bgGridColor - Background colour for the current week's cells.
 * @param {number} [weeksToShow=11] - Columns to show.
 * @param {number} [pastWeeksToShow=7] - How many of them are before this week.
 */
function showRelevantWeeks(viewId, bgGridColor, weeksToShow = 11, pastWeeksToShow = 7) {
    const { weekNumberFields } = window.WEEK_NUM_SHARED_AREA_GRID;
    const currentWeek = getWeekNumber(new Date());
    const view = document.getElementById(viewId);
    if (!view) return console.warn(`View element with ID ${viewId} not found`);
    const thead = view.querySelector('thead');
    const tbody = view.querySelector('tbody');
    if (!thead || !tbody) return console.warn(`Table header or body not found in view ${viewId}`);

    weekNumberFields.forEach((field) => view.querySelectorAll(`.${field}`).forEach((element) => { element.style.display = 'none'; }));
    const weeks = Array.from({ length: weeksToShow }, (_, index) => {
        const weekIndex = (currentWeek - pastWeeksToShow + index + 52) % 52 || 52; // Wraps over year ends; 52 not 0.
        return { field: weekNumberFields[weekIndex - 1], isCurrentWeek: weekIndex === currentWeek };
    });

    const headerRow = thead.querySelector('tr');
    weeks.forEach(({ field }) => {
        const header = headerRow?.querySelector(`.${field}`);
        if (!header) return;
        header.style.display = '';
        headerRow.append(header);
    });
    tbody.querySelectorAll('tr').forEach((row) => weeks.forEach(({ field, isCurrentWeek }) => {
        const cell = row.querySelector(`.${field}`);
        if (!cell) return;
        cell.style.display = '';
        if (isCurrentWeek) cell.style.backgroundColor = bgGridColor;
        row.append(cell);
    }));
}

/**
 * Updates a week's field on the shared-area record for a connection and type.
 * Needs the app global WEEK_NUM_SHARED_AREA_GRID.
 * @param {string} conxId - Connected record id.
 * @param {string} formDate - Form date as `dd/mm/yyyy`.
 * @param {*} value - Value to save in that week's field.
 * @param {*} typeValue - Type filter value.
 * @returns {Promise<void>}
 */
async function updateWeekNumberObject(conxId, formDate, value, typeValue) {
    const grid = WEEK_NUM_SHARED_AREA_GRID;
    const api = getKnackApiClient();
    const weekField = grid.weekNumberFields[getWeekNumber(convertToDateObj(formDate)) - 1];
    const [weeklyTask] = (await api.getRecords(grid.sceneId, grid.viewId, { filters: createFilterForWeekObj(grid, conxId, typeValue) })) ?? [];
    if (weeklyTask?.id) await api.updateRecord(grid.sceneId, grid.viewId, weeklyTask.id, { [weekField]: value });
}

/**
 * Replaces cell text with a label when its number is over a limit.
 * @param {string|number} cellIdent - Field id number (`td.field_N`), or text a link label must contain when `isLink`.
 * @param {number} maxNum - Largest number left as is.
 * @param {string} replaceTxt - Replacement text.
 * @param {boolean} [isLink] - Look at `span.knViewLink__label` elements instead of table cells.
 */
function replaceLargeNo(cellIdent, maxNum, replaceTxt, isLink) {
    const cells = isLink
        ? Array.from(document.querySelectorAll('span.knViewLink__label')).filter((span) => span.textContent.includes(cellIdent))
        : document.querySelectorAll(`td.field_${cellIdent}`);
    cells.forEach((cell) => {
        const value = parseInt(cell.textContent.replace(/,/g, ''), 10);
        if (!Number.isNaN(value) && value > maxNum) cell.textContent = replaceTxt;
    });
}

/**
 * Makes buttons and links in a view containing some text open a Knack asset (new window) or navigate to a file path.
 * Needs the app global KN_ASSET_PREFIX for same-window navigation.
 * @param {string} viewId - View id.
 * @param {string} btnText - Text the button must contain.
 * @param {string} filePath - Asset path.
 * @param {boolean} [openInNewWindow=false] - Open the Knack download URL in a new window.
 */
function openFileFromBtn(viewId, btnText, filePath, openInNewWindow = false) {
    const view = document.getElementById(viewId);
    if (!view) return console.error(`View element with ID ${viewId} not found`);
    const buttons = [...view.querySelectorAll('a'), ...view.querySelectorAll('button')].filter((button) => button.textContent.trim().includes(btnText));
    if (!buttons.length) return console.error(`Button with text "${btnText}" not found in view ${viewId}`);
    buttons.forEach((button) => button.addEventListener('click', (event) => {
        event.preventDefault();
        if (openInNewWindow) window.open(`https://api.knack.com/v1/applications/${Knack.application_id}/download/asset/${filePath}`, '_blank');
        else window.location.href = sanitiseURL(window.location.href) + KN_ASSET_PREFIX + filePath;
    }));
}

/**
 * Keeps two text inputs in sync (both ways, firing input and change events); the non-empty one wins at the start.
 * Safe to call again for the same pair.
 * @param {HTMLInputElement|HTMLTextAreaElement} textInputA - First input.
 * @param {HTMLInputElement|HTMLTextAreaElement} textInputB - Second input.
 */
function syncTextInputs(textInputA, textInputB) {
    if (textInputA.dataset.notesSyncBound === '1' && textInputB.dataset.notesSyncBound === '1') return;
    textInputA.dataset.notesSyncBound = textInputB.dataset.notesSyncBound = '1';

    let isSyncing = false;
    const propagate = (source, target) => {
        if (isSyncing || target.value === source.value) return;
        isSyncing = true;
        target.value = source.value;
        fireEvent(target, 'input');
        fireEvent(target, 'change');
        isSyncing = false;
    };
    ['input', 'change'].forEach((type) => {
        textInputA.addEventListener(type, () => propagate(textInputA, textInputB));
        textInputB.addEventListener(type, () => propagate(textInputB, textInputA));
    });

    const [a, b] = [textInputA.value, textInputB.value].map((value) => (value || '').trim());
    if (a && a !== b) propagate(textInputA, textInputB);
    else if (b && b !== a) propagate(textInputB, textInputA);
}

/**
 * Creates a Knack-styled button. Also accepts the old positional form `createButton(id, html, className)`.
 * @param {Object|string} options - `{id, html, className, type, attributes, onClick}`, or the id in the old form.
 * @returns {HTMLButtonElement}
 */
function createButton(options) {
    if (typeof options === 'string') options = { id: options, html: arguments[1], className: arguments[2] };
    const { id, html, className, type, attributes, onClick } = { id: '', html: '', className: '', type: 'button', attributes: {}, onClick: null, ...options };
    const button = document.createElement('button');
    if (id) button.id = id;
    button.className = `kn-button${className ? ` ${className}` : ''}`;
    button.type = type;
    button.innerHTML = html;
    Object.entries(attributes).forEach(([name, value]) => button.setAttribute(name, value));
    if (typeof onClick === 'function') button.addEventListener('click', onClick);
    return button;
}

/**
 * Opens the browser's date picker when a `type="date"` input is clicked or focused (once per input).
 * @param {HTMLInputElement|string|NodeList|Array} inputOrSelector - Input(s) or selector.
 * @returns {HTMLInputElement[]} The date inputs that have the picker attached.
 */
function attachNativeDateInputPicker(inputOrSelector) {
    return resolveElements(inputOrSelector).filter((input) => {
        if (!(input instanceof HTMLInputElement) || input.type.toLowerCase() !== 'date') return false;
        if (input.dataset.knackNativeDatePickerAttached === 'true') return true;
        const openPicker = () => {
            if (typeof input.showPicker !== 'function' || input.disabled || input.readOnly) return;
            try { input.showPicker(); } catch { /* Browser restriction or unsupported context. */ }
        };
        input.addEventListener('click', openPicker);
        input.addEventListener('focus', openPicker);
        input.dataset.knackNativeDatePickerAttached = 'true';
        return true;
    });
}

/**
 * Replaces the items of a view's menu links with styled buttons.
 * @param {Object} [config]
 * @param {Element} config.root - View root containing `.menu-links`.
 * @param {Array<{label?: string, id?: string, className?: string, isActive?: boolean, data?: Object, colors?: {baseColor?: string, activeColor?: string, textColor?: string}}>} [config.menuItems=[]] - Items.
 * @param {string} [config.buttonClass=''] - Extra class for every button.
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
    const globalClass = String(buttonClass || '').trim();
    const fragment = document.createDocumentFragment();
    (Array.isArray(menuItems) ? menuItems : []).forEach((item) => {
        const link = document.createElement('a');
        const extraClass = String(item?.className || '').trim();
        link.className = `${linkClassName} kn-button kf-menu-button${globalClass ? ` ${globalClass}` : ''}${extraClass ? ` ${extraClass}` : ''}`;
        link.textContent = String(item?.label || '').trim() || 'Menu';
        link.href = '#';
        if (item?.isActive) link.classList.add('is-active');
        if (item?.id) link.dataset.platformId = String(item.id);
        if (item?.data && typeof item.data === 'object') Object.entries(item.data).forEach(([key, value]) => { if (key) link.dataset[key] = String(value); });
        const { baseColor, activeColor, textColor } = item?.colors ?? {};
        if (baseColor) {
            link.style.setProperty('--kf-menu-color', baseColor);
            link.style.setProperty('--kf-menu-color-active', activeColor || baseColor);
            if (textColor) link.style.setProperty('--kf-menu-text-color', textColor);
        }
        const menuItem = Object.assign(document.createElement('li'), { className: 'kf-menu-item menu-links__list-item' });
        menuItem.append(link);
        fragment.append(menuItem);
    });
    list.append(fragment);
}
