// Batch 9: V1 lines 7661-7669, 13333-13423, 19020-19113, 20717-20903. Native DOM; the jQuery slide animation is
// replaced by the Web Animations API. Exception kept on jQuery: Knack form-submit events (bound through jQuery).

/**
 * Slides elements open or closed (height animation), like jQuery's slideDown/slideUp/slideToggle.
 * @param {Element|string|JQuery|Array} elements - Element reference(s).
 * @param {boolean|undefined} show - True to open, false to close, undefined to toggle each element.
 * @param {number|'fast'|'slow'} [duration=400] - Milliseconds, or jQuery's `fast` / `slow`.
 * @returns {Promise<void>} Resolves when every animation has finished.
 */
async function slideElements(elements, show, duration = 400) {
    const ms = { fast: 200, slow: 600 }[duration] ?? (Number.isFinite(Number(duration)) ? Number(duration) : 400);
    await Promise.all(resolveElements(elements).map(async (element) => {
        const opening = show ?? getComputedStyle(element).display === 'none';
        if (opening) element.style.display = '';
        if (opening && getComputedStyle(element).display === 'none') element.style.display = 'block';
        const open = `${element.scrollHeight}px`;
        const keyframes = opening ? [{ height: '0px' }, { height: open }] : [{ height: open }, { height: '0px' }];
        element.style.overflow = 'hidden';
        await element.animate(keyframes, { duration: ms || 0 }).finished;
        element.style.overflow = '';
        if (!opening) element.style.display = 'none';
    }));
}

/**
 * Binds one click handler per element and namespace, replacing any earlier one (like jQuery's `off('click.ns').on(...)`).
 * @param {Element} element - Element to bind.
 * @param {string} namespace - Handler name, e.g. `showHide`.
 * @param {(event: MouseEvent) => void} handler - New click handler.
 */
function bindClick(element, namespace, handler) {
    const registry = (bindClick.registry ??= new WeakMap()); // Handlers per element and namespace.
    const handlers = registry.get(element) ?? new Map();
    if (handlers.has(namespace)) element.removeEventListener('click', handlers.get(namespace));
    handlers.set(namespace, handler);
    registry.set(element, handlers);
    element.addEventListener('click', handler);
}

/**
 * Makes a button toggle content open and closed (slide), flipping the arrow (`down`/`up`) and the button's `active` class.
 * @param {Element|string|JQuery} buttonSelector - Button(s).
 * @param {Element|string|JQuery} hiddenSelector - Content to slide.
 * @param {Element|string|JQuery} arrowSelector - Arrow(s) whose `down`/`up` classes flip.
 * @param {number|string} delay - Slide duration.
 * @param {boolean} [flexOn=false] - Show the content as `display: flex`.
 */
function toggleShowHideViewContent(buttonSelector, hiddenSelector, arrowSelector, delay, flexOn = false) {
    resolveElements(buttonSelector).forEach((button) => bindClick(button, 'showHide', () => {
        slideElements(hiddenSelector, undefined, delay);
        resolveElements(arrowSelector).forEach((arrow) => { arrow.classList.toggle('down'); arrow.classList.toggle('up'); });
        resolveElements(buttonSelector).forEach((element) => element.classList.toggle('active'));
        if (flexOn) resolveElements(hiddenSelector).forEach((element) => { element.style.display = 'flex'; });
    }));
}

/**
 * Makes a "shrink" link close the content again.
 * @param {Element|string|JQuery} shrinkLinkSelector - Shrink link(s).
 * @param {Element|string|JQuery} hiddenSelector - Content to close.
 * @param {Element|string|JQuery} arrowSelector - Arrow(s) set back to `down`.
 * @param {number|string} delay - Slide duration.
 * @param {Element|string|JQuery} buttonSelector - Button(s) whose `active` class is removed.
 */
function shrinkContent(shrinkLinkSelector, hiddenSelector, arrowSelector, delay, buttonSelector) {
    resolveElements(shrinkLinkSelector).forEach((link) => bindClick(link, 'shrinkLink', () => {
        slideElements(hiddenSelector, false, delay);
        resolveElements(arrowSelector).forEach((arrow) => { arrow.classList.remove('up'); arrow.classList.add('down'); });
        resolveElements(buttonSelector).forEach((button) => button.classList.remove('active'));
    }));
}

