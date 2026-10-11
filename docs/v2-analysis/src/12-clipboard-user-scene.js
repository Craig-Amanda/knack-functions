// Batch 5: V1 lines 11361-11503, 11609-11642, 18359-18429, 18641-18686, 18865-18873, 19119-19144.
// Native DOM only. Exceptions kept on jQuery: Chosen selects in onInputChange (Chosen announces changes via jQuery trigger).

/**
 * Copies text to the clipboard and flashes a "copied" notification next to the element.
 * @param {HTMLElement} element - Element the notification attaches to.
 * @param {string} text - Text to copy.
 * @param {string} message - Notification text.
 */
function copyTextToClipboard(element, text, message) {
    const legacyCopy = () => {
        const textarea = Object.assign(document.createElement('textarea'), { value: text });
        document.body.append(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch { /* copy unsupported */ }
        textarea.remove();
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(legacyCopy);
    else legacyCopy();

    const parent = element.closest('td, .kn-detail-body');
    if (parent) {
        parent.style.position = 'relative';
        parent.style.overflow = 'visible';
    }
    showNotification({
        target: parent || element,
        message,
        backgroundColor: 'var(--success)',
        className: 'ca-notification ca-notification-copy',
        delay: 1000,
    });

    // Non-table views place the notification differently.
    const notification = parent && !parent.closest('table') && parent.querySelector('.ca-notification-copy');
    if (notification) {
        notification.style.left = '120px';
        notification.style.opacity = '0.85';
    }
}

/**
 * Makes each detail value in a view click-to-copy.
 * @param {Element} viewEle - View root.
 * @param {Object} [options={}]
 * @param {boolean} [options.addIcon=true] - Append a clipboard icon.
 * @param {string} [options.message='Text Copied'] - Notification text.
 * @param {string[]} [options.excludeFieldIds=[]] - `field_N` classes to skip.
 * @param {boolean} [options.includeLabels=false] - Copy `Label: value`.
 */
function addCopyToDetails(viewEle, options = {}) {
    if (!viewEle) return;
    const { addIcon = true, message = 'Text Copied', excludeFieldIds = [], includeLabels = false } = options;

    viewEle.querySelectorAll('.kn-detail-body').forEach((detail) => {
        if (detail.closest('.kn-details-link')) return;
        const fieldWrapper = detail.closest('[class*="field_"]');
        if (fieldWrapper && Array.from(fieldWrapper.classList).some((name) => excludeFieldIds.includes(name))) return;

        const originalText = detail.textContent.trim();
        if (!originalText || detail.dataset.copyEnabled === 'true') return;
        detail.dataset.copyEnabled = 'true';

        let finalText = originalText;
        const fieldClass = includeLabels && fieldWrapper && Array.from(fieldWrapper.classList).find((name) => name.startsWith('field_'));
        const labelText = fieldClass
            ? viewEle.querySelector(`.kn-label-top.${fieldClass}, .kn-detail.${fieldClass}`)?.querySelector('.kn-detail-label')?.textContent.trim()
            : '';
        if (labelText) finalText = `${labelText}: ${originalText}`;

        if (addIcon) {
            const icon = Object.assign(document.createElement('span'), { textContent: ' 📋' });
            icon.style.userSelect = 'none';
            detail.append(icon);
        }
        detail.style.cursor = 'pointer';
        detail.addEventListener('click', () => copyTextToClipboard(detail, finalText, message));
    });
}

/**
 * Makes `.ca-click-to-copy` elements in a view click-to-copy (with a clipboard icon, and a message per contact type).
 * @param {string} viewId - View id.
 */
function setupClickToCopy(viewId) {
    const messages = {
        'client-contact-num': 'Client Number Copied',
        'funder-email': 'Funder Email Copied',
        'funder-contact-num': 'Funder Number Copied',
        'funder-office-num': 'Funder Office Number Copied',
        'client-email': 'Client Email Copied',
    };
    document.querySelectorAll(`#${viewId} .ca-click-to-copy`).forEach((element) => {
        let text = element.textContent.trim();
        if (text === '📋' || text === '') {
            element.style.display = 'none';
            return;
        }
        text = text.replace(' 📋', '');
        if (!element.textContent.includes('📋')) element.textContent = `${text} 📋`;

        const message = messages[Object.keys(messages).find((name) => element.classList.contains(name))] ?? 'Text Copied';
        element.addEventListener('click', () => copyTextToClipboard(element, text, message));
    });
}

/**
 * Calls `callback(element)` whenever an input changes, and once now unless `onload` is false.
 * Chosen selects are bound through jQuery because Chosen announces changes with jQuery's trigger.
 * @param {Element|JQuery|string|Array} inputElement - Input(s) to watch.
 * @param {(element: Element) => void} callback - Receives the changed element.
 * @param {boolean} [onload=true] - Fire a change event straight away.
 */
function onInputChange(inputElement, callback, onload = true) {
    resolveElements(inputElement).forEach((element) => {
        const handler = () => callback(element);
        if (element.classList.contains('chzn-done')) globalThis.jQuery(element).on('change', handler); // Chosen select.
        else element.addEventListener('change', handler);
        if (onload) fireEvent(element, 'change');
    });
}

/**
 * Shows or hides the Knack input or title block containing an element.
 * @param {boolean} shouldShow - True to show, false to hide.
 * @param {string} eleSelector - Selector of an element inside the block.
 */
function toggleMessage(shouldShow, eleSelector) {
    document.querySelectorAll('.kn-input, .kn-special-title').forEach((container) => {
        if (container.querySelector(eleSelector)) container.style.display = shouldShow ? 'block' : 'none';
    });
}

/**
 * Whether the logged-in user has any of the given roles.
 * @param {string|string[]} userRoleArr - Role id(s) or name(s) accepted by `Knack.getUserRoles`.
 * @returns {boolean}
 */
function isUserRole(userRoleArr) {
    const roles = Array.isArray(userRoleArr) ? userRoleArr : [userRoleArr].filter((role) => role != null);
    return roles.some((role) => Boolean(Knack.getUserRoles(role)));
}

/**
 * Whether the logged-in user's name equals a value.
 * @param {string} nameToMatch - Name to compare.
 * @returns {boolean}
 */
function isUserName(nameToMatch) {
    return Knack.getUserAttributes()?.name === nameToMatch;
}

/**
 * Gets the DOM id of the page's background scene, ignoring scenes inside a modal.
 * @returns {string|null} e.g. `kn-scene_1151`, or null.
 */
function getBackgroundSceneId() {
    const scene = Array.from(document.querySelectorAll('#knack-body .kn-scenes .kn-scene')).find((candidate) => !candidate.closest('.kn-modal'));
    return scene?.id || null;
}

/**
 * Whether the background scene is one of the given scene numbers.
 * @param {Array<string|number>} scenes - Scene numbers, e.g. `[1151]`.
 * @returns {boolean}
 */
function isSceneToIgnore(scenes) {
    const backgroundSceneId = getBackgroundSceneId();
    if (!backgroundSceneId || !scenes.length) return false;
    return scenes.map(Number).includes(Number(backgroundSceneId.replace('kn-scene_', '')));
}

/**
 * Shows a temporary notification after an element (HTML text, as in V1) and fades it out.
 * V1 also called `Knack.showSpinner()` and never hid it; that call is kept.
 * @param {string|Element|JQuery} insertNotificationAfter - Element(s) to place the notification after.
 * @param {string} notificationTxt - Notification HTML.
 * @param {string} notificationCol - Background colour.
 * @param {string} ca_class - Class for the notification.
 * @param {number} delay - Milliseconds before it fades out.
 */
function showPopUpNotification(insertNotificationAfter, notificationTxt, notificationCol, ca_class, delay) {
    Knack.showSpinner();
    resolveElements(insertNotificationAfter).forEach((target) => {
        const notification = Object.assign(document.createElement('div'), { className: ca_class, innerHTML: notificationTxt });
        notification.style.backgroundColor = notificationCol;
        target.after(notification);
        setTimeout(() => notification.animate({ opacity: [1, 0] }, { duration: 400, fill: 'forwards' }).finished.then(() => notification.remove()), delay || 0);
    });
}

/**
 * Writes the logged-in user's name into elements.
 * @param {string|Element|NodeList} selector - Selector, element or NodeList to fill.
 * @param {(userName: string) => void} [callback] - Called with the name after filling.
 * @returns {string} The user's name (`Unknown User` when absent, `User Unknown` on error).
 */
function insertLoggedInUser(selector, callback) {
    try {
        const userName = Knack.getUserAttributes()?.name || 'Unknown User';
        if (typeof selector !== 'string' && !(selector instanceof Element) && !(selector instanceof NodeList)) {
            console.error('Invalid selector type provided to insertLoggedInUser');
            return userName;
        }
        const elements = resolveElements(selector);
        if (typeof selector === 'string' && !elements.length) {
            console.warn(`No elements found matching selector: ${selector}`);
            return userName;
        }
        elements.forEach((element) => { element.textContent = userName; });
        if (typeof callback === 'function') callback(userName);
        return userName;
    } catch (error) {
        console.error('Error inserting logged in user:', error);
        return 'User Unknown';
    }
}

/**
 * Rounds the right corners of the last visible menu link in a view.
 * @param {string} viewId - View id.
 * @param {number} [delay] - If given, runs again after this many milliseconds.
 */
function borderRadiusLastVisible(viewId, delay) {
    const menuList = document.getElementById(viewId)?.querySelector('.menu-links__list');
    const visible = Array.from(menuList?.children ?? []).filter((li) => getComputedStyle(li).display !== 'none' && li.offsetParent !== null);
    if (!visible.length) return;

    visible.forEach((li) => { if (li.querySelector('a')) li.querySelector('a').style.borderRadius = ''; });
    const lastLink = visible.at(-1).querySelector('a');
    if (lastLink) lastLink.style.borderRadius = '0 .35em .35em 0';
    if (delay) setTimeout(() => borderRadiusLastVisible(viewId), delay);
}

/**
 * Gets the record id of a form view's submit area.
 * @param {string} viewId - View id.
 * @returns {string|undefined}
 */
function getFormId(viewId) {
    return document.querySelector(`#${viewId} .kn-submit input[name="id"]`)?.value;
}
