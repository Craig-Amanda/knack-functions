/**
 * @deprecated Use getTableRowElements(), whose callback receives the native row.
 * @param {string} viewId - View id.
 * @param {(index: number, row: JQuery) => void} callback - Receives the index and the jQuery-wrapped row.
 * @param {boolean} [includeHeader=false] - Include `thead` rows.
 * @param {boolean} [includeGroup=false] - Include group rows.
 */
function getTableRows(viewId, callback, includeHeader = false, includeGroup = false) {
    warnDeprecated('getTableRows', 'getTableRowElements()');
    getTableRowElements(viewId, (index, row) => callback(index, toJQuery(row)), includeHeader, includeGroup);
}
