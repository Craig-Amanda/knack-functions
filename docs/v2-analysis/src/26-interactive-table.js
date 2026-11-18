// Interactive table ported as-is (analysis C14: modern, no jQuery dependency).

/**
 * Renders a generic interactive table into a Knack view and provides a small controller API.
 *
 * Use cases:
 * - Render prefilled data in a table
 * - Configure per-column editability
 * - Support typed editors (text, date, number, select, checkbox)
 * - Receive change callbacks whenever a cell is updated
 *
 * @param {Object} config - Table configuration.
 * @param {string} config.viewId - View id where the table should be inserted (e.g. 'view_2214').
 * @param {string} [config.containerSelector='.view-content'] - Selector inside the view for insertion.
 * @param {string} [config.tableClassName=''] - One or more space-separated CSS classes appended to the default 'kn-table knTable' classes (e.g. 'is-bordered my-class another-class').
 * @param {string} [config.dateLocale='uk'] - Date locale for picker format and slash-separated date interpretation.
 *   'uk' (default): dd/mm/yyyy display; picker format 'dd/mm/yy'.
 *   'us': mm/dd/yyyy display; picker format 'mm/dd/yy'.
 *   This sets the default column dateFormat and teaches the internal date converters to read/write
 *   the correct field order. Individual columns can still override dateFormat directly.
 * @param {'none'|'manual'|'auto'} [config.saveMode='manual'] - Save behaviour. `manual` renders a submit button, `auto` is reserved for save-as-you-go flows, `none` disables built-in save UI.
 * @param {string} [config.saveButtonText='Save'] - Text shown on the manual submit button.
 * @param {string} [config.saveButtonClassName=''] - Extra CSS classes appended to the default `kn-button is-primary` button classes.
 * @param {string} [config.actionContainerSelector=''] - Optional selector for a dedicated container in the view where table-generated Save and Clear controls render.
 * @param {boolean} [config.showClearButton=false] - Whether to render a clear button in the top-right table toolbar.
 * @param {string} [config.clearButtonText='Clear'] - Text shown on the clear button.
 * @param {string} [config.clearButtonClassName=''] - Extra CSS classes appended to the default `kn-button is-secondary` clear button classes.
 * @param {boolean} [config.confirmOnClear=true] - Whether clearing rows should ask for confirmation first.
 * @param {string} [config.clearConfirmMessage='Are you sure you want to clear all rows? This will remove any unsaved table data.'] - Confirmation text shown before rows are cleared.
 * @param {Function|null} [config.onSubmit=null] - Called when the manual submit button is clicked or controller.submit() is invoked.
 * @param {Function|null} [config.onClear=null] - Called after the clear button is clicked or controller.clear() is invoked.
 * @param {false|{header?: string, key?: string, buttonText?: string, buttonHtml?: string, buttonClassName?: string, ariaLabel?: string, title?: string, align?: string, maxWidth?: string|number|null}} [config.rowRemove=false] - Optional row-remove action column. The app remains responsible for persistence through `onRemoveRow`.
 * @param {Function|null} [config.onRemoveRow=null] - Called after a row is removed through the row-remove action or `controller.removeRow()`.
 * @param {null|string|number|{key: string|number, order?: Array<string>|Function, label?: Function, emptyLabel?: string, className?: string}} [config.groupBy=null] - Optional row grouping. Populated rows are shown under a heading row for each distinct value of `key` (a column key/row property); the trailing empty row always stays last with no heading. Row data order and every `rowIndex` passed to callbacks are unchanged — only the display order is grouped. `order` is an array of group values (unlisted values follow alphabetically) or a `(a, b) => number` comparator; rows with a blank value are grouped last under `emptyLabel` (default 'Ungrouped'). `label(value, rows)` returns the heading text. Editing the grouped column regroups the table immediately. A string or number is shorthand for `{ key }`.
 * @param {Function|null} [config.rowClassName=null] - Optional `(row, rowIndex) => string` returning extra CSS classes for a data row's `<tr>` (e.g. to style removed or flagged rows). Re-evaluated whenever the table re-renders (`setData`, an appended row, a regroup); a single cell edit only re-renders that cell.
 * @param {Array<{header?: string, key?: string|number, type?: string, editable?: boolean|Function, options?: Array|Function, className?: string, inputClassName?: string, align?: string, maxWidth?: string|number|null, allowHtml?: boolean, display?: Function, parse?: Function, openDateHintKey?: string, minDate?: string|Date|null, maxDate?: string|Date|null, dateFormat?: string}>} [config.columns=[]] - Column schema. Select options may be a static array, a function returning an array, or an async function/Promise resolving to an array. `type: 'search-select'` renders a searchable input backed by a datalist while still storing the selected option value. Select options are fetched once per column and cached for the current table instance.
 * @param {Array<string>} [config.headers=[]] - Optional headers when columns are omitted.
 * @param {Array<Object|Array>} [config.rows=[]] - Prefilled row data.
 * @param {Function|null} [config.onChange=null] - Called after a cell value changes.
 * @param {Function|null} [config.onRenderComplete=null] - Called after initial render.
 * @returns {{getData: Function, setData: Function, updateCell: Function, destroy: Function}|null}
 */
