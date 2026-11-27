/**
 * @deprecated Use getValueFromDetail(), which does the same.
 * @param {string|number} fieldID - Field id number.
 * @param {boolean} [returnHtml=false] - Return the inner HTML instead of the text.
 * @returns {string|null}
 */
function getValueFromDetailBody(fieldID, returnHtml = false) {
    warnDeprecated('getValueFromDetailBody', 'getValueFromDetail()');
    return getValueFromDetail(fieldID, returnHtml);
}

/**
 * @deprecated Use knackNavigator.getSceneInfoForView(), which also falls back to the scene scan for the slug.
 * @param {string|number} viewId - View id.
 * @returns {{key: string, slug: string|null}|null}
 */
function getSceneFromViewId(viewId) {
    warnDeprecated('getSceneFromViewId', 'knackNavigator.getSceneInfoForView()');
    const info = viewId ? knackNavigator.getSceneInfoForView(viewId) : null;
    return info?.key ? { key: info.key, slug: info.slug || null } : null;
}
