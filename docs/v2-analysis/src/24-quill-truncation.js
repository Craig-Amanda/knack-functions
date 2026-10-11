// Quill rich-text editor (plain DOM, Quill 2.x; no React) and grid truncation (analyses C09, C10).

/**
 * Enhanced Quill Rich Text Editor for Knack Replaces Knack's Redactor editor with Quill.js
 */

/** Formats the editor accepts: exactly what the toolbar offers, so pasted content can't bring in anything else. */
const QUILL_FORMATS = ['header', 'font', 'bold', 'italic', 'underline', 'color', 'background', 'align', 'list', 'indent', 'code-block', 'blockquote', 'script', 'link', 'image'];

/** Maps each toolbar button to its tooltip; `{mod}` is replaced by Cmd or Ctrl. The tooltip doubles as the accessible name. */
const QUILL_TOOLBAR_TIPS = [
    ['button.ql-bold', 'Bold ({mod}+B)'],
    ['button.ql-italic', 'Italic ({mod}+I)'],
    ['button.ql-underline', 'Underline ({mod}+U)'],
    ['button.ql-link', 'Insert Link ({mod}+K)'],
    ['button.ql-image', 'Insert Image'],
    ['button.ql-code-block', 'Code Block'],
    ['button.ql-blockquote', 'Blockquote'],
    ['button.ql-clean', 'Remove Formatting'],
    ['button.ql-list[value="ordered"]', 'Numbered List ({mod}+Shift+7)'],
    ['button.ql-list[value="bullet"]', 'Bullet List ({mod}+Shift+8)'],
    ['.ql-color', 'Text Color'],
    ['.ql-background', 'Background Color'],
    ['button.ql-script[value="sub"]', 'Subscript ({mod}+,)'],
    ['button.ql-script[value="super"]', 'Superscript ({mod}+.)'],
    ['.ql-align', 'Align'],
    ['.ql-header', 'Heading'],
    ['.ql-font', 'Font'],
];
const QUILL_ALIGN_TIPS = { '': 'Align Left', center: 'Align Center', right: 'Align Right', justify: 'Justify' };

/** Gives the toolbar buttons tooltips and accessible names. @param {Element} toolbar - The `.ql-toolbar` element. */
function labelQuillToolbar(toolbar) {
    const mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
    QUILL_TOOLBAR_TIPS.forEach(([selector, tip]) => toolbar.querySelectorAll(selector).forEach((el) => {
        el.title = tip.replace('{mod}', mod);
        el.setAttribute('aria-label', el.title);
    }));
    toolbar.querySelectorAll('.ql-align.ql-picker .ql-picker-item').forEach((option) => {
        option.title = QUILL_ALIGN_TIPS[option.getAttribute('data-value') ?? ''] ?? '';
    });
}

/**
 * Mounts a Quill editor in an element, with no framework needed.
 * @param {Element|string} target - Empty element (or selector) that becomes the editor; Quill adds its toolbar before it.
 * @param {Object} [options={}] - Editor options.
 * @param {string} [options.value=''] - Initial HTML; loading it is silent, so it does not fire `onChange`.
 * @param {Function} [options.onChange] - Called with the editor HTML after each user edit.
 * @param {Object} [options.modules] - Quill modules; defaults to `createQuillModules()`.
 * @param {string} [options.theme='snow'] - Quill theme.
 * @param {boolean} [options.readOnly=false] - Whether editing is disabled.
 * @param {string[]} [options.formats=QUILL_FORMATS] - Formats the editor accepts.
 * @returns {{quill: Object, getHtml: Function, setHtml: Function, setReadOnly: Function, destroy: Function}|null} Controller, or null when Quill or the target is missing.
 */
function createQuillEditor(target, { value = '', onChange, modules, theme = 'snow', readOnly = false, formats = QUILL_FORMATS } = {}) {
    const element = resolveElement(target);
    if (!element || !window.Quill) return null;

    const quill = new window.Quill(element, { theme, modules: modules || createQuillModules(), readOnly, formats });
    const setHtml = (html) => quill.setContents(quill.clipboard.convert({ html: html || '' }), 'silent');
    if (value) setHtml(value);

    const toolbar = element.previousElementSibling?.classList.contains('ql-toolbar') ? element.previousElementSibling : element.parentNode?.querySelector('.ql-toolbar');
    if (toolbar) labelQuillToolbar(toolbar);

    const handleChange = () => onChange?.(quill.root.innerHTML); // Silent loads don't emit, so this is only real edits.
    quill.on('text-change', handleChange);

    return {
        quill,
        getHtml: () => quill.root.innerHTML,
        setHtml,
        setReadOnly: (isReadOnly) => quill.enable(!isReadOnly),
        destroy: () => quill.off('text-change', handleChange),
    };
}