function renderInteractiveTable(config = {}) {
    const settings = {
        viewId: '',
        containerSelector: '.view-content',
        tableClassName: '',
        dateLocale: 'uk',
        saveMode: 'manual',
        saveButtonText: 'Save',
        saveButtonClassName: '',
        actionContainerSelector: '',
        showClearButton: false,
        clearButtonText: 'Clear',
        clearButtonClassName: '',
        confirmOnClear: true,
        clearConfirmMessage: 'Are you sure you want to clear all rows? This will remove any unsaved table data.',
        autoAppendRow: false,
        createEmptyRow: null,
        isRowPopulated: null,
        columns: [],
        headers: [],
        rows: [],
        onChange: null,
        onSubmit: null,
        onClear: null,
        rowRemove: false,
        onRemoveRow: null,
        groupBy: null,
        rowClassName: null,
        onRenderComplete: null,
        ...config,
    };

    const viewId = String(settings.viewId || '').trim();
    if (!viewId) {
        console.warn('renderInteractiveTable: missing viewId.');
        return null;
    }

    const viewEl = document.getElementById(viewId);
    if (!viewEl) {
        console.warn('renderInteractiveTable: view element not found:', viewId);
        return null;
    }

    const host = settings.containerSelector
        ? (viewEl.querySelector(settings.containerSelector) || viewEl)
        : viewEl;
    const actionContainerSelector = String(settings.actionContainerSelector || '').trim();
    const actionContainer = actionContainerSelector
        ? viewEl.querySelector(actionContainerSelector)
        : null;
    const usesExternalActionContainer = actionContainer instanceof HTMLElement && actionContainer !== host;

    const cloneRow = (row) => {
        if (Array.isArray(row)) return row.slice();
        if (row && typeof row === 'object') return { ...row };
        return {};
    };

    let rowsData = Array.isArray(settings.rows) ? settings.rows.map(cloneRow) : [];

    const rowRemoveConfig = settings.rowRemove && typeof settings.rowRemove === 'object'
        ? {
            header: '',
            key: '__kfRemoveRow',
            buttonText: 'Remove',
            buttonHtml: '',
            buttonClassName: '',
            ariaLabel: 'Remove row',
            title: 'Remove row',
            align: 'center',
            maxWidth: 90,
            ...settings.rowRemove,
        }
        : null;

    const normaliseColumns = () => {
        let normalisedColumns;
        if (Array.isArray(settings.columns) && settings.columns.length) {
            normalisedColumns = settings.columns.map((column, index) => ({
                header: '',
                key: index,
                type: 'text',
                editable: false,
                options: [],
                className: '',
                inputClassName: '',
                align: 'left',
                maxWidth: null,
                allowHtml: false,
                display: null,
                parse: null,
                openDateHintKey: '',
                minDate: null,
                maxDate: null,
                dateFormat: settings.dateLocale === 'us' ? 'mm/dd/yy' : 'dd/mm/yy',
                ...column,
            }));
        } else {
            const headers = Array.isArray(settings.headers) ? settings.headers : [];
            normalisedColumns = headers.map((header, index) => ({
                header: String(header || ''),
                key: index,
                type: 'text',
                editable: false,
                options: [],
                className: '',
                inputClassName: '',
                align: 'left',
                maxWidth: null,
                allowHtml: false,
                display: null,
                parse: null,
                openDateHintKey: '',
                minDate: null,
                maxDate: null,
                dateFormat: settings.dateLocale === 'us' ? 'mm/dd/yy' : 'dd/mm/yy',
            }));
        }

        if (!rowRemoveConfig) return normalisedColumns;

        return [...normalisedColumns, {
            header: rowRemoveConfig.header,
            key: rowRemoveConfig.key,
            type: 'text',
            editable: false,
            allowHtml: true,
            align: rowRemoveConfig.align,
            maxWidth: rowRemoveConfig.maxWidth,
            display: (_, row, rowIndex) => {
                if (!isRowPopulated(row, rowIndex)) return '';
                const buttonContent = rowRemoveConfig.buttonHtml || escapeHTML(rowRemoveConfig.buttonText);
                const buttonClassName = ['kfInteractiveTable__removeRow', rowRemoveConfig.buttonClassName]
                    .filter(Boolean)
                    .join(' ');
                return `<button type="button" class="${escapeHTML(buttonClassName)}" data-kf-interactive-table-remove-row="true" aria-label="${escapeHTML(rowRemoveConfig.ariaLabel)}" title="${escapeHTML(rowRemoveConfig.title)}">${buttonContent}</button>`;
            },
        }];
    };

    const columns = normaliseColumns();
    const colIndexByKey = new Map(columns.map((col, index) => [String(col.key), index]));
    const selectOptionsCache = new Map();
    let isSubmitting = false;
    let controller = null;
    let pendingEditorNavigation = null;

    const useArrayRowShape = (() => {
        if (Array.isArray(rowsData[0])) return true;
        if (rowsData[0] && typeof rowsData[0] === 'object') return false;
        return columns.every((column, index) => String(column.key) === String(index));
    })();

    const toCssSize = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return `${value}px`;
        }
        const text = String(value ?? '').trim();
        return text || '';
    };

    const getCellValue = (row, column, colIndex) => {
        if (typeof column.getValue === 'function') {
            return column.getValue(row, colIndex);
        }
        if (Array.isArray(row)) {
            const idx = Number(column.key);
            return Number.isFinite(idx) ? row[idx] : row[colIndex];
        }
        return row?.[column.key];
    };

    const setCellValue = (row, column, colIndex, value) => {
        if (Array.isArray(row)) {
            const idx = Number(column.key);
            if (Number.isFinite(idx)) {
                row[idx] = value;
            } else {
                row[colIndex] = value;
            }
            return;
        }
        row[column.key] = value;
    };

    const createDefaultCellValue = (column) => {
        if (Object.prototype.hasOwnProperty.call(column, 'emptyValue')) {
            return column.emptyValue;
        }
        if (column.type === 'checkbox') return false;
        return '';
    };

    const createEmptyRowData = () => {
        if (typeof settings.createEmptyRow === 'function') {
            try {
                const customRow = settings.createEmptyRow({
                    viewId,
                    host,
                    columns: columns.slice(),
                    data: rowsData.map(cloneRow),
                });
                if (Array.isArray(customRow)) return customRow.slice();
                if (customRow && typeof customRow === 'object') return { ...customRow };
            } catch (err) {
                console.error('renderInteractiveTable createEmptyRow error:', err);
            }
        }

        if (useArrayRowShape) {
            return columns.map((column) => createDefaultCellValue(column));
        }

        return columns.reduce((nextRow, column, colIndex) => {
            nextRow[column.key] = createDefaultCellValue(column, colIndex);
            return nextRow;
        }, {});
    };

    const isMeaningfulCellValue = (value, column) => {
        if (column?.type === 'checkbox') return value === true;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'number') return Number.isFinite(value);
        if (value == null) return false;
        return String(value).trim() !== '';
    };

    const defaultIsRowPopulated = (row, rowIndex) => {
        return columns.some((column, colIndex) => {
            const value = getCellValue(row, column, colIndex);
            return isMeaningfulCellValue(value, column, row, rowIndex);
        });
    };

    const isRowPopulated = (row, rowIndex) => {
        if (typeof settings.isRowPopulated === 'function') {
            try {
                return !!settings.isRowPopulated(row, rowIndex, rowsData.map(cloneRow));
            } catch (err) {
                console.error('renderInteractiveTable isRowPopulated error:', err);
            }
        }
        return defaultIsRowPopulated(row, rowIndex);
    };

    const getRawData = () => rowsData.map(cloneRow);

    const getData = (options = {}) => {
        if (options && options.includeEmptyRows === true) {
            return getRawData();
        }

        if (!settings.autoAppendRow) {
            return getRawData();
        }

        return rowsData
            .filter((row, rowIndex) => isRowPopulated(row, rowIndex))
            .map(cloneRow);
    };

    const ensureTrailingEmptyRow = () => {
        if (!settings.autoAppendRow) return false;

        if (!rowsData.length) {
            rowsData.push(createEmptyRowData());
            return true;
        }

        const lastRowIndex = rowsData.length - 1;
        if (isRowPopulated(rowsData[lastRowIndex], lastRowIndex)) {
            rowsData.push(createEmptyRowData());
            return true;
        }

        return false;
    };

    ensureTrailingEmptyRow();

    const groupByConfig = (() => {
        const rawGroupBy = typeof settings.groupBy === 'string' || typeof settings.groupBy === 'number'
            ? { key: settings.groupBy }
            : settings.groupBy;
        if (!rawGroupBy || typeof rawGroupBy !== 'object') return null;
        if (rawGroupBy.key === undefined || rawGroupBy.key === null || String(rawGroupBy.key) === '') return null;

        return {
            key: rawGroupBy.key,
            order: Array.isArray(rawGroupBy.order) ? rawGroupBy.order.map((value) => String(value ?? '').trim()) : rawGroupBy.order,
            label: typeof rawGroupBy.label === 'function' ? rawGroupBy.label : null,
            emptyLabel: String(rawGroupBy.emptyLabel ?? 'Ungrouped'),
            className: String(rawGroupBy.className || '').trim(),
        };
    })();

    const isGroupByColumn = (column) => !!groupByConfig && String(column?.key) === String(groupByConfig.key);

    const getGroupValue = (row) => {
        if (!groupByConfig) return '';
        return String(row?.[groupByConfig.key] ?? '').trim();
    };

    const compareGroupValues = (left, right) => {
        if (left === right) return 0;
        if (!left) return 1;
        if (!right) return -1;

        if (typeof groupByConfig.order === 'function') {
            try {
                return Number(groupByConfig.order(left, right)) || 0;
            } catch (err) {
                console.error('renderInteractiveTable groupBy.order error:', err);
            }
        } else if (Array.isArray(groupByConfig.order)) {
            const rank = (value) => {
                const index = groupByConfig.order.indexOf(value);
                return index === -1 ? groupByConfig.order.length : index;
            };
            const rankDifference = rank(left) - rank(right);
            if (rankDifference !== 0) return rankDifference;
        }

        return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
    };

    /**
     * Returns rowsData indexes in the order rows are displayed. Grouping only reorders the
     * display; rowsData (and every rowIndex exposed to callbacks) keeps its own order.
     */
    const getDisplayRowIndexes = () => {
        const indexes = rowsData.map((_, rowIndex) => rowIndex);
        if (!groupByConfig) return indexes;

        const populatedIndexes = indexes.filter((rowIndex) => isRowPopulated(rowsData[rowIndex], rowIndex));
        const emptyIndexes = indexes.filter((rowIndex) => !isRowPopulated(rowsData[rowIndex], rowIndex));
        populatedIndexes.sort((left, right) => {
            return compareGroupValues(getGroupValue(rowsData[left]), getGroupValue(rowsData[right])) || left - right;
        });

        return [...populatedIndexes, ...emptyIndexes];
    };

    const getRowClassName = (row, rowIndex) => {
        if (typeof settings.rowClassName !== 'function') return '';
        try {
            return String(settings.rowClassName(cloneRow(row), rowIndex) || '').trim();
        } catch (err) {
            console.error('renderInteractiveTable rowClassName error:', err);
            return '';
        }
    };

    const renderGroupHeaderRow = (groupValue) => {
        let label = groupValue || groupByConfig.emptyLabel;
        if (groupByConfig.label) {
            const groupRows = rowsData
                .filter((row, rowIndex) => isRowPopulated(row, rowIndex) && getGroupValue(row) === groupValue)
                .map(cloneRow);
            try {
                label = String(groupByConfig.label(groupValue, groupRows) ?? label);
            } catch (err) {
                console.error('renderInteractiveTable groupBy.label error:', err);
            }
        }

        const classes = ['kfInteractiveTable__groupRow', groupByConfig.className].filter(Boolean).join(' ');
        return `<tr class="${escapeHTML(classes)}" data-kf-group="${escapeHTML(groupValue)}"><td colspan="${columns.length}" style="padding:6px 8px;font-weight:600;">${escapeHTML(label)}</td></tr>`;
    };

    const isEditableCell = (column, row, rowIndex) => {
        if (typeof column.editable === 'function') {
            try {
                return !!column.editable(row, rowIndex, rowsData);
            } catch (_) {
                return false;
            }
        }
        return !!column.editable;
    };

    /**
     * Converts a date value to the ISO yyyy-mm-dd string required by <input type="date">.
     * Interprets slash-separated dates according to the table's dateLocale setting.
     */
    const toIsoDate = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
            const parts = text.split('/');
            // US: mm/dd/yyyy → yyyy-mm-dd; UK: dd/mm/yyyy → yyyy-mm-dd
            return settings.dateLocale === 'us'
                ? `${parts[2]}-${parts[0]}-${parts[1]}`
                : `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        const parsed = parseDateObject(text);
        if (!parsed) return '';
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const year = parsed.getFullYear();
        return `${year}-${month}-${day}`;
    };

    /**
     * Converts a date value to the locale display format.
     * UK (default): dd/mm/yyyy. US: mm/dd/yyyy.
     * Accepts ISO strings (yyyy-mm-dd), already-formatted slash dates, or anything
     * parseable by getDateUKFormat as a last resort.
     */
    const toDisplayDate = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        // Already a slash-separated date in the expected locale format — pass through.
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
            const parts = text.split('-');
            // US: yyyy-mm-dd → mm/dd/yyyy; UK: yyyy-mm-dd → dd/mm/yyyy
            return settings.dateLocale === 'us'
                ? `${parts[1]}/${parts[2]}/${parts[0]}`
                : `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return getDateUKFormat(text) || text;
    };

    const parseCellValue = (rawValue, column, row, rowIndex) => {
        const baseValue = (() => {
            if (column.type === 'date') return toDisplayDate(rawValue);
            if (column.type === 'number') {
                const normalised = String(rawValue || '').trim();
                if (!normalised) return '';
                const parsed = Number(normalised);
                return Number.isFinite(parsed) ? parsed : normalised;
            }
            if (column.type === 'checkbox') return !!rawValue;
            return String(rawValue ?? '');
        })();

        if (typeof column.parse === 'function') {
            try {
                return column.parse(baseValue, row, rowIndex, rowsData);
            } catch (_) {
                return baseValue;
            }
        }
        return baseValue;
    };

    const formatCellValue = (value, column, row, rowIndex) => {
        if (typeof column.display === 'function') {
            try {
                return String(column.display(value, row, rowIndex, rowsData) ?? '');
            } catch (_) {
                return '';
            }
        }

        if (column.type === 'checkbox') {
            return value ? 'Yes' : 'No';
        }

        if (column.type === 'date') {
            return toDisplayDate(value);
        }

        return String(value ?? '');
    };

    const normaliseSelectOptions = (rawOptions) => {
        const optionsArray = Array.isArray(rawOptions) ? rawOptions : [];
        return optionsArray.map((item) => {
            if (item && typeof item === 'object' && 'value' in item) {
                return {
                    value: String(item.value ?? ''),
                    label: String(item.label ?? item.value ?? ''),
                };
            }
            return {
                value: String(item ?? ''),
                label: String(item ?? ''),
            };
        });
    };

    const resolveSelectOptions = async (column, row, rowIndex, colIndex) => {
        if (typeof column.options === 'function') {
            try {
                const resolvedOptions = await Promise.resolve(column.options(row, rowIndex, rowsData));
                return normaliseSelectOptions(resolvedOptions);
            } catch (err) {
                console.error('renderInteractiveTable select options error:', err);
                return [];
            }
        }

        const cacheKey = String(colIndex);
        if (selectOptionsCache.has(cacheKey)) {
            return selectOptionsCache.get(cacheKey);
        }

        try {
            const rawOptions = column.options;
            const resolvedOptions = await Promise.resolve(rawOptions);
            const normalisedOptions = normaliseSelectOptions(resolvedOptions);
            selectOptionsCache.set(cacheKey, normalisedOptions);
            return normalisedOptions;
        } catch (err) {
            console.error('renderInteractiveTable select options error:', err);
            return [];
        }
    };

    const tryOpenSelectMenu = (selectEl) => {
        if (!selectEl || selectEl.disabled) return;

        const open = () => {
            try {
                if (typeof selectEl.showPicker === 'function') {
                    selectEl.showPicker();
                    return;
                }
            } catch (_) {}

            try {
                selectEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            } catch (_) {}

            try {
                selectEl.click();
            } catch (_) {}
        };

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(open);
            return;
        }

        setTimeout(open, 0);
    };

    const resolveSearchSelectValue = (rawValue, options) => {
        const normalisedRawValue = String(rawValue ?? '').trim();
        if (!normalisedRawValue) return '';

        const matchedOption = (Array.isArray(options) ? options : []).find((option) => {
            const optionValue = String(option?.value ?? '').trim().toLowerCase();
            const optionLabel = String(option?.label ?? '').trim().toLowerCase();
            const targetValue = normalisedRawValue.toLowerCase();
            return optionValue === targetValue || optionLabel === targetValue;
        });

        return matchedOption ? matchedOption.value : '';
    };

    const ensureSearchSelectDropdown = (inputEl) => {
        if (!inputEl) return null;
        if (inputEl._kfSearchDropdown instanceof HTMLElement) {
            return inputEl._kfSearchDropdown;
        }

        const dropdownEl = document.createElement('div');
        dropdownEl.className = 'kfInteractiveTable__searchSelectDropdown';
        dropdownEl.style.position = 'absolute';
        dropdownEl.style.top = 'calc(100% + 4px)';
        dropdownEl.style.left = '0';
        dropdownEl.style.right = '0';
        dropdownEl.style.zIndex = '50';
        dropdownEl.style.maxHeight = '220px';
        dropdownEl.style.overflowY = 'auto';
        dropdownEl.style.background = '#fff';
        dropdownEl.style.border = '1px solid #d3d9e3';
        dropdownEl.style.borderRadius = '0 0 8px 8px';
        dropdownEl.style.boxShadow = '0 10px 26px rgba(15, 23, 42, 0.12)';
        dropdownEl.style.padding = '6px';
        dropdownEl.style.display = 'none';

        inputEl._kfSearchWrapper?.appendChild(dropdownEl);
        inputEl._kfSearchDropdown = dropdownEl;
        return dropdownEl;
    };

    const closeSearchSelectDropdown = (inputEl) => {
        const dropdownEl = inputEl?._kfSearchDropdown;
        if (!(dropdownEl instanceof HTMLElement)) return;
        dropdownEl.style.display = 'none';
        dropdownEl.innerHTML = '';
        inputEl._kfSearchFilteredOptions = [];
        inputEl._kfSearchHighlightedIndex = -1;
        inputEl.setAttribute('aria-expanded', 'false');
    };

    const renderSearchSelectDropdown = (inputEl, options, filterText = '') => {
        const dropdownEl = ensureSearchSelectDropdown(inputEl);
        if (!(dropdownEl instanceof HTMLElement)) return;

        const targetText = String(filterText ?? '').trim().toLowerCase();
        const filteredOptions = (Array.isArray(options) ? options : []).filter((option) => {
            if (!targetText) return true;
            const optionLabel = String(option?.label ?? '').trim().toLowerCase();
            const optionValue = String(option?.value ?? '').trim().toLowerCase();
            return optionLabel.includes(targetText) || optionValue.includes(targetText);
        }).slice(0, 75);

        inputEl._kfSearchFilteredOptions = filteredOptions;
        const hasOptions = filteredOptions.length > 0;
        const nextHighlightedIndex = hasOptions
            ? Math.min(Math.max(Number(inputEl._kfSearchHighlightedIndex) || 0, 0), filteredOptions.length - 1)
            : -1;
        inputEl._kfSearchHighlightedIndex = nextHighlightedIndex;

        dropdownEl.innerHTML = '';

        if (!hasOptions) {
            const emptyStateEl = document.createElement('div');
            emptyStateEl.textContent = 'No matches found';
            emptyStateEl.style.padding = '8px 10px';
            emptyStateEl.style.color = '#6b7280';
            emptyStateEl.style.fontSize = '12px';
            dropdownEl.appendChild(emptyStateEl);
            dropdownEl.style.display = 'block';
            inputEl.setAttribute('aria-expanded', 'true');
            return;
        }

        filteredOptions.forEach((option, optionIndex) => {
            const optionButton = document.createElement('button');
            optionButton.type = 'button';
            optionButton.className = 'kfInteractiveTable__searchSelectOption';
            optionButton.textContent = String(option?.label ?? '');
            optionButton.dataset.value = String(option?.value ?? '');
            optionButton.dataset.label = String(option?.label ?? '');
            optionButton.style.display = 'block';
            optionButton.style.width = '100%';
            optionButton.style.border = '0';
            optionButton.style.borderRadius = '6px';
            optionButton.style.background = optionIndex === nextHighlightedIndex ? '#eef4ff' : 'transparent';
            optionButton.style.color = '#1f2937';
            optionButton.style.cursor = 'pointer';
            optionButton.style.font = 'inherit';
            optionButton.style.padding = '8px 10px';
            optionButton.style.textAlign = 'left';

            optionButton.addEventListener('mouseenter', () => {
                inputEl._kfSearchHighlightedIndex = optionIndex;
                renderSearchSelectDropdown(inputEl, options, inputEl.value);
            });

            let optionSelectionHandled = false;
            const selectSearchOption = (event) => {
                if (optionSelectionHandled) return;
                optionSelectionHandled = true;
                event.preventDefault();
                event.stopPropagation();
                inputEl._kfIgnoreBlurUntil = Date.now() + EDITOR_POINTER_BLUR_GUARD_MS;
                inputEl.value = optionButton.dataset.label || '';
                inputEl._kfSearchSelectedValue = optionButton.dataset.value || '';
                closeEditor(inputEl, true);
            };

            // Pointer events fire before blur on modern browsers. Keep the mouse fallback
            // for older environments so the selected option value is never lost to blur.
            optionButton.addEventListener('pointerdown', selectSearchOption);
            optionButton.addEventListener('mousedown', selectSearchOption);

            optionButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });

            dropdownEl.appendChild(optionButton);
        });

        dropdownEl.style.display = 'block';
        inputEl.setAttribute('aria-expanded', 'true');
    };

    const getCellElement = (rowIndex, colIndex) => {
        return host.querySelector(`td.kfInteractiveTable__cell[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`);
    };

    const getEditableCellCoordinates = () => {
        const coordinates = [];
        getDisplayRowIndexes().forEach((rowIndex) => {
            const row = rowsData[rowIndex];
            columns.forEach((column, colIndex) => {
                if (isEditableCell(column, row, rowIndex)) {
                    coordinates.push({ rowIndex, colIndex });
                }
            });
        });
        return coordinates;
    };

    const findAdjacentEditableCell = (rowIndex, colIndex, direction = 1) => {
        const editableCells = getEditableCellCoordinates();
        const currentIndex = editableCells.findIndex((cell) => cell.rowIndex === rowIndex && cell.colIndex === colIndex);
        if (currentIndex === -1) return null;

        const nextIndex = currentIndex + (direction < 0 ? -1 : 1);
        if (nextIndex < 0 || nextIndex >= editableCells.length) return null;

        const nextCell = editableCells[nextIndex];
        return getCellElement(nextCell.rowIndex, nextCell.colIndex);
    };

    const focusEditableCell = (cell, { open = false } = {}) => {
        if (!cell) return;

        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                cell.focus();
                if (open) {
                    void openEditor(cell);
                }
            });
            return;
        }

        setTimeout(() => {
            cell.focus();
            if (open) {
                void openEditor(cell);
            }
        }, 0);
    };

    const emitChange = (payload) => {
        if (typeof settings.onChange !== 'function') return;
        try {
            settings.onChange(payload);
        } catch (err) {
            console.error('renderInteractiveTable onChange error:', err);
        }
    };

    const renderCell = (cell, rowIndex, colIndex) => {
        if (!cell) return;
        const column = columns[colIndex];
        const row = rowsData[rowIndex];
        const value = getCellValue(row, column, colIndex);
        const formatted = formatCellValue(value, column, row, rowIndex);
        cell.innerHTML = column.allowHtml ? formatted : escapeHTML(formatted);
    };

    const renderTable = () => {
        const tableClass = `kn-table knTable is-bordered is-striped ${String(settings.tableClassName || '').trim()}`.trim();
        const saveMode = String(settings.saveMode || 'none').trim().toLowerCase();
        const showSubmitButton = saveMode === 'manual';
        const saveButtonText = String(settings.saveButtonText || 'Save').trim() || 'Save';
        const saveButtonClassName = String(settings.saveButtonClassName || '').trim();
        const submitButtonClass = ['kn-button', 'is-primary', saveButtonClassName].filter(Boolean).join(' ');
        const showClearButton = settings.showClearButton === true;
        const clearButtonText = String(settings.clearButtonText || 'Clear').trim() || 'Clear';
        const clearButtonClassName = String(settings.clearButtonClassName || '').trim();
        const clearButtonClass = ['kn-button', 'is-secondary', clearButtonClassName].filter(Boolean).join(' ');

        const headersHtml = columns.map((column) => {
            const align = String(column.align || 'left');
            const maxWidth = toCssSize(column.maxWidth);
            const styleParts = [`text-align:${escapeHTML(align)}`, 'padding:6px 8px'];
            if (maxWidth) styleParts.push(`max-width:${escapeHTML(maxWidth)}`);
            const headerHtml = String(column.header || '');
            return `<th style="${styleParts.join('; ')};">${headerHtml}</th>`;
        }).join('');

        let previousGroupValue = null;
        const rowsHtml = getDisplayRowIndexes().map((rowIndex) => {
            const row = rowsData[rowIndex];
            let groupHeaderHtml = '';
            if (groupByConfig && isRowPopulated(row, rowIndex)) {
                const groupValue = getGroupValue(row);
                if (groupValue !== previousGroupValue) {
                    previousGroupValue = groupValue;
                    groupHeaderHtml = renderGroupHeaderRow(groupValue);
                }
            }

            const cellsHtml = columns.map((column, colIndex) => {
                const editable = isEditableCell(column, row, rowIndex);
                const value = getCellValue(row, column, colIndex);
                const formatted = formatCellValue(value, column, row, rowIndex);
                const classes = [
                    'kfInteractiveTable__cell',
                    editable ? 'is-editable' : '',
                    editable ? 'ktlInlineEditableCellsStyle' : '',
                    String(column.className || '').trim(),
                ].filter(Boolean).join(' ');
                const align = String(column.align || 'left');
                const maxWidth = toCssSize(column.maxWidth);
                const styleParts = ['padding:4px 8px', `text-align:${escapeHTML(align)}`];
                if (maxWidth) styleParts.push(`max-width:${escapeHTML(maxWidth)}`);
                const tabIndexAttr = editable ? ' tabindex="0"' : '';
                return `<td class="${escapeHTML(classes)}" data-row-index="${rowIndex}" data-col-index="${colIndex}" data-col-key="${escapeHTML(String(column.key))}" style="${styleParts.join('; ')};"${tabIndexAttr}>${column.allowHtml ? formatted : escapeHTML(formatted)}</td>`;
            }).join('');

            const rowClassName = getRowClassName(row, rowIndex);
            const rowClassAttr = rowClassName ? ` class="${escapeHTML(rowClassName)}"` : '';
            return `${groupHeaderHtml}<tr data-row-index="${rowIndex}"${rowClassAttr}>${cellsHtml}</tr>`;
        }).join('');

        const clearButtonHtml = showClearButton
            ? `<button class="${escapeHTML(clearButtonClass)}" type="button" data-kf-interactive-table-clear="true"${isSubmitting ? ' disabled' : ''}>${escapeHTML(clearButtonText)}</button>`
            : '';

        const headerActionsHtml = clearButtonHtml && !usesExternalActionContainer
            ? `<div class="kfInteractiveTable__toolbar" style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:8px;"><button class="${escapeHTML(clearButtonClass)}" type="button" data-kf-interactive-table-clear="true"${isSubmitting ? ' disabled' : ''}>${escapeHTML(clearButtonText)}</button></div>`
            : '';

        const actionButtons = [
            showSubmitButton
                ? `<button class="${escapeHTML(submitButtonClass)}" type="submit" data-kf-interactive-table-submit="true"${isSubmitting ? ' disabled' : ''}>${escapeHTML(saveButtonText)}</button>`
                : '',
        ].filter(Boolean).join('');

        const actionsHtml = actionButtons && !usesExternalActionContainer
            ? `<div class="kfInteractiveTable__actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">${actionButtons}</div>`
            : '';

        host.innerHTML = `${headerActionsHtml}<table class="${escapeHTML(tableClass)}"><thead><tr>${headersHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>${actionsHtml}`;
        if (usesExternalActionContainer) {
            actionContainer.innerHTML = `${clearButtonHtml}${actionButtons}`;
        }
    };

    const clearTable = async () => {
        if (isSubmitting) return;

        const shouldConfirmClear = settings.confirmOnClear !== false;
        const clearConfirmMessage = String(settings.clearConfirmMessage || '').trim()
            || 'Are you sure you want to clear all rows? This will remove any unsaved table data.';

        if (shouldConfirmClear) {
            const confirmationResult = await showConfirmationDialog({
                title: 'Clear rows',
                message: clearConfirmMessage,
                buttons: [
                    {
                        text: 'Cancel',
                        className: 'kn-button is-secondary',
                        value: 'cancel',
                    },
                    {
                        text: 'Clear rows',
                        className: 'kn-button is-danger',
                        value: 'confirm',
                    },
                ],
            });

            if (confirmationResult?.value !== 'confirm') return;
        }

        rowsData = [];
        ensureTrailingEmptyRow();
        renderTable();

        if (typeof settings.onClear === 'function') {
            try {
                await settings.onClear({
                    viewId,
                    host,
                    data: getData(),
                    rawData: getRawData(),
                    controller,
                });
            } catch (err) {
                console.error('renderInteractiveTable onClear error:', err);
                throw err;
            }
        }
    };

    /**
     * Removes a row and notifies the caller so it can queue any persistence work.
     * @param {number} rowIndex
     * @param {string} [source='api']
     * @returns {void}
     */
    const removeRow = (rowIndex, source = 'api') => {
        const index = Number(rowIndex);
        if (!Number.isFinite(index) || index < 0 || index >= rowsData.length) return;

        const removedRow = cloneRow(rowsData[index]);
        if (!isRowPopulated(removedRow, index)) return;

        rowsData.splice(index, 1);
        ensureTrailingEmptyRow();
        renderTable();

        if (typeof settings.onRemoveRow === 'function') {
            try {
                settings.onRemoveRow({
                    rowIndex: index,
                    row: removedRow,
                    data: getData(),
                    rawData: getRawData(),
                    source,
                    controller,
                });
            } catch (err) {
                console.error('renderInteractiveTable onRemoveRow error:', err);
            }
        }
    };

    const submitTable = async () => {
        if (typeof settings.onSubmit !== 'function') {
            console.warn('renderInteractiveTable: manual submit requested but no onSubmit handler was provided.');
            return;
        }

        if (isSubmitting) return;

        isSubmitting = true;
        renderTable();

        try {
            await settings.onSubmit({
                viewId,
                host,
                data: getData(),
                rawData: getRawData(),
                controller,
            });
        } catch (err) {
            console.error('renderInteractiveTable onSubmit error:', err);
            throw err;
        } finally {
            isSubmitting = false;
            renderTable();
        }
    };

    const EDITOR_BLUR_SETTLE_DELAY_MS = 120;
    const EDITOR_INITIAL_BLUR_GUARD_MS = 400;
    const EDITOR_POINTER_BLUR_GUARD_MS = 250;

    const shouldKeepEditorOpenOnBlur = (inputEl, editingCell, relatedTarget) => {
        const activeElement = document.activeElement;

        if (Date.now() < Number(inputEl._kfIgnoreBlurUntil || 0)) {
            return true;
        }

        if (activeElement === inputEl) {
            return true;
        }

        if (editingCell && activeElement instanceof Node && editingCell.contains(activeElement)) {
            return true;
        }

        if (editingCell && relatedTarget instanceof Node && editingCell.contains(relatedTarget)) {
            return true;
        }

        return false;
    };

    const closeEditor = (inputEl, commit, options = {}) => {
        const restoreFocus = options.restoreFocus !== false;
        const cell = inputEl.closest('.kfInteractiveTable__cell');
        if (!cell) return;

        const rowIndex = Number(cell.getAttribute('data-row-index'));
        const colIndex = Number(cell.getAttribute('data-col-index'));
        const column = columns[colIndex];
        const row = rowsData[rowIndex];
        const previousValue = getCellValue(row, column, colIndex);

        if (commit) {
            const rawValue = column.type === 'checkbox'
                ? !!inputEl.checked
                : column.type === 'search-select'
                    ? String(inputEl._kfSearchSelectedValue ?? '').trim() || resolveSearchSelectValue(inputEl.value, inputEl._kfSearchOptions)
                    : inputEl.value;
            const nextValue = parseCellValue(rawValue, column, row, rowIndex);
            setCellValue(row, column, colIndex, nextValue);
            const appendedRow = ensureTrailingEmptyRow();
            if (appendedRow || isGroupByColumn(column)) {
                renderTable();
            } else {
                renderCell(cell, rowIndex, colIndex);
            }
            emitChange({
                rowIndex,
                columnIndex: colIndex,
                columnKey: column.key,
                column,
                previousValue,
                nextValue,
                row: cloneRow(row),
                data: getData(),
                rawData: getRawData(),
                source: 'editor',
            });
        } else {
            renderCell(cell, rowIndex, colIndex);
        }

        cell.classList.remove('is-editing');
        if (isEditableCell(column, row, rowIndex)) {
            cell.setAttribute('tabindex', '0');
        } else {
            cell.removeAttribute('tabindex');
        }

        if (pendingEditorNavigation) {
            const nextCell = findAdjacentEditableCell(rowIndex, colIndex, pendingEditorNavigation.direction);
            pendingEditorNavigation = null;
            if (nextCell) {
                focusEditableCell(nextCell, { open: true });
                return;
            }
        }

        if (!restoreFocus) return;

        // A regroup or appended row re-renders the table, detaching `cell`.
        const liveCell = cell.isConnected ? cell : getCellElement(rowIndex, colIndex);
        if (!liveCell || liveCell.matches(':focus')) return;
        focusEditableCell(liveCell);
    };

    const isDatepickerOpen = (jq) => {
        if (!jq) return false;
        try {
            return jq('.ui-datepicker:visible').length > 0;
        } catch (_) {
            return false;
        }
    };

    const openEditor = async (cell) => {
        if (!cell || cell.classList.contains('is-editing')) return;

        const rowIndex = Number(cell.getAttribute('data-row-index'));
        const colIndex = Number(cell.getAttribute('data-col-index'));
        const column = columns[colIndex];
        const row = rowsData[rowIndex];

        if (!isEditableCell(column, row, rowIndex)) return;

        const jq = typeof jQuery === 'function' ? jQuery : (typeof $ === 'function' ? $ : null);
        const hasJqDatepicker = !!(jq && jq.fn && typeof jq.fn.datepicker === 'function');
        const currentValue = getCellValue(row, column, colIndex);

        cell.classList.add('is-editing');
        cell.removeAttribute('tabindex');
        cell.textContent = '';

        let inputEl;
        if (column.type === 'select') {
            inputEl = document.createElement('select');
            inputEl.className = ['input', 'kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');
            inputEl.disabled = true;
            const loadingOption = document.createElement('option');
            loadingOption.value = '';
            loadingOption.textContent = 'Loading...';
            inputEl.appendChild(loadingOption);
        } else if (column.type === 'search-select') {
            const wrapperEl = document.createElement('div');
            wrapperEl.className = 'kfInteractiveTable__searchSelect';
            wrapperEl.style.position = 'relative';
            wrapperEl.style.display = 'flex';
            wrapperEl.style.alignItems = 'center';
            wrapperEl.style.width = '100%';

            inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.className = ['input', 'kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');
            inputEl.disabled = true;
            inputEl.placeholder = 'Select...';
            inputEl.autocomplete = 'off';
            inputEl.spellcheck = false;
            inputEl.setAttribute('aria-autocomplete', 'list');
            inputEl.setAttribute('aria-expanded', 'false');
            inputEl.style.paddingRight = '34px';

            const iconEl = document.createElement('span');
            iconEl.textContent = '▾';
            iconEl.style.position = 'absolute';
            iconEl.style.right = '10px';
            iconEl.style.top = '50%';
            iconEl.style.transform = 'translateY(-50%)';
            iconEl.style.pointerEvents = 'none';
            iconEl.style.color = '#64748b';
            iconEl.style.fontSize = '12px';

            wrapperEl.appendChild(inputEl);
            wrapperEl.appendChild(iconEl);
            cell.appendChild(wrapperEl);
            inputEl._kfSearchWrapper = wrapperEl;
        } else if (column.type === 'checkbox') {
            inputEl = document.createElement('input');
            inputEl.type = 'checkbox';
            inputEl.className = ['kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');
            inputEl.checked = !!currentValue;
        } else {
            inputEl = document.createElement('input');
            inputEl.className = ['input', 'kfInteractiveTable__editor', column.inputClassName || ''].filter(Boolean).join(' ');

            if (column.type === 'date') {
                const valueDisplay = toDisplayDate(currentValue);
                const valueIso = toIsoDate(currentValue);
                if (hasJqDatepicker) {
                    inputEl.type = 'text';
                    inputEl.value = valueDisplay;
                } else {
                    inputEl.type = 'date';
                    inputEl.value = valueIso;
                }
            } else if (column.type === 'number') {
                inputEl.type = 'number';
                inputEl.value = String(currentValue ?? '');
            } else {
                inputEl.type = 'text';
                inputEl.value = String(currentValue ?? '');
            }
        }

        inputEl.style.width = '100%';
        inputEl.style.minHeight = '30px';
        inputEl.style.maxWidth = '100%';
        inputEl._kfIgnoreBlurUntil = Date.now() + EDITOR_INITIAL_BLUR_GUARD_MS;
        const markInternalPointerInteraction = () => {
            inputEl._kfIgnoreBlurUntil = Date.now() + EDITOR_POINTER_BLUR_GUARD_MS;
        };

        inputEl.addEventListener('mousedown', markInternalPointerInteraction);
        inputEl.addEventListener('pointerdown', markInternalPointerInteraction);
        inputEl.addEventListener('touchstart', markInternalPointerInteraction, { passive: true });

        if (column.type !== 'search-select') {
            cell.appendChild(inputEl);
        }

        if (column.type === 'select' || column.type === 'search-select') {
            const options = await resolveSelectOptions(column, row, rowIndex, colIndex);
            const editingCell = inputEl.closest('.kfInteractiveTable__cell');
            if (!editingCell || !editingCell.classList.contains('is-editing')) return;

            const currentValueText = String(currentValue ?? '');

            if (column.type === 'select') {
                inputEl.innerHTML = '';
                options.forEach((opt) => {
                    const optionEl = document.createElement('option');
                    optionEl.value = opt.value;
                    optionEl.textContent = opt.label;
                    inputEl.appendChild(optionEl);
                });

                if (currentValueText && !options.some((opt) => opt.value === currentValueText)) {
                    const fallbackOption = document.createElement('option');
                    fallbackOption.value = currentValueText;
                    fallbackOption.textContent = currentValueText;
                    inputEl.insertBefore(fallbackOption, inputEl.firstChild);
                }

                inputEl.value = currentValueText;
                inputEl.disabled = false;
            } else {
                const currentOption = options.find((opt) => String(opt.value) === currentValueText);
                inputEl._kfSearchOptions = options;
                inputEl._kfSearchHighlightedIndex = 0;
                inputEl._kfSearchSelectedValue = currentOption ? String(currentOption.value ?? '') : '';
                inputEl.value = currentOption ? currentOption.label : currentValueText;
                inputEl.disabled = false;
                renderSearchSelectDropdown(inputEl, options, inputEl.value);
            }
        }

        if (column.type === 'date' && hasJqDatepicker) {
            const inputJq = jq(inputEl);
            const openDateHint = String(row?.[column.openDateHintKey] || '').trim();
            const dateFormat = String(column.dateFormat || (settings.dateLocale === 'us' ? 'mm/dd/yy' : 'dd/mm/yy'));

            if (!inputJq.hasClass('hasDatepicker')) {
                inputJq.datepicker({
                    dateFormat,
                    changeMonth: true,
                    changeYear: true,
                    defaultDate: openDateHint || null,
                    minDate: column.minDate ?? null,
                    maxDate: column.maxDate ?? null,
                    onSelect: function () {
                        closeEditor(inputEl, true);
                    },
                    onClose: function () {
                        setTimeout(function () {
                            const editingCell = inputEl.closest('.kfInteractiveTable__cell');
                            if (editingCell && editingCell.classList.contains('is-editing')) {
                                closeEditor(inputEl, true, { restoreFocus: false });
                            }
                        }, 0);
                    },
                });
            }

            if (typeof formatDatePicker === 'function') {
                try { formatDatePicker(inputEl); } catch (_) {}
            }

            if (typeof enhanceDateTimePicker === 'function') {
                try {
                    enhanceDateTimePicker(inputEl, {
                        mode: 'date',
                        dateFormat,
                        minDate: column.minDate ?? null,
                        maxDate: column.maxDate ?? null,
                        waitForInit: false,
                    });
                } catch (_) {}
            }

            try {
                if (String(inputEl.value || '').trim()) {
                    inputJq.datepicker('setDate', inputEl.value);
                } else {
                    if (openDateHint) {
                        inputJq.datepicker('option', 'defaultDate', openDateHint);
                    }
                    inputJq.datepicker('setDate', null);
                }
                inputJq.datepicker('show');
            } catch (_) {}
        }

        inputEl.addEventListener('keydown', function (event) {
            if (column.type === 'search-select') {
                const filteredOptions = Array.isArray(inputEl._kfSearchFilteredOptions) ? inputEl._kfSearchFilteredOptions : [];

                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (filteredOptions.length) {
                        const direction = event.key === 'ArrowDown' ? 1 : -1;
                        const currentIndex = Number(inputEl._kfSearchHighlightedIndex);
                        const nextIndex = Number.isFinite(currentIndex)
                            ? (currentIndex + direction + filteredOptions.length) % filteredOptions.length
                            : 0;
                        inputEl._kfSearchHighlightedIndex = nextIndex;
                    } else {
                        inputEl._kfSearchHighlightedIndex = -1;
                    }
                    renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
                    return;
                }

                if (event.key === 'Enter') {
                    const highlightedOption = filteredOptions[inputEl._kfSearchHighlightedIndex] || filteredOptions[0] || null;
                    if (highlightedOption) {
                        event.preventDefault();
                        inputEl.value = String(highlightedOption.label ?? '');
                        inputEl._kfSearchSelectedValue = String(highlightedOption.value ?? '');
                    }
                }

                if (event.key === 'Escape') {
                    closeSearchSelectDropdown(inputEl);
                }
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                closeEditor(inputEl, true);
            }
            if (event.key === 'Tab') {
                const nextCell = findAdjacentEditableCell(rowIndex, colIndex, event.shiftKey ? -1 : 1);
                if (nextCell) {
                    event.preventDefault();
                    pendingEditorNavigation = {
                        direction: event.shiftKey ? -1 : 1,
                    };
                    closeEditor(inputEl, true);
                }
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeEditor(inputEl, false);
            }
        });

        inputEl.addEventListener('change', function () {
            if (column.type === 'checkbox' || column.type === 'select' || column.type === 'search-select') {
                closeEditor(inputEl, true);
            }
        });

        if (column.type === 'search-select') {
            inputEl.addEventListener('input', function () {
                inputEl._kfSearchHighlightedIndex = 0;
                inputEl._kfSearchSelectedValue = '';
                renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
            });

            inputEl.addEventListener('focus', function () {
                renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
            });

            inputEl.addEventListener('click', function () {
                renderSearchSelectDropdown(inputEl, inputEl._kfSearchOptions, inputEl.value);
            });
        }

        inputEl.addEventListener('blur', function (event) {
            setTimeout(function () {
                const jq = typeof jQuery === 'function' ? jQuery : (typeof $ === 'function' ? $ : null);
                if (column.type === 'date' && isDatepickerOpen(jq)) {
                    return;
                }
                const editingCell = inputEl.closest('.kfInteractiveTable__cell');
                if (shouldKeepEditorOpenOnBlur(inputEl, editingCell, event.relatedTarget)) {
                    return;
                }

                if (column.type === 'search-select') {
                    closeSearchSelectDropdown(inputEl);
                }
                if (editingCell && editingCell.classList.contains('is-editing')) {
                    closeEditor(inputEl, true, { restoreFocus: false });
                }
            }, EDITOR_BLUR_SETTLE_DELAY_MS);
        });

        inputEl.focus();
        if (typeof inputEl.select === 'function' && column.type !== 'checkbox') {
            inputEl.select();
        }
        if (column.type === 'select') {
            tryOpenSelectMenu(inputEl);
        }
    };

    const handleTableClick = (event) => {
        const submitButton = event.target.closest('[data-kf-interactive-table-submit="true"]');
        if (submitButton && (host.contains(submitButton) || actionContainer?.contains(submitButton))) {
            event.preventDefault();
            void submitTable();
            return;
        }

        const clearButton = event.target.closest('[data-kf-interactive-table-clear="true"]');
        if (clearButton && (host.contains(clearButton) || actionContainer?.contains(clearButton))) {
            event.preventDefault();
            void clearTable();
            return;
        }

        const removeButton = event.target.closest('[data-kf-interactive-table-remove-row="true"]');
        if (removeButton && host.contains(removeButton)) {
            event.preventDefault();
            const rowIndex = Number(removeButton.closest('tr[data-row-index]')?.getAttribute('data-row-index'));
            removeRow(rowIndex, 'button');
            return;
        }

        const editor = event.target.closest('.kfInteractiveTable__editor');
        if (editor && host.contains(editor)) return;

        const cell = event.target.closest('.kfInteractiveTable__cell');
        if (!cell || !host.contains(cell) || cell.classList.contains('is-editing')) return;
        void openEditor(cell);
    };

    const handleTableMouseDown = (event) => {
        const submitButton = event.target.closest('[data-kf-interactive-table-submit="true"]');
        if (submitButton && (host.contains(submitButton) || actionContainer?.contains(submitButton))) return;

        const clearButton = event.target.closest('[data-kf-interactive-table-clear="true"]');
        if (clearButton && (host.contains(clearButton) || actionContainer?.contains(clearButton))) return;

        const removeButton = event.target.closest('[data-kf-interactive-table-remove-row="true"]');
        if (removeButton && host.contains(removeButton)) return;

        const editor = event.target.closest('.kfInteractiveTable__editor');
        if (editor && host.contains(editor)) return;

        const cell = event.target.closest('.kfInteractiveTable__cell');
        if (!cell || !host.contains(cell)) return;

        if (!cell.classList.contains('is-editing')) {
            event.preventDefault();
        }
    };

    const handleTableKeydown = (event) => {
        const cell = event.target.closest('.kfInteractiveTable__cell');
        if (!cell || !host.contains(cell) || cell.classList.contains('is-editing')) return;

        if (event.key === 'Enter' || event.key === ' ' || event.key === 'F2') {
            event.preventDefault();
            void openEditor(cell);
        }
    };

    renderTable();
    host.addEventListener('mousedown', handleTableMouseDown);
    host.addEventListener('click', handleTableClick);
    host.addEventListener('keydown', handleTableKeydown);
    if (usesExternalActionContainer) {
        actionContainer.addEventListener('mousedown', handleTableMouseDown);
        actionContainer.addEventListener('click', handleTableClick);
    }

    if (typeof settings.onRenderComplete === 'function') {
        try {
            settings.onRenderComplete({
                viewId,
                host,
                data: getData(),
                rawData: getRawData(),
            });
        } catch (err) {
            console.error('renderInteractiveTable onRenderComplete error:', err);
        }
    }

    controller = {
        getData(options = {}) {
            return getData(options);
        },
        setData(nextRows) {
            rowsData = Array.isArray(nextRows) ? nextRows.map(cloneRow) : [];
            ensureTrailingEmptyRow();
            renderTable();
        },
        updateCell(rowIndex, columnKeyOrIndex, value, options = {}) {
            const idx = Number(rowIndex);
            if (!Number.isFinite(idx) || idx < 0 || idx >= rowsData.length) return;

            const colIndex = typeof columnKeyOrIndex === 'number'
                ? columnKeyOrIndex
                : colIndexByKey.get(String(columnKeyOrIndex));
            if (!Number.isFinite(colIndex) || colIndex < 0 || colIndex >= columns.length) return;

            const column = columns[colIndex];
            const row = rowsData[idx];
            const previousValue = getCellValue(row, column, colIndex);
            const nextValue = parseCellValue(value, column, row, idx);
            setCellValue(row, column, colIndex, nextValue);
            const appendedRow = ensureTrailingEmptyRow();

            const cell = getCellElement(idx, colIndex);
            if (cell && !appendedRow && !isGroupByColumn(column)) {
                renderCell(cell, idx, colIndex);
            } else {
                renderTable();
            }

            if (options.emit !== false) {
                emitChange({
                    rowIndex: idx,
                    columnIndex: colIndex,
                    columnKey: column.key,
                    column,
                    previousValue,
                    nextValue,
                    row: cloneRow(row),
                    data: getData(),
                    rawData: getRawData(),
                    source: options.source || 'api',
                });
            }
        },
        async submit() {
            await submitTable();
        },
        async clear() {
            await clearTable();
        },
        removeRow(rowIndex) {
            removeRow(rowIndex);
        },
        destroy() {
            selectOptionsCache.clear();
            host.removeEventListener('mousedown', handleTableMouseDown);
            host.removeEventListener('click', handleTableClick);
            host.removeEventListener('keydown', handleTableKeydown);
            if (usesExternalActionContainer) {
                actionContainer.removeEventListener('mousedown', handleTableMouseDown);
                actionContainer.removeEventListener('click', handleTableClick);
                actionContainer.innerHTML = '';
            }
            host.innerHTML = '';
        },
    };

    return controller;
}
