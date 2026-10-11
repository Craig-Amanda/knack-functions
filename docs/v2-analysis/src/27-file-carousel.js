// File carousel ported as-is (analysis C24).

let fileCarouselState = null;

/**
 * Creates (once) the shared file-carousel overlay markup and styles, and returns the overlay root.
 * @returns {HTMLElement} The overlay root element.
 */
function ensureFileCarouselOverlay() {
    const existing = document.getElementById('kfnFileCarousel');
    if (existing) return existing;

    const style = document.createElement('style');
    style.id = 'kfnFileCarouselStyles';
    style.textContent = `
        .kfn-file-carousel { position: fixed; inset: 0; z-index: 2147483000; display: none; }
        .kfn-file-carousel.is-open { display: block; }
        .kfn-file-carousel__backdrop { position: absolute; inset: 0; background: rgba(20, 20, 20, 0.9); }
        .kfn-file-carousel__dialog { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 90px; box-sizing: border-box; }
        .kfn-file-carousel__scroll { height: 100%; max-width: 100%; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; align-items: center; }
        .kfn-file-carousel__stage { position: relative; max-width: 100%; flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; border-radius: 4px; overflow: hidden; }
        .kfn-file-carousel__stage img { max-width: 88vw; max-height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.15s ease; }
        .kfn-file-carousel__stage img.is-loaded { opacity: 1; }
        .kfn-file-carousel__stage iframe { width: 88vw; height: 100%; border: 0; background: #fff; }
        .kfn-file-carousel__spinner { width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.25); border-top-color: #fff; border-radius: 50%; animation: kfnFileCarouselSpin 0.7s linear infinite; }
        @keyframes kfnFileCarouselSpin { to { transform: rotate(360deg); } }
        .kfn-file-carousel__loading { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .kfn-file-carousel__loading-label { color: #fff; font-size: 13px; opacity: 0.85; text-align: center; }
        .kfn-file-carousel__fallback { color: #fff; text-align: center; padding: 40px; }
        .kfn-file-carousel__fallback .kfn-file-carousel__icon { font-size: 48px; display: block; margin-bottom: 12px; }
        .kfn-file-carousel__close, .kfn-file-carousel__nav { position: absolute; z-index: 2; background: rgba(0, 0, 0, 0.45); color: #fff; border: 0; cursor: pointer; border-radius: 50%; width: 44px; height: 44px; font-size: 24px; line-height: 1; display: flex; align-items: center; justify-content: center; }
        .kfn-file-carousel__close:hover, .kfn-file-carousel__nav:hover { background: rgba(0, 0, 0, 0.65); }
        .kfn-file-carousel__close { top: 16px; right: 16px; }
        .kfn-file-carousel__nav--prev { left: 16px; top: 50%; transform: translateY(-50%); }
        .kfn-file-carousel__nav--next { right: 16px; top: 50%; transform: translateY(-50%); }
        .kfn-file-carousel__nav::before { content: ''; width: 12px; height: 12px; border-style: solid; border-color: #fff; border-width: 0 3px 3px 0; display: block; }
        .kfn-file-carousel__nav--prev::before { transform: rotate(135deg); margin-left: 5px; }
        .kfn-file-carousel__nav--next::before { transform: rotate(-45deg); margin-right: 5px; }
        .kfn-file-carousel__preview { display: flex; flex-direction: column; align-items: center; max-width: 100%; width: 100%; flex: 1 1 auto; min-height: 0; }
        .kfn-file-carousel__filename { flex: 0 0 auto; color: #fff; font-size: 15px; margin: 0 0 10px; text-align: center; word-break: break-all; }
        .kfn-file-carousel__meta { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; margin: 14px 0 0; }
        .kfn-file-carousel__meta .kn-file-download { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: 999px; background: #2563eb; color: #fff; font-weight: 600; font-size: 12px; text-decoration: none; line-height: 1; }
        .kfn-file-carousel__meta .kn-file-download:hover { background: #1d4ed8; }
        .kfn-file-carousel__meta .kn-file-download i { font-size: 12px; }
        .kfn-file-carousel__download-size { opacity: 0.85; font-weight: 400; }
        .kfn-file-carousel__footer { flex: 0 0 auto; color: #fff; margin-top: 2px; text-align: center; max-width: 80vw; }
        .kfn-file-carousel__caption { font-size: 13px; opacity: 0.8; margin-bottom: 4px; }
        .kfn-file-carousel__counter { font-size: 12px; opacity: 0.55; }
        @media (max-width: 640px) {
            .kfn-file-carousel__dialog { padding: 10px 8px; }
            .kfn-file-carousel__stage img, .kfn-file-carousel__stage iframe { max-width: 96vw; }
            .kfn-file-carousel__close, .kfn-file-carousel__nav { width: 34px; height: 34px; font-size: 18px; }
            .kfn-file-carousel__close { top: 6px; right: 6px; }
            .kfn-file-carousel__nav--prev { left: 4px; }
            .kfn-file-carousel__nav--next { right: 4px; }
            .kfn-file-carousel__nav::before { width: 9px; height: 9px; border-width: 0 2px 2px 0; }
            .kfn-file-carousel__nav--prev::before { margin-left: 3px; }
            .kfn-file-carousel__nav--next::before { margin-right: 3px; }
            .kfn-file-carousel__filename { font-size: 13px; margin-bottom: 6px; }
            .kfn-file-carousel__meta { margin-top: 10px; }
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'kfnFileCarousel';
    overlay.className = 'kfn-file-carousel';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
        <div class="kfn-file-carousel__backdrop"></div>
        <div class="kfn-file-carousel__dialog">
            <button type="button" class="kfn-file-carousel__close" aria-label="Close">&times;</button>
            <button type="button" class="kfn-file-carousel__nav kfn-file-carousel__nav--prev" aria-label="Previous file"></button>
            <div class="kfn-file-carousel__scroll">
                <div class="kfn-file-carousel__preview">
                    <h1 id="kn-asset-header" class="kfn-file-carousel__filename"></h1>
                    <div class="kfn-file-carousel__stage"></div>
                    <p class="kfn-file-carousel__meta">
                        <a class="kn-file-download" download target="_blank" rel="noopener noreferrer">Download<span class="kfn-file-carousel__download-size"></span><i class="fa fa-cloud-download"></i></a>
                    </p>
                </div>
                <div class="kfn-file-carousel__footer">
                    <div class="kfn-file-carousel__caption"></div>
                    <div class="kfn-file-carousel__counter"></div>
                </div>
            </div>
            <button type="button" class="kfn-file-carousel__nav kfn-file-carousel__nav--next" aria-label="Next file"></button>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.kfn-file-carousel__backdrop').addEventListener('click', closeFileCarousel);
    overlay.querySelector('.kfn-file-carousel__close').addEventListener('click', closeFileCarousel);
    overlay.querySelector('.kfn-file-carousel__nav--prev').addEventListener('click', () => navigateFileCarousel(-1));
    overlay.querySelector('.kfn-file-carousel__nav--next').addEventListener('click', () => navigateFileCarousel(1));
    // The `download` attribute is ignored on cross-origin links (api.knack.com vs the app's own domain), so force it via fetch+blob.
    overlay.querySelector('.kn-file-download').addEventListener('click', (event) => {
        event.preventDefault();
        const item = fileCarouselState?.items[fileCarouselState.index];
        if (item) forceDownloadFile(item.assetUrl, item.fileName);
    });

    return overlay;
}

/**
 * Preloads an item's image in the background so navigating to it feels instant.
 * @param {Object} [item] - A carousel item.
 * @returns {void}
 */
function preloadFileCarouselImage(item) {
    if (!item || !IMAGE_EXTENSIONS.includes(item.extension)) return;
    new Image().src = item.assetUrl;
}

/**
 * Replaces the stage content with the "can't preview" message. The Download button stays available regardless.
 * @param {HTMLElement} stage - The carousel's stage element.
 * @param {string} [message] - Message to show under the icon.
 * @returns {void}
 */
function showFileCarouselFallback(stage, message = 'No preview available for this file type.') {
    stage.innerHTML = '';
    const fallback = document.createElement('div');
    fallback.className = 'kfn-file-carousel__fallback';
    fallback.innerHTML = `<span class="kfn-file-carousel__icon">\uD83D\uDCC4</span>${message}`;
    stage.appendChild(fallback);
}

/**
 * Renders the file at `index` into the carousel stage (image, PDF, attempted Office embed, or a download-only fallback).
 * @param {number} index - Index into the current carousel's items array.
 * @returns {void}
 */
function renderFileCarouselItem(index) {
    if (!fileCarouselState || !fileCarouselState.items.length) return;
    const overlay = document.getElementById('kfnFileCarousel');
    if (!overlay) return;

    const item = fileCarouselState.items[index];
    if (!item) return;
    fileCarouselState.index = index;

    const stage = overlay.querySelector('.kfn-file-carousel__stage');
    const filename = overlay.querySelector('.kfn-file-carousel__filename');
    const caption = overlay.querySelector('.kfn-file-carousel__caption');
    const counter = overlay.querySelector('.kfn-file-carousel__counter');
    const downloadSize = overlay.querySelector('.kfn-file-carousel__download-size');
    const download = overlay.querySelector('.kn-file-download');

    stage.innerHTML = '';
    if (IMAGE_EXTENSIONS.includes(item.extension)) {
        const loading = document.createElement('div');
        loading.className = 'kfn-file-carousel__loading';
        loading.innerHTML = '<div class="kfn-file-carousel__spinner"></div><div class="kfn-file-carousel__loading-label">Loading file\u2026</div>';
        stage.appendChild(loading);

        // Only reassure the user once it's actually slow, so fast loads stay clean.
        const slowLoadTimer = setTimeout(() => {
            if (!stage.contains(loading)) return;
            loading.querySelector('.kfn-file-carousel__loading-label').textContent = 'Still loading \u2014 this file is large, hang tight\u2026';
        }, 4000);

        const img = document.createElement('img');
        img.alt = item.fileName;
        img.addEventListener('load', () => {
            clearTimeout(slowLoadTimer);
            loading.remove();
            img.classList.add('is-loaded');
        }, { once: true });
        img.addEventListener('error', () => {
            clearTimeout(slowLoadTimer);
            if (stage.contains(img)) showFileCarouselFallback(stage, "This image couldn't be loaded.");
        }, { once: true });
        img.src = item.assetUrl;
        stage.appendChild(img);
    } else if (item.extension === 'pdf') {
        // Browsers render PDFs natively in an iframe, so no external viewer is needed.
        const iframe = document.createElement('iframe');
        iframe.src = item.assetUrl;
        iframe.title = item.fileName;
        stage.appendChild(iframe);
    } else if (fileCarouselState.tryOfficeEmbed && OFFICE_EXTENSIONS.includes(item.extension)) {
        // Office Online needs a publicly reachable src; the download button below is the fallback if this renders blank.
        const iframe = document.createElement('iframe');
        iframe.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(item.assetUrl)}`;
        iframe.title = item.fileName;
        stage.appendChild(iframe);
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'kfn-file-carousel__fallback';
        fallback.innerHTML = '<span class="kfn-file-carousel__icon">\uD83D\uDCC4</span>No preview available for this file type.';
        stage.appendChild(fallback);
    }

    caption.textContent = item.caption || item.fileName;
    counter.textContent = `${index + 1} of ${fileCarouselState.items.length}`;
    filename.textContent = item.fileName;
    const formattedSize = formatFileSizeBytes(item.fileSize);
    downloadSize.textContent = formattedSize ? ` (${formattedSize})` : '';
    download.href = item.assetUrl;
    download.setAttribute('download', item.fileName);

    if (item.fileSize === undefined) {
        fetchFileSizeBytes(item).then((bytes) => {
            // Bail if the carousel moved on or closed while the size request was in flight.
            if (!fileCarouselState || fileCarouselState.items[fileCarouselState.index] !== item) return;
            const sizeText = formatFileSizeBytes(bytes);
            overlay.querySelector('.kfn-file-carousel__download-size').textContent = sizeText ? ` (${sizeText})` : '';
        });
    }

    const showNav = fileCarouselState.items.length > 1 ? 'visible' : 'hidden';
    overlay.querySelector('.kfn-file-carousel__nav--prev').style.visibility = showNav;
    overlay.querySelector('.kfn-file-carousel__nav--next').style.visibility = showNav;

    // Warm the browser cache for adjacent items so Prev/Next feels instant.
    const total = fileCarouselState.items.length;
    preloadFileCarouselImage(fileCarouselState.items[(index + 1) % total]);
    preloadFileCarouselImage(fileCarouselState.items[(index - 1 + total) % total]);
}