/**
 * Custom Quill icon definitions for lists
 */
function initializeQuillIcons() {
    if (!(window.Quill?.imports?.['ui/icons']) || initializeQuillIcons.done) return;
    initializeQuillIcons.done = true;

    const icons = window.Quill.imports['ui/icons'];

    // Improved ordered list icon
    icons['list']['ordered'] = `
        <svg viewBox="0 0 18 18">
            <text x="2" y="5.5" font-size="6" font-family="Arial" fill="#444">1</text>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="3.8" rx="0.3"></rect>
            <text x="2" y="11.5" font-size="6" font-family="Arial" fill="#444">2</text>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="9.6" rx="0.3"></rect>
            <text x="2" y="17" font-size="6" font-family="Arial" fill="#444">3</text>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="15" rx="0.3"></rect>
        </svg>
    `;

    // Improved bullet list icon
    icons['list']['bullet'] = `
        <svg viewBox="0 0 18 18">
            <circle class="ql-fill" cx="5" cy="4" r="1.5"></circle>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="3.8" rx="0.3"></rect>
            <circle class="ql-fill" cx="5" cy="10" r="1.5"></circle>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="9.6" rx="0.3"></rect>
            <circle class="ql-fill" cx="5" cy="15" r="1.5"></circle>
            <rect class="ql-stroke" height="0.1" width="8" x="10" y="15" rx="0.3"></rect>
        </svg>
    `;
}

/**
 * Modal management for link and image insertion
 */
const QuillModal = {
    /**
     * Initialize the modal just once
     */
    init() {
        if (document.getElementById('quill-universal-modal')) return;

        // Create modal element
        const modal = document.createElement('div');
        modal.id = 'quill-universal-modal';
        modal.innerHTML = `
            <div class="ql-modal-content" role="dialog" aria-modal="true" aria-labelledby="ql-modal-title">
                <h3 id="ql-modal-title"></h3>
                <div id="ql-modal-fields"></div>
                <div class="ql-modal-actions">
                    <button id="ql-modal-save" type="button">Save</button>
                    <button id="ql-modal-unlink" type="button" style="display:none;">Unlink</button>
                    <button id="ql-modal-cancel" type="button">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #quill-universal-modal {
                position: fixed; z-index: 99999; left: 0; top: 0; width: 100vw; height: 100vh; display: none;
                background: rgba(0,0,0,0.3); align-items: center; justify-content: center;
            }
            .ql-modal-content {
                background: #fff; border-radius: 8px; padding: 1.5em 2em; min-width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                display: flex; flex-direction: column; gap: 1.25em;
            }
            .ql-modal-content h3 {
                margin: 0; padding: 0; font-size: 1.3em;
            }
            .ql-modal-content label {
                display: flex; flex-direction: column; gap: 0.5em; font-weight: 500;
                margin-bottom: 0.5em;
            }
            .ql-modal-content input {
                padding: 0.5em; border: 1px solid #ccc; border-radius: 4px;
                margin-bottom: 0;
            }
            .ql-modal-content small {
                color: #666; font-size: 0.65em; margin-top: -0.7em; margin-bottom: 0.85em;
                display: block;
            }
            .ql-modal-fields {
                margin-bottom: 0.5em;
            }
            .ql-modal-actions {
                display: flex; gap: 1em; justify-content: flex-end;
                margin-top: 0.5em; padding-top: 0.5em;
            }
            .ql-modal-actions button {
                padding: 0.6em 1.2em; border: none; border-radius: 4px;
                background: #0078d4; color: #fff; font-weight: 600; cursor: pointer;
                min-width: 80px;
            }
            .ql-modal-actions button#ql-modal-unlink { background: #e81123; }
            .ql-modal-actions button#ql-modal-cancel { background: #888; }
            .ql-modal-actions button:disabled { opacity: 0.6; cursor: not-allowed; }
            .ql-modal-actions button:hover { filter: brightness(1.1); }
        `;
        document.head.appendChild(style);
    },

    /**
     * Show the modal with the appropriate content
     */
    show({ type, url = '', label = '', onSave, onUnlink, onCancel }) {
        this.init();

        const modal = document.getElementById('quill-universal-modal');
        const fields = document.getElementById('ql-modal-fields');
        const title = document.getElementById('ql-modal-title');
        const saveBtn = document.getElementById('ql-modal-save');
        const unlinkBtn = document.getElementById('ql-modal-unlink');
        const cancelBtn = document.getElementById('ql-modal-cancel');

        // Set content based on type
        if (type === 'link') {
            title.textContent = 'Insert/Edit Link';
            fields.innerHTML = `
                <label>
                    Link URL:
                    <input type="url" id="ql-link-url" placeholder="https://example.com" value="${escapeHtml(url)}" required>
                    <small>
                        If you omit https:// it will be added automatically.
                    </small>
                </label>
                <label>
                    Link Text:
                    <input type="text" id="ql-link-label" placeholder="Link text" value="${escapeHtml(label)}" required>
                </label>
            `;
            unlinkBtn.style.display = '';
        } else if (type === 'image') {
            title.textContent = 'Insert Image';
            fields.innerHTML = `
                <label>
                    Image URL:
                    <input type="url" id="ql-image-url" placeholder="https://example.com/image.jpg" value="${escapeHtml(url)}" required>
                </label>
            `;
            unlinkBtn.style.display = 'none';
        }

        const previousFocus = document.activeElement;
        const close = () => {
            modal.style.display = 'none';
            modal.removeEventListener('keydown', onKeydown);
            if (previousFocus?.isConnected) previousFocus.focus?.();
        };
        const save = () => {
            if (type === 'link') {
                let urlVal = document.getElementById('ql-link-url').value.trim();
                const labelVal = document.getElementById('ql-link-label').value.trim();
                if (!urlVal || !labelVal) return;
                if (!/^https?:\/\//i.test(urlVal)) urlVal = 'https://' + urlVal;
                onSave(urlVal, labelVal);
            } else if (type === 'image') {
                const urlVal = document.getElementById('ql-image-url').value.trim();
                if (!urlVal) return;
                onSave(urlVal);
            }
            close();
        };
        // Escape cancels, Enter in a field saves, and Tab stays inside the dialog.
        const onKeydown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCancel?.();
                close();
            } else if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
                event.preventDefault();
                save();
            } else if (event.key === 'Tab') {
                const focusable = [...modal.querySelectorAll('input, button')].filter((el) => el.offsetParent !== null && !el.disabled);
                if (!focusable.length) return;
                const [first, last] = [focusable[0], focusable.at(-1)];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };

        modal.style.display = 'flex';
        modal.addEventListener('keydown', onKeydown);
        saveBtn.onclick = save;
        unlinkBtn.onclick = () => { onUnlink?.(); close(); };
        cancelBtn.onclick = () => { onCancel?.(); close(); };
        fields.querySelector('input')?.focus();
    }
};