/**
 * Wires the button and shrink link of a single-view show/hide section.
 * @param {string} showHideId - Section id used in the element ids and classes.
 * @param {number|string} delay - Slide duration.
 * @param {boolean} [flexOn=false] - Show the content as `display: flex`.
 */
function showHideViewContent(showHideId, delay, flexOn = false) {
    const button = `#show-hide_${showHideId}`;
    const arrow = `#arrow_${showHideId}`;
    const content = `.${showHideId}`;
    toggleShowHideViewContent(button, content, arrow, delay, flexOn);
    shrinkContent(`#shrink-link_${showHideId}`, content, arrow, delay, button);
}

/**
 * Adds the shrink link to a show/hide section (once).
 * @param {string} wrapperId - Id of the element holding the section.
 * @param {string} showHideId - Section id.
 * @param {boolean} [showHideGroup=false] - Append to the wrapper itself instead of its `.show-hide-section`.
 */
function appendShrinkLink(wrapperId, showHideId, showHideGroup = false) {
    if (document.getElementById(`shrink-link_${showHideId}`)) return;
    const html = `<a class="show-hide-btn shrink-link" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="arrow up" id="arrow_${showHideId}">◀</span></a>`;
    const wrapper = document.getElementById(wrapperId);
    const targets = showHideGroup ? [wrapper] : Array.from(wrapper?.querySelectorAll('.show-hide-section') ?? []);
    targets.filter(Boolean).forEach((target) => target.insertAdjacentHTML('beforeend', html));
}

/**
 * Replaces a view's title with a show/hide button (once).
 * @param {string} viewId - View id.
 * @param {string} showHideId - Section id.
 */
function replaceTitleWithButton(viewId, showHideId) {
    const titles = document.querySelectorAll(`#${viewId} h2.kn-title`);
    if (document.getElementById(`show-hide_${showHideId}`)) return;
    const titleText = Array.from(titles, (title) => title.textContent).join('');
    const html = `<div class="show-hide-btn" id="show-hide_${showHideId}">${escapeHtml(titleText)} &nbsp;<span class="arrow down" id="arrow_${showHideId}">◀</span></div>`;
    titles.forEach((title) => { title.innerHTML = html; });
}

/**
 * Wraps a view's content in a show/hide section.
 * @param {string} viewId - View id.
 * @param {'table'|'form'|'list'|string} viewType - View type; other types reuse an existing `section`.
 * @param {string} showHideId - Section id (also its class).
 */
function wrapContentForShowHide(viewId, viewType, showHideId) {
    const wrappers = { table: '.kn-table-wrapper, .kn-records-nav', form: 'form, .kn-form-confirmation', list: '.kn-list-content, .kn-records-nav' };
    const view = document.getElementById(viewId);
    const classes = `${showHideId} show-hide-section box-with-border`;
    if (wrappers[viewType]) {
        const content = Array.from(view?.querySelectorAll(wrappers[viewType]) ?? []);
        if (!content.length || content.some((element) => element.parentElement?.matches('section'))) return;
        const section = Object.assign(document.createElement('section'), { className: classes });
        content[0].before(section);
        section.append(...content);
        return;
    }
    const sections = Array.from(view?.querySelectorAll('section') ?? []);
    if (!sections.some((section) => ` ${section.className} `.includes(` ${classes} `))) sections.forEach((section) => section.classList.add(...classes.split(' ')));
}

/**
 * Collapses a group of views into one show/hide section headed by the first view's title.
 * @param {Array<string|number>} viewsToInclude - View numbers; the first is the main view.
 * @param {boolean} flexOn - Show the content as `display: flex`.
 */