/**
 * Moves the open carousel forward/backward by `delta`, wrapping around at either end.
 * @param {number} delta - -1 for previous, 1 for next.
 * @returns {void}
 */
function navigateFileCarousel(delta) {
    if (!fileCarouselState || !fileCarouselState.items.length) return;
    const total = fileCarouselState.items.length;
    const nextIndex = (fileCarouselState.index + delta + total) % total;
    renderFileCarouselItem(nextIndex);
}

/**
 * Closes the carousel when the user presses the browser Back button, since opening the carousel
 * pushed a history entry for exactly this purpose.
 * @returns {void}
 */
function onFileCarouselPopState() {
    closeFileCarousel({ viaPopState: true });
}

/**
 * Opens the shared file carousel overlay at a given item.
 * @param {Array<Object>} items - Ordered list of `{assetId, fileName, extension, assetUrl, caption}` entries.
 * @param {number} startIndex - Index of the item to show first.
 * @param {HTMLElement} [triggerElement] - Element to restore focus to when the overlay closes.
 * @param {{tryOfficeEmbed?: boolean}} [options]
 * @returns {void}
 */
function openFileCarousel(items, startIndex, triggerElement, options = {}) {
    if (!Array.isArray(items) || !items.length) return;
    const overlay = ensureFileCarouselOverlay();

    const onKeydown = (event) => {
        if (event.key === 'Escape') closeFileCarousel();
        else if (event.key === 'ArrowLeft') navigateFileCarousel(-1);
        else if (event.key === 'ArrowRight') navigateFileCarousel(1);
    };

    fileCarouselState = {
        items,
        index: startIndex,
        triggerElement: triggerElement || null,
        tryOfficeEmbed: options.tryOfficeEmbed !== false,
        keydownHandler: onKeydown,
    };

    document.addEventListener('keydown', onKeydown);
    window.addEventListener('popstate', onFileCarouselPopState);
    // One history entry per open (not per Prev/Next) so a single Back press closes the overlay
    // instead of navigating the underlying page away while it stays open on top.
    history.pushState({ kfnFileCarouselOpen: true }, '', location.href);

    document.body.style.overflow = 'hidden';
    overlay.classList.add('is-open');
    renderFileCarouselItem(startIndex);
    overlay.querySelector('.kfn-file-carousel__close').focus();
}

