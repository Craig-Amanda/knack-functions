/**
 * @deprecated Use addClasses(), which returns native elements. Kept for callers that chain jQuery on the result.
 * @param {string|Element|NodeList|JQuery|Array} selector - Element reference(s).
 * @param {string|string[]} classes - Class names to add.
 * @returns {JQuery|undefined} jQuery collection (undefined when given an array, as in V1).
 */
function addClassToSelector(selector, classes) {
    warnDeprecated('addClassToSelector', 'addClasses()');
    const elements = addClasses(selector, classes);
    return Array.isArray(selector) ? undefined : toJQuery(elements);
}

/**
 * @deprecated Use removeClasses(), which returns native elements. Kept for callers that chain jQuery on the result.
 * @param {string|Element|NodeList|JQuery|Array} selector - Element reference(s).
 * @param {string|string[]} classes - Class names to remove.
 * @returns {JQuery|undefined} jQuery collection (undefined when given an array, as in V1).
 */
function removeClassFromSelector(selector, classes) {
    warnDeprecated('removeClassFromSelector', 'removeClasses()');
    const elements = removeClasses(selector, classes);
    return Array.isArray(selector) ? undefined : toJQuery(elements);
}

/**
 * @deprecated Use getCheckedRowElements(), which returns native rows.
 * @param {string} viewId - View id.
 * @returns {JQuery[]} One jQuery-wrapped row per checked checkbox.
 */
function getCheckedRows(viewId) {
    warnDeprecated('getCheckedRows', 'getCheckedRowElements()');
    return getCheckedRowElements(viewId).map((row) => toJQuery(row));
}

/**
 * @deprecated Use getTextAreas(), which returns native elements.
 * @param {string} viewId - View id.
 * @returns {JQuery} jQuery collection of the view's textareas.
 */
function getTextArea(viewId) {
    warnDeprecated('getTextArea', 'getTextAreas()');
    return toJQuery(getTextAreas(viewId));
}