/**
 * Configuration for Quill editor features
 */
function createQuillModules() {
    return {
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, 4, false] }, { 'font': [] }],
                ['bold', 'italic', 'underline', { 'color': [] }, { 'background': [] }],
                [{ 'align': [] }, { 'list': 'ordered' }, { 'list': 'bullet' }],
                ['code-block', 'blockquote', { 'script': 'sub' }, { 'script': 'super' }],
                ['link', 'image'],
                ['clean']
            ],
            handlers: {
                image: function () {
                    const quill = this.quill;
                    const savedRange = quill.getSelection(true); // `true` focuses the editor, so a range always exists.

                    QuillModal.show({
                        type: 'image',
                        url: '',
                        onSave: (url) => {
                            quill.setSelection(savedRange.index, savedRange.length);
                            quill.insertEmbed(savedRange.index, 'image', url, 'user');
                        }
                    });
                },
                link: function () {
                    const quill = this.quill;
                    let savedRange = quill.getSelection();
                    if (!savedRange) return;

                    // Get current link and text at selection
                    let currentLink = '';
                    let currentText = '';

                    const [leaf] = quill.getLeaf(savedRange.index);
                    if (leaf?.parent?.formats && typeof leaf.parent.formats === 'function') {
                        const formats = leaf.parent.formats();
                        if (formats.link) {
                            currentLink = formats.link;
                            currentText = leaf.parent.domNode.innerText || quill.getText(savedRange.index, savedRange.length);
                        } else {
                            currentText = quill.getText(savedRange.index, savedRange.length);
                        }
                    } else {
                        currentText = quill.getText(savedRange.index, savedRange.length);
                    }

                    QuillModal.show({
                        type: 'link',
                        url: currentLink,
                        label: currentText,
                        onSave: (url, label) => {
                            quill.setSelection(savedRange.index, savedRange.length);
                            quill.deleteText(savedRange.index, savedRange.length);
                            quill.insertText(savedRange.index, label, 'link', url);
                        },
                        onUnlink: () => {
                            quill.setSelection(savedRange.index, savedRange.length);
                            quill.format('link', false);
                        }
                    });
                }
            }
        },
        clipboard: { matchVisual: false }, // Quill 2: don't turn pasted spacing into extra blank lines.
        keyboard: {
            bindings: {
                orderedList: {
                    key: 55, // '7'
                    shortKey: true,
                    shiftKey: true,
                    handler: function () {
                        this.quill.format('list', 'ordered');
                    }
                },
                bulletList: {
                    key: 56, // '8'
                    shortKey: true,
                    shiftKey: true,
                    handler: function () {
                        this.quill.format('list', 'bullet');
                    }
                }
            }
        }
    };
}