/**
 * Closes the shared file carousel overlay and restores focus/scroll state.
 * @param {{viaPopState?: boolean}} [options] - Set when called from a Back-button popstate, so we don't call history.back() again.
 * @returns {void}
 */
function closeFileCarousel(options = {}) {
    const overlay = document.getElementById('kfnFileCarousel');
    if (!overlay || !fileCarouselState) return;

    overlay.classList.remove('is-open');
    overlay.querySelector('.kfn-file-carousel__stage').innerHTML = '';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', fileCarouselState.keydownHandler);
    window.removeEventListener('popstate', onFileCarouselPopState);

    const { triggerElement } = fileCarouselState;
    fileCarouselState = null;

    // Closed via the X/backdrop/Escape rather than Back: pop the history entry we pushed on open
    // so it doesn't sit there as a stale extra step next time the user presses Back.
    if (!options.viaPopState) history.back();

    if (triggerElement && typeof triggerElement.focus === 'function') triggerElement.focus();
}

/**
 * Wires a Gmail-style attachment carousel onto a Knack table's file/image column.
 * Clicking any file cell opens an overlay that pages through every file currently rendered in the
 * table, instead of opening each asset in a new tab. Safe to call on every `knack-view-render` for
 * the view; the click listener is only bound once per rendered table element.
 * @param {string} viewId - Table view id (e.g. 'view_2331').
 * @param {string} fileFieldKey - File/image field key backing the column to enable (e.g. 'field_888').
 * @param {Object} [options]
 * @param {string[]} [options.captionFieldKeys] - Field keys shown as caption text under the preview, joined with " · ".
 * @param {boolean} [options.tryOfficeEmbed=true] - Attempt an inline Office Online preview for docx/xlsx/pptx before falling back to a download-only view.
 * @returns {void}
 */