function showHideGroup(viewsToInclude, flexOn) {
    const mainViewId = `view_${viewsToInclude[0]}`;
    const showHideId = `showHide_${mainViewId}`;
    const build = async () => {
        await Promise.all(viewsToInclude.map((view) => waitSelector({ selector: `#view_${view}` })));
        const viewTitle = await waitSelector({ selector: `#${mainViewId} h2.kn-title` });
        const mainView = document.getElementById(mainViewId);
        let wrapper = document.getElementById(`${mainViewId}_wrapper`);

        if (!document.getElementById(showHideId)) {
            viewTitle.style.display = 'none';
            mainView?.insertAdjacentHTML('beforebegin', `<div class="ktlHideShowButton" id="${showHideId}">${escapeHtml(viewTitle.textContent.trim())} &nbsp;<span class="ktlArrow ktlDown" id="arrow_${showHideId}">◀</span></div>`);
            wrapContentForShowHideGroup(viewsToInclude, showHideId);
            wrapper = document.getElementById(`${mainViewId}_wrapper`);
            if (wrapper && !document.getElementById(`shrink-link_${showHideId}`)) {
                wrapper.insertAdjacentHTML('beforeend', `<a class="ktlShrinkLink" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="ktlArrow ktlUp" id="arrow_${showHideId}">◀</span></a>`);
            }
        }

        const description = mainView?.querySelector('.kn-description');
        const section = document.querySelector(`.${showHideId}`);
        if (description?.textContent.trim() && section && !section.querySelector('.kn-description')) {
            section.prepend(description);
            description.style.display = '';
        }
        showHideViewGroupContent(showHideId, 1000, flexOn);
        if (wrapper) wrapper.style.marginTop = '13px';
    };
    build().catch((error) => {
        if (isDeveloper) console.warn('view/s missing from page', viewsToInclude, error);
    });
}

/**
 * Wraps a group of views in one hidden section (first view's wrapper), once.
 * @param {Array<string|number>} viewsArr - View numbers; the first is the main view.
 * @param {string} showHideId - Section class.
 */
function wrapContentForShowHideGroup(viewsArr, showHideId) {
    const mainViewId = `view_${viewsArr[0]}`;
    const mainView = document.getElementById(mainViewId);
    if (document.getElementById(`${mainViewId}_wrapper`)) return;

    const wrapper = Object.assign(document.createElement('section'), { className: `${showHideId} ktlBoxWithBorder ktlHideShowSection`, id: `${mainViewId}_wrapper` });
    wrapper.style.display = 'none';
    const viewWrapper = Object.assign(document.createElement('div'), { className: 'view-wrapper' });
    mainView.before(wrapper);
    wrapper.append(viewWrapper);
    viewWrapper.append(mainView, ...viewsArr.slice(1).map((view) => document.getElementById(`view_${view}`)).filter(Boolean));
}

/**
 * Stops mouse events on an element reaching KTL's long-press-refresh handlers.
 * @param {HTMLElement} element - Element to protect.
 */
function preventKtlLongPressRefresh(element) {
    if (!(element instanceof HTMLElement)) return;
    ['click', 'mousedown', 'mousemove', 'mouseup'].forEach((name) => element.addEventListener(name, (event) => event.stopPropagation()));
}

/**
 * `_vmxw` keyword: sets a view's max width (a bare number means px).
 * @param {{key: string}} view - Knack view.
 */
function setViewMaxWidth({ key: viewId }) {
    const viewElement = document.getElementById(viewId);
    ktl.core.getKeywordsByType(viewId, '_vmxw').forEach(({ options, params }) => {
        if (!ktl.core.hasRoleAccess(options) || !viewElement) return;
        const width = params[0][0];
        const parsed = parseFloat(width);
        viewElement.style.maxWidth = width.includes('%') || width.includes('px') || Number.isNaN(parsed) ? width : `${parsed}px`;
    });
}

/**
 * Removes empty detail values from a view (keeps the labels but drops the extra space).
 * @param {{key: string}} view - Knack view.
 */
function hideEmptyFields(view) {
    document.querySelectorAll(`#${view.key} .kn-detail-body`).forEach((detail) => {
        if (detail.textContent.trim() === '') detail.remove();
    });
}

/**
 * `_hebv` keyword: hides elements depending on a detail field's value
 * (`params[0]` field id, `params[1]` value, `!value` to invert, the rest are selectors to hide).
 * V1 also called borderRadiusLastVisible() with no view id, which did nothing; that call is dropped.
 * @param {{key: string}} view - Knack view.
 * @param {Object} keywords - Parsed view keywords.
 */