/** Controllers of the editors mounted by `replaceKnackRichTextWithQuillEditor`, so a re-render never mounts a second one. */
const quillEditorControllers = new WeakMap();

/**
 * Replaces Knack's Redactor rich-text inputs in a view with Quill editors.
 * The Redactor textarea stays the source of truth: every edit is copied into it and Knack is notified.
 * @param {string} [viewId] - View to search; the whole document when omitted.
 * @param {Object} [options={}] - `theme`, `modules`, `readOnly` and `formats`, as for `createQuillEditor`.
 * @returns {number|undefined} Number of rich-text inputs found; undefined when Quill is missing or nothing was found.
 */
function replaceKnackRichTextWithQuillEditor(viewId, options = {}) {
    if (!window.Quill) {
        console.warn("Quill not loaded, using Knack Redactor editor.");
        return;
    }

    initializeQuillIcons();
    ensureQuillMousedownGuard();

    const container = viewId ? document.getElementById(viewId) : document;
    const richInputs = container?.querySelectorAll('.kn-input-rich_text');
    if (!richInputs?.length) return;

    richInputs.forEach((knInput, idx) => {
        if (quillEditorControllers.has(knInput)) return;
        const knackEditor = knInput.querySelector('.redactor-editor');
        const textarea = knInput.querySelector('textarea.rich_text');
        if (!knackEditor || !textarea) return;

        const editorHost = document.createElement('div');
        editorHost.className = 'my-react-editor'; // Class name kept from V1: apps style and target it.
        editorHost.id = `my-react-editor-${viewId || 'global'}-${idx}`;
        editorHost.dataset.for = knInput.id;

        // Move the label above the new editor.
        const label = knInput.querySelector('label.kn-label');
        if (label) {
            knInput.parentNode.insertBefore(label.cloneNode(true), knInput);
            label.remove();
        }
        knInput.parentNode.insertBefore(editorHost, knInput);

        try {
            knackEditor.classList.add(CLASS_HIDDEN);
            const controller = createQuillEditor(editorHost, {
                theme: options.theme,
                modules: options.modules,
                formats: options.formats,
                readOnly: options.readOnly || textarea.disabled,
                value: textarea.value,
                onChange: (content) => {
                    // An editor holding only an empty paragraph is empty; one holding only an image is not.
                    const isEmpty = !content || (!/<img\b/i.test(content) && content.replace(/<[^>]+>/g, '').trim() === '');
                    textarea.value = isEmpty ? '' : content;
                    knackEditor.innerHTML = isEmpty ? '' : content;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                },
            });
            quillEditorControllers.set(knInput, controller);

            // Remove the Redactor toolbars that are now unused.
            document.querySelectorAll('.redactor-toolbar, .redactor-toolbar-tooltip, .redactor-air, .redactor-dropdown, [id^="redactor-toolbar-"]').forEach((el) => el.remove());
        } catch (err) {
            console.error("Failed to load Quill editor, reverting to Knack Redactor editor:", err);
            knackEditor.classList.remove(CLASS_HIDDEN);
            editorHost.remove();
        }
    });

    return richInputs.length;
}

/** Stops KTL's long-click handling when the Quill editor is used. Installed once, the first time an editor is mounted. */
function ensureQuillMousedownGuard() {
    if (ensureQuillMousedownGuard.done) return;
    ensureQuillMousedownGuard.done = true;
    document.addEventListener('mousedown', function (e) {
        const isQuillClick = document.activeElement?.closest('.ql-editor') || e.target.closest('.ql-editor, .ql-toolbar, .ql-container');
        // Toolbar pickers need their clicks.
        const isPickerClick = e.target.closest('.ql-picker, .ql-picker-label, .ql-picker-options, .ql-picker-item');
        if (isQuillClick && !isPickerClick) e.stopImmediatePropagation();
    }, true); // Capture phase
}