function initFileCarousel(viewId, fileFieldKey, options = {}) {
    const normalizedViewId = knackNavigator.normalizeViewId(viewId);
    const viewElement = document.getElementById(normalizedViewId);
    if (!viewElement || viewElement.dataset.fileCarouselInit === 'true') return;

    const fileColumnSelector = knackNavigator
        .getViewColumnSelectors(normalizedViewId, fileFieldKey)
        .find((selector) => selector.startsWith('td.') || selector.startsWith('td['));
    if (!fileColumnSelector) return;

    const captionFieldKeys = Array.isArray(options.captionFieldKeys) ? options.captionFieldKeys : [];
    const captionSelectors = captionFieldKeys
        .map((fieldKey) => knackNavigator
            .getViewColumnSelectors(normalizedViewId, fieldKey)
            .find((selector) => selector.startsWith('td.') || selector.startsWith('td[')))
        .filter(Boolean);

    /**
     * Extracts asset info from whichever element inside the cell carries Knack's asset identity attributes.
     * @param {HTMLElement} cellElement - The `<td>` for the file column.
     * @returns {{assetId: string, fileName: string, extension: string, assetUrl: string}|null}
     */
    function getCellAssetInfo(cellElement) {
        const assetElement = cellElement.querySelector('[data-asset-id][data-file-name]');
        if (!assetElement) return null;
        const info = buildKnackAssetInfo(
            assetElement.getAttribute('data-asset-id'),
            assetElement.getAttribute('data-file-name')
        );
        if (!info.assetUrl) return null;

        const fileSize = assetElement.getAttribute('data-file-size');
        return fileSize ? { ...info, fileSize: Number(fileSize) } : info;
    }

    /**
     * Builds the caption text for a row from the configured caption columns.
     * @param {HTMLElement} rowElement - The `<tr>` for the record.
     * @returns {string}
     */
    function getRowCaption(rowElement) {
        return captionSelectors
            .map((selector) => rowElement.querySelector(selector)?.textContent.trim())
            .filter(Boolean)
            .join(' · ');
    }

    // Capture phase runs before Knack's own bubble-phase asset click handler, so this pre-empts
    // Knack's native image lightbox from opening behind ours (it isn't rewritten for image extensions).
    viewElement.addEventListener('click', (event) => {
        const fileCell = event.target.closest(fileColumnSelector);
        if (!fileCell || !viewElement.contains(fileCell)) return;

        const clickedInfo = getCellAssetInfo(fileCell);
        if (!clickedInfo) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const items = [];
        let startIndex = 0;

        viewElement.querySelectorAll('tbody tr').forEach((rowElement) => {
            const cell = rowElement.querySelector(fileColumnSelector);
            if (!cell) return;
            const info = getCellAssetInfo(cell);
            if (!info) return;

            if (cell === fileCell) startIndex = items.length;
            items.push({ ...info, caption: getRowCaption(rowElement) });
        });

        if (!items.length) return;
        openFileCarousel(items, startIndex, fileCell, { tryOfficeEmbed: options.tryOfficeEmbed });
    }, true);

    viewElement.dataset.fileCarouselInit = 'true';
}
