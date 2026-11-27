/**
 * @deprecated Use resolveElements(), which also drops non-elements.
 * @param {Element|Element[]|NodeList|string|JQuery} target - Inputs or selector.
 * @returns {Element[]} V1 result: arrays are returned unchanged and anything else unrecognised is wrapped.
 */
function normaliseInputs(target) {
    warnDeprecated('normaliseInputs', 'resolveElements()');
    if (!target) return [];
    if (Array.isArray(target)) return target;
    return target instanceof Element || typeof target === 'string' || isjQueryInstance(target) || isNodeList(target) ? resolveElements(target) : [target];
}

/**
 * @deprecated Use knackNavigator.getCurrentSceneInfo().
 * @param {string} viewId - View id.
 * @param {number|{historyIndex?: number}} [options] - Optional history lookup.
 * @returns {{recordId: string, sceneId: string, sceneSlug: string}|null} Null (with a console error) on failure.
 */
function getCurrentSceneInfo(viewId, options) {
    warnDeprecated('getCurrentSceneInfo', 'knackNavigator.getCurrentSceneInfo()');
    try {
        return knackNavigator.getCurrentSceneInfo(viewId, options);
    } catch (error) {
        console.error(`Error retrieving scene information for view ID ${viewId}:`, error);
        return null;
    }
}