const gridTruncationControllers = new WeakMap();
const gridTruncationCells = new WeakMap();

/**
 * Adds expandable previews to grid columns, retaining the original content nodes.
 * Also available through the _trunk view keyword when the app's keyword handler calls
 * truncateColumnsInGrid.fromKeywords(view, keywords). Each group accepts a field ID
 * and an optional character limit: _trunk=[field_1234] defaults to 75 characters;
 * _trunk=[field_1234,150],[field_5678] configures multiple columns independently.
 * Keyword usage observes subsequent content updates; direct calls remain one-shot
 * unless options.observe is true. Previews retain basic formatting and clickable links.
 * @param {string} viewId - Rendered view ID.
 * @param {Object} fieldThresholds - Character limits mapped to field IDs, e.g. {75: [1234]}.
 * @param {Object} [options={}] - Set observe to true to follow subsequent DOM updates.
 * @returns {Object|undefined} Controller with refresh and disconnect methods.
 */
function truncateColumnsInGrid(viewId, fieldThresholds, options = {}) {
    const root = document.getElementById(viewId);
    if (!root) return;
    let controller = gridTruncationControllers.get(root);
    if (!controller) {
        const limits = new Map();
        let observing = false;
        let selector = '';
        const observer = new MutationObserver((mutations) => {
            if (!root.isConnected) return disconnect();
            const relevant = mutations.some(({ target, addedNodes }) => {
                const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
                if (element?.closest('.trunk-preview, .trunk-toggle')) return false;
                return element?.closest(selector) || Array.from(addedNodes).some(node =>
                    node.nodeType === Node.ELEMENT_NODE && (node.matches(selector) || node.querySelector(selector)));
            });
            if (relevant) refresh();
        });
        // Observe only ancestor child lists, so removing a view/scene releases its observer.
        const removalObserver = new MutationObserver(() => {
            if (!root.isConnected) disconnect();
        });

        /** Stops observation without changing the displayed content. @returns {void} */
        function disconnect() {
            observing = false;
            observer.disconnect();
            removalObserver.disconnect();
        }

        /** Rebuilds changed previews while excluding our own mutations. @returns {void} */
        function refresh() {
            observer.disconnect();
            try {
                for (const [fieldId, limit] of limits) {
                    root.querySelectorAll(`td.${fieldId}, td[data-field-key="${fieldId}"]`).forEach(cell => {
                        const columnIndex = cell.dataset.columnIndex;
                        const content = Array.from(cell.children).find(child => child.classList.contains(`col-${columnIndex}`)) || cell;
                        renderGridTruncation(content, limit);
                    });
                }
            } finally {
                if (observing) observer.observe(root, { childList: true, characterData: true, subtree: true });
            }
        }

        /**
         * Merges column limits and optionally enables observation.
         * @param {Map<string, number>} fields - Validated column limits.
         * @param {boolean} observe - Whether to observe updates.
         * @returns {void}
         */
        function configure(fields, observe) {
            fields.forEach((limit, field) => limits.set(field, limit));
            selector = Array.from(limits.keys()).map(field => `td.${field}, td[data-field-key="${field}"]`).join(',');
            if (observe && !observing && selector) {
                observing = true;
                for (let parent = root.parentNode; parent; parent = parent.parentNode) {
                    removalObserver.observe(parent, { childList: true });
                }
            }
            refresh();
        }
        controller = { configure, refresh, disconnect };
        gridTruncationControllers.set(root, controller);
    }
    const fields = new Map();
    Object.entries(fieldThresholds || {}).forEach(([value, ids]) => {
        const limit = Number(value);
        if (!Number.isSafeInteger(limit) || limit <= 0) return;
        (Array.isArray(ids) ? ids : [ids]).forEach(id => {
            const field = knackNavigator.normalizeFieldId(id);
            if (field) fields.set(field, limit);
        });
    });
    controller.configure(fields, options.observe === true);
    return controller;
}

/**
 * Renders a preview without duplicating Knack connection attributes or live controls.
 * @param {HTMLElement} content - Column content wrapper (or the cell itself).
 * @param {number} limit - Maximum preview character count, excluding the ellipsis.
 * @returns {void}
 */
