/**
 * @deprecated Use setVisibility() or toggleVisibility().
 * @param {string|Element|Array} selectors - Element reference(s); an array is handled one entry at a time.
 * @param {boolean|boolean[]} [show] - Show/hide (per entry when an array); omit to toggle.
 */
function toggleElements(selectors, show) {
    warnDeprecated('toggleElements', 'setVisibility() or toggleVisibility()');
    if (!Array.isArray(selectors)) return toggleVisibility(selectors, show);
    selectors.forEach((selector, index) => toggleVisibility(selector, Array.isArray(show) ? show[index] : show));
}

/**
 * @deprecated Use csvToArray().
 * @param {string} fieldValue - Comma-separated text.
 * @returns {string[]} Trimmed items; empty array for empty input.
 */
function splitAndTrimField(fieldValue) {
    warnDeprecated('splitAndTrimField', 'csvToArray()');
    return fieldValue ? csvToArray(fieldValue) : [];
}

/**
 * @deprecated Use knackNavigator.isUserRole().
 * @param {string|string[]} userRoleArr - Role id(s) or name(s).
 * @returns {boolean}
 */
function isUserRole(userRoleArr) {
    warnDeprecated('isUserRole', 'knackNavigator.isUserRole()');
    return knackNavigator.isUserRole(userRoleArr);
}

/**
 * @deprecated Use knackNavigator.isUserName().
 * @param {string} nameToMatch - Name to compare.
 * @returns {boolean}
 */
function isUserName(nameToMatch) {
    warnDeprecated('isUserName', 'knackNavigator.isUserName()');
    return knackNavigator.isUserName(nameToMatch);
}