function hideElementsByValue(view, keywords) {
    const keyword = '_hebv';
    const { key: viewId } = view;
    if (!viewId || !keywords[keyword]) return;
    ktl.core.getKeywordsByType(viewId, keyword).forEach(({ options, params: paramGroups }) => {
        if (!ktl.core.hasRoleAccess(options)) return;
        paramGroups.filter((params) => params.length >= 3).forEach(([fieldId, valueToMatch, ...elementsToHide]) => {
            const fieldValue = Array.from(document.querySelectorAll(`.${fieldId} .kn-detail-body`), (element) => element.textContent).join('').trim();
            const shouldHide = valueToMatch.startsWith('!') ? fieldValue !== valueToMatch.slice(1) : fieldValue === valueToMatch;
            if (shouldHide) resolveElements(elementsToHide.join()).forEach((element) => { element.style.display = 'none'; });
        });
    });
}

/**
 * Reads `_rtp` keyword settings: `false` stops redirecting on close; a `scene_N` entry names a scene that cancels it.
 * @param {Array<{params?: Array}>} [keywordEntries=[]] - Keyword entries.
 * @returns {{redirectOnClose: boolean, sceneToIgnore: string}}
 */
function getRedirectToPopUpConfig(keywordEntries = []) {
    const config = { redirectOnClose: true, sceneToIgnore: '' };
    keywordEntries.forEach(({ params = [] } = {}) => {
        params.flat().map((param) => String(param || '').trim()).filter(Boolean).forEach((param) => {
            const lower = param.toLowerCase();
            if (lower === 'false') config.redirectOnClose = false;
            else if (lower.startsWith('scene_')) config.sceneToIgnore = param;
        });
    });
    return config;
}

/**
 * Makes modal close buttons redirect to the parent page instead of just closing (bound once per view).
 * @param {Object} options
 * @param {string} options.viewId - View id.
 * @param {string} options.parentUrl - Where to go.
 * @param {string} options.closeRedirectSelector - Close button selector.
 * @param {() => boolean} options.shouldSkipRedirect - Return true to leave the click alone.
 */
function bindRedirectToPopUpCloseButtons({ viewId, parentUrl, closeRedirectSelector, shouldSkipRedirect }) {
    document.querySelectorAll(closeRedirectSelector).forEach((button) => {
        if (button.dataset.rtpCloseBound === viewId) return;
        button.dataset.rtpCloseBound = viewId;
        button.addEventListener('click', (event) => {
            if (shouldSkipRedirect()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            handleRedirect(event, parentUrl);
        }, { capture: true });
    });
}

/**
 * `_rtp` keyword: when a view is shown in a modal, redirect to the parent page on close and after a form submit.
 * @param {{key: string}} view - Knack view.
 * @param {Object} keywords - Parsed view keywords.
 */
function redirectToPopUp(view, keywords) {
    const keyword = '_rtp';
    if (!keywords?.[keyword]) return;
    const viewId = view.key;
    const submitEvent = `knack-form-submit.${viewId}.rtp`;
    const $document = globalThis.jQuery(document); // Knack fires its events through jQuery.
    $document.off(submitEvent);
    if (!document.querySelector('.kn-modal')) return;

    const parentUrl = ktl.core.findParentURL(sanitiseURL(window.location.href), 1);
    if (!parentUrl) return;
    const { redirectOnClose, sceneToIgnore } = getRedirectToPopUpConfig(keywords[keyword]);
    const shouldSkipRedirect = () => sceneToIgnore && document.getElementById(`kn-${sceneToIgnore}`);
    if (shouldSkipRedirect()) return;

    if (redirectOnClose) {
        bindRedirectToPopUpCloseButtons({ viewId, parentUrl, closeRedirectSelector: '.kn-modal button.close-modal, .kn-modal .close-modal', shouldSkipRedirect });
    }
    if (ktl.views.getViewType(viewId) !== 'form') return;
    $document.on(submitEvent, (event) => {
        if (!shouldSkipRedirect()) handleRedirect(event, parentUrl);
    });
}