function renderGridTruncation(content, limit) {
    const previous = gridTruncationCells.get(content);
    const intact = previous && previous.full.parentNode === content;
    if (intact && previous.limit === limit && previous.html === previous.full.innerHTML
        && previous.preview.parentNode === content && previous.button.parentNode === content
        && content.childNodes.length === 3) return;

    const expanded = intact && previous.button.getAttribute('aria-expanded') === 'true';
    if (intact) previous.full.replaceWith(...previous.full.childNodes);
    previous?.preview.remove();
    previous?.button.remove();
    gridTruncationCells.delete(content);
    // Editing widgets and media do not have a useful character-based preview.
    if (content.querySelector('input, textarea, select, button, iframe, img, video, audio, script, style')) return;

    const preview = document.createElement('div');
    preview.className = 'trunk-preview';
    let length = 0;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    /**
     * Copies text, basic formatting and link destinations, excluding IDs and Knack metadata.
     * @param {Node} source - Original node.
     * @param {Node} target - Preview parent.
     * @returns {void}
     */
    function copyPreview(source, target) {
        if (source.nodeType === Node.TEXT_NODE) {
            const characters = Array.from(segmenter.segment(source.textContent), item => item.segment);
            if (length < limit) target.append(document.createTextNode(characters.slice(0, limit - length).join('')));
            length += characters.length;
        } else if (source.nodeType === Node.ELEMENT_NODE) {
            if (source.hidden || source.getAttribute('aria-hidden') === 'true' || source.style.display === 'none') return;
            const tag = source.tagName.toLowerCase();
            const block = /^(br|p|div|li|h[1-6])$/.test(tag);
            if (block && length) length += 1;
            const copy = document.createElement(/^(a|br|p|div|ul|ol|li|strong|b|em|i|u|s|span)$/.test(tag) ? tag : 'span');
            if (tag === 'a') {
                // Keep native navigation (including keyboard and open-in-new-tab actions)
                // without duplicating connection IDs or application selector metadata.
                ['href', 'target', 'rel', 'title', 'download', 'hreflang', 'referrerpolicy'].forEach(attribute => {
                    if (source.hasAttribute(attribute)) copy.setAttribute(attribute, source.getAttribute(attribute));
                });
            }
            if (length < limit) target.append(copy);
            source.childNodes.forEach(child => copyPreview(child, copy));
        }
    }
    content.childNodes.forEach(node => copyPreview(node, preview));
    if (length <= limit) return;
    preview.append(document.createTextNode('…'));

    const full = document.createElement('div');
    full.className = 'trunk-full';
    full.append(...content.childNodes);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-expand trunk-toggle';
    button.style.cssText = 'background:none;border:0;padding:0;font:inherit;color:#0645ad;text-decoration:underline;cursor:pointer';
    /** Applies the expansion state to both content and button. @param {boolean} open - Expanded state. @returns {void} */
    function setExpanded(open) {
        full.hidden = !open;
        full.style.display = open ? '' : 'none';
        preview.hidden = open;
        preview.style.display = open ? 'none' : '';
        button.setAttribute('aria-expanded', String(open));
        button.textContent = open ? 'View less' : 'View more';
    }
    button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(button.getAttribute('aria-expanded') !== 'true');
    });
    button.addEventListener('mousedown', event => event.stopPropagation());
    setExpanded(Boolean(expanded));
    content.append(preview, full, button);
    gridTruncationCells.set(content, { preview, full, button, limit, html: full.innerHTML });
}

/**
 * Applies _trunk=[field_1234],[field_5678,150] using parsed KTL keyword groups.
 * @param {Object} view - Knack view metadata.
 * @param {Object} keywords - Parsed view keywords.
 * @returns {Object|undefined} Grid truncation controller.
 */
truncateColumnsInGrid.fromKeywords = function (view, keywords) {
    if (view?.type !== 'table' || !keywords?._trunk) return;
    const fields = new Map();
    keywords._trunk.forEach(entry => {
        if (entry.options && !ktl.core.hasRoleAccess(entry.options)) return;
        (entry.params || []).forEach(params => {
            if (!Array.isArray(params) || params.length < 1 || params.length > 2) return;
            const field = knackNavigator.normalizeFieldId(params[0]);
            const limit = params.length === 1 ? 75 : Number(params[1]);
            if (field && Number.isSafeInteger(limit) && limit > 0) fields.set(field, limit);
        });
    });
    if (!fields.size) return;
    const thresholds = {};
    fields.forEach((limit, field) => (thresholds[limit] ||= []).push(field));
    return truncateColumnsInGrid(view.key, thresholds, { observe: true });
};
