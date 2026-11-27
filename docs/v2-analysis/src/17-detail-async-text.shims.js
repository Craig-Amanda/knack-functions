/**
 * @deprecated V1 returned the URL unchanged for every extension; use the URL directly.
 * @param {string} extension - File extension (ignored).
 * @param {string} url - File URL.
 * @returns {string} The URL.
 */
function fileViewer(extension, url) {
    warnDeprecated('fileViewer', 'the file URL directly');
    return url;
}
