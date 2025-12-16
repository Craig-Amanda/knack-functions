//Global Const
const CLASS_HIDDEN = 'ktlHidden';
const CLASS_DISPLAY_NONE = 'ktlDisplayNone';
const INPUT_CHECKBOX_SELECTOR = 'input[type="checkbox"]';
const INPUT_RADIO_SELECTOR = 'input[type="radio"]';
const INPUT_CHECKBOX_CHECKED_SELECTOR = `${INPUT_CHECKBOX_SELECTOR}:checked`;
const INPUT_RADIO_CHECKED_SELECTOR = `${INPUT_RADIO_SELECTOR}:checked`;
const HEADER_CHECKBOX_SELECTOR = 'th input[type="checkbox"]';
const CLASS_DISABLED = 'disabled';
console.log('KnackApps/ARC Beta 1.0 - knackFunctions.js loaded.');
//jQuery extensions - BEGIN
//Searches a selector for text like : contains, but with an exact match, and after a spaces trim.
$.expr[':'].textEquals = function (el, i, m) {
    let searchText = m[3];
    let elementText = $(el).text().replace('*', '').trim(); //Remove * for Required fields.
    return elementText === searchText;
}

const evaluate = a => operator => b => { //an example of currying evaluate(oxygenField)('<')(90))
    switch (operator) {
        case '+': return a + b;
        case '-': return a - b;
        case '/': return a / b;
        case '*': return a * b;
        case '>': return a > b;
        case '>=': return a >= b;
        case '<': return a < b;
        case '<=': return a <= b;
        case '==': return a == b;
        case '===': return a === b;
        case '!=': return a != b;
        case '!==': return a !== b;
        case '%': return a % b;
        default: return 'Invalid operation';
    }
}

/** Get a finite number from an input element (or selector).
 * If `stripNonNumeric` is true, all characters except digits, '.', '+', and '-' are removed before parsing.
 * Returns NaN if the element is missing or the result is not a finite number.
 * @param {string|HTMLElement} selOrEl - A CSS selector string or an element with a `.value` property.
 * @param {boolean} [stripNonNumeric=false] - Whether to strip non-numeric characters before parsing.
 * @returns {number} A finite number, or NaN if parsing fails.*/
function getNumericValue(selOrEl, stripNonNumeric = false) {
    let el;

    if (typeof selOrEl === 'string') {
        el = document.querySelector(selOrEl);
        if (!el) return NaN;
    } else if (selOrEl && typeof selOrEl === 'object' && 'value' in selOrEl) {
        el = selOrEl;
    } else {
        return NaN;
    }

    const raw = String(el.value ?? '').trim();
    const cleaned = stripNonNumeric ? raw.replace(/[^\d.+-]/g, '') : raw;
    const n = Number(cleaned);

    return Number.isFinite(n) ? n : NaN;
}

/**
 * Show or hide one or more elements.
 * @param {Element|NodeList|string|Array} elements - DOM element(s), selector, or array of elements/selectors.
 * @param {boolean} show - true to show, false to hide.
 */
function setVisibility(elements, show) {
    if (typeof elements === 'string') elements = document.querySelectorAll(elements);
    if (elements instanceof Element) elements = [elements];
    if (NodeList.prototype.isPrototypeOf(elements) || Array.isArray(elements)) {
        elements.forEach(el => {
            if (el) el.style.display = show ? '' : 'none';
        });
    }
}

/**
 * Show or hide elements based on a condition.
 * @param {Element|NodeList|string|Array} elements - DOM element(s), selector, or array of elements/selectors.
 * @param {Function|boolean} condition - Boolean or function returning boolean.
 */
function showIf(elements, condition) {
    const result = (typeof condition === 'function') ? condition() : condition;
    setVisibility(elements, !!result);
}

/**
 * Toggle element(s) visibility based on a condition.
 * @param {Element|NodeList|string|Array} elements - DOM element(s), selector, or array of elements/selectors.
 * @param {Function|boolean} [condition] - If provided, toggles to that state; if omitted, toggles current state.
 */
function toggleVisibility(elements, condition) {
    if (typeof elements === 'string') elements = document.querySelectorAll(elements);
    if (elements instanceof Element) elements = [elements];
    if (NodeList.prototype.isPrototypeOf(elements) || Array.isArray(elements)) {
        elements.forEach(el => {
            if (!el) return;
            let show;
            if (typeof condition === 'undefined') {
                show = el.style.display === 'none';
            } else {
                show = (typeof condition === 'function') ? condition() : !!condition;
            }
            el.style.display = show ? '' : 'none';
        });
    }
}

/**
 * Enhanced Quill Rich Text Editor for Knack Replaces Knack's Redactor editor with Quill.js
 */

/**
 * QuillEditor React component with optimized rendering
 */
function QuillEditor({ value, onChange, modules, theme = "snow", readOnly = false }) {
    const editorRef = React.useRef(null);
    const quillRef = React.useRef(null);

    // Initialize Quill instance
    React.useEffect(() => {
        if (!editorRef.current || !window.Quill || quillRef.current) return;

        // Create new Quill instance
        quillRef.current = new window.Quill(editorRef.current, {
            theme,
            modules,
            readOnly,
        });

        // Find the toolbar element through various fallback methods
        const toolbar = [
            editorRef.current.previousSibling,
            editorRef.current.parentNode?.querySelector('.ql-toolbar'),
            document.querySelector('.ql-toolbar')
        ].find(el => el?.classList?.contains('ql-toolbar'));

        // Detect Mac or Windows for shortcut display
        function getModifierKey() {
            return /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
        }

        if (toolbar) {
            const modifierKey = getModifierKey();
            const tooltips = [
                { selector: 'button.ql-bold', tip: `Bold (${modifierKey}+B)` },
                { selector: 'button.ql-italic', tip: `Italic (${modifierKey}+I)` },
                { selector: 'button.ql-underline', tip: `Underline (${modifierKey}+U)` },
                { selector: 'button.ql-link', tip: `Insert Link (${modifierKey}+K)` },
                { selector: 'button.ql-image', tip: 'Insert Image' },
                { selector: 'button.ql-code-block', tip: 'Code Block' },
                { selector: 'button.ql-blockquote', tip: 'Blockquote' },
                { selector: 'button.ql-clean', tip: 'Remove Formatting' },
                { selector: 'button.ql-list[value="ordered"]', tip: `Numbered List (${modifierKey}+Shift+7)` },
                { selector: 'button.ql-list[value="bullet"]', tip: `Bullet List (${modifierKey}+Shift+8)` },
                { selector: '.ql-color', tip: 'Text Color' },
                { selector: '.ql-background', tip: 'Background Color' },
                { selector: 'button.ql-script[value="sub"]', tip: `Subscript (${modifierKey}+,)` },
                { selector: 'button.ql-script[value="super"]', tip: `Superscript (${modifierKey }+.)` },
                { selector: '.ql-align', tip: 'Align' }
            ];

            tooltips.forEach(({ selector, tip }) => {
                toolbar.querySelectorAll(selector).forEach(btn => {
                    btn.title = tip;
                });
            });

            // Add tooltips for each align option in the dropdown
            const alignPicker = toolbar.querySelector('.ql-align.ql-picker');
            if (alignPicker) {
                const alignOptions = alignPicker.querySelectorAll('.ql-picker-item');
                alignOptions.forEach(option => {
                    switch (option.getAttribute('data-value')) {
                        case null:
                            option.title = 'Align Left';
                            break;
                        case 'center':
                            option.title = 'Align Center';
                            break;
                        case 'right':
                            option.title = 'Align Right';
                            break;
                        case 'justify':
                            option.title = 'Justify';
                            break;
                    }
                });
            }
        }

        // Listen for text changes
        quillRef.current.on('text-change', () => {
            const html = editorRef.current.querySelector('.ql-editor').innerHTML;
            onChange && onChange(html);
        });

        // Cleanup
        return () => {
            if (quillRef.current) {
                quillRef.current.off('text-change');
                quillRef.current = null;
            }
        };
    }, [modules, theme, readOnly]);

    // Handle external value changes
    React.useEffect(() => {
        if (
            !quillRef.current ||
            value === quillRef.current.root.innerHTML ||
            quillRef.current.hasFocus()
        ) return;

        quillRef.current.clipboard.dangerouslyPasteHTML(value || '');
    }, [value]);

    // Handle readOnly changes
    React.useEffect(() => {
        if (quillRef.current) {
            quillRef.current.enable(!readOnly);
        }
    }, [readOnly]);

    return React.createElement('div', { ref: editorRef });
}

/**
 * Custom Quill icon definitions for lists
 */
function initializeQuillIcons() {
    if (!(window.Quill?.imports?.['ui/icons'])) return;

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
            <div class="ql-modal-content">
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
                    <input type="url" id="ql-link-url" placeholder="https://example.com" value="${url}" required>
                    <small>
                        If you omit https:// it will be added automatically.
                    </small>
                </label>
                <label>
                    Link Text:
                    <input type="text" id="ql-link-label" placeholder="Link text" value="${label}" required>
                </label>
            `;
            unlinkBtn.style.display = '';
        } else if (type === 'image') {
            title.textContent = 'Insert Image';
            fields.innerHTML = `
                <label>
                    Image URL:
                    <input type="url" id="ql-image-url" placeholder="https://example.com/image.jpg" value="${url}" required>
                </label>
            `;
            unlinkBtn.style.display = 'none';
        }

        modal.style.display = 'flex';

        // Set up event handlers
        saveBtn.onclick = () => {
            if (type === 'link') {
                let urlVal = document.getElementById('ql-link-url').value.trim();
                let labelVal = document.getElementById('ql-link-label').value.trim();
                if (urlVal && labelVal) {
                    if (!/^https?:\/\//i.test(urlVal)) urlVal = 'https://' + urlVal;
                    onSave(urlVal, labelVal);
                    modal.style.display = 'none';
                }
            } else if (type === 'image') {
                let urlVal = document.getElementById('ql-image-url').value.trim();
                if (urlVal) {
                    onSave(urlVal);
                    modal.style.display = 'none';
                }
            }
        };

        unlinkBtn.onclick = () => {
            onUnlink && onUnlink();
            modal.style.display = 'none';
        };

        cancelBtn.onclick = () => {
            onCancel && onCancel();
            modal.style.display = 'none';
        };
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
                    let savedRange = quill.getSelection();

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

/**
 * Main function to replace Knack's rich text editor with Quill
 */
function replaceKnackRichTextWithQuillEditor(viewId, options = {}) {
    // Check for required dependencies
    if (!window.React || !window.ReactDOM || !window.Quill) {
        console.warn("React or Quill not loaded, using Knack Redactor editor.");
        return;
    }

    // Initialize Quill icons
    initializeQuillIcons();

    // Configure Quill
    const quillModules = createQuillModules();

    // Get container element
    const container = viewId ? document.getElementById(viewId) : document;
    if (!container) return;

    // Get all rich text inputs in container
    const richInputs = container.querySelectorAll?.('.kn-input-rich_text') ||
        document.querySelectorAll('.kn-input-rich_text');

    if (!richInputs.length) return;

    // Process each rich text input
    richInputs.forEach((knInput, idx) => {
        // Idempotency guard: skip if we've already mounted a Quill editor for this input
        if (knInput.dataset.quillMounted === 'true') return;
        const knackEditor = knInput.querySelector('.redactor-editor');
        const textarea = knInput.querySelector('textarea.rich_text');
        if (!knackEditor || !textarea) return;

        // Move label above the new editor
        const label = knInput.querySelector('label.kn-label');
        let detachedLabel = null;
        if (label) {
            detachedLabel = label.cloneNode(true);
            label.remove();
        }

        // Create or get React container
        const containerId = `${viewId || 'global'}-${idx}`;
        let reactDiv = knInput.parentNode.querySelector(`.my-react-editor[data-for="${knInput.id}"]`);

        if (!reactDiv) {
            reactDiv = document.createElement('div');
            reactDiv.className = 'my-react-editor';
            reactDiv.id = `my-react-editor-${containerId}`;
            reactDiv.setAttribute('data-for', knInput.id);

            knInput.parentNode.insertBefore(reactDiv, knInput);
            if (detachedLabel) {
                reactDiv.parentNode.insertBefore(detachedLabel, reactDiv);
            }
        }

        // Replace editor
        try {
            // Hide original editor
            knackEditor.classList.add(CLASS_HIDDEN);

            // Render Quill editor
            if (!reactDiv._reactRootContainer) {
                reactDiv._reactRootContainer = ReactDOM.createRoot(reactDiv);
            }

            reactDiv._reactRootContainer.render(
                React.createElement(QuillEditor, {
                    theme: options.theme || "snow",
                    value: textarea.value,
                    modules: options.modules || quillModules,
                    readOnly: options.readOnly || false,
                    onChange: (content) => {
                        const isEmpty = !content || content.replace(/<[^>]+>/g, '').trim() === '';                        textarea.value = isEmpty ? '' : content;
                        if (knackEditor) {
                            knackEditor.innerHTML = isEmpty ? '' : content;
                        }
                        // Trigger events to notify Knack
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        textarea.blur();
                    }
                })
            );

            // Mark this input as processed to avoid duplicate toolbars on subsequent calls
            knInput.dataset.quillMounted = 'true';

            // Clean up old editor elements
            document.querySelectorAll('.redactor-toolbar, .redactor-toolbar-tooltip, .redactor-air, .redactor-dropdown')
                .forEach(el => el.remove());
            document.querySelectorAll('[id^="redactor-toolbar-"]')
                .forEach(el => el.remove());

        } catch (err) {
            console.error("Failed to load QuillEditor, reverting to Knack Redactor editor:", err);

            // Revert to original editor
            const revertContainer = container.querySelectorAll ? container : document;
            revertContainer.querySelectorAll('.redactor-editor')
                .forEach(editor => editor.classList.remove(CLASS_HIDDEN));
            revertContainer.querySelectorAll('.my-react-editor')
                .forEach(div => div.remove());
        }
    });

    return richInputs.length; // Return count of replaced editors
}

// Prevent KTL long click when Quill editor is focused or clicked
document.addEventListener('mousedown', function(e) {
    const isQuillFocused = document.activeElement && document.activeElement.closest('.ql-editor');
    const isQuillClick = e.target.closest('.ql-editor, .ql-toolbar, .ql-container');

    // Don't block clicks on toolbar pickers - they need to work!
    const isPickerClick = e.target.closest('.ql-picker, .ql-picker-label, .ql-picker-options, .ql-picker-item');

    if ((isQuillFocused || isQuillClick) && !isPickerClick) {
        e.stopImmediatePropagation();
    }
}, true); // Use capture phase

/**
 * Adds a "View More / View Less" toggle to table cells in a given view and field(s) if their text exceeds a threshold.
 * @param {string} viewId - The ID of the view containing the table.
 * @param {Object} fieldThresholds - Object where keys are character thresholds and values are arrays of field IDs.
 *   Example: { 75: [4907, 4915], 120: [4920] }
 */
function truncateColumnsInGrid(viewId, fieldThresholds) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    // Iterate over each threshold and its associated field IDs
    Object.entries(fieldThresholds).forEach(([thresholdStr, fieldIds]) => {
        const threshold = parseInt(thresholdStr, 10);
        const ids = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
        ids.forEach(fieldId => {
        const selector = `td.field_${fieldId}`;
        const tempDiv = document.createElement('div');
        viewElement.querySelectorAll(selector).forEach(container => {
            const fullHTML = container.innerHTML;

            // Replace <br> and block tags with a space before extracting text
            let htmlWithSpaces = fullHTML
                .replace(/<\/(p|div|li|h[1-6]|tr|td|th)>/gi, ' ')
                .replace(/<(p|div|li|h[1-6]|tr|td|th)[^>]*>/gi, ' ')
                .replace(/<\/(p|div|li|h[1-6]|tr|td|th)>/gi, ' ')
                .replace(/<(ul|ol|table|thead|tbody|tfoot|section|article)[^>]*>/gi, ' ');

            // Create a temporary element to get textContent with spaces
            tempDiv.innerHTML = htmlWithSpaces;
            const textContent = tempDiv.textContent;

            if (textContent.length > threshold) {
                const truncatedText = textContent.substring(0, threshold) + '...';
             const truncatedSpan = document.createElement('span');
                    truncatedSpan.textContent = truncatedText;

                    const fullSpan = document.createElement('span');
                    fullSpan.innerHTML = fullHTML;
                    fullSpan.style.display = 'none';

                    const toggleLink = document.createElement('a');
                    toggleLink.href = '#';
                    toggleLink.className = 'text-expand';
                    toggleLink.textContent = 'View More';

                    toggleLink.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent cell click event
                        const isHidden = fullSpan.style.display === 'none';
                        fullSpan.style.display = isHidden ? '' : 'none';
                        truncatedSpan.style.display = isHidden ? 'none' : '';
                        toggleLink.textContent = isHidden ? 'View Less' : 'View More';
                    });

                    // Clear and append
                    container.innerHTML = '';
                    container.appendChild(truncatedSpan);
                    container.appendChild(fullSpan);
                    container.appendChild(document.createTextNode(' '));
                    container.appendChild(toggleLink);
                }
            });
        });
    });
}

/**
 * Selects all text in input elements when they receive focus
 * @param {string} viewId - The ID of the view containing input elements to modify
 * @param {string} [selector='.kn-input-number input'] - Optional CSS selector to target specific inputs within the view
 */
function selectTextOnFocus(viewId, selector = '.kn-input-number input') {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const inputs = viewElement.querySelectorAll(selector);

    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            // Use setTimeout to ensure selection happens after the browser's default focus behavior
            setTimeout(() => {
                this.select();
            }, 0);
        });
    });
}

/**
 * Simple debounce function to prevent rapid consecutive calls
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Adds event listeners to an element or selector for input-related events.
 * - Supports multiple event types (default: 'change')
 * - Supports event delegation (optional)
 * - Handles NodeList, single element, or selector string
 * - Passes the event and element to the callback
 *
 * @param {HTMLElement|NodeList|string} target - Element, NodeList, or selector string
 * @param {Function} callback - Function(event, element) to call on event
 * @param {Object} [options] - Optional settings:
 *   - {string|string[]} events: Event(s) to listen for (default: 'change')
 *   - {string} delegate: Selector for event delegation (optional)
 *  - {boolean} runOnInit: If true, runs callback on initial load for each element (default: false)
 */
function addInputEventListener(target, callback, options = {}) {
    const {
        events = 'change',
        delegate = null,
        runOnInit = false
    } = options;

    const eventList = Array.isArray(events) ? events : [events];
    const attachedElements = [];

    // Helper to attach event(s) to a single element
    function attach(el) {
        eventList.forEach(eventType => {
            if (delegate) {
                el.addEventListener(eventType, function(e) {
                    const possibleTargets = el.querySelectorAll(delegate);
                    const targetEl = e.target.closest(delegate);
                    if (targetEl && Array.from(possibleTargets).includes(targetEl)) {
                        callback(e, targetEl);
                    }
                });
            } else {
                el.addEventListener(eventType, function(e) {
                    callback(e, el);
                });
            }
        });
        // If this element has a jQuery UI datepicker attached, also wire its onSelect so
        // calendar selections trigger the same callback. Preserve any existing onSelect.
        try {
            if (window.jQuery && window.jQuery.fn && typeof window.jQuery.fn.datepicker === 'function') {
                const datepickerEl = $(el);
                // Only attach if this element already has a datepicker instance (jQuery UI adds class 'hasDatepicker')
                if (datepickerEl.hasClass && datepickerEl.hasClass('hasDatepicker')) {
                    let existingOnSelect = null;
                    try {
                        existingOnSelect = datepickerEl.datepicker('option', 'onSelect');
                    } catch (err) {
                        existingOnSelect = null;
                    }

                    datepickerEl.datepicker('option', 'onSelect', function (dateText, inst) {
                        // call previous handler if present
                        if (typeof existingOnSelect === 'function') {
                            try { existingOnSelect.call(this, dateText, inst); } catch (_) {}
                        }
                        // Create a small synthetic event-like object so callbacks expecting an Event can handle it
                        const syntheticEvent = { type: 'datepicker', dateText: dateText, target: el };
                        try { callback(syntheticEvent, el); } catch (_) {}
                    });
                }
            }
        } catch (e) {
            // Swallow any errors - non-critical enhancement
        }

        // Run callback on initial load if requested
        if (runOnInit) {
            callback(null, el);
        }

        attachedElements.push(el);
    }

    if (typeof target === 'string') {
        document.querySelectorAll(target).forEach(attach);
    } else if (NodeList.prototype.isPrototypeOf(target) || Array.isArray(target)) {
        target.forEach(attach);
    } else if (target instanceof Element) {
        attach(target);
    }

    return attachedElements;
}

/**
 * Enhance a jQuery UI datepicker/timepicker input to show month/year selectors, optional time bounds, and apply styling.
 * Safe no-op when required plugins are not present or the input lacks an initialized picker.
 *
 * @param {HTMLElement|string} inputOrSelector - Input element or selector for the date/time input
 * @param {Object} [opts] - Options
 * @param {('date'|'time'|'datetime')} [opts.mode='date'] - Apply to date only, time only, or both
 * @param {number} [opts.yearsBack=80] - Years back from current year in yearRange
 * @param {boolean} [opts.showButtonPanel=false] - Whether to show the datepicker button panel
 * @param {string|null} [opts.dateFormat=null] - Date format string for datepicker
 * @param {string|Date|null} [opts.minDate=null] - Minimum selectable date
 * @param {string|Date|null} [opts.maxDate=null] - Maximum selectable date
 * @param {boolean} [opts.waitForInit=false] - When true, retry applying until picker initializes or attempts are exhausted
 * @param {string|null} [opts.timeFormat='H:i'] - Time format string for timepicker
 * @param {string|Date|null} [opts.minTime=null] - Earliest selectable time (timepicker)
 * @param {string|Date|null} [opts.maxTime=null] - Latest selectable time (timepicker)
 * @param {Array<Array<string|Date>>|null} [opts.disableTimeRanges=null] - Disabled time ranges [[start, end], ...]
 * @param {number|null} [opts.step=null] - Minute step for timepicker
 * @param {Object|null} [opts.timepickerOptions=null] - Raw options forwarded to the timepicker plugin
 * @returns {boolean|Promise<boolean>} - true if enhancement applied, false otherwise (Promise when waitForInit)
 */
function enhanceDateTimePicker(inputOrSelector, opts = {}) {
    const defaults = {
        mode: 'date',
        changeMonth: true,
        changeYear: true,
        yearsBack: 80,
        showButtonPanel: false,
        dateFormat: null,
        minDate: null,
        maxDate: null,
        waitForInit: false,
        maxAttempts: 10,
        attemptInterval: 200,
        onApplied: null,
        timeFormat: 'H:i',
        minTime: null,
        maxTime: null,
        disableTimeRanges: null,
        step: null,
        timepickerOptions: null
    };

    const options = Object.assign({}, defaults, opts || {});
    const mode = String(options.mode || 'date').toLowerCase();
    const wantsDate = mode === 'date' || mode === 'datetime';
    const wantsTime = mode === 'time' || mode === 'datetime';

    const hasJquery = !!(window.jQuery && window.jQuery.fn);
    const hasDatepicker = hasJquery && typeof window.jQuery.fn.datepicker === 'function';
    const hasTimepicker = hasJquery && typeof window.jQuery.fn.timepicker === 'function';

    if (!hasJquery || (wantsDate && !hasDatepicker) || (wantsTime && !hasTimepicker)) {
        return options.waitForInit ? Promise.resolve(false) : false;
    }

    const resolveElements = () => {
        if (typeof inputOrSelector === 'string') return Array.from(document.querySelectorAll(inputOrSelector));
        if (NodeList.prototype.isPrototypeOf(inputOrSelector) || Array.isArray(inputOrSelector)) return Array.from(inputOrSelector);
        if (inputOrSelector instanceof Element) return [inputOrSelector];
        return [];
    };

    const els = resolveElements();
    if (!els.length) return options.waitForInit ? Promise.resolve(false) : false;

    // Inject datepicker styles only when date mode is requested and styles are absent
    if (wantsDate && !document.getElementById('knack-datepicker-styles')) {
        const style = document.createElement('style');
        style.id = 'knack-datepicker-styles';
        style.textContent = `
        /* Improve month/year select styling in jQuery UI datepicker */
        .ui-datepicker-title {
            display: flex;
        }
        .ui-datepicker select.ui-datepicker-month, .ui-datepicker select.ui-datepicker-year {
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid #cfcfcf;
            background: #fff;
            color: #222;
            font-size: 13px;
            margin-right: 6px;
            display: inline-block;
        }
        .ui-datepicker .ui-datepicker-header {
            padding: 6px 8px;
            background: #f5f6f7;
            border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        .ui-datepicker .ui-datepicker-calendar td a {
            border-radius: 4px;
            padding: 6px 8px;
        }
        .ui-datepicker .ui-datepicker-buttonpane {
            text-align: right;
            padding: 6px 8px;
        }
        `;
        document.head.appendChild(style);
    }

    const applyToElements = () => {
        let appliedAny = false;
        els.forEach(el => {
            try {
                const datepickerEl = $(el);
                if (!datepickerEl || !datepickerEl.hasClass) return;

                let appliedOnElement = false;

                if (wantsDate && datepickerEl.hasClass('hasDatepicker')) {
                    const currentYear = new Date().getFullYear();
                    const startYear = currentYear - Math.max(0, options.yearsBack);
                    const optObj = {
                        changeMonth: !!options.changeMonth,
                        changeYear: !!options.changeYear,
                        yearRange: `${startYear}:${currentYear}`,
                        showButtonPanel: !!options.showButtonPanel
                    };
                    if (options.dateFormat) optObj.dateFormat = options.dateFormat;
                    if (options.minDate !== null) optObj.minDate = options.minDate;
                    if (options.maxDate !== null) optObj.maxDate = options.maxDate;

                    datepickerEl.datepicker('option', optObj);
                    appliedOnElement = true;
                }

                if (wantsTime && typeof datepickerEl.timepicker === 'function') {
                    const timeOpts = {};
                    if (options.timeFormat) timeOpts.timeFormat = options.timeFormat;
                    if (options.minTime !== null) timeOpts.minTime = options.minTime;
                    if (options.maxTime !== null) timeOpts.maxTime = options.maxTime;
                    if (options.disableTimeRanges) timeOpts.disableTimeRanges = options.disableTimeRanges;
                    if (options.step) timeOpts.step = options.step;
                    if (options.timepickerOptions && typeof options.timepickerOptions === 'object') {
                        Object.assign(timeOpts, options.timepickerOptions);
                    }

                    if (datepickerEl.hasClass('ui-timepicker-input')) {
                        datepickerEl.timepicker('option', timeOpts);
                    } else {
                        datepickerEl.timepicker(timeOpts);
                    }

                    appliedOnElement = true;
                }

                if (appliedOnElement) {
                    appliedAny = true;
                    if (typeof options.onApplied === 'function') {
                        try { options.onApplied(el); } catch (e) { /* swallow */ }
                    }
                }
            } catch (err) {
                // ignore per-element failures
            }
        });
        return appliedAny;
    };

    if (!options.waitForInit) {
        return applyToElements();
    }

    // waitForInit: attempt to apply repeatedly until success or attempts exhausted
    return new Promise((resolve) => {
        let attempts = 0;
        const tryApply = () => {
            attempts += 1;
            const ok = applyToElements();
            if (ok) return resolve(true);
            if (attempts >= Math.max(1, options.maxAttempts)) return resolve(false);
            setTimeout(tryApply, Math.max(50, options.attemptInterval));
        };
        tryApply();
    });
}

/**
 * Waits for an element that matches the selector and optionally contains specific text to appear in the DOM
 * @param {Object} options - Configuration options
 * @param {string} options.selector - CSS selector to wait for
 * @param {function|string|Object} [options.textCondition=null] - Optional text content to match or custom condition callback
 *                                                If object: {text: string, exact: boolean}
 * @param {string} [options.returnType='element'] - Type of return: 'element', 'elements', 'empty' for just success
 * @param {number} [options.timeout=10000] - Maximum time to wait in milliseconds
 * @returns {Promise<Element|Element[]|boolean>} - Resolves with the element(s) or true, rejects on timeout
 */
async function waitSelector({
    selector,
    textCondition = null,
    returnType = 'element',
    timeout = 10000
}) {
    return new Promise((resolve, reject) => {
        // Declare observer variable at the top of the function scope
        let observer = null;
        let timeoutId = null;

        // Check if element already exists
        const checkForElement = () => {
            let result = null;
            // Process text condition to determine matching function
            let textMatch = null;
            let isExactMatch = false;

            if (textCondition) {
                if (typeof textCondition === 'string') {
                    textMatch = textCondition;
                    isExactMatch = false; // Default to includes for backward compatibility
                } else if (typeof textCondition === 'object' && textCondition !== null) {
                    textMatch = textCondition.text;
                    isExactMatch = !!textCondition.exact;
                }
            }

            // Function to check if element's text content matches condition
            const matchesText = (el) => {
                if (!textMatch) return true;
                const content = el.textContent.trim();
                return isExactMatch ? content === textMatch : content.includes(textMatch);
            };

            if (returnType === 'elements') {
                result = document.querySelectorAll(selector);
                if (result.length > 0) {
                    // Filter by text content if needed
                    if (textMatch) {
                        result = Array.from(result).filter(matchesText);
                        if (result.length === 0) return; // No matches, keep waiting
                    }

                    if (!textCondition || typeof textCondition === 'string' ||
                        typeof textCondition === 'object' || textCondition(result)) {
                        if (observer) observer.disconnect();
                        clearTimeout(timeoutId);
                        resolve(result);
                    }
                }
            } else {
                if (textMatch) {
                    // Find elements that match both selector and text content
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if (matchesText(el)) {
                            result = el;
                            break;
                        }
                    }
                } else {
                    result = document.querySelector(selector);
                }

                if (result) {
                    if (!textCondition || typeof textCondition === 'string' ||
                        typeof textCondition === 'object' || textCondition(result)) {
                        if (observer) observer.disconnect();
                        clearTimeout(timeoutId);
                        resolve(returnType === 'empty' ? true : result);
                    }
                }
            }
        };

        // Check immediately in case the element already exists
        checkForElement();

        // Set up a timeout to reject the promise if the element doesn't appear
        timeoutId = setTimeout(() => {
            if (observer) observer.disconnect();
            let textInfo = '';
            if (textCondition) {
                if (typeof textCondition === 'string') {
                    textInfo = ` with text: ${textCondition}`;
                } else if (typeof textCondition === 'object' && textCondition.text) {
                    textInfo = ` with ${textCondition.exact ? 'exact ' : ''}text: ${textCondition.text}`;
                }
            }
            reject(new Error(`Timeout waiting for selector: ${selector}${textInfo} after ${timeout}ms`));
        }, timeout);

        // Use MutationObserver to watch for DOM changes
        observer = new MutationObserver((mutations, obs) => {
            checkForElement();
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
    });
}

/**
 * Updates the "Add Option" button and default value for a Knack select field.
 * @param {HTMLElement} fieldEle - The field container element
 * @param {string} btnStr - The button label
 * @param {string} defaultVal - The default value for the select
 * @param {boolean} disableInitially - Whether to disable the button initially
 */
const updateOptions = (fieldEle, btnStr, defaultVal, disableInitially) => {
    // Find the .kn-add-option button
    const addOption = fieldEle.querySelector('.kn-add-option');
    if (!addOption) return;

    // Find the default option and container
    const defaultOpt = fieldEle.querySelector('.default');
    const container = fieldEle.querySelector('.chzn-container') || fieldEle.querySelector('.select');

    // Update button label and style
    addOption.textContent = btnStr;
    addOption.style.width = 'fit-content';

    // Handle disabling/enabling logic
    if (disableInitially) {
        addOption.classList.add(CLASS_DISABLED);
        if (container) {
            // Enable when user interacts with the select field
            const enableButton = () => {
                addOption.classList.remove(CLASS_DISABLED);
            };

            // Listen for multiple interaction events to ensure button gets enabled
            container.addEventListener('click', enableButton);

            // Also listen for the Chosen dropdown opening
            const searchInput = container.querySelector('.chzn-search input');
            if (searchInput) {
                searchInput.addEventListener('focus', enableButton);
                searchInput.addEventListener('input', enableButton);
            }

            // Listen for changes on the actual select element
            const select = fieldEle.querySelector('select');
            if (select) {
                select.addEventListener('change', enableButton);
                select.addEventListener('focus', enableButton);
            }
        }
    } else {
        // Insert before the first .control element if not already present
        const control = fieldEle.querySelector('.control');
        if (control && control.parentNode !== addOption.parentNode) {
            control.parentNode.insertBefore(addOption, control);
        }
    }

    // Set default value for the select
    if (defaultOpt) {
        defaultOpt.value = defaultVal;
    }

    // Add event listener for registration handler (one-time)
    addOption.addEventListener('mousedown', function handler(e) {
        waitSelector({ selector: 'li.kn-form-col', timeout: 3000 })
            .then(() => registrationHandler(e));
        addOption.removeEventListener('mousedown', handler);
    }, { once: true });
};

/** Get value from a detail field
 * @param {string} fieldID - ID of the field where the value is located.
 * @param {boolean} [returnHtml=false] - Whether to return HTML instead of plain text.
 * @returns {string|null} - The text or HTML content of the specified field. */
function getValueFromDetailBody(fieldID, returnHtml = false) {
    const fieldElement = document.querySelector(`.field_${fieldID} .kn-detail-body`);

    if (!fieldElement) {
        console.log(`Error: Element with field_${fieldID} not found.`);
        return null;
    }

    return returnHtml ? fieldElement.innerHTML.trim() : fieldElement.textContent.trim();
}

/**
 * Finds the index(es) of column header(s) in a table based on field ID(s)
 * @param {HTMLElement} viewElement - The parent view element containing the table
 * @param {number|string|Array<number|string>} fieldIds - One or more Knack field IDs to search for in the header
 * @returns {number|Array<number>} The zero-based index(es) of the column header(s), or -1 if not found
 * @example
 * const viewElement = document.getElementById('view_123');
 * const [colA, colB] = getIndexOfColumnHeader(viewElement, [1507, 1508]);
 * const colSingle = getIndexOfColumnHeader(viewElement, 1507);
 */
function getIndexOfColumnHeader(viewElement, fieldIds) {
    if (!viewElement) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: viewElement is undefined'), { fieldIds });
        return Array.isArray(fieldIds) ? fieldIds.map(() => -1) : -1;
    }
    if (typeof fieldIds === 'undefined' || fieldIds === null) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: fieldIds is undefined or null'), { viewElement });
        return -1;
    }

    const headerRow = viewElement.querySelector('table thead tr');
    if (!headerRow) {
        errorHandler.handle(new Error('getIndexOfColumnHeader: headerRow not found'), { viewElement, fieldIds });
        return Array.isArray(fieldIds) ? fieldIds.map(() => -1) : -1;
    }

    // Support single fieldId or array of fieldIds
    if (Array.isArray(fieldIds)) {
        return fieldIds.map(fieldId =>
            Array.from(headerRow.children).findIndex(child => child.classList.contains(`field_${fieldId}`))
        );
    }
    return Array.from(headerRow.children).findIndex(child => child.classList.contains(`field_${fieldIds}`));
}

/** Retrieves the rows of a table's tbody within a specified view and applies a callback to each row.
 * @param {string} viewId - The ID of the Knack view containing the table
 * @param {Function} callback - Function to execute on each row. Receives (index, rowElement) as arguments
 * @param {boolean} [includeHeader=false] - Whether to include header rows in the processing
 * @param {boolean} [includeGroup=false] - Whether to include group rows in the processing
 * @returns {void}
 * @example
 * getTableRows('view_123', (index, row) => {
 *   console.log(`Processing row ${index}:`, row);
 * }, true, false);
 */
function getAllTableRows(viewId, callback, includeHeader = false, includeGroup = false, excludeSelector = null) {
    if (!viewId) return;

    const tableElement = document.querySelector(`#${viewId} table`);
    if (!tableElement) return;

    // Start with body rows (excluding group rows)
    let tableRows = Array.from(tableElement.querySelectorAll('tbody tr:not(.kn-table-group)'));

    // Include header rows if specified
    if (includeHeader) {
        const headerRows = Array.from(tableElement.querySelectorAll('thead tr'));
        tableRows = [...headerRows, ...tableRows];
    }

    // Include group rows if specified
    if (includeGroup) {
        const groupRows = Array.from(tableElement.querySelectorAll('tbody tr.kn-table-group'));
        tableRows = [...tableRows, ...groupRows];
    }

    // Exclude rows matching the excludeSelector if provided
    if (excludeSelector) {
        tableRows = tableRows.filter(row => !row.matches(excludeSelector));
    }

    // Iterate over each row and execute the callback
    tableRows.forEach((row, index) => {
        callback(index, row);
    });
}

/** Update button color on form completion
 * @param {string} completedField - The field containing completed forms
 * @param {object} mappingObject - The mapping object for view IDs
 * @param {string} buttonColour - The color to set for the button */
function updateButtonColourOnFormComplete(completedField, mappingObject, buttonColour) {
    const formsCompleted = getValueFromDetail(completedField);
    if (!formsCompleted || !formsCompleted.length) return;

    const formsCompletedArray = formsCompleted.split(',');
    for (const form of formsCompletedArray) {
        const viewId = mappingObject[form.trim()];
        if (viewId) {
            ktl.core.waitSelector(`#view_${viewId} .view-header:has(.ktlHideShowButton), #view_${viewId} a.knViewLink`).then(() => {
                $(`#view_${viewId} .view-header:has(.ktlHideShowButton), #view_${viewId} a.knViewLink`).css('background-color', buttonColour);
            }).catch(error => {
                console.error(`Error waiting for selector in view_${viewId}:`, error);
            });
        }
    }
}

function removeElement (selector) {

    if (Array.isArray(selector)) {
        selector.forEach((element) => {
            removeElement(element);
        });
        return;
    }

    // Check if the selector is a jQuery object
    const element = selector instanceof jQuery ? selector : $(selector);
    element.remove();
};

function addClassToSelector (selector, classes) {
    if (Array.isArray(selector)) {
        selector.forEach((element) => {
            addClassToSelector(element, classes);
        });
        return;
    }

    const element = selector instanceof jQuery ? selector : $(selector);
    element.addClass(classes);
    return element;
};

function removeClassFromSelector (selector, classes) {
    if (Array.isArray(selector)) {
        selector.forEach((element) => {
            removeClassFromSelector(element, classes);
        });
        return;
    }

    const element = selector instanceof jQuery ? selector : $(selector);
    element.removeClass(classes);
    return element;
};

//Keydown event, with the convenient F2 as an example to debug or do other action.
$(document).keydown(function (e) {
    if (e.keyCode === 113) { // F2
        debugger;
    }
});

function escapeHTML(text) {
    return text.replace(/[&<>"']/g, function (match) {
        return `&#${match.charCodeAt(0)};`;
    });
}

/** Get checked row IDs from the grid
 * @param {string} viewId
 * @returns {string[]} Array of checked row IDs. */
function getCheckedRowIds(viewId) {
    return $(`#${viewId} tbody ${INPUT_CHECKBOX_CHECKED_SELECTOR}`).map(function() {
        return $(this).closest('tr').attr('id');
    }).get();
}

/** Get checked rows from the grid
 * @param {string} viewId
 * @returns {JQuery<HTMLElement>[]} Array of checked rows. */
function getCheckedRows(viewId) {
    return $(`#${viewId} tbody ${INPUT_CHECKBOX_CHECKED_SELECTOR}`).map(function() {
        return $(this).closest('tr');
    }).get();
}

/** Shows a notification and returns it's ID.
 * @param {jQuery} inputElement
 * @param {string} message - The message to display in the notification.
 * @param {string} backgroundColor - The background color of the notification.
 * @param {number} timeout - Duration in milliseconds before the notification is automatically removed.
 * @returns {string} - An ID for the notification.
 */
function showInputNotification(inputElement, message, backgroundColor, timeout = null) {
    const notificationId = `notif_${Date.now()}`; // Unique ID based on timestamp
    const knInputElement = inputElement.closest('.kn-input');
    const notification = $('<div>', {
        id: notificationId,
        class: 'input-notification',
        text: message,
        css: { backgroundColor }
    }).insertAfter(knInputElement);

    // Automatically remove the notification after a timeout
    if (timeout !== null) {
        setTimeout(() => {
            removeInputNotification(notificationId);
        }, timeout);
    }

    return notificationId;
}

/* Updates the content of an existing notification.
    * @param {string} notificationId - The ID of the notification to update.
    * @param {string} newMessage - The new message to display. */
function updateInputNotification(notificationId, newMessage) {
    $(`#${notificationId}`).text(newMessage);
}

/** Removes a notification by its ID.
 * @param {string} notificationId - The ID of the notification to remove. */
function removeInputNotification(notificationId) {
    $(`#${notificationId}`).remove();
}

// Returns a Promise that resolves after "ms" Milliseconds
const API_TIMER = (ms) => new Promise((res) => setTimeout(res, ms));

const getMax = object => {
    return Object.keys(object).filter(x => {
        return object[x] == Math.max.apply(null,
        Object.values(object));
    });
};

/** Get the textAreas from the views
* @param {string} viewId - view.key of the view */
function getTextArea(viewId) { //knack
    return $(`#${viewId} textarea`);
}

/** Get the ID of inputs NOT SELECTS
* @param {selector} input - selector */
function getFieldId(input) { //knack
    return input.attr('id');
}

/** Update user fields and date fields in the form.
    * @param {string} viewId - The ID of the view. */
function updateFieldsInArrays(viewId) {
    const viewSelector = $(`#${viewId}`).length > 0 ? viewId : `connection-form-view:has(input[value="${viewId}"])`;
    const userFieldIds = FIELD_IDS_FOR_LOGGED_IN_USER.filter(fieldId => $(`#${viewSelector} #kn-input-field_${fieldId}`).length > 0);
    const dateFieldIds = SET_CURRENT_DATE_FIELDS.filter(fieldId => $(`#${viewSelector} #kn-input-field_${fieldId}`).length > 0);

    if (userFieldIds.length > 0) {
        updateUserFields(viewId, userFieldIds);
    }

    if (dateFieldIds.length > 0) {
        updateDateFields(viewId, dateFieldIds);
    }
}

/** Update user fields with the logged-in user's name.
 * @param {string} viewId - The ID of the view.
 * @param {Array} fieldIds - Array of user field IDs.*/
function updateUserFields(viewId, fieldIds) {
    const userName = Knack.getUserAttributes().name;
    fieldIds.forEach(foundFieldId => {
        const userField = $(`#kn-input-field_${foundFieldId}`);
        const userInput = userField.find('input');

        userField.addClass(CLASS_HIDDEN);
        userInput.val(userName);
    });
}

/** Update date fields with the current date and time.
 * @param {string} viewId - The ID of the view.
 * @param {Array} fieldIds - Array of date field IDs.*/
function updateDateFields(viewId, fieldIds) {
    const currentDate = new Date();
    fieldIds.forEach(foundFieldId => {
        if ($('#view_3404').length > 0) return false; // Submit Support Request Form

        const dateField = $(`#${viewId}-field_${foundFieldId}`);
        const timeField = $(`#${viewId}-field_${foundFieldId}-time`);

        if (!dateField.val()) {
            dateField.val(getDateUKFormat(currentDate));
        }

        if (!timeField.val()) {
            const timeString = `${currentDate.getHours()}:${currentDate.getMinutes()}`;
            timeField.val(timeString);
        }
    });
}

/**
 * Copies text to clipboard and shows a notification.
 * @param {HTMLElement} element - The element to attach the notification to.
 * @param {string} text - The text to copy.
 * @param {string} message - The message to show in the notification.
 */
function copyTextToClipboard(element, text, message) {
    if (!navigator.clipboard) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(textarea);
    } else {
        navigator.clipboard.writeText(text);
    }

    // Ensure parent is positioned for notification
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
        delay: 1000
    });

    // Optional: adjust notification position for non-table views
    if (parent && !parent.closest('table')) {
        const notif = parent.querySelector('.ca-notification-copy');
        if (notif) {
            notif.style.left = '120px';
            notif.style.opacity = '0.85';
        }
    }
}

/*** Adds click-to-copy functionality to all .kn-detail-body elements within a view.
 * @param {HTMLElement} viewEle - The DOM element of the view.
 * @param {Object} [options] - Optional configuration object.
 * @param {boolean} [options.addIcon=true] - Whether to add a 📋 icon next to the copied text.
 * @param {string} [options.message='Text Copied'] - The notification message to show.
 * @param {string[]} [options.excludeFieldIds=[]] - Array of field to exclude (e.g. ['field_9389']).
 * @param {boolean} [options.includeLabels=false] - Whether to prepend the field label to the copied text.
 */
function addCopyToDetails(viewEle, options = {}) {
    if (!viewEle) return;

    const {
        addIcon = true,
        message = 'Text Copied',
        excludeFieldIds = [],
        includeLabels = false
    } = options;
    const details = viewEle.querySelectorAll('.kn-detail-body');

    details.forEach(detail => {

        if (detail.closest('.kn-details-link')) return; // skip if a link

        const fieldWrapper = detail.closest('[class*="field_"]');
        if (fieldWrapper) {  // Skip if inside an excluded field
            const fieldClasses = Array.from(fieldWrapper.classList);
            if (fieldClasses.some(cls => excludeFieldIds.includes(cls))) return;
        }

        const originalText = detail.textContent.trim();
        if (!originalText) return;

        // Prevent duplicate setup
        if (detail.dataset.copyEnabled === 'true') return;
        detail.dataset.copyEnabled = 'true';

        // Get label text if requested
        let finalText = originalText;
        if (includeLabels && fieldWrapper) {
            const fieldClass = [...fieldWrapper.classList].find(cls => cls.startsWith('field_'));
            let labelText = '';

            if (fieldClass) {
                const labelFieldWrapper = viewEle.querySelector(`.kn-label-top.${fieldClass}, .kn-detail.${fieldClass}`);
                const labelEl = labelFieldWrapper?.querySelector('.kn-detail-label');
                labelText = labelEl?.textContent.trim() || '';
                console.log(`Label wrapper for ${fieldClass}:`, labelEl);
            }

            if (labelText) {
                finalText = `${labelText}: ${originalText}`;
            }
        }

        // Add 📋 icon if enabled
        if (addIcon) {
            const icon = document.createElement('span');
            icon.textContent = ' 📋';
            icon.style.userSelect = 'none';
            detail.appendChild(icon);
        }

        // Attach click-to-copy behaviour
        detail.style.cursor = 'pointer';
        detail.addEventListener('click', () => {
            copyTextToClipboard(detail, finalText, message);
        });
    });
}

/**
 * Sets up click-to-copy functionality for elements with .ca-click-to-copy in a view.
 * @param {string} viewId - The ID of the view.
 */
function setupClickToCopy(viewId) {
    const elements = document.querySelectorAll(`#${viewId} .ca-click-to-copy`);
    elements.forEach(el => {
        let text = el.textContent.trim();

        // Hide if only clipboard emoji
        if (text === '📋' || text === '') {
            el.style.display = 'none';
            return;
        }

        // Remove clipboard emoji from text
        text = text.replace(' 📋', '');

        // Add 📋 if not already there
        if (!el.textContent.includes('📋')) {
            el.textContent = text + ' 📋';
        }

        let message = 'Text Copied';
        if (el.classList.contains('client-contact-num')) message = 'Client Number Copied';
        else if (el.classList.contains('funder-email')) message = 'Funder Email Copied';
        else if (el.classList.contains('funder-contact-num')) message = 'Funder Number Copied';
        else if (el.classList.contains('funder-office-num')) message = 'Funder Office Number Copied';
        else if (el.classList.contains('client-email')) message = 'Client Email Copied';

        el.addEventListener('click', function () {
            copyTextToClipboard(el, text, message);
        });
    });
}

/** Gets the week commencing date for a given date.
 * @param {Date} date - The date to calculate the week commencing date for.
 * @returns {string} The week commencing date in the format "DD MMM YYYY". */
function getWeekCommencingDate(date) {
    const currentDayIndex = date.getDay();
    const daysToAdd = (currentDayIndex === 0 ? -6 : 1) - currentDayIndex; // If it's Sunday, subtract 6 days, otherwise subtract the current day index from 1
    const weekCommencingDate = new Date(date);
    weekCommencingDate.setDate(date.getDate() + daysToAdd);
    return weekCommencingDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function scheduleDailyRefresh(viewId, hours, minutes) {
    const now = new Date();
    const nextRefresh = new Date();

    // Set the next refresh time to HH:mm
    nextRefresh.setHours(hours, minutes, 0, 0);

    // If the current time is past HH:mm AM, set the next refresh to tomorrow
    if (now > nextRefresh) {
        nextRefresh.setDate(nextRefresh.getDate() + 1);
    }

    // Calculate the time difference in milliseconds
    const timeToNextRefresh = nextRefresh - now;

    // Set a timeout to refresh the view at HH:mm AM
    setTimeout(function() {
        ktl.views.refreshView(viewId);

        // Set an interval to refresh the view every 24 hours
        setInterval(function() {
            ktl.views.refreshView(viewId);

        }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    }, timeToNextRefresh);
}

function getCurrentYear() {
    const date = new Date();
    return date.getFullYear();
}

/** Constructs a human-readable list from an array of strings. Takes an array of strings
 * and a string to use before the last item (typically 'and' or 'or') to construct a list that is more
 * natural for reading. For example, given an array ['apple', 'banana', 'cherry'] and the string 'and',
 * it returns 'apple, banana and cherry'.
 * @param {string[]} stringsArr - An array of strings to be joined into a list.
 * @param {string} joinStr - A string to insert before the last item in the list. Typically 'and' or 'or'.
 * @returns {string} A string representing the joined list.
     */
function constructList(stringsArr, joinStr) {
    let list = stringsArr.join(', ');
    if (stringsArr.length > 1) {
        let lastComma = list.lastIndexOf(',');
        list = list.slice(0, lastComma) + ' ' + joinStr + list.slice(lastComma + 1);
    }
    return list;
}

/** Convert CSV string to an array
 * @param {string} csvString - CS string
 * @param {Boolean} [removeDuplicates] */
function csvToArray(csvString, removeDuplicates = false) {
    if (!csvString || typeof csvString !== 'string') {
        console.error('Invalid input. Please provide a non-empty string.');
        return [];
    }

    let newArray = csvString.split(',').map(item => item.trim());

    if (removeDuplicates) {
        newArray = [...new Set(newArray)];
    }
    return newArray;
}

/**
 * Checks if a given word starts with a vowel (a, e, i, o, u, A, E, I, O, U).
 * @param {string} word - The word to check.
 * @returns {boolean} True if the word starts with a vowel, false otherwise.
 */
function startsWithVowel(word){
    const vowels = ("aeiouAEIOU");
    return vowels.indexOf(word[0]) !== -1;
}

/** Change View Title if Selector Found
 * @param {string} viewId - Knack view id
 * @param {string} selector - jQuery selector
 * @param {string} newTitle - new title to set */
function updateViewTitleIfSelectorFound(viewId, selector, newTitle) {
    ktl.core.waitSelector(selector, 10000).then(() => {
        const viewTitle = $(`#${viewId} h3.kn-title:first`);
        if ($(selector).length > 0) {
            viewTitle.text(newTitle);
        }
    });
}

/** Add Change Event Listener to Input Element pass in callback function
 * @param {jQuery} inputElement - jQuery input element
 * @param {function} callback - callback function to run on change
 * @param {boolean} [onload] - whether to trigger the change event when the view loads */
function onInputChange(inputElement, callback, onload = true) {
    inputElement.on('change', function () {
        callback(this);
    });
    if (onload) {
        inputElement.change();
    }
}

/**
 * Toggle a message in a tile/copy, can be used as callback or standalone
 * @param {boolean} shouldShow - true to show false to hide
 * @param {string} eleSelector - id or class of message to toggle
 */
function toggleMessage(shouldShow, eleSelector) {
    // Select elements that contain the target element
    const messageElements = document.querySelectorAll(
        `.kn-input:has(${eleSelector}), .kn-special-title:has(${eleSelector})`
    );

    if (messageElements.length === 0) {
        // Fallback for browsers that don't support :has()
        const allContainers = document.querySelectorAll('.kn-input, .kn-special-title');
        allContainers.forEach(container => {
            if (container.querySelector(eleSelector)) {
                container.style.display = shouldShow ? 'block' : 'none';
            }
        });
    } else {
        messageElements.forEach(element => {
            element.style.display = shouldShow ? 'block' : 'none';
        });
    }
}

/** Replace Text in One Field with Text from Another Field in a Grid
 * @param {string} viewId
 * @param {string} sourceField ID
 * @param {string} targetField ID or column header */
function replaceTextInGrid(viewId, sourceField, targetField) {
    const targetIndex = targetField.startsWith('field_') ?
                        $(`#${viewId} .kn-table thead th.${targetField}`).index() :
                        $(`#${viewId} .kn-table thead th:textEquals('${targetField}')`).index();
    const rows = $(`#${viewId} .kn-table tbody tr`);

    rows.each(function() {
        const span = $(this).find(`td:eq(${targetIndex}) span.knViewLink__label`);
        const text = $(this).find(`td.${sourceField}`).find('span').html();
        span.html(text).find('span').css('text-decoration', 'none');
    });
}

/** Removes blank data from df where blanks to be removed are in <span class='removeIfBlank'>
 * @param {object} dfData jquery object with the df could be a td
 * @param {string} [seperator] could be :, - or null if no data before etc func will check if any data after the seperator */
function removeBlanksFromDF(dfData, separator) {
    // Regex pattern to match a single dash or multiple dashes
    const dashPattern = /^-+\s*-*$/;

    dfData.find('.removeIfBlank').each(function() {
        let spanText = $(this).text().trim();
        let textToCheck = spanText; // Default is the full text, used if no separator is provided

        // If a separator is provided, extract the text after the separator
        if (separator) {
            const splitText = spanText.split(separator);
            textToCheck = splitText.length > 1 ? splitText[1].trim() : '';
        }

        // Remove span if the text is blank, or matches the dash pattern
        if (textToCheck === '' || dashPattern.test(textToCheck)) {
            removeElement(this);
        }
    });
}

/** Hides empty list container */
function hideEmptyListItems(viewId) {
    const viewElement = $(`#${viewId}`);
    const listContainer = viewElement.find('.kn-list-container');
    listContainer.each(function() {
        const text = $(this).text().trim();

        if (text === '') {
            $(this).hide();
        }
    });
}

/**** Utility function to handle mapping of date to how long ago
 * @param {string} dateStr - date in dd/mm/yyyy
 * @param {object} ranges - object holding the range label with there max months (see SUICIDE_SELFHARM_RANGES)
 * @return the range for the date passed in or false if no range found*/
function mapDateToRange(dateStr, ranges) {
    const [day, month, year] = dateStr.split('/').map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();

    // Calculate the difference in months
    const diffYears = now.getFullYear() - date.getFullYear();
    const diffMonths = diffYears * 12 + (now.getMonth() - date.getMonth());

    for (const range of ranges) {
        if (diffMonths < range.max) {
            return range.label;
        }
    }
    console.error(`No match found in range "${ranges}" for date "${dateStr}".`);
    return false;
}

/** Parse a value into a Date object (or null if invalid).
 * Accepts: Date (cloned), millisecond timestamp (number), ISO string, or dd/mm/yyyy or yy string (cleaned via removeHtml)
 * @param {string|Date|number} input
 * @returns {Date|null} - New Date instance, or null if unparseable.
 */
function parseDateObject(input) {
    if (input instanceof Date) {
        return Number.isNaN(input.getTime()) ? null : new Date(input.getTime());
    }

    if (typeof input === 'number') {
        const dateFromNumber = new Date(input);
        return Number.isNaN(dateFromNumber.getTime()) ? null : dateFromNumber;
    }

    if (typeof input === 'string') {
        const cleanDate = removeHtml(input).trim();

        // dd/mm/yyyy OR dd/mm/yy
        const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(cleanDate);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10);
            let year = parseInt(dmyMatch[3], 10);

            // Interpret 2-digit years as 2000–2099 (tweak if you prefer a different pivot)
            if (year < 100) year += 2000;

            const dateFromDmy = new Date(year, month - 1, day);
            return (dateFromDmy.getFullYear() === year &&
                    dateFromDmy.getMonth() === month - 1 &&
                    dateFromDmy.getDate() === day)
                ? dateFromDmy
                : null;
        }

        // Fallback: ISO/RFC-like
        const dateFromString = new Date(cleanDate);
        return Number.isNaN(dateFromString.getTime()) ? null : dateFromString;
    }

    return null;
}

/** Offset a date and return a UK date string (dd/mm/yyyy).
 * Accepts an ISO string, Date object, dd/mm/yyyy or millisecond timestamp - uses parseDateObject.
 * @param {string|Date|number} inputDate - ISO string, dd/mm/yyyy string, Date object, or ms since epoch.
 * @param {number} [daysOffset=0] - Days to add (use negative to subtract).
 * @returns {string} - Formatted date string (dd/mm/yyyy) or '' if invalid.
 */
function getOffsetDateUK(inputDate, daysOffset = 0) {
    const date = parseDateObject(inputDate);
    if (!date) {
        console.warn('getOffsetDateUK: cannot parse date:', inputDate);
        return '';
    }
    date.setDate(date.getDate() + daysOffset);
    return getDateUKFormat(date);
}

/** Format Date as dd/mm/yyyy
 *  @param {Date|string|number} inputDate - Date object or parsable date value.
 *  @return {string} - Formatted date string (dd/mm/yyyy) or '' if invalid. */
function getDateUKFormat(inputDate) {
    const date = inputDate instanceof Date ? inputDate : parseDateObject(inputDate);
    if (!date) {
        console.warn('getDateUKFormat: cannot parse date:', inputDate);
        return '';
    }
    return date.toLocaleDateString('en-GB');
}

/** Calcualate How many weeks ago a date was
 * @param {number} weeksAgo - Number of weeks ago
 * @returns {string} */
function getWeeksAgoDate(weeksAgo) {
    const today = new Date(); // Get today's date
    const weeksInMillis = weeksAgo * 7 * 24 * 60 * 60 * 1000; // Convert weeks to milliseconds
    const targetDate = new Date(today.getTime() - weeksInMillis); // Calculate the target date
    return getDateUKFormat(targetDate); // Return the date string in UK format
}

/**  get array of week numbers and fields
 * @param {number} startFieldNum - Starting field number
 * @returns {array} Array of week numbers and fields */
function getArrayOfWeekNumbersAndFields(startFieldNum) { //knack
    return Array.from({length: 52}, (_, i) => `field_${startFieldNum + i}`);
}

/**  Get Week Number from given date
     * @param {object} date - Date object
     * @returns {number} Week number */
function getWeekNumber(date) { //knack
    const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
    // Get first day of the year
    const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

/**  Update the week number grid
 * @param {string} viewId
 * @param {string} bcgGridColour - background colour of current week */
async function updateWeekNumberObject( conxId, formDate, value, typeValue ) { //knack
    const sGrid = WEEK_NUM_SHARED_AREA_GRID;

    const weekNumber = getWeekNumber(convertToDateObj(formDate));
    const weekNumberField = sGrid.weekNumberFields[weekNumber - 1];

    const filter = createFilterForWeekObj(sGrid, conxId, typeValue);
    const weeklyTasks = await caAPI(sGrid.sceneId, sGrid.viewId, null, {}, 'get', filter);
    const weeklyTaskId = weeklyTasks.records[0].id;

    if (weeklyTaskId) {
        await caAPI(sGrid.sceneId, sGrid.viewId, weeklyTaskId, {[weekNumberField]: value}, 'put');
    }
}

function createFilterForWeekObj(sGrid, recordId, value) { //knack
    return {
        'match': 'and',
        'rules': [
            {'field': sGrid.conxField, 'operator': 'is', 'value': [recordId]},
            {'field': sGrid.typeField, 'operator': 'is', 'value': value},
        ]
    };
}

/**
 * Shows only relevant weeks in the Week Number Grid with improved performance and readability
 * @param {string} viewId - The ID of the view containing the grid
 * @param {string} bgGridColor - Background color for the current week
 * @param {number} [weeksToShow=11] - Total number of weeks to display
 * @param {number} [pastWeeksToShow=7] - Number of weeks before the current week to show
 */
function showRelevantWeeks(viewId, bgGridColor, weeksToShow = 11, pastWeeksToShow = 7) {
    const sGrid = window.WEEK_NUM_SHARED_AREA_GRID;
    const currentWeek = getWeekNumber(new Date());
    const weekNumberFields = sGrid.weekNumberFields; // field ids

    // Cache DOM elements to improve performance
    const viewElement = document.getElementById(viewId);
    if (!viewElement) {
        console.warn(`View element with ID ${viewId} not found`);
        return;
    }

    // Get all headers and rows once
    const thead = viewElement.querySelector('thead');
    const tbody = viewElement.querySelector('tbody');
    if (!thead || !tbody) {
        console.warn(`Table header or body not found in view ${viewId}`);
        return;
    }

    // Hide all columns first
    weekNumberFields.forEach(field => {
        const columnElements = viewElement.querySelectorAll(`.${field}`);
        columnElements.forEach(el => el.style.display = 'none');
    });

    // Show and reorder relevant columns
    const weeksToProcess = [];
    for (let i = 0; i < weeksToShow; i++) {
        // Calculate week index with proper wrapping for year boundaries
        const weekIndex = (currentWeek - pastWeeksToShow + i + 52) % 52 || 52; // Use 52 instead of 0
        const adjustedIndex = weekIndex - 1; // Convert to 0-based index
        weeksToProcess.push({
            field: weekNumberFields[adjustedIndex],
            isCurrentWeek: weekIndex === currentWeek
        });
    }

    // Process header cells
    const headerRow = thead.querySelector('tr');
    if (headerRow) {
        weeksToProcess.forEach(weekData => {
            const headerCell = headerRow.querySelector(`.${weekData.field}`);
            if (headerCell) {
                headerCell.style.display = '';
                headerRow.appendChild(headerCell);
            }
        });
    }

    // Process all data rows
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        weeksToProcess.forEach(weekData => {
            const cell = row.querySelector(`.${weekData.field}`);
            if (cell) {
                cell.style.display = '';
                if (weekData.isCurrentWeek) {
                    cell.style.backgroundColor = bgGridColor;
                }
                row.appendChild(cell);
            }
        });
    });
}

/* Compare Ages Function
 * @param {string} dob - Date of Birth
 * @param {number} age - Age to compare
 * @param {string} operator - Comparison operator
 * @returns {boolean} */
function compareAge(dob, age, operator) {
    const dateDOB = convertToDateObj(dob);
    const ageDifMs = Date.now() - dateDOB.getTime();
    const ageDate = new Date(ageDifMs);
    const calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970);
    return evaluate(calculatedAge)(operator)(age);
}

/** Add related field values from a Knack view (list or detail) into an HTML list.
 * @param {string} listId - The ID of the <ul> or <ol> element to populate.
 * @param {string} fieldId - The field class (e.g. 'field_3473') from which to extract values.
 * @param {string} [defaultText=''] - Text to show if no values are found.
 * @param {string} [viewType='detail'] - Type of view: 'detail' or 'list'.
 * @param {number} [delay=20000] - Time to wait (ms) for field selector to appear.*/
async function addConxDetailsToList(listId, fieldId, defaultText = '', viewType = 'detail', delay = 20000) {
    try {
        const list = $(listId).addClass('custom-list');
        if (list.find('li').length > 0) return;

        const itemSelector = viewType === 'list'
            ? `.kn-list-item-container .${fieldId} .kn-detail-body span`
            : `.${fieldId} .kn-detail-body span`;

        await ktl.core.waitSelector(itemSelector, delay);

        const elements = $(itemSelector);

        const items = [];
        elements.each(function (index) {
            const $el = $(this);
            const text = $el.text().trim();
            const hasSpanChildren = $el.children('span').length > 0;

            if (text && !hasSpanChildren) {
                items.push(text);
            }
        });

        if (items.length === 0 && defaultText) {
            list.append(`<li>${defaultText}</li>`);
        } else {
            const addedItems = new Set();
            items.forEach((text, i) => {
                if (!addedItems.has(text)) {
                    list.append(`<li>${text}</li>`);
                    addedItems.add(text);
                }
            });
        }
    } catch (error) {
        throw new Error(`Failed to add details to list: ${error}`);
    }
}

/** Map fields from one view to another view with the same fields
 * @param {string[]} textFields - Array of text field ids, maybe empty
 * @param {string[]} radioFields - Array of radio field ids, maybe empty
 * @param {string[]} selectFields - Array of select field ids, maybe empty
 * @param {string} targetViewId - Target view id
 * TO DO: add other field types if needed */
function mapFieldsToView(textFields, radioFields, selectFields, sourceViewId, targetViewId) {
    const mapField = (fieldId, fieldType, event) => {
        const fieldSelector = `#${sourceViewId} #kn-input-field_${fieldId} ${fieldType}`;
        const targetFieldSelector = `#${targetViewId} #kn-input-field_${fieldId} ${fieldType}`;

        // Check if the element exists before trying to use it
        if ($(fieldSelector).length === 0 || $(targetFieldSelector).length === 0) {
            console.error(`Element not found: ${fieldSelector} or ${targetFieldSelector}`);
            return;
        }

        $(targetFieldSelector).closest('.kn-input').addClass('ktlHidden');

        $(fieldSelector).on(event, function() {
            const value = fieldType === INPUT_RADIO_SELECTOR
                ? $(`#kn-input-field_${fieldId} ${INPUT_RADIO_CHECKED_SELECTOR}`).val()
                : $(this).val();

            if (fieldType === INPUT_RADIO_SELECTOR) {
                $(`${targetFieldSelector}`).filter(`[value="${value}"]`).trigger('click');
            } else {
                $(targetFieldSelector).val(value);
                if (fieldType === 'select') {
                    $(targetFieldSelector).trigger('liszt:updated');
                }
            }
        });
    };

    textFields.forEach(fieldId => mapField(fieldId, 'textarea', 'blur'));
    radioFields.forEach(fieldId => mapField(fieldId, INPUT_RADIO_SELECTOR, 'change'));
    selectFields.forEach(fieldId => mapField(fieldId, 'select', 'change'));
}

/**
 * Configuration constants for multi-form submission
 */
const MULTI_FORM_CONFIG = {
    TIMEOUTS: {
        BUTTON_WAIT: 10000,
        FORM_SUBMIT: 30000,
        PRE_SUBMIT_DELAY: 200,
        MODAL_CLOSE_DELAY: 200,
        OUTCOME_POLL_INTERVAL: 500
    },
    SELECTORS: {
        SUBMIT_BUTTON: 'button[type=submit]',
        FORM: 'form',
        SUCCESS_MESSAGE: '.kn-message.success',
        ERROR_MESSAGE: '.kn-message.is-error',
        MODAL: '.kn-modal',
        MODAL_CLOSE: 'button.close-modal'
    }
};

/**
 * Class for managing coordinated submission of multiple Knack forms.
 * Handles a primary manual form and one or more auto-submit forms that must complete first.
 *
 * Features:
 * - Sequential auto-form submission (not parallel) to handle validation properly
 * - Validation using ktlNotValid_* class pattern before submission
 * - Tracks successfully submitted forms to prevent re-submission
 * - On validation failure: stops process and leaves failing form enabled for user to edit
 * - User can fix errors and re-submit - already-submitted forms are skipped
 *
 * @example
 * // Basic usage
 * const coordinator = new MultiFormSubmissionCoordinator({
 *     manualSubmitViewId: 'view_123',
 *     autoSubmitViewIds: ['view_456', 'view_789']
 * });
 * coordinator.initialize('view_123'); // Call on form render
 *
 * @example
 * // With modal close and custom config
 * const coordinator = new MultiFormSubmissionCoordinator({
 *     manualSubmitViewId: 'view_123',
 *     autoSubmitViewIds: ['view_456'],
 *     closeModalAfterSubmit: true,
 *     onAutoFormsComplete: (outcomes) => {
 *         console.log('Auto forms completed:', outcomes);
 *     }
 * });
 */
class MultiFormSubmissionCoordinator {
    /**
     * @param {Object} config - Configuration object
     * @param {string} config.manualSubmitViewId - View ID of the manual (primary) form
     * @param {string[]} config.autoSubmitViewIds - Array of view IDs for auto-submit forms
     * @param {boolean} [config.closeModalAfterSubmit=false] - Close modal after successful submission
     * @param {Function} [config.onAutoFormsComplete=null] - Callback after auto forms complete
     * @param {Object} [config.timeouts] - Override default timeout values
     * @param {Object} [config.selectors] - Override default selector strings
     */
    constructor(config) {
        this.manualSubmitViewId = config.manualSubmitViewId;
        this.autoSubmitViewIds = config.autoSubmitViewIds || [];
        this.closeModalAfterSubmit = config.closeModalAfterSubmit || false;
        this.onAutoFormsComplete = config.onAutoFormsComplete || null;

        this.timeouts = { ...MULTI_FORM_CONFIG.TIMEOUTS, ...(config.timeouts || {}) };
        this.selectors = { ...MULTI_FORM_CONFIG.SELECTORS, ...(config.selectors || {}) };

        /**
         * Tracks event namespaces for cleanup. Maps event keys to their jQuery namespaces.
         * Example: Map { 'render-view_123' => 'knack-view-render.view_123.mfc-abc123' }
         * Used by destroy() to unbind all jQuery events and prevent memory leaks.
         */
        this.eventHandlers = new Map();
        this.isInitialized = false;

        // Track successfully submitted forms to avoid re-submission
        this.submittedForms = new Set();

        // Unique instance ID for event namespacing to prevent conflicts between multiple coordinators
        this.instanceId = `mfc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize the coordinator for a specific rendered view
     * @param {string} renderedViewId - The view ID that just rendered
     */
    initialize(renderedViewId) {
        if (renderedViewId === this.manualSubmitViewId) {
            this._attachManualFormHandler();
        } else if (this.autoSubmitViewIds.includes(renderedViewId)) {
            this._waitForManualForm();
        }
    }

    /**
     * Generate unique event namespace for jQuery events
     * @private
     * @param {string} eventName - Base event name (e.g., 'knack-view-render')
     * @param {string} viewId - View ID to namespace
     * @returns {string} Namespaced event string
     */
    _getEventNamespace(eventName, viewId) {
        return `${eventName}.${viewId}.${this.instanceId}`;
    }

    /**
     * Check if error is a validation error (not unexpected error)
     * @private
     * @param {Error} error - Error to check
     * @returns {boolean} True if validation error
     */
    _isValidationError(error) {
        return error.message.includes('Form validation failed');
    }

    /**
     * Wait for manual form to be available, then attach handler
     * @private
     */
    async _waitForManualForm() {
        try {
            await waitSelector({
                selector: `#${this.manualSubmitViewId} ${this.selectors.SUBMIT_BUTTON}`,
                timeout: this.timeouts.BUTTON_WAIT
            });
            this._attachManualFormHandler();
        } catch (err) {
            errorHandler.handleError(err, {
                manualSubmitViewId: this.manualSubmitViewId,
                autoSubmitViewIds: this.autoSubmitViewIds
            }, 'MultiFormCoordinator:WaitForManualForm');
        }
    }

    /**
     * Attach submit handler to manual form
     * @private
     */
    _attachManualFormHandler() {
        if (this.isInitialized) return;

        this._hideAutoSubmitButtons();

        const manualView = document.getElementById(this.manualSubmitViewId);
        if (!manualView) {
            console.error(`[MultiFormCoordinator] Manual submit view "${this.manualSubmitViewId}" not found`);
            errorHandler.handleError(
                new Error(`Manual submit view "${this.manualSubmitViewId}" not found`),
                { manualSubmitViewId: this.manualSubmitViewId },
                'MultiFormCoordinator'
            );
            return;
        }

        const manualForm = manualView.querySelector(this.selectors.FORM);
        const manualSubmitBtn = manualView.querySelector(this.selectors.SUBMIT_BUTTON);

        if (!manualForm || !manualSubmitBtn) {
            console.error(`[MultiFormCoordinator] Form or submit button not found in view "${this.manualSubmitViewId}"`);
            errorHandler.handleError(
                new Error(`Form or submit button not found in view "${this.manualSubmitViewId}"`),
                {
                    manualSubmitViewId: this.manualSubmitViewId,
                    formExists: !!manualForm,
                    buttonExists: !!manualSubmitBtn
                },
                'MultiFormCoordinator'
            );
            return;
        }

        this._cleanupPreviousHandler(manualSubmitBtn);

        const clickHandler = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this._handleFormSubmission(manualForm, manualSubmitBtn);
        };

        const formSubmitHandler = (event) => {
            event.preventDefault();
            event.stopPropagation();
        };

        manualSubmitBtn._multiSubmitHandler = clickHandler;
        manualSubmitBtn.addEventListener('click', clickHandler);

        manualForm._multiFormSubmitHandler = formSubmitHandler;
        manualForm.addEventListener('submit', formSubmitHandler);

        this.isInitialized = true;
    }

    /**
     * Hide submit buttons for auto-submit forms
     * Uses unique namespaced events to prevent duplicates and enable proper cleanup
     * @private
     */
    _hideAutoSubmitButtons() {
        this.autoSubmitViewIds.forEach(autoViewId => {
            const renderHandler = () => {
                const autoSubmitBtn = document.querySelector(`#${autoViewId} ${this.selectors.SUBMIT_BUTTON}`);
                if (autoSubmitBtn) {
                    autoSubmitBtn.classList.add(CLASS_HIDDEN);
                }
            };

            const eventNamespace = this._getEventNamespace('knack-view-render', autoViewId);

            // Unbind any existing handler first to prevent duplicates
            $(document).off(eventNamespace);
            $(document).on(eventNamespace, renderHandler);

            this.eventHandlers.set(`render-${autoViewId}`, eventNamespace);

            // Hide button immediately if already rendered
            waitSelector({
                selector: `#${autoViewId} ${this.selectors.SUBMIT_BUTTON}`,
                timeout: this.timeouts.BUTTON_WAIT
            })
                .then(btn => btn && btn.classList.add(CLASS_HIDDEN))
                .catch(() => {});
        });
    }

    /**
     * Handle the complete form submission workflow
     * @private
     */
    async _handleFormSubmission(manualForm, manualSubmitBtn) {
        manualSubmitBtn.disabled = true;
        this._setFormInputsDisabled(manualForm, true);

        let outcomes = [];
        try {
            outcomes = await this._submitAutoForms();

            if (this.onAutoFormsComplete) {
                this.onAutoFormsComplete(outcomes);
            }

            this._setFormInputsDisabled(manualForm, false);
            manualSubmitBtn.disabled = false;

            await this._submitManualForm(manualForm);

        } catch (err) {
            errorHandler.handleError(err, {
                manualSubmitViewId: this.manualSubmitViewId,
                autoSubmitViewIds: this.autoSubmitViewIds,
                outcomes
            }, 'MultiFormCoordinator:HandleSubmission');

            this._setFormInputsDisabled(manualForm, false);
            manualSubmitBtn.disabled = false;
        }
    }

    /**
     * Validate a form by checking for fields with ktlNotValid_* classes
     * @private
     * @param {string} viewId - View ID of the form being validated
     * @param {HTMLFormElement} form - The form element to validate
     * @returns {Object} Validation result with { isValid, invalidInputs, errorMessage }
     */
    _validateForm(viewId, form) {
        if (!form) {
            return { isValid: false, invalidInputs: [], errorMessage: `Form not found for ${viewId}` };
        }

        const allInputs = form.querySelectorAll('input, select, textarea');
        const invalidInputs = Array.from(allInputs).filter(input =>
            Array.from(input.classList).some(cls => cls.startsWith('ktlNotValid_'))
        );

        if (invalidInputs.length === 0) {
            return { isValid: true, invalidInputs: [], errorMessage: '' };
        }

        // Build detailed error message with field info
        const invalidFields = invalidInputs.map(input => {
            const invalidClasses = Array.from(input.classList)
                .filter(cls => cls.startsWith('ktlNotValid_'))
                .join(', ');
            return `#${input.id || input.name} (${invalidClasses})`;
        }).join(', ');

        return {
            isValid: false,
            invalidInputs,
            errorMessage: `Form validation failed for ${viewId}. Found ${invalidInputs.length} invalid input(s): ${invalidFields}`
        };
    }

    /**
     * Submit all auto forms sequentially, skipping already-submitted forms
     * @private
     * @returns {Promise<Array>} Array of submission outcomes
     */
    async _submitAutoForms() {
        const outcomes = [];

        for (const autoViewId of this.autoSubmitViewIds) {
            if (this.submittedForms.has(autoViewId)) {
                outcomes.push({
                    success: true,
                    viewId: autoViewId,
                    skipped: true,
                    reason: 'Already submitted'
                });
                continue;
            }

            try {
                const outcome = await this._submitSingleAutoForm(autoViewId);
                outcomes.push(outcome);

                if (outcome.success) {
                    this.submittedForms.add(autoViewId);
                }
            } catch (err) {
                // Validation errors already logged in _submitSingleAutoForm
                if (!this._isValidationError(err)) {
                    errorHandler.handleError(err, {
                        manualSubmitViewId: this.manualSubmitViewId,
                        autoSubmitViewIds: this.autoSubmitViewIds,
                        failedViewId: autoViewId,
                        submittedForms: Array.from(this.submittedForms)
                    }, 'MultiFormCoordinator:SubmitAutoForms');
                }
                throw err;
            }
        }

        return outcomes;
    }

    /**
     * Submit a single auto form and wait for outcome
     * @private
     * @param {string} autoViewId - View ID of the auto form
     * @returns {Promise<Object>} Submission outcome
     */
    async _submitSingleAutoForm(autoViewId) {
        const autoView = document.getElementById(autoViewId);
        if (!autoView) throw new Error(`Auto submit view "${autoViewId}" not found`);

        const autoForm = autoView.querySelector(this.selectors.FORM);
        const autoSubmitBtn = autoView.querySelector(this.selectors.SUBMIT_BUTTON);

        if (!autoForm || !autoSubmitBtn) {
            throw new Error(`Form or submit button not found in auto view "${autoViewId}"`);
        }

        try {
            // Enable form for validation
            this._setFormInputsDisabled(autoForm, false);
            autoSubmitBtn.disabled = false;

            // Validate before submitting
            const validationResult = this._validateForm(autoViewId, autoForm);
            if (!validationResult.isValid) {
                console.error(`[MultiFormCoordinator] ${validationResult.errorMessage}`);
                throw new Error(validationResult.errorMessage);
            }

            // Submit and wait for outcome
            const outcomePromise = this._waitForFormSubmitOutcome(autoViewId);
            autoSubmitBtn.click();
            const outcome = await outcomePromise;

            // Hide success message and disable form
            setVisibility(`#${autoViewId} ${this.selectors.SUCCESS_MESSAGE}`, false);
            this._setFormInputsDisabled(autoForm, true);

            return {
                success: true,
                viewId: autoViewId,
                record: outcome.record || null,
                timestamp: new Date().toISOString()
            };

        } catch (autoErr) {
            // Only log unexpected errors (validation already logged)
            if (!this._isValidationError(autoErr)) {
                errorHandler.handleError(autoErr, {
                    autoViewId,
                    manualSubmitViewId: this.manualSubmitViewId,
                    viewExists: !!autoView
                }, 'MultiFormCoordinator:SubmitSingleAutoForm');
            }
            throw autoErr;
        }
    }

    /**
     * Wait for form submission outcome by monitoring DOM for success/error messages
     * @private
     * @param {string} viewId - View ID to monitor
     * @returns {Promise<Object>} Submission result
     */
    _waitForFormSubmitOutcome(viewId) {
        return new Promise((resolve, reject) => {
            let cleanupDone = false;
            let timeoutId = null;
            let pollIntervalId = null;
            let observer = null;

            const cleanup = () => {
                if (cleanupDone) return;
                cleanupDone = true;
                if (timeoutId) clearTimeout(timeoutId);
                if (pollIntervalId) clearInterval(pollIntervalId);
                if (observer) observer.disconnect();
            };

            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Form submission timeout for ${viewId} after ${this.timeouts.FORM_SUBMIT}ms`));
            }, this.timeouts.FORM_SUBMIT);

            const viewElement = document.getElementById(viewId);
            if (!viewElement) {
                cleanup();
                reject(new Error(`View element not found: ${viewId}`));
                return;
            }

            const checkOutcome = () => {
                // Check for success message
                const successMsg = viewElement.querySelector(this.selectors.SUCCESS_MESSAGE);
                if (successMsg) {
                    cleanup();
                    resolve({
                        success: true,
                        record: null,
                        view: viewId,
                        message: successMsg.textContent.trim()
                    });
                    return true;
                }

                // Check for error message
                const errorMsg = viewElement.querySelector(this.selectors.ERROR_MESSAGE);
                if (errorMsg) {
                    cleanup();
                    reject(new Error(`Form submission failed: ${errorMsg.textContent.trim()}`));
                    return true;
                }

                // Check for invalid inputs
                const invalidInputs = viewElement.querySelectorAll('input.invalid, select.invalid, textarea.invalid, [aria-invalid="true"]');
                if (invalidInputs.length > 0) {
                    const fieldNames = Array.from(invalidInputs)
                        .map(inp => {
                            const label = inp.closest('.kn-input')?.querySelector('.kn-label');
                            return label ? label.textContent.trim().replace('*', '').trim() : 'Unknown field';
                        })
                        .filter((name, index, self) => self.indexOf(name) === index)
                        .slice(0, 3)
                        .join(', ');

                    cleanup();
                    reject(new Error(`Form validation failed: Required fields missing or invalid (${fieldNames})`));
                    return true;
                }

                return false;
            };

            // Monitor for changes with MutationObserver
            observer = new MutationObserver(checkOutcome);
            observer.observe(viewElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'aria-invalid']
            });

            // Initial check and delayed check
            checkOutcome();
            setTimeout(checkOutcome, this.timeouts.OUTCOME_POLL_INTERVAL);

            // Periodic polling as backup
            pollIntervalId = setInterval(() => {
                if (!cleanupDone) checkOutcome();
            }, this.timeouts.OUTCOME_POLL_INTERVAL);

            this.eventHandlers.set(`submit-${viewId}`, cleanup);
        });
    }

    /**
     * Submit the manual form
     * @private
     */
    async _submitManualForm(manualForm) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    $(manualForm).submit();

                    if (this.closeModalAfterSubmit && document.querySelector(this.selectors.MODAL)) {
                        setTimeout(() => {
                            document.querySelector(this.selectors.MODAL_CLOSE)?.click();
                        }, this.timeouts.MODAL_CLOSE_DELAY);
                    }

                    resolve();
                } catch (submitErr) {
                    errorHandler.handleError(submitErr, {
                        manualSubmitViewId: this.manualSubmitViewId
                    }, 'MultiFormCoordinator:SubmitManualForm');
                    reject(submitErr);
                }
            }, this.timeouts.PRE_SUBMIT_DELAY);
        });
    }

    /**
     * Enable or disable all form inputs
     * @private
     * @param {HTMLFormElement} form - The form element
     * @param {boolean} disabled - True to disable, false to enable
     */
    _setFormInputsDisabled(form, disabled) {
        if (!form) return;
        form.querySelectorAll('input, select, textarea, button').forEach(el => {
            el.disabled = disabled;
        });
    }

    /**
     * Clean up previous event handlers from button and form
     * @private
     */
    _cleanupPreviousHandler(button) {
        if (button._multiSubmitHandler) {
            button.removeEventListener('click', button._multiSubmitHandler);
            delete button._multiSubmitHandler;
        }

        const form = button.closest('form');
        if (form && form._multiFormSubmitHandler) {
            form.removeEventListener('submit', form._multiFormSubmitHandler);
            delete form._multiFormSubmitHandler;
        }
    }

    /**
     * Clean up all event handlers and resources
     */
    destroy() {
        // Clean up manual form DOM event handlers
        const manualView = document.getElementById(this.manualSubmitViewId);
        if (manualView) {
            const manualForm = manualView.querySelector(this.selectors.FORM);
            const manualSubmitBtn = manualView.querySelector(this.selectors.SUBMIT_BUTTON);

            if (manualSubmitBtn && manualSubmitBtn._multiSubmitHandler) {
                manualSubmitBtn.removeEventListener('click', manualSubmitBtn._multiSubmitHandler);
                delete manualSubmitBtn._multiSubmitHandler;
            }

            if (manualForm && manualForm._multiFormSubmitHandler) {
                manualForm.removeEventListener('submit', manualForm._multiFormSubmitHandler);
                delete manualForm._multiFormSubmitHandler;
            }
        }

        // Clean up jQuery event handlers using stored namespaces
        this.eventHandlers.forEach((eventNamespace) => {
            $(document).off(eventNamespace);
        });

        this.eventHandlers.clear();
        this.submittedForms.clear();
        this.isInitialized = false;
    }
}

/**
 * Legacy function wrapper - maintains same API as original function
 * @deprecated Consider using MultiFormSubmissionCoordinator class directly for better control
 * @param {string} manualSubmitViewId - The view ID of the manual (main) form.
 * @param {string[]} autoSubmitViewIds - Array of view IDs for forms to be auto-submitted before the manual form.
 * @param {string} renderedViewId - The view ID of the form that has just rendered.
 * @param {boolean} [closeModalAfterSubmit=false] - If true, closes modal after successful submission.
 * @returns {MultiFormSubmissionCoordinator} The coordinator instance
 */
function setupAutoFormSubmission(manualSubmitViewId, autoSubmitViewIds, renderedViewId, closeModalAfterSubmit = false) {
    const coordinator = new MultiFormSubmissionCoordinator({
        manualSubmitViewId,
        autoSubmitViewIds,
        closeModalAfterSubmit
    });
    coordinator.initialize(renderedViewId);
    return coordinator;
}

/** Function to select an item in a Knack connection dropdown.
 * @param {string} viewId - The ID of the view element.
 * @param {string} conxFieldIdInput - The ID of the connection field input.
 * @param {string|null} connectionId - The ID of the connection to select (optional).
 * @param {string} connectionObject - The connection object to use for API calls. */
async function addConnectionIdToRecord(viewId, conxFieldIdInput, connectionId = null, connectionObject) {
    const viewElement = $(`#${viewId}`).length > 0 ? $(`#${viewId}`) : $(`#connection-form-view:has(input[value="${viewId}"])`);

    const connectionField = viewElement.find(`#kn-input-field_${conxFieldIdInput}`);
    const connectionSelect = connectionField.find('select');
    const conxId = connectionId || getRecordID();
    const timeoutDuration = 10000; // 10 seconds
    const pollingInterval = 500; // 500 milliseconds
    connectionField.addClass(CLASS_HIDDEN);

    const setConnectionId = (conxId) => {
        connectionSelect.val(conxId).trigger('liszt:updated');
    };

    await ktl.core.waitSelector(`${viewElement.selector} #kn-input-field_${conxFieldIdInput} select option`, 20000);
    const optionsLength = connectionSelect.find('option').length;

    if (optionsLength > 1) {
        setConnectionId(conxId);
    } else {
        const { sceneIdAPI, viewIdAPI, clientPKField } = CONNECTION_FIELDS_OBJECT[connectionObject];
        try {
            const response = await caAPI(sceneIdAPI, viewIdAPI, connectionId, {}, 'get', {}, [], false);
            const optionText = response[`${clientPKField}_raw`];
            const searchInput = connectionField.find('.chzn-search input');

            searchInput.trigger('focus').val(optionText).trigger('input');

            const interval = setInterval(() => {
                const option = connectionSelect.find('option').filter((_, el) => $(el).text() === optionText);

                if (option.length > 0) {
                    setConnectionId(option.val());
                    searchInput.trigger('blur');
                    clearInterval(interval);
                    clearTimeout(timeout);
                }
            }, pollingInterval);

            const timeout = setTimeout(() => {
                clearInterval(interval);
                console.log(`Timeout: Could not find item "${optionText}" in the dropdown.`);
            }, timeoutDuration);
        } catch (error) {
            console.error('Error fetching data from API:', error);
        }
    }
}

/**
 * Validates if the input field specified by the inputId is empty. If the field is empty, it adds a class
 * 'inputInvalid' to visually indicate an invalid input and scrolls the input into view. Additionally, it
 * attaches a 'blur' event listener to the input field to remove or add the 'inputInvalid' class based on
 * the input's value when the field loses focus.
 * @param {string} inputId - The ID of the input field to be validated.
 * @returns {boolean} Returns true if the input field is not empty, otherwise false.
 */
function validateInputEmpty(inputId) {
    const input = $(`#${inputId}`);

    input.on('blur', function() {
        if (input.val()) {
            removeClassFromSelector(input, 'inputInvalid');
        } else input.addClass('inputInvalid');
    });

    if (!input.val()) {
        input.addClass('inputInvalid').focus();
        input[0].scrollIntoView({behavior: "smooth", block: "center", inline: "nearest"});
        return false;
    }
    return true;
}

/** Disable ALL cells in a column based on colHead id
 * @param {string} viewId - ID of the view (e.g., 'view_123')
 * @param {integer} colHeadID - field id of the column
 * @param {boolean} doRestyle - true to add CLASS_DISABLED to cell, false by default
 */
function disableCellsByColHead(viewId, colHeadID) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;
    const table = viewElement.querySelector('table');
    if (!table) return;
    const headerCells = table.querySelectorAll('thead th');
    let colIndex = -1;
    headerCells.forEach((th, idx) => {
        if (th.classList.contains(`field_${colHeadID}`)) colIndex = idx;
    });
    if (colIndex === -1) return;
    getAllTableRows(viewId, (i, row) => {
        const cell = row.children[colIndex];
        if (!cell) return;
        cell.classList.add(CLASS_DISABLED);
    });
}

/**
 * Checks whether the current time is within office hours (Mon - Fri).
 * By default, office hours are Monday to Friday, 08:30 to 16:30.
 * You can optionally provide custom start and end times in 24-hour 'HH:mm' format.
 * @param {string} [startTime='08:30'] - Optional start time in 'HH:mm' format (24-hour clock).
 * @param {string} [endTime='16:30'] - Optional end time in 'HH:mm' format (24-hour clock).
 * @returns {boolean} True if current time is within office hours on a weekday; otherwise false.
 */
function isInOfficeHours(startTime = '08:30', endTime = '16:30') { // ARC
    const toMinutes = timeStr => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const start = toMinutes(startTime);
    const end = toMinutes(endTime);

    const date = new Date();
    const now = date.getHours() * 60 + date.getMinutes();

    if (date.getDay() === 0 || date.getDay() === 6) {
        return false; // it's the weekend
    }
    return start <= now && now <= end;
}

/** Setup the local storage minutes for a meeting
* @param {string} storageKey - the key to the storage
* @param {array} viewsToAddLocalStorage - the views to add local storage to */
function setupLocalStorageMinutes(storageKey, viewsToAddLocalStorage, buttonText) { //ARC
    const meetingId = getRecordID();
    initSecureStorage(storageKey);

    viewsToAddLocalStorage.forEach(view => {
        const textarea = getTextArea(view);
        textarea.on('blur', function() {
            const fieldId = getFieldId($(this));
            setSecureStorage(storageKey, meetingId, fieldId, $(this).val());
        });

        $(`#${view} .redactor-editor`).on('blur', function() {
            const fieldId = getFieldId($(this).closest('.kn-input'));
            setSecureStorage(storageKey, meetingId, fieldId, $(this).html());
        });
    });

    ktl.core.waitSelector(`.kn-details-link a:contains("${buttonText}")`, 5000).then(() => {
        $(`.kn-details-link a:contains("${buttonText}")`).on('click', function (e) {
            e.preventDefault();
            getSecureStorage(storageKey, meetingId).then(minutes => {
                if (!minutes) return;
                reloadMinutes(viewsToAddLocalStorage, minutes);
            });
        });
    });
}

/** Reload the minutes from local storage
* @param {array} viewsToAddLocalStorage - the views to add local storage to
* @param {object} minutes - the minutes from local storage */
function reloadMinutes(viewsToAddLocalStorage, minutes) { //ARC
    viewsToAddLocalStorage.forEach(view => {
        const textarea = getTextArea(view);
        textarea.each(function() {
            const fieldId = getFieldId($(this));
            const text = minutes[fieldId];
            if (text) $(`#${fieldId}`).val(text);
        });

        $(`#${view} .redactor-editor`).each(function () {
            const fieldId = getFieldId($(this).closest('.kn-input'));
            const richText = minutes[fieldId];
            if (richText) {
                $(`#${fieldId} .redactor-editor`).html(richText);
                $(`#${fieldId} textarea`).val(richText);
            }
        });
    });
}

/** showHideGroup - show hide a group of views together
 * @param {string} viewsToInclude- FIRST must be the first view and will be used for the button */
function showHideGroup(viewsToInclude, flexOn) {
    // Create an array of promises for each view
    const viewsReadyArr = viewsToInclude.map(view => waitSelector({
        selector: `#view_${view}`
    }));

        Promise.all(viewsReadyArr).then(() => {
        const delay = 1000;
        const mainViewId = `view_${viewsToInclude[0]}`;
        const showHideId = `showHide_${mainViewId}`;
        const showHideClass = `.${showHideId}`;
        const shrinkLinkHTML = `<a class="ktlShrinkLink" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="ktlArrow ktlUp" id="arrow_${showHideId}">◀</span></a>`;

        waitSelector({ selector: `#${mainViewId} h2.kn-title` }).then((viewTitle) => {
            const titleText = viewTitle.textContent.trim();
            const showHideBtnHTML = `<div class="ktlHideShowButton" id="${showHideId}">${titleText} &nbsp;<span class="ktlArrow ktlDown" id="arrow_${showHideId}">◀</span></div>`;
            const mainViewElem = document.getElementById(mainViewId);

            // Only wrap and add controls if not already present
            let wrapper = document.getElementById(`${mainViewId}_wrapper`);
            if (!document.getElementById(showHideId)) {
                viewTitle.style.display = 'none';
                if (mainViewElem) {
                    mainViewElem.insertAdjacentHTML('beforebegin', showHideBtnHTML);
                }
                wrapContentForShowHideGroup(viewsToInclude, showHideId);
                wrapper = document.getElementById(`${mainViewId}_wrapper`);
                if (wrapper && !document.getElementById(`shrink-link_${showHideId}`)) {
                    wrapper.insertAdjacentHTML('beforeend', shrinkLinkHTML);
                }
            }

            // Move description if needed
            if (mainViewElem) {
                const description = mainViewElem.querySelector('.kn-description');
                if (
                    description &&
                    description.textContent.trim() !== '' &&
                    !document.querySelector(`${showHideClass} .kn-description`)
                ) {
                    const showHideSection = document.querySelector(showHideClass);
                    if (showHideSection) {
                        showHideSection.insertBefore(description, showHideSection.firstChild);
                        description.style.display = '';
                    }
                }
            }

            showHideViewGroupContent(showHideId, delay, flexOn);
            if (wrapper) wrapper.style.marginTop = '13px';
        });
    })
    .catch((error) => {
       if (isDeveloper){ console.warn('view/s missing from page', viewsToInclude, error); }
    });
}

/**  wrap content for show/hide group
 * so view types don't matter anymore?
 * @param {array} viewsArr - views to include in the show/hide first must be the main view
 * @param {string} showHideId - unique id for show/hide content */
function wrapContentForShowHideGroup(viewsArr, showHideId) {
    const mainViewId = `view_${viewsArr[0]}`;
    const mainView = document.getElementById(mainViewId);

    // If already wrapped, do nothing
    if (document.getElementById(`${mainViewId}_wrapper`)) return;

    // Create wrapper section
    const wrapper = document.createElement('section');
    wrapper.className = `${showHideId} ktlBoxWithBorder ktlHideShowSection`;
    wrapper.id = `${mainViewId}_wrapper`;
    wrapper.style.display = 'none'; // Show by default

    // Create view-wrapper div
    const viewWrapper = document.createElement('div');
    viewWrapper.className = 'view-wrapper';

    // Insert wrapper before mainView and move mainView inside viewWrapper
    mainView.parentNode.insertBefore(wrapper, mainView);
    wrapper.appendChild(viewWrapper);
    viewWrapper.appendChild(mainView);

    // Append other views
    viewsArr.slice(1).forEach(view => {
        const otherView = document.getElementById(`view_${view}`);
        if (otherView) {
            viewWrapper.appendChild(otherView);
        }
    });
}

function showHideViewGroupContent(showHideId, delay, flexOn = false) {
    const button = document.getElementById(showHideId);
    const arrow = document.getElementById(`arrow_${showHideId}`);
    const hiddenSection = document.querySelector(`.${showHideId}`);
    const shrinkLink = document.getElementById(`shrink-link_${showHideId}`);

    if (!button || !arrow || !hiddenSection) return;

    // Helper to get computed paddings/margins
    function getBoxSpacing(elem) {
        const style = window.getComputedStyle(elem);
        return {
            paddingTop: style.paddingTop,
            paddingBottom: style.paddingBottom,
            marginTop: style.marginTop,
            marginBottom: style.marginBottom
        };
    }

    // Animate height, padding, and margin for smooth slide
    function slideToggle(elem, duration = 600, displayType = 'block') {
        const isHidden = window.getComputedStyle(elem).display === 'none';
        const spacing = getBoxSpacing(elem);

        if (isHidden) {
            elem.style.removeProperty('display');
            let display = window.getComputedStyle(elem).display;
            if (display === 'none') display = displayType;
            elem.style.display = display;
            elem.style.overflow = 'hidden';
            elem.style.height = '0px';
            elem.style.paddingTop = '0px';
            elem.style.paddingBottom = '0px';
            elem.style.marginTop = '13px';
            elem.style.marginBottom = '0px';
            elem.offsetHeight; // force reflow

            requestAnimationFrame(() => {
                elem.style.transition = [
                    `height ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`
                ].join(', ');
                elem.style.height = elem.scrollHeight + 'px';
                elem.style.paddingTop = spacing.paddingTop;
                elem.style.paddingBottom = spacing.paddingBottom;
                elem.style.marginTop = spacing.marginTop;
                elem.style.marginBottom = spacing.marginBottom;
            });

            setTimeout(() => {
                elem.style.transition = '';
                elem.style.height = 'auto';
                elem.style.overflow = '';
                elem.style.paddingTop = '';
                elem.style.paddingBottom = '';
                elem.style.marginTop = '13px';
                elem.style.marginBottom = '';

                // --- BEGIN: Inserted signature/table group logic ---
                // Find the parent view element (with id starting with "view_")
                let parentView = elem.closest('[id^="view_"]');
                if (parentView) {
                    // Render signatures if needed
                    const signatureElements = parentView.querySelectorAll('.kn-input-signature');
                    const viewId = parentView.id;
                    if (
                        signatureElements.length &&
                        window.Knack &&
                        Knack.views &&
                        Knack.views[viewId] &&
                        typeof Knack.views[viewId].renderSignatures === 'function'
                    ) {
                        Knack.views[viewId].renderSignatures();
                    }

                    // Adjust colspan for table group cell
                    const tableGroupCell = parentView.querySelector('.kn-table-group td');
                    const visibleThs = parentView.querySelectorAll('th:not([style*="display: none"])');
                    if (tableGroupCell && visibleThs.length) {
                        const numOfVisibleColumns = visibleThs.length;
                        const currentColspan = parseInt(tableGroupCell.getAttribute('colspan'), 10);
                        if (currentColspan !== numOfVisibleColumns) {
                            tableGroupCell.setAttribute('colspan', numOfVisibleColumns);
                        }
                    }
                }
            }, duration);
        } else {
            elem.style.height = elem.scrollHeight + 'px';
            elem.style.overflow = 'hidden';
            elem.offsetHeight; // force reflow

            requestAnimationFrame(() => {
                elem.style.transition = [
                    `height ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `padding-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-top ${duration}ms cubic-bezier(0.33,0,0.2,1)`,
                    `margin-bottom ${duration}ms cubic-bezier(0.33,0,0.2,1)`
                ].join(', ');
                elem.style.height = '0px';
                elem.style.paddingTop = '0px';
                elem.style.paddingBottom = '0px';
                elem.style.marginTop = '13px';
                elem.style.marginBottom = '0px';
            });

            setTimeout(() => {
                elem.style.display = 'none';
                elem.style.transition = '';
                elem.style.height = '';
                elem.style.overflow = '';
                elem.style.paddingTop = '';
                elem.style.paddingBottom = '';
                elem.style.marginTop = '13px';
                elem.style.marginBottom = '';
            }, duration);
        }
    }

    function slideUp(elem, duration = 400) {
        if (window.getComputedStyle(elem).display === 'none') return;
        elem.style.height = elem.scrollHeight + 'px';
        elem.style.overflow = 'hidden';
        elem.offsetHeight; // force reflow

        requestAnimationFrame(() => {
            elem.style.transition = `height ${duration}ms cubic-bezier(0.33,0,0.2,1)`;
            elem.style.height = '0px';
        });

        setTimeout(() => {
            elem.style.display = 'none';
            elem.style.transition = '';
            elem.style.height = '';
            elem.style.overflow = '';
        }, duration);
    }

    button.onclick = function () {
        slideToggle(hiddenSection, delay, flexOn ? 'flex' : 'block');
        arrow.classList.toggle('ktlDown');
        arrow.classList.toggle('ktlUp');
        button.classList.toggle('ktlActive');
        if (flexOn && window.getComputedStyle(hiddenSection).display !== 'none') {
            hiddenSection.style.display = 'flex';
        }
    };

    if (shrinkLink) {
        shrinkLink.onclick = function () {
            slideUp(hiddenSection, delay);
            arrow.classList.toggle('ktlDown');
            arrow.classList.toggle('ktlUp');
            button.classList.remove('ktlActive');
        };
    }
}

/**
 * Adds checkboxes to a table view and handles select/unselect all functionality.
 * Optionally invokes a callback when checkboxes change.
 *
 * @param {string} viewId - The ID of the view.
 * @param {function} [onCheckedChange] - Optional callback invoked on changes.
 * @param {boolean} [addHeaderCheckbox=true] - Whether to add a select-all checkbox to the header.
 *   Signature: ({ type: 'row'|'header', checked: boolean, row?: HTMLTableRowElement,
 *                 viewId: string, checkedCount: number, totalCount: number, headerChecked: boolean, event: Event }) => void
 * @example
 * addCheckboxes('view_1234', ({ type, checked, checkedCount }) => console.log(type, checked, checkedCount));
 */
function addCheckboxes(viewId, onCheckedChange, addHeaderCheckbox = true) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const table = viewElement.querySelector('table.kn-table');
    if (!table) return;

    const headerRow = table.querySelector('thead tr');
    const bodyRows = table.querySelectorAll('tbody tr:not(.kn-tr-nodata)');

    // Always ensure a placeholder header cell exists for alignment
    let headerCheckboxTh = headerRow.querySelector('th.header-checkbox-th');
    if (!headerCheckboxTh) {
        headerCheckboxTh = document.createElement('th');
        headerCheckboxTh.className = 'header-checkbox-th';
    }
    // Ensure placeholder is first column
    if (headerRow.firstChild !== headerCheckboxTh) {
        headerRow.insertBefore(headerCheckboxTh, headerRow.firstChild);
    }

    // Conditionally add/remove the select-all checkbox input
    let headerCheckbox = null;
    if (addHeaderCheckbox) {
        headerCheckbox = headerCheckboxTh.querySelector('input[type="checkbox"]');
        if (!headerCheckbox) {
            headerCheckbox = document.createElement('input');
            headerCheckbox.type = 'checkbox';
            headerCheckbox.className = 'header-checkbox';
            headerCheckboxTh.appendChild(headerCheckbox);
        }
    } else {
        const existingHeaderCb = headerCheckboxTh.querySelector('input[type="checkbox"]');
        if (existingHeaderCb) existingHeaderCb.remove();
    }

    // Add row checkboxes if not already present
    bodyRows.forEach(row => {
        let checkboxTd = row.querySelector('td.row-checkbox-td');
        if (!checkboxTd) {
            checkboxTd = document.createElement('td');
            checkboxTd.className = 'row-checkbox-td';
            checkboxTd.style.maxWidth = '32px';
            const rowCheckbox = document.createElement('input');
            rowCheckbox.type = 'checkbox';
            rowCheckbox.className = 'row-checkbox';
            checkboxTd.appendChild(rowCheckbox);
            row.insertBefore(checkboxTd, row.firstChild);

            addInputEventListener(rowCheckbox, function (e) {
                const allChecked = Array.from(table.querySelectorAll(`tbody tr:not(.kn-tr-nodata) ${INPUT_CHECKBOX_SELECTOR}`))
                    .every(cb => cb.checked);
                if (headerCheckbox) headerCheckbox.checked = allChecked;

                // Invoke callback for row checkbox change
                if (typeof onCheckedChange === 'function') {
                    const checkedCount = table.querySelectorAll('tbody tr:not(.kn-tr-nodata) input[type="checkbox"].row-checkbox:checked').length;
                    onCheckedChange({
                        type: 'row',
                        checked: rowCheckbox.checked,
                        row,
                        viewId,
                        checkedCount,
                        totalCount: bodyRows.length,
                        headerChecked: !!headerCheckbox?.checked,
                        event: e || null
                    });
                }
            }, { events: 'change' });
        }
    });

    if (headerCheckbox) {
        addInputEventListener(headerCheckbox, function (e) {
            const isChecked = headerCheckbox.checked;
            bodyRows.forEach(row => {
                const cb = row.querySelector(`td.row-checkbox-td ${INPUT_CHECKBOX_SELECTOR}`);
                if (cb) cb.checked = isChecked;
            });

            // Invoke callback for header checkbox change (after rows updated)
            if (typeof onCheckedChange === 'function') {
                const checkedCount = isChecked
                    ? bodyRows.length
                    : 0;
                onCheckedChange({
                    type: 'header',
                    checked: isChecked,
                    viewId,
                    checkedCount,
                    totalCount: bodyRows.length,
                    headerChecked: !!headerCheckbox.checked,
                    event: e || null
                });
            }
        }, { events: 'change' });
    }
}

/**
 * Adds a checkbox to each table header cell in a Knack view (does not add to rows).
 * Only adds a checkbox if the header cell has a class starting with "field_".
 * Ensures the checkbox is the first child and inline with the header text.
 * Optionally accepts a callback that receives an array of field IDs for checked headers.
 * Uses addInputEventListener for event handling.
 * @param {string} viewId - The ID of the view containing the table.
 * @param {function} [onCheckedChange] - Optional callback: (checkedFieldIds: string[]) => void
 * @example
 * addCheckboxesToHeaders('view_1234', checkedIds => { console.log(checkedIds); });
 */
function addCheckboxesToHeaders(viewId, onCheckedChange) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const table = viewElement.querySelector('table.kn-table');
    if (!table) return;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return;

    Array.from(headerRow.children).forEach(th => {
        // Only add checkbox if th has a class starting with "field_"
        const fieldClass = Array.from(th.classList).find(cls => cls.startsWith('field_'));
        if (!fieldClass) return;

        // Wrap existing content in a flex container if not already
        let flexWrap = th.querySelector('.header-flex-wrap');
        if (!flexWrap) {
            flexWrap = document.createElement('span');
            flexWrap.className = 'header-flex-wrap';
            flexWrap.style.display = 'inline-flex';
            flexWrap.style.alignItems = 'center';
            flexWrap.style.gap = '4px';

            // Move all th children into the flexWrap
            while (th.firstChild) {
                flexWrap.appendChild(th.firstChild);
            }
            th.appendChild(flexWrap);
        }

        // Add checkbox if not already present
        if (!flexWrap.querySelector(INPUT_CHECKBOX_SELECTOR)) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'header-checkbox';
            checkbox.style.verticalAlign = 'middle';
            checkbox.style.marginRight = '6px';
            flexWrap.insertBefore(checkbox, flexWrap.firstChild);
        } else {
            // Ensure checkbox is first and styled
            const existing = flexWrap.querySelector(INPUT_CHECKBOX_SELECTOR);
            if (existing !== flexWrap.firstChild) {
                flexWrap.insertBefore(existing, flexWrap.firstChild);
            }
            existing.style.verticalAlign = 'middle';
            existing.style.marginRight = '6px';
        }
    });

    // If a callback is provided, set up listeners for all header checkboxes
    if (typeof onCheckedChange === 'function') {
        const headerCheckboxes = headerRow.querySelectorAll(`${INPUT_CHECKBOX_SELECTOR}.header-checkbox`);
        addInputEventListener(headerCheckboxes, function () {
            const checkedFieldIds = Array.from(headerCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => {
                    const th = cb.closest('th');
                    if (!th) return null;
                    const fieldClass = Array.from(th.classList).find(cls => cls.startsWith('field_'));
                    return fieldClass ? fieldClass.replace('field_', '') : null;
                })
                .filter(Boolean);
            onCheckedChange(checkedFieldIds);
        }, { events: 'change' });
    }
}

/** Add given text in fron of value in grouped by table rows
 * @param {string} txtToAdd
 * @param {string} viewId
 * @param {integer} groupLevel - Opiontal add group level if not 1 */
function prependTextToGroupBy(txtToAdd, viewId, groupLevel = 1) {
    const selector = `#${viewId} .kn-group-level-${groupLevel} td`;
    $(selector).prepend(`${txtToAdd} `);
}

/**
 * Retrieves the rows of a table's tbody within a specified view and applies a callback to each row.
 * @param {string} viewId
 * @param {function} callback - Receives the index of the row and the jQuery-wrapped row element as arguments.
 */
function getTableRows(viewId, callback, includeHeader = false, includeGroup = false) {
    if (!viewId) return;

    const tableElement = $(`#${viewId} table`);
    let tableRows = tableElement.find('tbody tr:not(.kn-table-group)');

    // Include header rows if specified
    if (includeHeader) {
        const headerRows = tableElement.find('thead tr');
        tableRows = tableRows.add(headerRows);
    }

    // Include group rows if specified
    if (includeGroup) {
        const groupRows = tableElement.find('tbody tr.kn-table-group');
        tableRows = tableRows.add(groupRows);
    }

    // Iterate over each row and execute the callback
    tableRows.each((index, row) => {
        callback(index, $(row));
    });
}

/**
 * Extract a UK postcode from an address string.
 * @param {string} address - The address string, possibly containing HTML tags.
 * @returns {string} The extracted postcode in uppercase, or an empty string if not found.
 * @example <span>312 Fawcett Road Portsmouth, Hampshire PO4 0LG</span> Returns: "PO4 0LG"*/
function extractPostcode(address) {
    if (!address) return '';
    const cleanAddress = removeHtml(address).trim();
    // Match UK postcode pattern (case-insensitive)
    const match = cleanAddress.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i);
    return match ? match[0].toUpperCase() : '';
}

/**
 * Returns the appropriate viewer URL for a given file type.
 * @param {string} extension - File extension (lowercase, no dot)
 * @param {string} url - Direct asset URL
 * @return {string} - Viewer URL
 */
function fileViewer(extension, url) {
    if (OFFICE_EXTENSIONS.includes(extension)) {
        return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
    }
    if (extension === "pdf") {
        return `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}`;
    }
    // Fallback to Google Docs Viewer for other types
    return `https://docs.google.com/gview?url=${encodeURIComponent(url)}`;
}
/**num of whole weeks between two dates
 * @param {Date} date1 - 24/05/2023
 * @param {Date} date2 - 24/05/2023 **/
 function weeksBetween(date1, date2) {
    var WEEK = 1000 * 60 * 60 * 24 * 7;
    var diff = Math.abs(date2 - date1);
    return Math.ceil(diff / WEEK);
}

/** Returns A date object from a uk date string
 * @param {string} date - 24/05/2023
 * @return {Date} dateObj **/
function convertToDateObj (date) {
    var dateArr = date.split("/");
    return new Date(dateArr[2],	dateArr[1] - 1,	dateArr[0]);
}

/** Determine whether an element is visible in the DOM.
 * Accepts either an element reference or a selector string, Visibility checks include inline/computed styles and hidden ancestors.
 *
 * @param {HTMLElement|string} target - The element itself, or a selector string.
 * @param {ParentNode} [root=document] - Optional root to scope selector queries (e.g., a view container).
 * @returns {boolean} True if the element is visible, false otherwise. */
function isElementVisible(target, root = document) {
    const context = root && typeof root.querySelector === 'function' ? root : document;
    const el = typeof target === 'string' ? context.querySelector(target) : target;

    if (!el || !el.isConnected) return false;

    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;

    // When the element or any ancestor has display:none, offsetParent is null.
    if (el.offsetParent === null) return false;

    return true;
}


/** Checks if all inputs on a view are empty.
 * @param {string} viewId - The ID of the view (e.g., view_xxxx).
 * @param {Array} fieldsToIgnore - An array of field IDs to ignore when checking for empty inputs.
 * @return {boolean} - Returns true if all inputs are empty, false otherwise. */
function areAllInputsEmpty(viewId, fieldsToIgnore = []) {
    if (!viewId) return true;

    const viewElement = $(`#${viewId}`);
    const textInputs = viewElement.find('input[type="text"]:not(.search-field input[type="text"]), input[type="number"], input[type="email"], textarea');
    const selectInputs = viewElement.find('select');

    // Check if any text input has a non-empty value
    for (let i = 0; i < textInputs.length; i++) {
        const input = $(textInputs[i]);
        const inputId = input.attr('id');
        if (fieldsToIgnore.includes(inputId)) continue;

        const inputValue = input.val();
        if (inputValue.trim() !== '') {
            return false;
        }
    }

    // Check if any select input has a selected option
    for (let i = 0; i < selectInputs.length; i++) {
        const select = $(selectInputs[i]);
        const selectId = select.attr('id');
        if (fieldsToIgnore.includes(selectId)) continue;

        const selectedOptions = select.find('option:selected');
        if (selectedOptions.length > 0 && selectedOptions.val() !== '') {
            return false;
        }
    }

    // Check if any radio or checkbox input is checked
    const checkedInputs = viewElement.find('input[type="radio"]:checked, input[type="checkbox"]:checked');
    for (let i = 0; i < checkedInputs.length; i++) {
        const input = $(checkedInputs[i]);
        const inputId = input.attr('name').split('-').pop();
        if (fieldsToIgnore.includes(inputId)) continue;

        return false;
    }

    return true; // All inputs are empty
}

/** Check whether a form input is empty.
 * @param {HTMLElement|string} fieldEleOrId - The field element or the field ID string.
 * @param {string} type - The type of field to check. Supported values:
 *        - 'choice': Radio buttons or checkboxes — returns true if none are selected.
 *        - 'textarea': Text, number, email inputs, or textarea — returns true if empty.
 *        - 'dropdown': Select dropdown — returns true if no option is selected.
 * @returns {boolean} True if the field is empty, false otherwise.*/
const isInputEmpty = (fieldEleOrId, type) => {
    const fieldEle = typeof fieldEleOrId === 'string'
        ? document.getElementById(fieldEleOrId)
        : fieldEleOrId;

    if (!fieldEle) {
        console.warn(`isInputEmpty: element not found for`, fieldEleOrId);
        return null;
    }

    switch (type) {
        case 'choice': {
            const checked = fieldEle.querySelectorAll('input:checked');
            return checked.length === 0;
        }
        case 'textarea': {
            const input = fieldEle.querySelector('textarea, input[type="text"], input[type="number"], input[type="email"]');
            return !input || input.value.trim() === '';
        }
        case 'dropdown': {
            const select = fieldEle.querySelector('select');
            const value = select ? select.value : '';
            return value === '' || value === null;
        }
        default:
            console.warn(`isInputEmpty: unknown field type "${type}"`);
            return false;
    }
};

/**
 * Replace value in table cell if match found - replaces if matchTxt is ANYWHERE in the TD.
 * @param {string} viewId - ID of the view containing the table.
 * @param {number|string} colHeadID - Field ID of the column header.
 * @param {string} matchTxt - Text to match anywhere in the cell.
 * @param {string} replaceTxt - Text to replace the matched cell with.
 */
function replaceValueInTD(viewId, colHeadID, matchTxt, replaceTxt) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const table = viewElement.querySelector('table');
    if (!table) return;

    const colIndex = getIndexOfColumnHeader(table, colHeadID);
    if (colIndex === -1) return;

    getAllTableRows(viewId, (index, row) => {
        const cell = row.querySelectorAll('td')[colIndex];
        if (cell && cell.textContent.trim().includes(matchTxt)) {
            cell.textContent = replaceTxt;
        }
    });
}

/** Filter values from dropdown based on text to match, if item contains the text show it else hide
 * @param {integer} viewID - view id where select is
 * @param {integer} fieldTofilter - ID of field to filter
 * @param {string} textToMatch - ID of conx field to filter to**/
function filterSelectByText(viewId, fieldTofilter, textToMatch){
    $('#' + viewId + `_field_${fieldTofilter}_chzn li`).each(function () {
        if ($(this).text().indexOf(textToMatch) != -1) {
            $(this).show(); //match found so show the list item
        } else {
            $(this).hide(); //match match so hide
        }
    });
}

   /** Trigger a webhook
     * @param {string} webhookURL - Webhook URL including any params to pass in
     * @param {object} data - data object to be sent to the webhook
     * @param {string} [webhookName='Unnamed Webhook'] - Name for webhook used for console log
     * @param {boolean} [isSecure=false] - Optional flag to indicate if user token should be included
     * @returns {Promise<{success: boolean, data: object|string|null, error: string|null}>} */
   async function triggerWebhook(webhookURL, data, webhookName = 'Unnamed Webhook', isSecure = false) {
    if (!webhookURL.startsWith('https://')) {
        const errorMsg = `Invalid webhook URL: ${webhookURL} in webhook: ${webhookName}`;
        console.error(errorMsg);
        return { error: errorMsg };
    }

    const parseResponse = async (response) => {
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    };

    let responseData = null;
    try {
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                userToken: isSecure ? Knack.getUserToken() : '',
            },
            body: JSON.stringify(data),
        });

        responseData = await parseResponse(response);

        if (!response.ok) {
            console.error(`Webhook (${webhookName}) failed with status ${response.status}:`, responseData);
            throw new Error(`Network response was not ok: ${responseData}`);
        }

        console.log(`Webhook (${webhookName}) sent successfully with response:`, responseData);
        return { success: true, data: responseData, error: null };
    } catch (error) {
        console.error(`Error triggering webhook: ${webhookName}`, error);
        throw {
            success: false,
            data: responseData,
            error: error.message,
            webhookName: webhookName,
        };
    }
}

/** Make a delayed API call loop
 * @param {string} sceneKey - The scene key with the view that has records to update.
 * @param {string} viewId - The view key of the view that has records to update
 * @param {array} recordIdArr - An array of record IDs to be updated.
 * @param {object} data - The data to be sent to the API it will send the same data to each record
 * @param {array} viewToRefresh - An array of view keys to be refreshed.
 * @param {integer} delay - The delay in milliseconds between each API call. */
async function delayAPIPut (sceneKey = null, viewId = null, recordIdArr = [], data, viewToRefresh = [], delay = 500) {
    for (var i = 0; i < recordIdArr.length; i++) {
        caAPI (sceneKey, viewId, recordIdArr[i], data, 'put', {}, viewToRefresh, true);
        await API_TIMER(delay);
    }
}

/**
 * KnackAPI Class
 * Handles CRUD operations, filtering, sorting, pagination, and formatting
 * Does not require API keys (uses view-based methods only)
 *
 * @author Amanda Mower & Craig Winnall
 * @version 1.0.1
 */
class KnackAPI {
    /**
     * Creates a new KnackAPI instance
     * @param {Object} options - Configuration options
     * @param {boolean} [options.showSpinner=false] - Whether to show the Knack spinner during API calls
     * @param {number} [options.timeout=60000] - Timeout for API requests in milliseconds
     * @param {boolean} [options.debug=false] - Whether to log debug information to console
     * @param {boolean} [options.developerOnly=true] - Whether to restrict logs to developers only
     * @param {Array<string>} [options.developerRoles=['Developer']] - User roles considered as developers
     */
    constructor(options = {}) {
        this.options = {
            showSpinner: options.showSpinner !== undefined ? options.showSpinner : false,
            timeout: options.timeout || 60000,
            debug: options.debug || false,
            developerOnly: options.developerOnly !== undefined ? options.developerOnly : true,
            developerRoles: options.developerRoles || ['Developer']
        };

        this._initLogSettings();
    }

    /**
     * Retrieves records from a Knack view
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Object} [options] - Request options
     * @param {Array<Object>|Object} [options.filters] - Filter specifications
     * @param {Array<Object>|Object} [options.sorters] - Sort specifications
     * @param {number} [options.page] - Page number for pagination
     * @param {number} [options.rows] - Number of rows per page
     * @param {boolean} [options.rawResponse=false] - Return raw response instead of just records
     * @returns {Promise<Array<Object>|Object>} - Retrieved records or raw response
     * @public
     */
    async getRecords(sceneId, viewId, options = {}) {
        const {
            filters,
            sorters,
            page,
            rows,
            rawResponse = false,
            timeout
        } = options;

        let params = {};

        // Add filters if provided
        if (filters) {
            params = { ...params, ...this.buildFilters(filters) };
            this._log('Filters', params);
        }

        // Add sorters if provided
        if (sorters) {
            params = { ...params, ...this.buildSorters(sorters) };
            this._log('Sorters', params);
        }

        // Add pagination if provided
        if (page) {
            params.page = page;
        }

        if (rows) {
            params.rows_per_page = rows;
        }

        const url = this._formatApiUrl(sceneId, viewId) + this._formatParams(params);
        this._log('Getting records', url);

        const { controller, signal, clear } = this._createAbortController(timeout);

        try {
            const responseData = await this._executeRequest(
                url,
                {
                    method: 'GET',
                    headers: this._buildHeaders()
                },
                signal
            );

            return rawResponse ? responseData : responseData.records;
        } finally {
            clear();
        }
    }

    /**
     * Fetches all records across multiple pages
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Object} [options] - Request options
     * @param {Array<Object>|Object} [options.filters] - Filter specifications
     * @param {Array<Object>|Object} [options.sorters] - Sort specifications
     * @param {number} [options.rows=1000] - Number of rows per page
     * @param {Function} [options.onProgress] - Callback function for progress updates
     * @returns {Promise<Array<Object>>} - All records
     * @public
     */
    async getAllRecords(sceneId, viewId, options = {}) {
        const {
            filters,
            sorters,
            rows = 1000,
            onProgress
        } = options;

        // Fetch first page to get pagination info
        const firstPage = await this.getRecords(sceneId, viewId, {
            filters,
            sorters,
            page: 1,
            rows,
            rawResponse: true
        });

        const { total_pages, total_records, records: initialRecords } = firstPage;

        this._log('Fetching all records', { total_pages, total_records });

        if (total_records === 0) {
            return [];
        }

        const allRecords = [...initialRecords];

        for (let page = 2; page <= total_pages; page++) {
            const nextPage = await this.getRecords(sceneId, viewId, {
                filters,
                sorters,
                page,
                rows,
                rawResponse: true
            });

            allRecords.push(...nextPage.records);

            if (onProgress) {
                const progress = {
                    page,
                    total_pages,
                    records_loaded: allRecords.length,
                    total_records,
                    percentage: Math.round((page / total_pages) * 100)
                };
                onProgress(progress);
            }
        }

        return allRecords;
    }

    /**
     * Retrieves child records connected to a parent record
     * @param {string} sceneId - The scene ID/key/slug where the parent record is displayed
     * @param {string} viewId - The view ID/key where the parent record is displayed
     * @param {string} recordId - The ID of the parent record
     * @param {string} connectionFieldKey - The field key that connects child records to the parent
     * @param {Object} [options] - Request options
     * @param {Array<Object>|Object} [options.filters] - Filter specifications
     * @param {Array<Object>|Object} [options.sorters] - Sort specifications
     * @param {number} [options.page] - Page number for pagination
     * @param {number} [options.rows] - Number of rows per page
     * @param {boolean} [options.rawResponse=false] - Return raw response instead of just records
     * @param {number} [options.timeout] - Optional timeout override
     * @returns {Promise<Array<Object>|Object>} - Retrieved child records or raw response
     * @public
     */
    async getRecordChildren(sceneId, viewId, recordId, connectionFieldKey, options = {}) {
        const {
            filters,
            sorters,
            page,
            rows,
            rawResponse = false,
            timeout
        } = options;

        let params = {};

        // Add filters if provided
        if (filters) {
            params = { ...params, ...this.buildFilters(filters) };
        }

        // Add sorters if provided
        if (sorters) {
            params = { ...params, ...this.buildSorters(sorters) };
        }

        // Add pagination if provided
        if (page) {
            params.page = page;
        }

        if (rows) {
            params.rows_per_page = rows;
        }

        // Format URL for child records
        // For view-based API, we use the pattern:
        // /pages/{scene_slug}/views/{view_key}/records?{scene_slug}_id={record_id}
        const url = this._formatApiUrl(sceneId, viewId);

        // Add the parent record ID as a parameter
        params[`${connectionFieldKey}_id`] = recordId;

        const formattedUrl = url + this._formatParams(params);
        this._log('Getting child records', formattedUrl);

        const { controller, signal, clear } = this._createAbortController(timeout);

        try {
            const responseData = await this._executeRequest(
                formattedUrl,
                {
                    method: 'GET',
                    headers: this._buildHeaders()
                },
                signal
            );

            return rawResponse ? responseData : responseData.records;
        } finally {
            clear();
        }
    }

    /**
     * Retrieves all child records connected to a parent record across multiple pages.
     * @param {string} sceneId - The scene ID/key/slug where the parent record is displayed
     * @param {string} viewId - The view ID/key where the child records are displayed
     * @param {string} recordId - The ID of the parent record
     * @param {string} connectionFieldKey - The field key that connects child records to the parent
     * @param {Object} [options] - Optional parameters
     * @param {number} [options.rows=1000] - Number of rows per page
     * @param {Function} [options.onProgress] - Optional progress callback
     * @returns {Promise<Array<Object>>} - All connected child records
     * @public
     */
    async getAllRecordChildren(sceneId, viewId, recordId, connectionFieldKey, options = {}) {
        const {
            filters,
            sorters,
            rows = 1000,
            onProgress
        } = options;

        // Get initial page to determine pagination
        const firstPage = await this.getRecordChildren(sceneId, viewId, recordId, connectionFieldKey, {
            filters,
            sorters,
            page: 1,
            rows,
            rawResponse: true
        });

        const { total_pages, total_records, records: initialRecords } = firstPage;

        this._log('Fetching all child records', { total_pages, total_records });

        if (total_records === 0) {
            return [];
        }

        const allRecords = [...initialRecords];

        for (let page = 2; page <= total_pages; page++) {
            const nextPage = await this.getRecordChildren(sceneId, viewId, recordId, connectionFieldKey, {
                filters,
                sorters,
                page,
                rows,
                rawResponse: true
            });

            allRecords.push(...nextPage.records);

            if (onProgress) {
                const progress = {
                    page,
                    total_pages,
                    records_loaded: allRecords.length,
                    total_records,
                    percentage: Math.round((page / total_pages) * 100)
                };
                onProgress(progress);
            }
        }

        return allRecords;
    }

    /**
     * Creates a new record in a Knack view
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Object} recordData - The record data to create
     * @param {string|Array<string>} [refreshViews] - The view ID/key(s) to refresh after the creation
     * @param {number} [timeout] - Optional timeout override
     * @returns {Promise<Object>} - The created record
     * @public
     */
    async createRecord(sceneId, viewId, recordData, refreshViews, timeout) {
        const url = this._formatApiUrl(sceneId, viewId);
        this._log('Creating record', { url, data: recordData });

        const { controller, signal, clear } = this._createAbortController(timeout);

        try {
            const result = await this._executeRequest(
                url,
                {
                    method: 'POST',
                    headers: this._buildHeaders(),
                    body: JSON.stringify(recordData)
                },
                signal
            );
            if (refreshViews) await this.refreshView(refreshViews);
            return result;
        } finally {
            clear();
        }
    }

    /**
     * Updates a record in a Knack view with verification of updated fields
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {string} recordId - The record ID to update
     * @param {Object} recordData - The updated record data
     * @param {string|Array<string>} [refreshViews] - The view ID/key(s) to refresh after the update
     * @param {number} [timeout] - Optional timeout override
     * @returns {Promise<Object>} - The updated record
     * @public
     */
    async updateRecord(sceneId, viewId, recordId, recordData, refreshViews, timeout) {
        const url = this._formatApiUrl(sceneId, viewId, recordId);
        this._log('Updating record', { url, data: recordData });

        const { controller, signal, clear } = this._createAbortController(timeout);

        try {
            const result = await this._executeRequest(
                url,
                {
                    method: 'PUT',
                    headers: this._buildHeaders(),
                    body: JSON.stringify(recordData)
                },
                signal
            );

            // --- basic verification & logging (non-breaking) ---
            try {
                const recordObj = result?.record ?? result; // handle both shapes defensively
                const requestedKeys = Object.keys(recordData || {});
                const failed = [];
                const succeeded = [];

                for (const key of requestedKeys) {
                    const sentVal = recordData[key];
                    const gotVal = this._extractResponseValueFromRecord(recordObj, key);

                    if (gotVal === undefined || !this._valuesEffectivelyEqual(gotVal, sentVal)) {
                        failed.push({
                            field: key,
                            sent: sentVal,
                            received: gotVal
                        });
                    }
                }

                if (failed.length > 0) {
                    const failedFields = failed.map(f => f.field).join(', ');
                    this._log('Field update verification: failures detected', {
                        sceneId,
                        viewId,
                        recordId,
                        failedFields,
                        failedCount: failed.length
                    }, 'warn');
                }
            } catch (verifyErr) {
                this._log('Field update verification error', verifyErr, 'error');
            }
            // --- end verification ---

            if (refreshViews) await this.refreshView(refreshViews);
            return result;
        } finally {
            clear();
        }
    }


    /**
     * Updates multiple records with the same data, with a delay between each request
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {Array<string>} recordIds - Array of record IDs to update
     * @param {Object} recordData - The data to update each record with
     * @param {string|Array<string>} [refreshViews] - The view ID/key(s) to refresh after the update
     * @param {number} [delay=300] - Delay in milliseconds between requests
     * @param {number} [timeout] - Optional timeout
     * @returns {Promise<Array<Object>>} - Array of responses from each update
     * @public
     */
    async updateRecordsWithDelay(sceneId, viewId, recordIds, recordData, refreshViews, delay = 300, timeout) {
        const results = [];

        for (let i = 0; i < recordIds.length; i++) {
            try {
                const result = await this.updateRecord(sceneId, viewId, recordIds[i], recordData, [], timeout);
                results.push(result);

                // Don't add delay after the last request
                if (i < recordIds.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (error) {
                results.push({ error, recordId: recordIds[i] });
            }
        }

        if (refreshViews) await this.refreshView(refreshViews);

        return results;
    }

    /**
     * Deletes a record in a Knack view
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {string} recordId - The record ID to delete
     * @param {string|Array<string>} [refreshViews] - The view ID/key(s) to refresh after the deletion
     * @param {number} [timeout] - Optional timeout override
     * @returns {Promise<Object>} - Response data
     * @public
     */
    async deleteRecord(sceneId, viewId, recordId, refreshViews, timeout) {
        const url = this._formatApiUrl(sceneId, viewId, recordId);
        this._log('Deleting record', url);

        const { controller, signal, clear } = this._createAbortController(timeout);

        try {
            const result = await this._executeRequest(
                url,
                {
                    method: 'DELETE',
                    headers: this._buildHeaders()
                },
                signal
            );
            if (refreshViews) await this.refreshView(refreshViews);
            return result;
        } finally {
            clear();
        }
    }

    /**
     * Refreshes one or more Knack views
     * @param {string|string[]} viewId - The view ID/key to refresh (format: "view_XX") or an array of view IDs
     * @returns {Promise<void|void[]>} - Promise that resolves when all views have been refreshed
     * @public
    */
    async refreshView(viewId) {
        // If viewId is an array, refresh each view in sequence
        if (Array.isArray(viewId)) {
            //this._log('Refreshing multiple views', viewId);
            const refreshPromises = viewId.map(id => this._refreshSingleView(id));
            return Promise.all(refreshPromises);
        }

        // Otherwise, refresh a single view
        return this._refreshSingleView(viewId);
    }

    /**
     * Fetches a specific record by its record ID.
     * @param {string} sceneId - The scene ID/key where the record is displayed.
     * @param {string} viewId - The ID of the view containing the record.
     * @param {string} recordId - The ID of the record to fetch.
     * @returns {Promise<Object>} - A promise that resolves to the record data.
     */
    async getRecord(sceneId, viewId, recordId) {
        if (!sceneId || !viewId || !recordId) {
            throw new Error('sceneId, viewId, and recordId are required to fetch a record.');
        }

        const apiUrl = this._formatApiUrl(sceneId, viewId, recordId);

        this._log('Fetching record by ID', apiUrl);

        try {
            return await this._executeRequest(apiUrl, {
                method: 'GET',
                headers: this._buildHeaders()
            });

        } catch (error) {
            console.error('Error fetching record by ID:', error);
            throw error;
        }
    }

    /**
     * Force logging a message regardless of developer status
     * @param {string} message - The message to log
     * @param {*} data - Optional data to log
     * @public
     */
    forceLog(message, data) {
        this._log(message, data, true);
    }

    /**
     * Check if the current user is considered a developer
     * @returns {boolean} - Whether the current user is a developer
     * @public
     */
    isDeveloper() {
        return this._canShowLogs;
    }

    /**
     * Set debug mode
     * @param {boolean} enabled - Whether to enable debug mode
     * @public
     */
    setDebug(enabled) {
        this.options.debug = enabled;
        this._log('Debug mode set to', enabled);
    }

    /**
     * Log messages with levels (info, warn, error). Defaults to info.
     * @param {string} message - The message to log
     * @param {*} data - Optional data to log
     * @param {boolean} [forceLog=false] - Force logging regardless of developer status
     * @param {'info'|'warn'|'error'} [level='info'] - Log level
     * @private
     */
    _log(message, data, level = 'info', forceLog = false) {
        if ((this.options.debug && (this._canShowLogs || forceLog))) {
            const prefix = `[KnackAPI] ${message}`;
            switch (level) {
                case 'warn':
                    console.warn(prefix, data || '');
                    break;
                case 'error':
                    console.error(prefix, data || '');
                    break;
                default:
                    console.log(prefix, data || '');
            }
        }
    }

    /**
     * Shows or hides the Knack spinner
     * @param {boolean} show - Whether to show or hide the spinner
     * @private
     */
    _toggleSpinner(show) {
        if (this.options.showSpinner) {
            if (show) {
                Knack.showSpinner();
            } else {
                Knack.hideSpinner();
            }
        }
    }

    /**
     * Checks if Knack is available
     * @throws {Error} If Knack is not available
     * @private
     */
    _checkKnack() {
        if (typeof Knack === 'undefined') {
            throw new Error('Knack is not available');
        }
    }

    /**
     * Creates an AbortController with timeout
     * @param {number} [timeout] - Optional timeout override in milliseconds
     * @returns {Object} - Object containing controller and signal
     * @private
     */
    _createAbortController(timeout) {
        const controller = new AbortController();
        const timeoutMs = timeout || this.options.timeout;

        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        return {
            controller,
            signal: controller.signal,
            clear: () => clearTimeout(timeoutId)
        };
    }

    /**
     * Get the authorization token for API requests
     * @returns {string} - Knack authorization token
     * @private
     */
    _getAuthToken() {
        return Knack.getUserToken();
    }

    /**
     * Formats an API URL for Knack view operations
     * @param {string} sceneId - The scene ID/key
     * @param {string} viewId - The view ID/key
     * @param {string} [recordId] - Optional record ID for single record operations
     * @returns {string} - The formatted API URL
     * @private
     */
    _formatApiUrl(sceneId, viewId, recordId = null) {
        let url = `${Knack.api_dev}/pages/${sceneId}/views/${viewId}`;

        if (recordId) {
            url += `/records/${recordId}`;
        } else {
            url += '/records';
        }

        return url;
    }

    /**
     * Handles API response and extracts data
     * @param {Response} response - Fetch API response
     * @returns {Promise<Object>} - Parsed response data
     * @throws {Error} If response is not OK
     * @private
     */
    async _handleResponse(response) {
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ message: "Unknown error" }));
            throw new Error(`API error ${response.status}: ${errorBody.message || response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Executes an API request with proper error handling
     * @param {string} url - The API URL
     * @param {Object} options - Fetch options
     * @param {AbortSignal} signal - AbortController signal
     * @returns {Promise<Object>} - Response data
     * @private
     */
    async _executeRequest(url, options, signal) {
        this._checkKnack();
        this._toggleSpinner(true);

        try {
            const response = await fetch(url, { ...options, signal });
            const data = await this._handleResponse(response);
            this._log('API response', data);
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        } finally {
            this._toggleSpinner(false);
        }
    }

    /**
     * Builds headers for API requests
     * @param {boolean} withAuth - Whether to include authorization header
     * @returns {Object} - Headers object
     * @private
     */
    _buildHeaders(withAuth = true) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Knack-Application-ID': Knack.application_id,
            'X-Knack-REST-API-Key': 'knack'
        };

        if (withAuth) {
            const token = this._getAuthToken();
            if (token) {
                headers['Authorization'] = token;
            }
        }

        return headers;
    }

        /**
     * Initialize logging settings based on user role
     * @private
     */
    _initLogSettings() {
        this._canShowLogs = false;

        // If developer-only mode is disabled, allow logs for everyone
        if (!this.options.developerOnly) {
            this._canShowLogs = true;
            return;
        }

        try {
            // Check if user has a developer role
            const userRoles = Knack.getUserRoleNames();
            this._canShowLogs = this.options.developerRoles.some(role =>
                userRoles.includes(role)
            );
        } catch (error) {
            // If we can't determine the user role, default to false
            this._canShowLogs = false;
            console.warn('KnackAPI: Could not determine user role, defaulting to no logs');
        }
    }

    /**
     * Builds filter parameters for API requests
     * @param {Array<Object>|Object} filters - Filter specifications
     * @returns {Object} - Formatted filter parameters
     * @public
     */
    buildFilters(filters) {
        if (!filters) return {};

        // Check if this is a JSON filter with 'match' property (Knack filter format)
        if (filters.match && filters.rules) {
            // Convert match property (e.g., 'and', 'or') and rules to URL parameters
            return {
                'filters': JSON.stringify(filters)
            };
        }

        // Handle single filter object case (not in the array)
        if (!Array.isArray(filters)) {
            filters = [filters];
        }

        const formattedFilters = {};

        filters.forEach((filter, index) => {
            const filterKey = `filters[${index}]`;

            if (filter.field) {
                formattedFilters[`${filterKey}[field]`] = filter.field;
            }

            if (filter.operator) {
                formattedFilters[`${filterKey}[operator]`] = filter.operator;
            }

            // Handle various value types
            if (filter.value !== undefined) {
                if (Array.isArray(filter.value)) {
                    filter.value.forEach((val, valIndex) => {
                        formattedFilters[`${filterKey}[value][${valIndex}]`] = val;
                    });
                } else {
                    formattedFilters[`${filterKey}[value]`] = filter.value;
                }
            }

            // Match type (exact/any/all)
            if (filter.type) {
                formattedFilters[`${filterKey}[type]`] = filter.type;
            }
        });

        return formattedFilters;
    }
    /**
     * Builds sort parameters for API requests
     * @param {Array<Object>|Object} sorters - Sort specifications
     * @returns {Object} - Formatted sort parameters
     * @public
     */
    buildSorters(sorters) {
        if (!sorters) return {};

        // Handle single sorter object case
        if (!Array.isArray(sorters)) {
            sorters = [sorters];
        }

        const formattedSorters = {};

        sorters.forEach((sorter, index) => {
            const sorterKey = `sort[${index}]`;

            if (sorter.field) {
                formattedSorters[`${sorterKey}[field]`] = sorter.field;
            }

            if (sorter.direction) {
                formattedSorters[`${sorterKey}[direction]`] = sorter.direction;
            } else {
                formattedSorters[`${sorterKey}[direction]`] = 'asc';
            }
        });

        return formattedSorters;
    }

    /**
     * Formats URL parameters for API requests
     * @param {Object} params - URL parameters
     * @returns {string} - Formatted URL parameters string
     * @private
     */
    _formatParams(params) {
        if (!params || Object.keys(params).length === 0) {
            return '';
        }

        const urlParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            urlParams.append(key, value);
        });

        return `?${urlParams.toString()}`;
    }

    /**
     * Refreshes a single Knack view (internal helper method)
     * @param {string} viewId - The view ID/key to refresh (format: "view_XX")
     * @returns {Promise<void>}
     * @private
     */
    _refreshSingleView(viewId) {
        return new Promise((resolve, reject) => {
            try {
                const view = Knack.views[viewId];

                if (!view || !view.model || !view.model.view) {
                    this._log('View not found or invalid', viewId);
                    return reject(new Error('View not found or invalid'));
                }

                const viewType = view.model.view.type;

                // Form views: use reloadForm
                if (viewType === 'form') {
                    if (typeof view.reloadForm === 'function') {
                        view.reloadForm();
                        view.render(); // Optional UI rebind
                        this._log('Form view reloaded successfully', viewId);
                        return resolve();
                    } else {
                        this._log('reloadForm not available on form view', viewId);
                        return reject(new Error('reloadForm not available'));
                    }
                }

                // Calendar views: use renderRecords()
                                if (viewType === 'calendar') {
                    if (typeof view.renderRecords === 'function') {
                        view.renderRecords();
                        Knack.hideSpinner?.();
                        this._log('Calendar view refreshed via renderRecords', viewId);
                        return resolve();
                    } else {
                        this._log('renderRecords not available on calendar view', viewId);
                        return reject(new Error('renderRecords not available'));
                    }
                }

                // Search views: skip fetch/render, just use renderResults
                if (viewType === 'search') {
                    if (typeof view.renderResults === 'function') {
                        view.renderResults();
                        this._log('Search view refreshed via renderResults', viewId);
                        return resolve();
                    } else {
                        this._log('renderResults not available on search view', viewId);
                        return reject(new Error('renderResults not available'));
                    }
                }

                // Menu views: use postRender
                if (viewType === 'menu') {
                    if (typeof view.postRender=== 'function') {
                        view.postRender();
                        this._log('Menu view refreshed via postRender', viewId);
                        return resolve();
                    } else {
                        this._log('postRender not available on menu view', viewId);
                        return reject(new Error('postRender not available'));
                    }
                }

                // All others: fetch first, then render
                view.model.fetch({
                    success: () => {
                        if (viewType === 'details') {
                            view.render();
                            view.postRender?.();
                            this._log('Details view refreshed after fetch', viewId);
                        }

                        if (viewType === 'table') {
                            view.renderResults?.();
                            this._log('Table view refreshed via renderResults', viewId);
                        }

                        resolve();
                    },
                    error: (model, error) => {
                        this._log('Error fetching view model', { viewId, error });
                        reject(error);
                    }
                });

            } catch (error) {
                this._log('Error in _refreshSingleView()', { viewId, error });
                reject(error);
            }
        });
    }

    /**
     * Formats data from connected fields in Knack records
     * @param {Array<Object>} records - The records to format
     * @param {Array<string>} connectedFields - The connected field keys to format
     * @returns {Array<Object>} - The formatted records
     * @public
     */
    formatConnectedFields(records, connectedFields) {
        if (!Array.isArray(records)) {
            records = [records];
        }

        return records.map(record => {
            const formattedRecord = { ...record };

            connectedFields.forEach(field => {
                if (record[`${field}_raw`]) {
                    formattedRecord[field] = Array.isArray(record[`${field}_raw`])
                        ? record[`${field}_raw`].map(item => ({ ...item }))
                        : { ...record[`${field}_raw`] };
                }
            });

            return formattedRecord;
        });
    }

    //*************** Helpers for comparing request and response data *************************/
    /**
     * Extracts the value of a field from a Knack record response. Checks both the plain field key and its `_raw` variant.
     * @param {Object} recordObj - The record object returned by Knack
     * @param {string} fieldKey - The field key to extract (e.g. "field_1567").
     * @returns {*} - The field value if found, otherwise undefined.
     * @private
     */
    _extractResponseValueFromRecord(recordObj, fieldKey) {
        if (!recordObj || typeof recordObj !== 'object') return undefined;
        if (Object.prototype.hasOwnProperty.call(recordObj, fieldKey)) {
            return recordObj[fieldKey];
        }
        const rawKey = `${fieldKey}_raw`;
        if (Object.prototype.hasOwnProperty.call(recordObj, rawKey)) {
            return recordObj[rawKey];
        }
        return undefined;
    }

    /**
     * Normalises values for loose comparison between request and response.
     * Handles strings, numbers, booleans, arrays (order-insensitive), and simple objects.
     * @param {*} val - The value to normalise.
     * @returns {string|null} - A normalised string suitable for comparison, or null if no value.
     * @private
     */
    _normaliseForCompare(val) {
        if (val === null || val === undefined) return null;

        // Arrays (order-insensitive, common for connections / multiselects)
        if (Array.isArray(val)) {
            const mapped = val.map(v => {
                if (v && typeof v === 'object') return v.id ?? v.value ?? JSON.stringify(v);
                return String(v);
            });
            return mapped.sort().join('|');
        }

        // Objects (shallow stable string)
        if (typeof val === 'object') {
            const keys = Object.keys(val).sort();
            return keys.map(k => `${k}:${this._normaliseForCompare(val[k])}`).join('|');
        }

        // Primitives
        return String(val).trim();
    }

    /**
     * Compares two values after normalisation to determine if they are effectively equal.
     * @param {*} a - The first value.
     * @param {*} b - The second value.
     * @returns {boolean} - True if values are considered equal, otherwise false.
     * @private
     */
    _valuesEffectivelyEqual(a, b) {
        return this._normaliseForCompare(a) === this._normaliseForCompare(b);
    }
}

/** Generic Knack API call function.
* Most of the code provided by @cortexrd
* BTW, you can use connected records by enclosing your recId param in braces.  Ex: [myRecId]
* @param {string} sceneKey - The scene key with the view to get records from, parent > child pass in the slug of the scene.
* @param {string} viewId - The view key of the view that shows the records
* @param {string} recId - The record ID of the record to be updated or the parent record id if parent > child.
* @param {object} apiData - The data to be sent to the API. Pass an empty object if its a GET request.
* @param {string} requestType - The type of request to be sent to the API get/put/post.
* @param {object} apiFilter - The filter to be sent to the API. Only needed if you want certain records from the get/put/post
* @param {array} viewsToRefresh - An array of view keys to be refreshed.
* @param {boolean} showSpinner - Whether or not to show the Knack spinner.
* @return {object} data - The data returned from the API. */
async function caAPI(sceneKey = null, viewId = null, recId = null,	apiData = {}, requestType = "", apiFilter = {},	viewsToRefresh = [], showSpinner = false) {
    return new Promise(function (resolve, reject) {
        requestType = requestType.toUpperCase();

        if ( viewId ===	null /*recId === null || @@@ can be null for post req*/ /*data === null ||*/ ||
                !(requestType === "PUT" || requestType === "GET" || requestType === "POST" ||	requestType === "DELETE") ) {
            reject(new Error("Called caAPI with invalid parameters: view = " +	viewId + ", recId = " + recId + ", reqType = " + requestType));
            return;
        }

        const failsafeTimeout = setTimeout(function () {
            if (intervalId) {
                clearInterval(intervalId);
                reject(new Error("Called caAPI with invalid scene key"));
                return;
            }
        }, 5000);

        // testRenderKeyRegex(sceneKey)  will check to see if you pass in a slug or a scene key slug is used for parent > child
        let sceneId = sceneKey.startsWith('scene_') ? sceneKey : Knack.scenes.getBySlug(sceneKey).attributes.key;

        // allow an interval between each try of the API call 100 ms works for most cases
        let intervalId = setInterval(function () {
            if (!sceneId) {
                sceneId = sceneKey.startsWith('scene_') ? sceneKey : Knack.scenes.getBySlug(sceneKey).attributes.key;
            } else {
                clearInterval(intervalId);
                intervalId = null;
                clearTimeout(failsafeTimeout);
                let apiURL = `https://api.knack.com/v1/pages/${sceneId}/views/${viewId}/records/`;

                if (recId && !sceneKey.startsWith('scene_')) {
                    // if parent > child GET
                    apiURL = `${apiURL}?${sceneKey}_id=${recId}`;
                } else if (recId && sceneKey.startsWith('scene_')) {
                    // Normal API call
                    apiURL = `${apiURL}${recId}`;
                } else if (!$.isEmptyObject(apiFilter)) {
                    // if filter is passed in
                    apiURL = `${apiURL}?filters=${encodeURIComponent(
                        JSON.stringify(apiFilter)
                    )}`;
                }

                if (showSpinner) Knack.showSpinner();
                if (ktl.account.isDeveloper()) {
                    // if account is developer log the API call
                    console.log('apiURL =', apiURL);
                    console.log(`caAPI - sceneKey: ${sceneKey}, caAPI - viewId: ${viewId}, recId: ${recId}, requestType: ${requestType}, apiData: ${JSON.stringify(apiData)}, apiFilter: apiFilter: ${JSON.stringify(apiFilter)}`);
                }

                $.ajax({
                    url: apiURL,
                    type: requestType,
                    crossDomain: true, //Attempting to reduce the frequent but intermittent CORS error message.
                    retryLimit: 4, //Make this configurable by app,
                    headers: {
                        Authorization: Knack.getUserToken(),
                        'X-Knack-Application-Id': Knack.application_id,
                        'X-Knack-REST-API-Key': 'knack',
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*.knack.com",
                    },
                    data: JSON.stringify(apiData),
                    success: function (data, textStatus, jqXHR) {
                        Knack.hideSpinner();
                        if (ktl.account.isDeveloper()) { // if account is developer log the API call
                            ktl.log.clog('green', "caAPI data : ");
                            console.log(data);
                        }

                        if (viewsToRefresh.length === 0) {
                            resolve(data);
                        } else {
                            ktl.views.refreshViewArray(viewsToRefresh).then(function () {
                                resolve(data);
                            });
                        }
                    },
                    error: function (response /*jqXHR*/) {
                        ktl.log.clog('purple', 'caAPI error:');
                        console.log("retries:", this.retryLimit, "\nresponse:", response);

                        if (this.retryLimit-- > 0) {
                            const ajaxParams = this; //Backup 'this' otherwise this will become the Window object in the setTimeout.
                            setTimeout(function () {
                                $.ajax(ajaxParams);
                            }, 500);
                            return;
                        } else {
                            //All retries have failed, log this.
                            console.log("retry limit reached");
                            Knack.hideSpinner();
                            response.caller = "caAPI";
                            response.viewId = viewId;
                            reject(response);
                        }
                    },
                });
            }
        }, 100);
    });
}

/** Retrieves a nested value from an object using a dot-separated path.
 * Example: const obj = { a: { b: { c: 123 } } }; getNestedValue(obj, 'a.b.c'); // returns 123
 * @param {Object} obj - The object to extract the value from.
 * @param {string} path - Dot-separated path string (e.g. 'field_2398_raw.street').
 * @returns {*} - The value at the given path, or undefined if any level is missing. */
function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

/** Extracts plain text from an HTML string.
 * @param {string} htmlString - The HTML content.
 * @returns {string} Text content without HTML tags.*/
function removeHtml(htmlString) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    return tempDiv.textContent;
}

/** Searches for an element containing the exact text provided.
 * Can optionally filter by tag name and class name, within a specific root element.
 * @param {string} text - The exact text content to search for.
 * @param {Element|Document} [root=document] - The root element to search within.
 * @param {Object} [filter={}] - Optional filters: { tag, class }
 * @returns {Element|null} - The found element or null if no match is found.
 */
function findElementByText(text, root = document, filter = {}) {
    const { tag, class: classFilter } = filter;

    const elements = tag ? root.querySelectorAll(tag) : root.querySelectorAll('*');

    for (let element of elements) {
        const matchesClass = classFilter
            ? classFilter.split(/\s+/).every(cls => element.classList.contains(cls))
            : true;

        if (matchesClass && element.textContent.trim() === text) {
            return element;
        }
    }
    console.warn(`[findElementByText] No element found with text "${text}"` +
        (tag ? `, tag "${tag}"` : '') +
        (classFilter ? `, class "${classFilter}"` : ''));

    return null;
}

/**
 * Gets the selected radio value for a given Knack field ID.
 * @param {string|number} fieldId - Knack field ID
 * @returns {string} The trimmed value of the selected radio input, or an empty string if none selected*/
function getSelectedRadioValue(fieldId) {
    const containerId = `kn-input-field_${fieldId}`;
    const container = document.getElementById(containerId);
    const checked = container?.querySelector('input[type="radio"]:checked');
    return checked?.value?.trim() || '';
}

/** Replace text in given selector or td (using field ID) with that passed in when regex matched
 * @param {string|integer} selectorOrFieldID - selector or ID of td field where text to replace is
 * @param {regex} regex - regex to match
 * @param {string} replaceTxt - text to replace matched text with
 * @param {boolean} replaceAll - if true, replace all occurrences of the matched text */
function replaceTextRegex(selectorOrFieldID, regex, replaceTxt, replaceAll = false) {
    const selector = typeof selectorOrFieldID === 'number' ? `td.field_${selectorOrFieldID}` : selectorOrFieldID;

    $(selector).each(function () {
        const oldText = $(this).text();
        const newText = replaceAll ? oldText.replaceAll(regex, replaceTxt) : oldText.replace(regex, replaceTxt);
        $(this).text(newText);
    });
}

/**
 * Show/hide message based on value(s) of selected option in one or more dropdowns
 * @param {string} viewId - View ID where select element(s) are located
 * @param {number|number[]} fieldIds - ID or array of select field IDs
 * @param {string|string[]} valuesToMatch - Value or array of values to match to show the message
 * @param {string} msgSelector - CSS selector for the message element to show/hide
 * @param {boolean} isConxSelect - Whether this is a connection field select
 *
 * @example
 * // Show message if any of the selects has value 'Yes' or 'Maybe'
 * showHideMsgBasedOnSelect('view_123', [456, 789], ['Yes', 'Maybe'], '#myMsg');
 */
function showHideMsgBasedOnSelect(viewId, fieldIds, valuesToMatch, msgSelector, isConxSelect = false) {
    // Normalize fieldIds and valuesToMatch to arrays for consistent handling
    const fieldIdArr = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
    const matchValues = Array.isArray(valuesToMatch) ? valuesToMatch : [valuesToMatch];

    // Helper to get selected value for a field
    function getSelectedValue(fieldId) {
        if (isConxSelect) {
            const selectedItem = document.querySelector(`#${viewId}_field_${fieldId}_chzn li.result-selected`);
            return selectedItem ? selectedItem.textContent.trim() : '';
        } else {
            const selectElement = document.getElementById(`${viewId}-field_${fieldId}`);
            return selectElement ? selectElement.value : '';
        }
    }

    // Function to check all fields and toggle message
    const toggleMessageBasedOnSelect = () => {
        const hasMatch = fieldIdArr.some(fieldId => matchValues.includes(getSelectedValue(fieldId)));
        toggleMessage(hasMatch, msgSelector);
    };

    // Attach listeners to all select elements
    fieldIdArr.forEach(fieldId => {
        const selectElement = document.getElementById(`${viewId}-field_${fieldId}`);
        if (!selectElement) {
            console.error(`Select element not found: ${viewId}-field_${fieldId}`);
            return;
        }
        addInputEventListener(selectElement, toggleMessageBasedOnSelect, { runOnInit: true });
    });
}

/**
 * Show/hide message based on radio button values.
 * Supports three modes:
 * 1. "all": All fields must match their value(s) to show message.
 * 2. "any": Any field matches its value(s) to show message.
 * 3. "map": Each field must match its specific value (field-value mapping).
 * Accepts either positional arguments (for backward compatibility) or a single options object.
 *
 * @param {number|number[]|object|object} fieldIds - Field ID(s) or {fieldId: valueToMatch, ...} for "map" mode, or options object.
 * @param {string|string[]|object} [valuesToMatch] - Value(s) to match, or {fieldId: valueToMatch, ...} for "map" mode.
 * @param {string} [selector] - CSS selector for the message element to show/hide.
 * @param {Function} [callback] - Optional callback function to execute on change.
 * @param {Object} [params] - Optional parameters to pass to the callback.
 * @param {'all'|'any'|'map'} [mode='any'] - Matching mode: "all", "any", or "map".
 *
 * @example
 * // Show if both radios are "Yes"
 * showHideMsgBasedOnRadios([123, 456], "Yes", "#msg", null, null, "all");
 *
 * // Show if either radio is "Yes"
 * showHideMsgBasedOnRadios([123, 456], "Yes", "#msg", null, null, "any");
 *
 * // Show if field 123 is "Yes" and field 456 is "No"
 * showHideMsgBasedOnRadios({123: "Yes", 456: "No"}, null, "#msg", null, null, "map");
 *
 * // New: Pass options object
 * showHideMsgBasedOnRadios({
 *   fieldIDs: [123, 456],
 *   valuesToMatch: "Yes",
 *   selector: "#msg",
 *   callback: null,
 *   params: null,
 *   mode: "all"
 * });
 */
function showHideMsgBasedOnRadios(fieldIds, valuesToMatch, selector, callback, params, mode = 'any') {
    // Support options object as first param
    let opts;
    if (typeof fieldIds === 'object' && fieldIds !== null && (
        fieldIds.hasOwnProperty('fieldIds') || fieldIds.hasOwnProperty('selector') || fieldIds.hasOwnProperty('mode')
    )) {
        opts = Object.assign({
            fieldIds: null,
            valuesToMatch: null,
            selector: null,
            callback: null,
            params: null,
            mode: 'any'
        }, fieldIds);
    } else {
        opts = { fieldIds, valuesToMatch, selector, callback, params, mode };
    }

    let fieldIdArr, matchValuesArr;

    // Enforce canonical parameter name 'fieldIds'. If legacy keys are used, error and exit.
    if (opts.fieldIDs || opts.fieldID) {
        console.error('[showHideMsgBasedOnRadios] Deprecated parameter "fieldIDs"/"fieldID" used; please pass "fieldIds" only.');
        return;
    }

    let isMapMode = opts.mode === 'map' || (typeof opts.fieldIds === 'object' && !Array.isArray(opts.fieldIds));

    // Validate required parameters
    if (!opts.fieldIds) {
        console.error('[showHideMsgBasedOnRadios] Missing required parameter "fieldIds". Example: showHideMsgBasedOnRadios([123], "Yes", "#msg")');
        return;
    }
    if (!opts.selector) {
        console.error('[showHideMsgBasedOnRadios] Missing required parameter "selector". Example: showHideMsgBasedOnRadios([123], "Yes", "#msg")');
        return;
    }

    // Get the target message element
    const messageElement = document.querySelector(opts.selector);
    if (!messageElement) {
        console.error(`Message element not found: ${opts.selector}`);
        return;
    }

    // Handler for radio change
    const handleRadioChange = () => {
        let showMessage = false;

        if (isMapMode) {
            // "map" mode: fieldIds is an object {fieldId: valueToMatch, ...}
            showMessage = Object.entries(opts.fieldIds).every(([fid, val]) => {
                const checkedRadio = document.querySelector(`#kn-input-field_${fid} input[type="radio"]:checked`);
                return checkedRadio && checkedRadio.value === val;
            });
        } else {
            // "all"/"any" mode: fieldIds and valuesToMatch are arrays
            fieldIdArr = Array.isArray(opts.fieldIds) ? opts.fieldIds : [opts.fieldIds];
            matchValuesArr = Array.isArray(opts.valuesToMatch) ? opts.valuesToMatch : [opts.valuesToMatch];

            const matches = fieldIdArr.map(fid => {
                const checkedRadio = document.querySelector(`#kn-input-field_${fid} ${INPUT_RADIO_CHECKED_SELECTOR}`);
                return checkedRadio && matchValuesArr.includes(checkedRadio.value);
            });

            if (opts.mode === 'all') {
                showMessage = matches.every(Boolean);
            } else { // "any" (default)
                showMessage = matches.some(Boolean);
            }
        }

        toggleMessage(showMessage, opts.selector);

        if (opts.callback && typeof opts.callback === 'function') {
            opts.callback(showMessage, opts.params);
        }
    };

    // Attach listeners to all relevant radio buttons
    if (isMapMode) {
        Object.keys(opts.fieldIds).forEach(fid => {
            const radios = document.querySelectorAll(`#kn-input-field_${fid} input[type="radio"]`);
            radios.forEach(radio => {
                addInputEventListener(radio, handleRadioChange, { runOnInit: true });
            });
        });
    } else {
        fieldIdArr = Array.isArray(opts.fieldIds) ? opts.fieldIds : [opts.fieldIds];
        fieldIdArr.forEach(fid => {
            const radios = document.querySelectorAll(`#kn-input-field_${fid} input[type="radio"]`);
            radios.forEach(radio => {
                addInputEventListener(radio, handleRadioChange, { runOnInit: true });
            });
        });
    }
}

/** Show/Hide message based on value(s) of radio button(s), optional callback fnc.
 * @param {integer|array} fieldID - Field ID(s) of the radio button or an array of field IDs
 * @param {string|array} valuesToMatch - Value(s) to match to show the message
 * @param {string} selector - Selector for the message to show/hide
 * @param {function} [callback] - Optional callback function to execute on change
 * @param {object} [params] - Optional object containing additional parameters to pass to the callback*/
function showHideEleBasedOnRadios(fieldID, valuesToMatch, selector, isMultiple = false) {
    const fieldSelector = `#kn-input-field_${fieldID}`;

    if ($(fieldSelector).length === 0) { // Check field exsists
        console.error(`Field with ID ${fieldID} not found on the page.`);
        return;
    }

    if ($(selector).length === 0) {  // Check target selector exists
        console.error(`Target selector "${selector}" not found on the page.`);
        return;
    }

    $(fieldSelector).change(function () {
        const selectVal = $(`${fieldSelector} :checked`).val();
        const matchCondition = isMultiple
            ? $.inArray(selectVal, valuesToMatch) !== -1
            : selectVal == valuesToMatch;
        $(selector).toggle(matchCondition);
    }).change();
}

/** show or hide element if match to key found in string in key/vale object
 * @param {string} searchStr - string to search for match
 * @param {object} selectorMap - key/value pairs {string : selector} */
function showHideEleBasedOnString(searchStr, selectorMap) {
    Object.entries(selectorMap).forEach(([key, selector]) => {
        const shouldShow = searchStr.includes(key);
        $(selector).toggle(shouldShow);
    });
}

/**
 * Display a notification on a specified element and return the notification element.
 * @param {Object} options - Configuration options for the notification
 * @param {HTMLElement|string} options.target - The element to attach the notification to (DOM element or selector)
 * @param {array|string} options.message - Text of notification (can be a string or an array of strings)
 * @param {string} [options.backgroundColor='#4CAF50'] - Background color of the notification
 * @param {string} [options.className=''] - CSS classes to apply to the notification
 * @param {number} [options.delay=2000] - Time in milliseconds before the notification disappears (0 for no auto-removal)
 * @param {number} [options.fadeTime=500] - Time in milliseconds for fade transition
 * @param {Object} [options.styles={}] - Additional CSS styles to apply to notification
 * @param {Function} [options.onShow=null] - Callback function when notification is shown
 * @param {Function} [options.onHide=null] - Callback function when notification is hidden
 * @returns {HTMLElement} - The created notification element
 */
function showNotification(options) {
    // Default options
    const defaults = {
        target: null,
        message: '',
        backgroundColor: '',
        className: '',
        delay: 2000,
        fadeTime: 500,
        styles: {},
        onShow: null,
        onHide: null
    };

    // Merge provided options with defaults
    const settings = { ...defaults, ...options };

    // Handle different input types for target
    const targetElement = typeof settings.target === 'string'
        ? document.querySelector(settings.target)
        : settings.target;

    if (!targetElement) {
        console.error('Target element not found:', settings.target);
        return null;
    }

    // Store the original z-index
    const originalZIndex = getComputedStyle(targetElement).zIndex;

    // Ensure target can be positioned properly
    if (originalZIndex === 'auto' || originalZIndex === '0') {
        targetElement.style.position = targetElement.style.position || 'relative';
        targetElement.style.zIndex = '1';
    }

    // Create notification element
    const notification = document.createElement('div');

    const baseClass = 'custom-notification';
    // Split className string(s) into individual class tokens
    let customClasses = [];
    if (Array.isArray(settings.className)) {
        customClasses = settings.className.flatMap(cls => cls.split(' '));
    } else if (typeof settings.className === 'string' && settings.className.trim()) {
        customClasses = settings.className.trim().split(/\s+/);
    }
    notification.classList.add(baseClass, ...customClasses);

    // set content and text styles
    const textStyleKeys = ['color', 'fontWeight', 'fontSize', 'lineHeight', 'textAlign'];
    const messages = Array.isArray(settings.message) ? settings.message : [settings.message];
    messages.forEach(msg => {
        const p = document.createElement('p');
        p.innerHTML = msg;

        textStyleKeys.forEach(key => {
            if (settings.styles?.[key]) {
                p.style[key] = settings.styles[key];
            }
        });
        notification.appendChild(p);
    });

    // Set base styles
    const baseStyles = {
        backgroundColor: settings.backgroundColor,
        opacity: '1',
        transition: `opacity ${settings.fadeTime}ms ease`,
    };

    // Apply base styles
    Object.assign(notification.style, baseStyles);

    // Apply custom styles
    Object.assign(notification.style, settings.styles);

    // Append notification to target
    targetElement.appendChild(notification);

    // Call onShow callback if provided
    if (typeof settings.onShow === 'function') {
        settings.onShow(notification);
    }

    // Set timeout to fade out and remove notification
    if (settings.delay > 0) {
        setTimeout(() => {
            notification.style.opacity = '0';

            // Remove element after fade effect completes
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);

                    // Reset target z-index to original value if we changed it
                    if (originalZIndex === 'auto' || originalZIndex === '0') {
                        targetElement.style.zIndex = originalZIndex;
                    }

                    // Call onHide callback if provided
                    if (typeof settings.onHide === 'function') {
                        settings.onHide();
                    }
                }
            }, settings.fadeTime);
        }, settings.delay);
    }

    return notification;
}

const isNodeList = val => NodeList.prototype.isPrototypeOf(val);
const isjQueryInstance = val => typeof window !== 'undefined' && window.jQuery && val instanceof window.jQuery;

/**
 * Normalises any supported selector/collection into a flat array of HTMLElements.
 * @param {HTMLElement|HTMLElement[]|NodeList|string|jQuery} target - Inputs or selector to resolve
 * @returns {HTMLElement[]} Array of matched elements (possibly empty)
 * @example
 * const inputs = normaliseInputs('#view_123 input');
 */
function normaliseInputs(target) {
    if (!target) return [];
    if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
    if (isjQueryInstance(target)) return target.toArray();
    if (Array.isArray(target)) return target;
    if (isNodeList(target)) return Array.from(target);
    return [target];
}

/**
 * Escapes a string for safe use inside CSS selectors.
 * Falls back to a manual escape when CSS.escape is unavailable.
 * @param {string} value - Raw selector fragment
 * @returns {string} Escaped selector fragment
 * @example
 * const safeName = cssEscape('[field]');
 */
function cssEscape(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
    return String(value).replace(/([^a-zA-Z0-9_\-])/g, '\\$1');
}

/** Clear the value(s) of a given input or array of inputs.
 * Supports text/date/select/textarea/checkbox/radio.
 * @param {HTMLElement|HTMLElement[]|NodeList|string|jQuery} input - Input(s) or selector to clear
 * @param {boolean} triggerChange - whether to trigger change/input events*/
function clearInput(inputContainer, triggerChange = false) {
    const normalisedInputs = normaliseInputs(inputContainer);

    normalisedInputs.forEach(field => {
        if (!field) return;

        const inputs = field.matches && field.matches('input, select, textarea')
            ? [field]
            : Array.from(field.querySelectorAll('input, select, textarea'));

        if (!inputs.length) return;

        const processedRadioGroups = new Set();

        inputs.forEach(input => {
            if (!input) return;

            const targetInputs = (() => {
                if (input.type !== 'radio' || !input.name) {
                    return [input];
                }

                if (processedRadioGroups.has(input.name)) {
                    return [];
                }
                processedRadioGroups.add(input.name);

                const scoped = field.querySelectorAll
                    ? field.querySelectorAll(`${INPUT_RADIO_SELECTOR}[name="${cssEscape(input.name)}"]`)
                    : [];
                if (scoped.length) return Array.from(scoped);

                const globalRadios = document.querySelectorAll(`${INPUT_RADIO_SELECTOR}[name="${cssEscape(input.name)}"]`);
                return globalRadios.length ? Array.from(globalRadios) : [input];
            })();

            targetInputs.forEach(targetInput => {
                const hadValue = (targetInput.type === 'checkbox' || targetInput.type === 'radio')
                    ? targetInput.checked
                    : targetInput.value !== '';

                if (targetInput.type === 'checkbox' || targetInput.type === 'radio') {
                    targetInput.checked = false;
                } else if (targetInput.tagName === 'SELECT') {
                    targetInput.value = '';
                    if (targetInput.multiple) {
                        Array.from(targetInput.options).forEach(option => option.selected = false);
                    } else {
                        targetInput.selectedIndex = -1;
                    }

                    if (typeof window !== 'undefined' && window.jQuery) {
                        const selectEl = $(targetInput);
                        if (selectEl.data('chosen')) {
                            selectEl.trigger('liszt:updated');
                        }
                    }
                } else {
                    targetInput.value = '';
                }

                if (triggerChange && hadValue) {
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    });
}

/** Remove given options from select
 * @param {integer} fieldID - ID of select field
 * @param {array} removeArr - array of items to remove
 * @return {boolean} - false if not array */
function removeOpsFromSelect(fieldID, removeArr) {
    if ($.isArray(removeArr)) {
        $(removeArr).each(function (i, val) {
            $(`${fieldID} option`).filter(`[value="${val}"]`).remove();
        });
        return true;
    } else return false;
}

/** Remove given options from checkbox or radio butttons
 * @param {integer} fieldID - ID of select field
 * @param {array} removeArr - array of items to remove
 * @return {boolean} - false if not array */
function removeFrmRadioCheckBox(fieldID, removeArr) {
    if ($.isArray(removeArr)) {
        $(removeArr).each(function (i, val) {
            removeElement(`#kn-input-field_${fieldID} .control:contains("${val}")`);
        });
        return true;
    } else return false;
}

/**** Function to change the label text of a radio button
 * @param {integer} fieldId - field id of radio
 * @param {string} originalLabelText - current label text
 * @param {integer} newLabelTex - new text for label */
function changeRadioButtonLabel(fieldId, originalLabelText, newLabelText) {
    const field = $(`#kn-input-field_${fieldId}`);
    const label = field.find('label.option.radio').filter(function() {
        return $(this).text().trim() === originalLabelText;
    });

    const detachedInput = label.find('input').detach();
    label.text(` ${newLabelText}`);
    label.prepend(detachedInput);
}

/** Setup status field, set background color based on status
 * @param {string} fieldId - field ID number (without 'field_' prefix) that holds the status
 * @param {boolean} isAmber - default false, true if bg color should be amber if not complete/requested
 */
function setupFieldStatus(fieldId, isAmber = false) {
    // Find all elements with the given field class
    const fieldElements = document.querySelectorAll(`.field_${fieldId}`);

    if (!fieldElements.length) return;

    // Process each matching element
    fieldElements.forEach(element => {
        const fieldStatus = element.textContent.trim();
        // Apply appropriate background color based on status
        if (isAmber && fieldStatus.includes("Not")) {
            element.style.backgroundColor = "var(--warning)";
        }
        else if (!fieldStatus.includes("Not") && !isAmber) {
            element.style.backgroundColor = "var(--success)";
        }
    });
}

/** Remove 'null' from span
* @param {string} spanID - class of span to remove null from */
function removeNull(spanID) {
   removeElement(`span.${spanID}:contains("null")`);
}

/** Select val dropdown
 * @param {string} fieldID - ID of select field
 * @param {string} value - text to select */
function selectFromSelect(fieldID, value) {
    const optionExists = $(`${fieldID} option[value="${value}"]`).length > 0;
    if (optionExists) {
        $(`${fieldID} option[value="${value}"]`).prop("selected", true);
    } else {
        console.error(`Option "${value}" does not exist in the dropdown with ID "${fieldID}".`);
    }
}

/** Select val from conx dropdown
 * @param {string} viewId- ID of view where conx is
 * @param {integer} fieldID - ID of conx field
 * @param {string} txtVal - text to select */
function selectFromConx(viewId, fieldID, txtVal) {
    var selectArr = $('#' + viewId + `-field_${fieldID} option`);
    selectArr.each(function () {
        //console.log('Option Val: ' + $(this).val()); console.log('Option Txt: ' + $(this).text());
        if ($(this).text() == txtVal) {
            selectFromSelect('#' + viewId + `-field_${fieldID}`, $(this).val());
            return false;
        }
    });
}

/**** Add Placeholder to Field Input
 * @param {integer} fieldID - field ID
 * @param {string} placeholder - placeholder to put in input */
function addPlaceholderToInput(fieldID, placeholder) {
    const input = document.getElementById(`field_${fieldID}`);
    if (input) {
        input.setAttribute("placeholder", placeholder);
    }
}

/**
 * Waits for one or more fields in a Knack detail view to be available and retrieves their values.
 * * @param {object} options - The options for the function.
 * @param {string} options.viewId - The ID of the Knack view to wait for.
 * @param {number|number[]} options.fieldIds - The field ID(s) to retrieve values from.
 * @param {number} [options.delay=20000] - Maximum time to wait for the field(s) in milliseconds.
 * @param {boolean} [options.returnHtml=false] - If true, returns the HTML content; otherwise, returns text.
 * @returns {Promise<string|object|null>} - Field value(s) or null if not found.
 */
async function waitGetValueFromDetail({viewId, fieldIds, delay = 20000, returnHtml = false}) {
    // Normalize fieldIds to always be an array for uniform handling
    const fieldIdArray = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
    const fieldValues = {};

    try {
        // Attempt to wait for all fields and track missing fields
        const fieldStatuses = await Promise.all(
            fieldIdArray.map(async fieldId => {
                // Use viewId if provided; otherwise search globally
                const selector = viewId
                    ? `#${viewId} .field_${fieldId} .kn-detail-body span`
                    : `.field_${fieldId} .kn-detail-body span`;

                try {
                    const element = await waitSelector({
                        selector,
                        delay
                    });
                    return { fieldId, found: true, element };
                } catch (error) {
                    console.warn(`Field ${fieldId} not found ${viewId ? `in view ${viewId}` : 'globally'} within ${delay}ms.`);
                    return { fieldId, found: false, element: null };
                }
            })
        );

        // Retrieve values for all fields (or set null for missing fields)
        fieldStatuses.forEach(({ fieldId, found, element }) => {
            if (found && element) {
                const value = returnHtml
                    ? element.innerHTML?.trim() || null
                    : element.textContent?.trim() || null;
                fieldValues[fieldId] = value;
            } else {
                fieldValues[fieldId] = null;
            }
        });

        // If only one field ID was provided, return its value directly
        if (!Array.isArray(fieldIds)) {
            return fieldValues[fieldIds];
        }

        return fieldValues;
    } catch (error) {
        console.error(`Error retrieving values for fields in view ${viewId}:`, error);

        // Preserve already-found values and only set null for missing ones
        fieldIdArray.forEach(fieldId => {
            if (fieldValues[fieldId] === undefined) {
                fieldValues[fieldId] = null;
            }
        });

        return Array.isArray(fieldIds) ? fieldValues : null;
    }
}

/** Get value from a detail field
 * @param {string} fieldID - ID of the field where the value is located.
 * @param {boolean} [returnHtml=false] - Whether to return HTML instead of plain text.
 * @returns {string|null} - The text or HTML content of the specified field. */
function getValueFromDetail(fieldID, returnHtml = false) {
    const fieldElement = $(`.field_${fieldID} .kn-detail-body`).first();

    if (fieldElement.length === 0) {
        console.log(`Error: Element with field_${fieldID} not found.`);
        return null;
    }
    return returnHtml ? fieldElement.html().trim() : fieldElement.text().trim();
}

/**
 * Inserts the value from a detail field into a span or element.
 * @param {integer|string} fieldID - id of field where value is
 * @param {string} insertSpan - selector for the span/element to insert data into (e.g. "#mySpan" or ".myClass")
 */
function insertValFromDetail(fieldID, insertSpan) {
    const value = getValueFromDetail(fieldID);
    const elements = document.querySelectorAll(insertSpan);
    elements.forEach(el => {
        el.textContent = value;
    });
}

/**
 * Inserts the logged-in user's name into the specified element(s)
 * @param {string|Element|NodeList} selector - CSS selector, DOM element, or NodeList to insert the user name into
 * @param {Function} [callback] - Optional callback function to execute after inserting the username
 * @returns {string} - The inserted username
 */
function insertLoggedInUser(selector, callback) {
    try {
        // Get the current user's name from Knack
        const userName = Knack.getUserAttributes()?.name || 'Unknown User';

        // Handle different selector types
        if (typeof selector === 'string') {
            // CSS selector: Find all matching elements
            const elements = document.querySelectorAll(selector);
            if (elements.length === 0) {
                console.warn(`No elements found matching selector: ${selector}`);
                return userName;
            }

            // Insert the user name into each matching element
            elements.forEach(element => {
                element.textContent = userName;
            });
        } else if (selector instanceof Element) {
            // Single DOM element
            selector.textContent = userName;
        } else if (selector instanceof NodeList) {
            // NodeList of elements
            selector.forEach(element => {
                element.textContent = userName;
            });
        } else {
            console.error('Invalid selector type provided to insertLoggedInUser');
            return userName;
        }

        // Execute callback if provided
        if (typeof callback === 'function') {
            callback(userName);
        }

        return userName;
    } catch (error) {
        console.error('Error inserting logged in user:', error);
        return 'User Unknown';
    }
}

function borderRadiusLastVisible(viewId, delay) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) return;

    const menuList = viewElement.querySelector('.menu-links__list');
    if (!menuList) return;

    const visibleLis = Array.from(menuList.children).filter(
        li => window.getComputedStyle(li).display !== 'none' && li.offsetParent !== null
    );

    if (visibleLis.length === 0) return;

    // Remove border-radius from all <a> first
    visibleLis.forEach(li => {
        const a = li.querySelector('a');
        if (a) a.style.borderRadius = '';
    });

    // Add border-radius to the last visible <a>
    const lastLi = visibleLis[visibleLis.length - 1];
    const lastA = lastLi.querySelector('a');
    if (lastA) lastA.style.borderRadius = '0 .35em .35em 0';

    if (delay) {
        setTimeout(() => borderRadiusLastVisible(viewId), delay);
    }
}

/**
 * Changes an input field to a range slider with labels and synchronizes values
 * @param {string} viewId - The ID of the view containing the input fields
 * @param {string|Element} sliderFieldSelector - Selector or element for the slider field
 * @param {string|Element} resultFieldSelector - Selector or element for the result display field
 * @param {object} attributes - Object with slider attributes
 * @param {number} attributes.min - Minimum value for the slider
 * @param {number} attributes.max - Maximum value for the slider
 * @param {number} attributes.step - Step value for the slider
 * @param {number} attributes.value - Initial value for the slider
 * @param {string} [attributes.minLabel] - Label for minimum value (optional)
 * @param {string} [attributes.maxLabel] - Label for maximum value (optional)
 * @param {string} [attributes.class] - Class to add to slider field & class-result (optional)
 */
function changeToSlider(viewId, sliderFieldSelector, resultFieldSelector, attributes = {}) {
    // Full selectors with viewId included
    const fullSliderSelector = typeof sliderFieldSelector === 'string'
        ? `#${viewId} ${sliderFieldSelector}`
        : sliderFieldSelector;

    const fullResultSelector = typeof resultFieldSelector === 'string'
        ? `#${viewId} ${resultFieldSelector}`
        : resultFieldSelector;

    // Get elements from selectors or use provided elements
    const sliderField = typeof fullSliderSelector === 'string'
        ? document.querySelector(fullSliderSelector)
        : fullSliderSelector;

    const resultField = typeof fullResultSelector === 'string'
        ? document.querySelector(fullResultSelector)
        : fullResultSelector;

    if (!sliderField || !resultField) {
        console.error(`Slider or result field not found in view ${viewId}`);
        return;
    }

    const sliderFieldId = sliderField.id;
    const resultFieldId = resultField.id;

    // Extract labels and optional class, then remove them from the attributes object
    const minLabel = attributes.minLabel || '';
    const maxLabel = attributes.maxLabel || '';
    const extraClass = attributes.class || '';                       // NEW

    // Create a copy without label and class properties so they are not fed into setAttribute
    const sliderAttributes = { ...attributes };
    delete sliderAttributes.minLabel;
    delete sliderAttributes.maxLabel;
    delete sliderAttributes.class;                                   // NEW

    // Convert input to range slider
    sliderField.classList.remove('input');
    sliderField.type = 'range';
    sliderField.classList.add('slider');

    // Add optional class(es) to slider and mirrored “-result” class to the result field
    if (extraClass) {                                                // NEW
        extraClass.split(/\s+/).filter(Boolean).forEach(cls => {
            document.getElementById(`kn-input-${sliderFieldId}`).classList.add(cls);
            document.getElementById(`kn-input-${resultFieldId}`).classList.add(`${cls}-result`);
        });
    }

    // Set remaining attributes on slider
    for (const [key, value] of Object.entries(sliderAttributes)) {
        sliderField.setAttribute(key, value);
    }

    // Add event listener for slider input
    sliderField.addEventListener('input', () => {
        resultField.value = sliderField.value;
    });

    // Add event listener for result field input
    resultField.addEventListener('keyup', () => {
        // Validate if input is in range before setting slider value
        const numValue = parseFloat(resultField.value);
        const min = parseFloat(sliderField.min || 0);
        const max = parseFloat(sliderField.max || 100);

        if (!isNaN(numValue) && numValue >= min && numValue <= max) {
            sliderField.value = numValue;
        }
    });

    // Trigger initial sync
    resultField.value = sliderField.value;

    // Get the parent control element
    if (!sliderFieldId) {
        return; // Can't find control without ID
    }

    const controlDiv = document.querySelector(`#${viewId} #kn-input-${sliderFieldId} div.control`);
    if (!controlDiv) {
        return; // Can't add labels without container
    }

    // Add min label if provided
    if (minLabel) {
        const minLabelElem = document.createElement('label');
        minLabelElem.className = 'slideLabel';
        minLabelElem.textContent = minLabel;
        minLabelElem.style.left = '1px';
        controlDiv.appendChild(minLabelElem);
    }

    // Add max label if provided
    if (maxLabel) {
        const maxLabelElem = document.createElement('label');
        maxLabelElem.className = 'slideLabel';
        maxLabelElem.textContent = maxLabel;
        maxLabelElem.style.right = '2px';
        controlDiv.appendChild(maxLabelElem);
    }
}

/**
 * Opens a kn-asest file from a button click, either by redirecting or in an overlay/new window
 * @param {string} viewId - ID of view where button is located
 * @param {string} btnText - Text on the button to target
 * @param {string} filePath - Path to the file to open
 * @param {boolean} [openInNewWindow=false] - Whether to open in new window
 */
function openFileFromBtn(viewId, btnText, filePath, openInNewWindow = false) {
    const viewElement = document.getElementById(viewId);
    if (!viewElement) {
        console.error(`View element with ID ${viewId} not found`);
        return;
    }

    // Find all potential button elements in the view
    const allButtons = [];
    allButtons.push(...viewElement.querySelectorAll('a'));
    allButtons.push(...viewElement.querySelectorAll('button'));

    // Filter buttons by text content
    const matchingButtons = Array.from(allButtons).filter(btn => {
        return btn.textContent.trim().includes(btnText);
    });

    if (matchingButtons.length === 0) {
        console.error(`Button with text "${btnText}" not found in view ${viewId}`);
        return;
    }
    // Add click event listeners to all matching buttons
    matchingButtons.forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();

            if (openInNewWindow) {

                    // Parse the file extension from the path
                    const arr = filePath.split('.');
                    const extension = arr[arr.length - 1];

                    // Generate API URL to access the file
                    const url = `https://api.knack.com/v1/applications/${Knack.application_id}/download/asset/${filePath}`;

                    // Get appropriate viewer URL based on file type
                    const viewerUrl = fileViewer(extension, url);

                    // Open in new window
                    window.open(viewerUrl, '_blank');

            } else {
                // Direct navigation by appending filePath to sanitised current URL
                window.location.href = sanitiseURL(window.location.href) + KN_ASSET_PREFIX + filePath;
            }
        });
    });

}

/***** Redirect to Prev pop-up from frm after close unless scene to ignore in  background
 * Note - more selectors can be added to listener
 * @param {object}  event - calling event
 * @param {string} newURL - url to redirect to */
function handleRedirect(event, newURL) {
    if (event.type === 'knack-form-submit') {
        setTimeout(() => {
            window.location.href = newURL;
        }, 300);
    } else if (event.type === 'knack-scene-render' || event.type === 'knack-view-render') {
        document.querySelectorAll('button.close-modal').forEach(btn => {
            btn.addEventListener('click', function () {
                setTimeout(() => {
                    window.location.href = newURL;
                }, 300);
            }, { once: true });
        });
    }
}

/** Get new url based on number of / to remove
* @param {string} currURL - The current URL */
function getNewURL(currURL, numPops = 3) {
    const urlSegments = sanitiseURL(currURL).split('/');
    for (let i = 1; i <= numPops; i++) {
        urlSegments.pop(); // Remove segment
    }
    return urlSegments.join('/');
}

/** Get the background scene ID (ignores any scenes inside a modal).
 * @returns {string|null} The DOM id of the background scene (e.g. 'kn-scene_1151'), or null if none found. */
function getBackgroundSceneId() {
    const allScenes = document.querySelectorAll('#knack-body .kn-scenes .kn-scene');
    for (const scene of allScenes) {
        if (!scene.closest('.kn-modal')) {
            return scene.id || null;
        }
    }
    return null;
}

/**
 * Check whether the current background scene should be ignored. Used in handleRedirect to prevent redirecting
 * @param {(number|string)[]} scenes - Array of scene IDs (can be numbers or strings).
 * @returns {boolean} True if the background scene matches one of the scenes to ignore.
 */
function isSceneToIgnore(scenes) {
    const backgroundSceneId = getBackgroundSceneId();

    if (!backgroundSceneId || !scenes.length) return false;
    const backgroundSceneNumber = Number(backgroundSceneId.replace('kn-scene_', ''));
    const sceneNumbers = scenes.map(scene => Number(scene)).filter(scene => !Number.isNaN(scene));

    return sceneNumbers.includes(backgroundSceneNumber);
}

/** Check if current user role  match for given user role/s will match if any ONE matches
     * @param {array} userRole - array of userroles
     * @return {boolean} - true if match found false otherwise */
function isUserRole(userRoleArr) {
    var matchFound = false;
    $(userRoleArr).each(function (i, val) {
        if (Knack.getUserRoles(val)) {
            matchFound = true;
            return false;
        }
    });
    return matchFound;
}

/** Check if current user name matches the given user name
 * @param {string} nameToMatch - Name to match against current user name
 * @return {boolean} - true if match found, false otherwise */
function isUserName(nameToMatch) {
    const userName = Knack.getUserAttributes()?.name;
    return userName === nameToMatch;
}

/**
 * Replace large numbers in table cells.
 * If isLink is true, finds <span class="knViewLink__label"> containing cellIdent as text.
 * If isLink is false, finds <td class="field_{cellIdent}">.
 * If the cell's number is greater than maxNum, replaces it with replaceTxt.
 * @param {string|number} cellIdent - Field ID (number or string) or text to match in cell.
 * @param {number} maxNum - Maximum allowed number before replacement.
 * @param {string} replaceTxt - Text to replace the number with.
 * @param {boolean} isLink - If true, search for link label spans; if false, search for field class tds.
 */
function replaceLargeNo(cellIdent, maxNum, replaceTxt, isLink) {
    let cells = [];
    if (isLink) {
        // Find all spans with class knViewLink__label containing cellIdent as text
        cells = Array.from(document.querySelectorAll('span.knViewLink__label'))
            .filter(span => span.textContent.includes(cellIdent));
    } else {
        // Find all td elements with class field_{cellIdent}
        cells = Array.from(document.querySelectorAll(`td.field_${cellIdent}`));
    }

    cells.forEach(cell => {
        // Get the text content, parse as integer
        const intVal = parseInt(cell.textContent.replace(/,/g, ''), 10);
        if (!isNaN(intVal) && intVal > maxNum) {
            cell.textContent = replaceTxt;
        }
    });
}

/**
 * Get a 24-character hex ID from an element’s id or class tokens.
 * Checks the element’s `id` first, then each token in `classList`,
 * and returns the first value that matches a 24-char hex pattern.
 *
 * @param {Element|null} el - The DOM element to inspect.
 * @returns {string|null} The first matching 24-char hex ID, or null if none found.
 */
function getIdFromElement(el) {
    if (!el) return null;
    const HEX24 = /^[a-fA-F0-9]{24}$/;

    if (el.id && HEX24.test(el.id)) return el.id;

    for (const token of el.classList || []) {
        if (HEX24.test(token)) return token;
    }
    return null;
}

/**
 * Extract the connected record ID from a Knack table cell.
 * Targets the canonical connection node: `span[data-kn="connection-value"]`.
 * If not found, falls back to scanning descendant <span> elements for a 24-char hex token in id/class.
 * @param {HTMLTableCellElement|Element|null} cellEl - The <td> (or container) holding the connection.
 * @returns {string|null} The connected record’s 24-char hex ID, or null if not found.
 *
 * @example
 * // <td class="field_196"><span><span class="673c...737f" data-kn="connection-value">JON DOE</span></span></td>
 * const clientId = getConnectionIdFromCell(cellEl); // '673c6b4ee5a91c02d47a737f'
 */
function getConnectionIdFromCell(cellEl) {
    if (!cellEl) return null;

    // Primary: explicit connection value node
    const conn = cellEl.querySelector('span[data-kn="connection-value"]');
    const idFromConn = getIdFromElement(conn);
    if (idFromConn) return idFromConn;

    // Fallback: any descendant <span>
    const spans = cellEl.querySelectorAll('span');
    for (const s of spans) {
        const id = getIdFromElement(s);
        if (id) return id;
    }
    return null;
}

/* get current record id */
function getRecordID(part = null) {
    const urlStr = sanitiseURL(window.location.href);
    const parts = urlStr.split("/");
    if (!part) return parts[parts.length - 2];
    return parts[parts.length - part];
}

/****Display Notifications
 * @param {string} insertNotificationAfter - The selctor to attach the notification too
 * @param {string} notificationTxt - text of notification
 * @param {string} notificationCol - Background colour of the notification
 * @param {string} ca_class - classes to use for the notification
 * @param {integer} delay - length of delay */
function showPopUpNotification(insertNotificationAfter, notificationTxt, notificationCol, ca_class, delay) {
    Knack.showSpinner();
    $(`<div class="${ca_class}">${notificationTxt}</div>`).css({"background-color": notificationCol,})
        .insertAfter(insertNotificationAfter)
        .delay(delay)
        .fadeOut(function () {
            removeElement(this);
        });
}

/** Remove query string from URL
* @param {string} urlToClean - URL to clean pass in window.location.href
* @return {string} cleanURL */
function sanitiseURL(urlToClean) {
    return urlToClean.toString().split('?')[0];
}

/**
 * Initializes secure local storage with proper error handling
 * @param {string} storageKey - The key under which data will be stored in secure local storage
 * @returns {Promise<Object>} A promise that resolves to the storage content object, or an empty object if storage doesn't exist
 *
 * @example
 * // Initialize secure storage for meeting minutes
 * initSecureStorage('meetingMinutes').then(storage => {
 *     console.log('Storage initialized:', storage);
 * }).catch(error => {
 *     console.error('Failed to initialize storage:', error);
 * });
 */
async function initSecureStorage(storageKey) {
    if (!storageKey || typeof storageKey !== 'string') {
        return Promise.reject(new Error('Invalid storage key provided. Must be a non-empty string.'));
    }

    return ktl.storage.initSecureLs()
        .then(() => {
            try {
                const storageContent = ktl.storage.lsGetItem(storageKey, false, false, true);

                // If storage is empty, create a new empty object and store it
                if (!storageContent) {
                    console.log(`Storage '${storageKey}' doesn't exist yet, initializing empty storage.`);
                    const emptyStorage = '{}';
                    ktl.storage.lsSetItem(storageKey, emptyStorage, false, false, true);
                    return {};
                }

                // Parse the storage content
                try {
                    return JSON.parse(storageContent);
                } catch (parseError) {
                    console.warn(`Error parsing content of '${storageKey}', returning empty object:`, parseError);
                    // Reset the storage to a valid state if parsing fails
                    ktl.storage.lsSetItem(storageKey, '{}', false, false, true);
                    return {};
                }
            } catch (getItemError) {
                console.error(`Error accessing storage '${storageKey}':`, getItemError);
                throw new Error(`Failed to get item from secure storage: ${getItemError.message}`);
            }
        })
        .catch(initError => {
            console.error('Failed to initialize secure storage:', initError);
            throw new Error(`Secure storage initialization failed: ${initError.message}`);
        });
}

/** Set secure local storage item
* @param {string} storageKey - the key to the storage
* @param {string} recordKey - the key to store the items under
* @param {string} fieldId - the fieldId of the input
* @param {string} valueToStore - the value of the input
* @param {number} daysUntilExpiry - the number of days until the item expires
* @returns {object} - the items from local storage */
function setSecureStorage(storageKey, recordKey, fieldId, valueToStore, daysUntilExpiry = 5) {
    initSecureStorage(storageKey).then(currentStorage => {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + daysUntilExpiry);
        currentStorage[recordKey] = currentStorage[recordKey] || {};
        currentStorage[recordKey].expirationDate = expirationDate.getTime();
        currentStorage[recordKey][fieldId] = valueToStore;
        ktl.storage.lsSetItem(storageKey, JSON.stringify(currentStorage), false, false, true);
    });
}

/** Gets item from local storage if key exists
* @param {string} storageKey - the key to the storage
* @param {string} recordKey - the key to store the items under
* @returns {object} - the items from local storage*/
function getSecureStorage(storageKey, recordKey) {
    return initSecureStorage(storageKey).then(currentStorage => {
        const now = new Date().getTime();
        for (let id in currentStorage) {
            if (now > currentStorage[id].expirationDate) {
                delete currentStorage[id];
            }
        }
        ktl.storage.lsSetItem(storageKey, JSON.stringify(currentStorage), false, false, true);
        return currentStorage[recordKey] ? currentStorage[recordKey] : '';
    });
}

/** Check all radio groups have been answered on given view
 * @param {string} viewId - view containing radio buttons
 * @param {Array} fieldToExclude - array of field IDs to exclude
 * @returns {boolean} - true if all visible radio groups are answered, false otherwise */
function checkAllRadioAnswered(viewId, fieldToExclude = []) {
    const names = new Set();

    // Collect unique group names for visible radio buttons only, excluding specified fields
    $(`#${viewId} :radio:visible`).each(function () {
        const parentFieldId = parseInt($(this).closest('[id^="kn-input-field_"]').attr('id').split('_')[1]);
        if (!fieldToExclude.includes(parentFieldId)) {
            names.add($(this).attr('name'));
        }
    });

    // Compare the count of checked visible radios with the count of visible groups
    const checkedVisibleRadios = $(`#${viewId} :radio:visible:checked`).filter(function () {
        const parentFieldId = parseInt($(this).closest('[id^="kn-input-field_"]').attr('id').split('_')[1]);
        return !fieldToExclude.includes(parentFieldId);
    }).length;

    return checkedVisibleRadios === names.size;
}

/**Change a tables cell text based on another cell
 * @param {object} view - the view object
 * @param {object} records - the records object
 * @param {string} fieldIdToMatch - the field id to match
 * @param {string} fieldIdToChange - the field id to change
 * @param {string} textToMatch - the text to match
 * @param {string} newText - the new text to change to
 * @param {string} bkgColor - the background color to change to */
function changeCellTextBasedOnCellContent(viewId, records, fieldIdToMatch, fieldIdToChange, textToMatch, newText, bkgColor = 'success') {
    records.forEach(record => {
        if (record[fieldIdToMatch].includes(textToMatch)) {
            const row = $(`tr[id=${record.id}]`);
            const cell = row.find(`td:eq(${$(`#${viewId} th.${fieldIdToChange}`).index()})`);
            cell.css({
                'background-color': `var(--${bkgColor})`,
                'font-weight': '700',
                'color': 'black'
            }).find('.knViewLink__label').text(newText);
        }
    });
}

/**  toggle the show/hide content
 * @param {object} buttonSelector - jQuery selector for button
 * @param {object} hiddenSelector - jQuery selector for hidden content
 * @param {object} arrowSelector - jQuery selector for arrow
 * @param {number} delay - delay in ms
 * @param {boolean} flexOn - true if flex display is required */
function toggleShowHideViewContent(buttonSelector, hiddenSelector, arrowSelector, delay, flexOn = false) {
    buttonSelector.off('click.showHide').on('click.showHide', function() {
        hiddenSelector.slideToggle(delay);
        arrowSelector.toggleClass('down up');
        buttonSelector.toggleClass('active');
        flexOn && hiddenSelector.css('display', 'flex');
    });
}

/** Shrink view back to hidden state
 * @param {object} shrinkLinkSelector
 * @param {object} hiddenSelector
 * @param {object} arrowSelector
 * @param {number} delay
 * @param {object} buttonSelector */
function shrinkContent(shrinkLinkSelector, hiddenSelector, arrowSelector, delay, buttonSelector) {
    shrinkLinkSelector.off('click.shrinkLink').on('click.shrinkLink', function() {
        hiddenSelector.slideUp(delay);
        removeClassFromSelector(arrowSelector, 'up').addClass('down');
        removeClassFromSelector(buttonSelector, 'active');
    });
}

/**  Show/Hide content
 * @param {string} showHideId - unique id for show/hide content
 * @param {number} delay - delay in ms
 * @param {boolean} flexOn - true if flex display is required */
function showHideViewContent(showHideId, delay, flexOn = false) {
    const buttonSelector = $(`#show-hide_${showHideId}`);
    const arrowSelector = $(`#arrow_${showHideId}`);
    const shrinkLinkSelector = $(`#shrink-link_${showHideId}`);
    const hiddenSelector = $(`.${showHideId}`);
    toggleShowHideViewContent(buttonSelector, hiddenSelector, arrowSelector, delay, flexOn);
    shrinkContent(shrinkLinkSelector, hiddenSelector, arrowSelector, delay, buttonSelector);
}

/**  append shrink link
 * @param {string} appendToId - unique ID to append shrink link to
 * @param {string} showHideId - unique id for show/hide content*/
    function appendShrinkLink(wrapperId, showHideId, showHideGroup = false) {
    const shrinkLinkHTML = `<a class="show-hide-btn shrink-link" id="shrink-link_${showHideId}">Shrink &nbsp;<span class="arrow up" id="arrow_${showHideId}">◀</span></a>`;
    const shrinkLinkSelector = $(`#shrink-link_${showHideId}`);

    // Check if the shrink link already exists
    if (shrinkLinkSelector.length === 0) {
        if (showHideGroup) {
            $(`#${wrapperId}`).append(shrinkLinkHTML);
        } else {
            $(`#${wrapperId}`).find('.show-hide-section').append(shrinkLinkHTML);
        }
    }
}

/**  replace title with button
 * @param {string} viewId
 * @param {string} showHideId - unique id for show/hide content */
function replaceTitleWithButton(viewId, showHideId) {
    const viewTitle = $(`#${viewId} h2.kn-title`);
    const titleText = viewTitle.text();
    const showHideBtnHTML = `<div class="show-hide-btn" id="show-hide_${showHideId}">${titleText} &nbsp;<span class="arrow down" id="arrow_${showHideId}">◀</span></div>`;

    if ($(`#show-hide_${showHideId}`).length === 0) {
        viewTitle.html(showHideBtnHTML);
    }
}

/**  wrap content for show/hide
 * @param {string} viewId
 * @param {string} viewType
 * @param {string} showHideId - unique id for show/hide content */
function wrapContentForShowHide(viewId, viewType, showHideId) {
    const wrappers = {
        'table': '.kn-table-wrapper, .kn-records-nav',
        'form': 'form, .kn-form-confirmation',
        'list': '.kn-list-content, .kn-records-nav',
    };

    const wrapper = wrappers[viewType];
    const viewElement = $(`#${viewId}`);
    const sectionElement = viewElement.find('section');

    if (wrapper) {
        const wrapperElement = viewElement.find(wrapper);
        // Check if the wrapper element is already wrapped
        if (!wrapperElement.parent().is('section')) {
            wrapperElement.wrapAll(`<section class='${showHideId} show-hide-section box-with-border' />`);
        }
    } else {
        // Check if the section element already has the classes
        if (!sectionElement.hasClass(`${showHideId} show-hide-section box-with-border`)) {
            sectionElement.addClass(`${showHideId} show-hide-section box-with-border`);
        }
    }
}

/** Toggle elements
 * @param {Array|jQuery|string} selectors - Single or multiple jQuery selectors/elements
 * @param {boolean|Array} show - Single boolean or an array of booleans for each selector
 * i.e. toggleElements([ele1, ele2, [false, true]); hide ele1 show ele2*/
function toggleElements(selectors, show) {
    if (Array.isArray(selectors)) {
        selectors.forEach((selector, index) => {
            const shouldShow = Array.isArray(show) ? show[index] : show;
            $(selector).toggle(shouldShow);
        });
    } else {
        $(selectors).toggle(show);
    }
}

/** returns the form id of the current view
 * @param {string} viewId */
function getFormId(viewId) {
    return $(`#${viewId} .kn-submit input[name="id"]`).val();
}

/**
 * Helper function to split a comma-separated string into a trimmed array
 * @param {string} fieldValue - The field value to split
 * @returns {string[]} Array of trimmed values
 */
function splitAndTrimField(fieldValue) {
    if (!fieldValue) return [];
    return fieldValue.split(",").map(item => item.trim());
}

/**
 * Keep two text inputs synchronised in both directions - Updates in one are mirrored to the other.
 * - Guards against infinite loops with an internal flag.
 * - Fires 'input' and 'change' events so Knack detects updates.
 * - Marks elements with data-notes-sync-bound to avoid duplicate binding.
 * - On init, the non-empty value (if any) is copied across.
 *
 * @param {HTMLInput} textInputA - First text input.
 * @param {HTMLInput} textInputB - Second text input.
 */
function syncTextInputs(textInputA, textInputB) {
    // Prevent duplicate binding if Knack re-renders and elements are reused
    if (textInputA.dataset.notesSyncBound === '1' && textInputB.dataset.notesSyncBound === '1') return;
    textInputA.dataset.notesSyncBound = '1';
    textInputB.dataset.notesSyncBound = '1';

    let isSyncing = false;

    function propagate(sourceInput, targetInput) {
        if (isSyncing) return; //prevent loops
        const next = sourceInput.value;
        if (targetInput.value === next) return;

        isSyncing = true;
        targetInput.value = next;

        // Notify any listeners (including Knack) that the value changed
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));

        isSyncing = false;
    }

    function onInputA() { propagate(textInputA, textInputB); }
    function onInputB() { propagate(textInputB, textInputA); }

    textInputA.addEventListener('input', onInputA);
    textInputA.addEventListener('change', onInputA);
    textInputB.addEventListener('input', onInputB);
    textInputB.addEventListener('change', onInputB);

    // Initial reconciliation: prefer the non-empty one
    const aVal = (textInputA.value || '').trim();
    const bVal = (textInputB.value || '').trim();
    if (aVal && aVal !== bVal) {
        propagate(textInputA, textInputB);
    } else if (bVal && bVal !== aVal) {
        propagate(textInputB, textInputA);
    }
}

/**
 * Creates an HTML button element with specified attributes.
 * @param {Object} options - Configuration for the button
 * @param {string} options.id - The ID to assign to the button (optional)
 * @param {string} options.html - The HTML content to set inside the button
 * @param {string} options.className - CSS class(es) to assign to the button (will be added to default "kn-button" class)
 * @param {string} options.type - Button type (default: 'button')
 * @param {Object} options.attributes - Additional attributes to set on the button
 * @param {Function} options.onClick - Click event handler for the button
 * @return {HTMLElement} - The created button element
 */
function createButton(options) {
    // Allow simple signature for backward compatibility
    if (typeof arguments[0] === 'string') {
        options = {
            id: arguments[0],
            html: arguments[1],
            className: arguments[2]
        };
    }

    // Set defaults
    options = Object.assign({
        id: '',
        html: '',
        className: '',
        type: 'button',
        attributes: {},
        onClick: null
    }, options);

    // Create button element
    const button = document.createElement('button');

    // Set basic attributes
    if (options.id) button.id = options.id;

    // Always add kn-button class, then add any additional classes
    button.className = 'kn-button' + (options.className ? ' ' + options.className : '');

    button.type = options.type;
    button.innerHTML = options.html;

    // Add any additional attributes
    for (const [key, value] of Object.entries(options.attributes)) {
        button.setAttribute(key, value);
    }

    // Add click handler if provided
    if (typeof options.onClick === 'function') {
        button.addEventListener('click', options.onClick);
    }

    return button;
}

/**  Add Buttons to Scroll to Top and Close Modal */
function addModalNavigationButtons() {
    // Create the button container to hold both buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-control-buttons';

    // Create the scroll to top button
    const scrollToTopBtn = createButton({
        id: 'scrollToTopBtn',
        html: '<i class="fa fa-arrow-up"></i>',
        className: 'modalButton success-bkgd scroll-to-top-btn',
        onClick: function() {
            document.querySelector('.modal-card-head').scrollIntoView({
                behavior: 'auto',
                block: 'start'
            });
        }
    });

    // Create the close modal button
    const closeModalBtn = createButton({
        id: 'closeModalBtn',
        html: '<i class="fa fa-times"></i>',
        className: 'modalButton warning-bkgd close-modal-btn',
        onClick: function() {
            // Find and click the existing close modal button
            const knackCloseBtn = document.querySelector('button.close-modal');
            if (knackCloseBtn) {
                knackCloseBtn.click();
            } else {
                // Fallback approach if the standard close button isn't found
                const modalBg = document.getElementById('kn-modal-bg-0');
                if (modalBg) {
                    modalBg.style.display = 'none';
                }
            }
        }
    });

    // Add buttons to the container
    buttonContainer.appendChild(scrollToTopBtn);
    buttonContainer.appendChild(closeModalBtn);

    // Find the modal background and append the button container
    const modalBg = document.getElementById('kn-modal-bg-0');
    if (modalBg) {
        modalBg.appendChild(buttonContainer);

        // Initially hide the button container
        buttonContainer.style.display = 'none';

        // Add scroll event listener to the modal background
        modalBg.addEventListener('scroll', function() {
            const modalCard = document.querySelector(".modal-card-body");
            if (!modalCard) return;

            const rect = modalCard.getBoundingClientRect();

            buttonContainer.style.left = `${rect.right}px`;

            // Show/hide the button based on scroll position
            if (modalBg.scrollTop > 100) {
                buttonContainer.style.display = 'flex';
                // Fade-in effect
                buttonContainer.style.opacity = '1';
                buttonContainer.style.transition = 'opacity 0.3s';
            } else {
                // Fade-out effect
                buttonContainer.style.opacity = '0';
                buttonContainer.style.transition = 'opacity 0.3s';

                // Set a timeout to actually hide the element after the transition
                setTimeout(function() {
                    if (modalBg.scrollTop <= 100) {
                        buttonContainer.style.display = 'none';
                    }
                }, 300);
            }
        });
    }
}

/**
 * Capitalises the input text based on the specified criteria.
 * @param {string} viewId - The ID of the view containing the input element.
 * @param {string} inputSelector - The selector for the input element within the view.
 * @param {Object} [options] - Optional settings.
 * @param {string} [options.mode='title'] - 'all' for ALL CAPS, 'title' for Title Case, 'sentence' for Sentence case.
 * @param {boolean} [options.trim=true] - Whether to trim whitespace.
 * @param {boolean} [options.smartWords=true] - If true, don't capitalise short words (like "of", "and") in title mode.
 */
function capitaliseInput(viewId, inputSelector, options = { mode: 'title', trim: true, smartWords: true }) {
    let viewElement = document.getElementById(viewId);
    if (!viewElement) viewElement = document.querySelector(`#connection-form-view:has(input[value="${viewId}"])`);
    if (!viewElement) return;

    const input = viewElement.querySelector(inputSelector);
    if (!input) return;

    // List of words to ignore in title case (unless first/last)
    const minorWords = ['and', 'or', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'a', 'an', 'but', 'nor', 'as'];

    addInputEventListener(input, function (e, inputElement) {
        let str = inputElement.value;
        if (!str) return;

        const { mode = 'title', trim = true, smartWords = true } = options || {};

        // Only trim on blur, not on input
        let isBlur = e && e.type === 'blur';
        if (trim && isBlur) str = str.trim();

        let result = str;

        if (mode === 'all') {
            result = str.toUpperCase();
        } else if (mode === 'sentence') {
            result = str.charAt(0).toUpperCase() + str.slice(1);
        } else if (mode === 'title') {
            // Only process if not just typing a space
            if (!e || e.inputType !== 'insertText' || e.data !== ' ') {
                result = str.replace(/\b[\w'-]+\b/g, function (word, idx, full) {
                    // Capitalise first letter and any letter after - or '
                    let capitalised = word.replace(/(^|[-'])\w/g, function (match) {
                        return match.toUpperCase();
                    }).replace(/(?<!^|[-'])\w/g, function (match) {
                        return match.toLowerCase();
                    });
                    // Smart words logic
                    if (
                        smartWords &&
                        minorWords.includes(capitalised.toLowerCase()) &&
                        idx !== 0 &&
                        idx + word.length !== full.length
                    ) {
                        return capitalised.toLowerCase();
                    }
                    return capitalised;
                });
            }
        }

        // Only update if changed, and preserve caret position if possible
        if (inputElement.value !== result) {
            const pos = inputElement.selectionStart;
            inputElement.value = result;
            if (typeof pos === 'number' && inputElement === document.activeElement) {
                inputElement.setSelectionRange(pos, pos);
            }
        }
    }, { events: ['input', 'blur'] });
}

/** Capitalises a string.
 * @param {string} str - The string to be capitalised.
 * @param {Object} [options] - Optional settings.
 * @param {boolean} [options.allCaps=true] - If true, capitalise the whole string; if false, capitalise first letter of each word.
 * @returns {string} - The capitalised string.
 */
function capitaliseString(str, options = { allCaps: true }) {
    if (typeof str !== 'string' || !str.trim()) return '';
    const { allCaps = true } = options;

    if (allCaps) {
        return str.trim().toUpperCase();
    } else {
        // Capitalise first letter of each word, preserving other characters
        return str.trim().replace(/\b\w/g, char => char.toUpperCase());
    }
}

/**
 * Wait for a details view to load and get the connection ID(s) from the detail element
 * @param {object} options - The options for the function
 * @param {string} options.viewId - The ID of the view to wait for
 * @param {number} options.fieldId - The ID of the field to get the conxId from
 * @param {number} [options.delay=5000] - The delay in milliseconds to wait for the selector
 * @return {Promise<string|string[]|null>} - A promise that resolves to the conxId(s) or null if not found
 */
async function waitGetConxIdFromDetailId({ viewId, fieldId, delay = 5000 }) {
    try {
        const selector = `#${viewId} .field_${fieldId} .kn-detail-body > span > span > span`;

        // Wait for the elements to be available
        const elements = await waitSelector({
            selector,
            delay,
            returnType: 'elements'
        });

        if (!elements || elements.length === 0) {
            console.log(`No connection elements found with selector: ${selector}`);
            return null;
        }

        // Give the DOM a moment to fully render the spans with IDs
        return new Promise(resolve => {
            setTimeout(() => {
                const ids = Array.from(elements).map(element => element.id).filter(Boolean);

                if (ids.length === 0) {
                    console.log('No connection IDs found in elements');
                    resolve(null);
                } else {
                    // Return a single ID or array depending on number of results
                    resolve(ids.length === 1 ? ids[0] : ids);
                }
            }, 100);
        });
    } catch (error) {
        console.error(`Error getting connection ID from detail view: ${error}`);
        return null;
    }
}

/**
 * Creates a dropdown HTML structure compatible with Knack forms
 * @param {string} dropName - ID for the dropdown element
 * @param {boolean} [isRequired=true] - Whether the dropdown is required
 * @param {string} [labelText='Select'] - The label text to display
 * @returns {HTMLDivElement} - The created dropdown container element
 */
function createDropdownHTML(dropName, isRequired = true, labelText = 'Select') {
    // Create container element
    const container = document.createElement('div');
    container.className = 'kn-input kn-input-multiple_choice control';

    // Create label and its child elements
    const label = document.createElement('label');
    label.setAttribute('for', dropName);
    label.className = 'label kn-label';

    const labelTextSpan = document.createElement('span');
    labelTextSpan.textContent = `${labelText} `;

    const selectTextSpan = document.createElement('span');
    selectTextSpan.className = 'selectText';

    // Append elements to label
    label.appendChild(labelTextSpan);
    label.appendChild(selectTextSpan);

    // Add required asterisk if needed
    if (isRequired) {
        const requiredSpan = document.createElement('span');
        requiredSpan.className = 'kn-required';
        requiredSpan.textContent = '*';
        label.appendChild(requiredSpan);
    }

    // Create select container
    const selectContainer = document.createElement('div');
    selectContainer.className = 'kn-select';

    const innerSelectContainer = document.createElement('div');
    innerSelectContainer.className = 'kn-select';

    // Create select element
    const select = document.createElement('select');
    select.setAttribute('data-placeholder', 'Select');
    select.setAttribute('name', dropName);
    select.setAttribute('id', dropName);
    select.className = 'select';
    select.style.verticalAlign = 'bottom';

    // Build the component hierarchy
    innerSelectContainer.appendChild(select);
    selectContainer.appendChild(innerSelectContainer);
    container.appendChild(label);
    container.appendChild(selectContainer);

    return container;
}

// Supported office, PDF, and image extensions
const OFFICE_EXTENSIONS = [
    "docx", "odt", "rtf", "docm", "doc", "dotx", "dotm", "dot",
    "xlsx", "xls", "ppts", "ppt", "pptx"
];
const IMAGE_EXTENSIONS = [
    "png", "jpeg", "jpg", "gif", "bmp", "svg", "webp", "tiff", "ico"
];

/**
 * Inserts or replaces asset/file links in a view.
 * - For .ca-link/.ca-link-child: sets href using ID or assetURLs.
 * - For .ca-asset/.kn-view-asset: opens Office files in Office Online, PDF in PDF.js, others direct download.
 * - For images: uses Knack's default behaviour (no viewer link).
 * @param {string} viewId - The ID of the view containing the links/assets.
 * @example
 * updateLinksAndAssets('view_1234');
 */
function updateLinksAndAssets(viewId) {
    const currentURL = sanitiseURL(window.location.href);
    const viewElement = document.getElementById(viewId);
    if (!viewElement) {
        console.error(`View element with ID ${viewId} not found`);
        return;
    }

    /**
     * Returns asset info for a given link or asset element.
     * @param {HTMLElement} el - The link or asset element.
     * @param {boolean} isKnViewAsset - True if .kn-view-asset, false if .ca-link.
     * @returns {object} { assetId, fileName, extension, assetUrl }
     */
    function getAssetInfoFromElement(el, isKnViewAsset = false) {
        let assetId, fileName;
        if (isKnViewAsset) {
            assetId = el.getAttribute('data-asset-id');
            fileName = el.getAttribute('data-file-name');
        } else {
            const linkID = el.id;
            if (!assetURLs[linkID]) return {};
            const fileParts = assetURLs[linkID].split('/');
            assetId = fileParts[0];
            fileName = fileParts[fileParts.length - 1];
        }
        if (!fileName || !assetId) return {};
        const extMatch = fileName.match(/\.([^.]+)$/);
        const extension = extMatch ? extMatch[1].toLowerCase() : '';
        const assetUrl = `https://api.knack.com/v1/applications/${Knack.application_id}/download/asset/${assetId}/${encodeURIComponent(fileName)}`;
        return { assetId, fileName, extension, assetUrl };
    }

    /**
     * Sets the correct href/target/download for a link or asset element.
     * @param {HTMLElement} el - The link or asset element.
     * @param {object} info - Asset info object.
     * @param {boolean} isKnViewAsset - True if .kn-view-asset, false if .ca-link.
     */
    function setFileViewerLink(el, info, isKnViewAsset = false) {
        if (!info.extension) return;
        if (IMAGE_EXTENSIONS.includes(info.extension)) {
            // Use Knack's default behaviour for images
            el.setAttribute('href', `${sanitiseURL(window.location.href)}kn-asset/1542-3553-3690-${info.assetId}/${info.fileName}`);
        } else if (OFFICE_EXTENSIONS.includes(info.extension)) {
            el.setAttribute('href', `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(info.assetUrl)}`);
            el.setAttribute('target', '_blank');
        } else if (info.extension === "pdf") {
            el.setAttribute('href', `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(info.assetUrl)}`);
            el.setAttribute('target', '_blank');
        } else {
            el.setAttribute('href', info.assetUrl);
            el.setAttribute('download', info.fileName);
        }
        if (isKnViewAsset) {
            el.textContent = info.fileName;
        }
    }

    // Unified handler for both .ca-link/.ca-link-child and .kn-view-asset
    function processAssetElement(el, isKnViewAsset = false) {
        const info = getAssetInfoFromElement(el, isKnViewAsset);
        if (!info.extension) return;
        setFileViewerLink(el, info, isKnViewAsset);
    }

    // Handle .ca-link and .ca-link-child
    viewElement.querySelectorAll('.ca-link, .ca-link-child, .ca-link-user').forEach(linkEle => {
        const linkID = linkEle.id;
        let fullFormURL = currentURL;

        if (!linkID) {
            console.error(`%c Error: ${linkEle.textContent} - Link must have ID to define URL `, 'color: red; font-weight: bold;');
            return;
        }

        const isAsset = linkEle.classList.contains('ca-asset');
        const formName = isAsset ? assetURLs[linkID] : linkID;

        if (linkEle.classList.contains('ca-link-child')) {
            fullFormURL += `${formName}/${getRecordID()}`;
        } else if (linkEle.classList.contains('ca-link-user')) {
            fullFormURL += `${formName}/${Knack.getUserAttributes()?.id}`;
        } else {
            fullFormURL += formName;
        }

        if (isAsset) {
            processAssetElement(linkEle, false);
        } else {
            if (linkEle.getAttribute('target') === '_blank') {
                linkEle.classList.add('extLink');
            }
            linkEle.setAttribute('href', fullFormURL);
        }
    });

    // Handle .kn-view-asset (replace with viewer links)
    viewElement.querySelectorAll('.kn-view-asset').forEach(assetEl => {
        const info = getAssetInfoFromElement(assetEl, true);
        if (!info.extension) return;
        if (IMAGE_EXTENSIONS.includes(info.extension)) return; // Use Knack's default behaviour for images

        const a = document.createElement('a');
        a.target = "_blank";
        setFileViewerLink(a, info, true);
        assetEl.replaceWith(a);
    });
}

/**
 * Inserts the logged-in user's name or the staff name from the detail view into the specified element(s).
 * @param {HTMLElement|string} target - The element(s) or selector to insert the name into.
 */
function insertStaffName(target) {
    try {
        const staffFieldSelector = '.kn-detail-label';
        const userName = Knack.getUserAttributes()?.name || '';

        waitSelector({
            selector: staffFieldSelector,
            textCondition: { text: 'Staff Name', exact: true },
            timeout: 5000,
        }).then((staffField) => {
            const staffNameText = staffField.nextElementSibling.textContent.trim() || userName;

            // Support DOM element, NodeList, or selector string
            if (typeof target === 'string') {
                document.querySelectorAll(target).forEach(el => el.textContent = staffNameText);
            } else if (target instanceof Element) {
                target.textContent = staffNameText;
            } else if (target instanceof NodeList || Array.isArray(target)) {
                Array.from(target).forEach(el => el.textContent = staffNameText);
            }
        })
        .catch(err => {
            console.error(`Error finding staff field: ${err}`);
            // Fallback to using the user name if the field is not found
            if (typeof target === 'string') {
                document.querySelectorAll(target).forEach(el => el.textContent = userName);
            } else if (target instanceof Element) {
                target.textContent = userName;
            } else if (target instanceof NodeList || Array.isArray(target)) {
                Array.from(target).forEach(el => el.textContent = userName);
            }
        });
    } catch (err) {
        errorHandler.handle(err, { function: 'insertStaffName', target }, 'insertStaffName');
    }
}

//KTL Functions

/**
 * Updates the label text for a field in a Knack view.
 * Works with regular views and connection-form-views.
 * Supports HTML replacements using placeholder syntax: {br}, {strong}, {/strong}, {em}, {/em}, {hr}.
 *
 * @param {string} viewId - The ID of the view containing the field.
 * @param {string} viewType - The type of view ('form', 'details', 'list', 'table', 'search').
 * @param {string} fieldId - The field ID (e.g., 'field_1234').
 * @param {object} options - Configuration object.
 * @param {Array} options.params - Array containing label text and optional type specifier.
 *
 * @example
 * // Update a form field label
 * updateLabelText('view_1234', 'form', 'field_5678', { params: [['New Label Text']] });
 *
 * @example
 * // Update with HTML formatting
 * updateLabelText('view_1234', 'form', 'field_5678', { params: [['Enter {strong}Client Name{/strong}{br}(First and Last)']] });
 *
 * @example
 * // Update with type specifier
 * updateLabelText('view_1234', 'form', 'field_5678', { params: [['New Label'], ['form']] });
 */
function updateLabelText(viewId, viewType, fieldId, { params }) {
    // Determine if we're working with a connection form or regular view
    const viewElement = document.getElementById(viewId)

    if (!viewElement) {
        console.warn(`View ${viewId} not found for updateLabelText`);
        return;
    }


    let labelTxt, type, selector;
    const selectors = {
        form: `#${viewElement.id} #kn-input-${fieldId} .kn-label span:not(.kn-required)`,
        details: `#${viewElement.id} .${fieldId} .kn-detail-label > span`,
        list: `#${viewElement.id} .${fieldId} .kn-detail-label > span`,
        table: `#${viewElement.id} th.${fieldId} > span > a > span:not(span.icon)`,
        search: `#${viewElement.id} th.${fieldId} > span > a > span:not(span.icon)`
    };

    if (params.length === 2) {
        [labelTxt, type] = params.map(param => param);
        labelTxt = labelTxt.join(', ');
        selector = selectors[viewType] && type[0].includes(viewType[0]) ? selectors[viewType] : null;
    } else {
        labelTxt = params[0].join(', ');
        selector = selectors[viewType];
    }

    // Do replacements AFTER labelTxt is set
    const replacements = {
        '{br}': '<br>',
        '{strong}': '<strong>',
        '{/strong}': '</strong>',
        '{em}': '<em>',
        '{/em}': '</em>',
        '{hr}': '<hr>',
    };
    const originalText = Object.entries(replacements).reduce(
        (text, [pattern, replacement]) => text.replaceAll(pattern, replacement),
        labelTxt || ''
    );

    if (selector) {
        const targetElement = document.querySelector(selector);
        if (targetElement) {
            targetElement.innerHTML = originalText || '';
        } else {
            console.warn(`Label element not found for selector: ${selector}`);
        }
    }
}

function idleWatchDogTimeout() {
    if (document.querySelector('.kn-login')) return;

    // Remove any existing overlay/dialog to prevent duplicates
    document.getElementById('overlay')?.remove();
    document.getElementById('ktl-idle-dialog')?.remove();

    // Create the overlay and append it to the body
    const overlay = document.createElement('div');
    overlay.id = 'overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'black',
        opacity: 0.8,
        zIndex: 1000,
        display: 'block'
    });
    document.body.appendChild(overlay);

    // Create the dialog element
    const dialog = document.createElement('div');
    dialog.id = 'ktl-idle-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'ktl-idle-dialog-title');
    dialog.setAttribute('tabindex', '-1');
    dialog.innerHTML = `
        <h2 id="ktl-idle-dialog-title">Knack Logout</h2>
        <p>You are about to be logged out. Do you wish to remain logged in?</p>
        <div class="ktl-dialog-buttons">
            <button id="ktl-logout-btn" class="kn-button is-secondary">Logout</button>
            <button id="ktl-stay-btn" class="kn-button is-secondary">Stay Logged In</button>
        </div>
    `;
    document.body.appendChild(dialog);

    // Save the element that had focus before opening the dialog
    const previousActiveElement = document.activeElement;
    // Move focus to the dialog for accessibility
    dialog.focus();

    // Remove resize listener when dialog is closed to avoid duplicates
    function closeIdleDialog() {
        overlay.remove();
        dialog.remove();
        clearTimeout(autoLogoutTimeout);
        window.removeEventListener('resize', setDialogWidth);
        // Restore focus to the previously focused element if possible
        if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
            previousActiveElement.focus();
        }
    }

    // Button event listeners
    document.getElementById('ktl-logout-btn').onclick = function() {
        closeIdleDialog();
        Knack.user.destroy();
    };
    document.getElementById('ktl-stay-btn').onclick = function() {
        closeIdleDialog();
        ktl.scenes.resetIdleWatchdog();
    };

    // Responsive dialog width
    function setDialogWidth() {
        dialog.style.width = window.innerWidth <= 768 ? '70%' : '25%';
    }

    setDialogWidth();
    window.addEventListener('resize', setDialogWidth);

    // Auto logout after 1 minute
    const autoLogoutTimeout = setTimeout(() => {
        closeIdleDialog();
        Knack.user.destroy();
    }, 1 * 60 * 1000);
}


function setViewMaxWidth({ key: viewId }) {
    const kw = '_vmxw';
    const viewElement = $(`#${viewId}`);
    const kwList = ktl.core.getKeywordsByType(viewId, kw);

    kwList.forEach(({ options, params }) => {
        if (!ktl.core.hasRoleAccess(options)) return;

        const width = params[0][0];
        let maxWidth;
        const parsedWidth = parseFloat(width);
        // Check if width includes units
        if (width.includes('%') || width.includes('px') || isNaN(parsedWidth)) {
            maxWidth = width; // Use the width as is
        } else {
            if (!isNaN(parsedWidth)) {
                maxWidth = `${parsedWidth}px`; // Assume it's a number and add 'px'
            } else {
                console.error(`Invalid width value: ${width}`);
                return;
            }
        }

        viewElement.css('max-width', maxWidth);
    });
}

function hideEmptyFields(view) {
    //used when label still needed but don't want extra space if no details - used in view meeting agenda/past minutes
    $(`#${view.key} .kn-detail-body`).each(function () {
        if ($.trim($(this).text()) === '') {
            removeElement(this);
        }
    });
}

// _hebv = Hide Elements By Value param[0] = fieldId, param[1] = valueToMatch, param.slice(2) = elementsToHide
function hideElementsByValue (view, keywords) {
    const kw = '_hebv';
    const { key: viewId } = view;
    if (!viewId || !keywords[kw]) return;

    const kwList = ktl.core.getKeywordsByType(viewId, kw);
    kwList.forEach(kwInstance => {
        const { options, params: paramGroups } = kwInstance;
        if (!ktl.core.hasRoleAccess(options) || paramGroups.length === 0) return;

        paramGroups.forEach(params => {
            if (params.length < 3) return;

            const [fieldId, valToMatch, ...elesToHide] = params;
            const fieldValue = $.trim($(`.${fieldId} .kn-detail-body`).text());

            const shouldHide = valToMatch.startsWith('!')
                ? fieldValue !== valToMatch.slice(1)
                : fieldValue === valToMatch;

            if (shouldHide) {
                $(elesToHide.join()).hide();
                borderRadiusLastVisible();
            }
        });
    });
}

function buttonToUrl({ key: viewId }, keywords) {
    const btnUrl = '_btnurl';
    if (!keywords[btnUrl]) return;

    const viewType = ktl.views.getViewType(viewId);

            if (['list', 'form'].includes(viewType)) return;

    const viewElement = $(`#${viewId}`);
    const keywordList = ktl.core.getKeywordsByType(viewId, btnUrl);

    keywordList.forEach(({ options, params: paramGroups }) => {
        if (!paramGroups.length) {
            console.error('Button URL Params Error - No parameter groups found.');
            return;
        }

        paramGroups.forEach(params => {
            if (params.length < 2) {
                console.error('Button URL Params Error - Insufficient parameters found.');
                return;
            }

            if (!ktl.core.hasRoleAccess(options)) {
                removeElement(viewElement.find(linkSelector));
                return;
            }

            const currentUrl = sanitiseURL(window.location.href);
            const [linkText, pageUrl, isChildPageParam, urlPartParam] = params;
            const linkSelector = viewType === 'menu' ? `li:textEquals("${linkText}")` : `a:textEquals("${linkText}")`;

            const handleLinkClick = (e, targetUrl) => {
                e.preventDefault();
                window.location.href = targetUrl;
            };

            const processLinkElement = (linkElement, targetUrl) => {
                if (!linkElement.length) {
                    console.error(`buttonURL Error - Button with text "${linkText}" not found.`);
                    return;
                }
                linkElement.off('click').on('click', e => handleLinkClick(e, targetUrl));
            };

            if (['table', 'search'].includes(viewType)) {
                getTableRows(viewId, (i, row) => {
                    const knackId = row.find('td.field_6087').text().trim();
                    const linkElement = row.find(linkSelector);
                    const targetUrl = `${currentUrl}${pageUrl}/${knackId}/`;

                    processLinkElement(linkElement, targetUrl);
                });
            } else {
                const linkElement = viewElement.find(linkSelector);
                const isChildPage = isChildPageParam !== 'false';
                const urlPart = urlPartParam || null;
                const targetUrl = isChildPage
                    ? `${currentUrl}${pageUrl}/${getRecordID(urlPart)}/`
                    : `${currentUrl}${pageUrl}/`;

                processLinkElement(linkElement, targetUrl);
            }
        });
    });
}

function caQuickToggle({ key: viewId }, data = []) {
    // Create an instance of the CAQuickToggle class and initialize it
    const caQuickToggle = new CAQuickToggle(viewId, data);
    caQuickToggle.init();
}

class CAQuickToggle {
    constructor(viewId, data) {
        // Core properties
        this.viewId = viewId;
        this.data = data;
        this.kw = '_caqt';
        this.kwInstance = null;
        this.viewModel = null;
        this.viewType = '';
        this.inlineEditing = false;
        this.fieldMap = new Map();

        // State properties
        this.quickToggleParams = {
            bgColorTrue: '#e2efda',
            bgColorFalse: '#ffb557',
            bgColorPending: '#ffe699',
            showNotification: false,
            showSpinner: false,
            pendingClass: 'ktlProgress',
        };
        this.qtScanItv = null;
        this.quickToggleObj = {};
        this.numToProcess = 0;
        this.refreshTimer = null;
        this.viewsToRefresh = [];
        this.viewHasQt = false;
        this.fieldsColor = {};
    }

    init() {
        // Exit early if conditions aren't met
        if (!this.isValidInitialState()) return;

        // Setup keyword instances
        if (!this.setupKeywordInstances()) return;

        // Setup view model and check type
        if (!this.setupViewModel()) return;

        // Setup colors based on keywords
        this.setupColors();

        // Process fields to identify boolean fields
        this.processFields();

        // Update table colors
        this.updateTableColors();

        // Setup cell click handlers
        this.setupCellClickHandlers();
    }

    isValidInitialState() {
        // Exit early if no view ID, no data, or in iFrame window
        return this.viewId && this.data.length > 0 && !ktl.scenes.isiFrameWnd();
    }

    setupKeywordInstances() {
        // Check for the custom keyword specifically
        this.kwInstance = ktlKeywords[this.viewId] && ktlKeywords[this.viewId][this.kw];
        if (this.kwInstance && this.kwInstance.length) {
            this.kwInstance = this.kwInstance[0];
            const { options } = this.kwInstance;
            if (!ktl.core.hasRoleAccess(options)) return false;
        }

        const hasCAQtKeyword = ktl.core.checkIfViewHasKeyword(this.viewId, this.kw);

        // IMPORTANT: Check if the view has both _caqt and _qt keywords - if so, don't process
        const hasOriginalQtKeyword = ktl.core.checkIfViewHasKeyword(this.viewId, '_qt');
        if (hasOriginalQtKeyword) {
            console.log(`View ${this.viewId} has both _caqt and _qt keywords. Using original quickToggle only.`);
            return false;
        }

        // Ensure the view has our custom keyword
        if (!hasCAQtKeyword) return false;

        return true;
    }

    setupViewModel() {
        this.viewModel = Knack.router.scene_view.model.views._byId[this.viewId];
        if (!this.viewModel) return false;

        const viewAttr = this.viewModel.attributes;
        this.viewType = viewAttr.type;

        // Only work with table and search views
        if (!['table', 'search'].includes(this.viewType)) return false;

        this.inlineEditing = this.viewType === 'table' ?
            (viewAttr.options && viewAttr.options.cell_editor) :
            viewAttr.cell_editor;

        return true;
    }

    setupColors() {
        // Start with hard coded default colors
        let bgColorTrue = this.quickToggleParams.bgColorTrue;
        let bgColorFalse = this.quickToggleParams.bgColorFalse;

        // Override with view-specific colors, if any
        if (this.kwInstance) {
            this.viewHasQt = true; // If view has QT, then all fields inherit also

            if (this.kwInstance.params && this.kwInstance.params.length) {
                const fldColors = this.kwInstance.params[0];
                if (fldColors.length >= 1 && fldColors[0])
                    bgColorTrue = fldColors[0];

                if (fldColors.length >= 2 && fldColors[1])
                    bgColorFalse = fldColors[1];
            }
        }

        // Save colors to instance variables
        this.bgColorTrue = bgColorTrue;
        this.bgColorFalse = bgColorFalse;
    }

    processFields() {
        const viewAttr = this.viewModel.attributes;
        let fieldKeywords = {};
        const cols = this.viewType === 'table' ? viewAttr.columns : viewAttr.results.columns;

        cols.forEach(col => {
            if (col.type === 'field' && col.field && col.field.key) {
                const field = Knack.objects.getField(col.field.key);
                if (field && !col.connection) { // Field must be local to view's object, not a connected field.
                    if (field.attributes.type === 'boolean') {
                        let fieldHasQt = false;
                        const { key: fieldId } = col.field;

                        // Override with field-specific colors, if any.
                        let tmpFieldColors = {
                            bgColorTrue: this.bgColorTrue,
                            bgColorFalse: this.bgColorFalse
                        }

                        ktl.fields.getFieldKeywords(fieldId, fieldKeywords);
                        const fieldKeyword = fieldKeywords[fieldId] && fieldKeywords[fieldId][this.kw];
                        if (this.viewHasQt || fieldKeyword) {
                            fieldHasQt = true;
                            if (fieldKeyword && fieldKeyword.length && fieldKeyword[0].params && fieldKeyword[0].params.length > 0) {
                                const fldColors = fieldKeyword[0].params[0];
                                if (fldColors.length >= 1 && fldColors[0] !== '')
                                    tmpFieldColors.bgColorTrue = fldColors[0];
                                if (fldColors.length >= 2 && fldColors[1] !== '')
                                    tmpFieldColors.bgColorFalse = fldColors[1];
                            }
                        }

                        if (fieldHasQt) {
                            this.fieldsColor[fieldId] = tmpFieldColors;
                            if (this.inlineEditing && !col.ignore_edit)
                                $(`#${this.viewId} td.${fieldId}.cell-edit`).addClass('caQtCellClickable');
                        }
                    }
                }
                this.fieldMap.set(col.field.key, col.header);
            }
        });
    }

    updateTableColors() {
        if (!$.isEmptyObject(this.fieldsColor)) {
            this.data.forEach(row => {
                Object.keys(this.fieldsColor).forEach(fieldId => {
                    // Merge new style with existing one.
                    const cell = $(`#${this.viewId} tbody tr[id="${row.id}"] .${fieldId}`);
                    const currentStyle = cell.attr('style');
                    const style = `background-color:${row[fieldId + '_raw'] === true ?
                        this.fieldsColor[fieldId].bgColorTrue :
                        this.fieldsColor[fieldId].bgColorFalse}`;
                    cell.attr('style', `${currentStyle ? currentStyle + '; ' : ''}${style}`);
                });
            });
        }
    }

    setupCellClickHandlers() {
        // Process cell clicks
        $(`#${this.viewId} .caQtCellClickable`).bindFirst('click', (e) => this.handleCellClick(e));
    }

    handleCellClick(e) {
        if ($('.bulkEditCb:checked').length) return;

        e.stopImmediatePropagation();

        const fieldId = $(e.target).data('field-key') || $(e.target).parent().data('field-key');
        const viewElement = $(e.target).closest('.kn-search.kn-view[id], .kn-table.kn-view[id]');

        if (viewElement.length) {
            const viewId = viewElement.attr('id');
            const dt = Date.now();
            const recId = $(e.target).closest('tr').attr('id');
            let value = ktl.views.getDataFromRecId(viewId, recId)[`${fieldId}_raw`];
            value = (value === true ? false : true);

            if (!this.viewsToRefresh.includes(viewId))
                this.viewsToRefresh.push(viewId);

            this.quickToggleObj[dt] = { viewId, fieldId, value, recId, processed: false };

            const cell = $(e.target).closest('td');
            cell.css('background-color', this.quickToggleParams.bgColorPending);

            if (this.quickToggleParams.pendingClass) {
                cell.addClass(this.quickToggleParams.pendingClass);
            }

            clearTimeout(this.refreshTimer);

            // Look for corresponding field for additional updates
            const additionalData = this.findCorrespondingField(fieldId, value);
            if (additionalData) {
                this.quickToggleObj[dt].additionalData = additionalData;
            }

            this.numToProcess++;
            this.startQtScanning();
        }
    }

    findCorrespondingField(fieldId, value) {
        const fieldTitle = this.fieldMap.get(fieldId);
        let correspondingFieldId = '';
        let isName = false;

        for (const [key, header] of this.fieldMap.entries()) {
            if (key !== fieldId &&
                (header === fieldTitle ||
                 header === `${fieldTitle} - Name` ||
                 header.startsWith(`${fieldTitle} `))) {

                isName = header === `${fieldTitle} - Name`;
                correspondingFieldId = key;
                break;
            }
        }

        if (correspondingFieldId) {
            const userAttributes = Knack.getUserAttributes();
            const userAttribute = isName ? userAttributes.name : userAttributes.id;
            return { [correspondingFieldId]: value === false ? null : userAttribute };
        }

        return null;
    }

    startQtScanning() {
        if (this.quickToggleParams.showNotification) {
            ktl.core.infoPopup();
            this.showProgress();
        }

        if (this.qtScanItv) return;

        ktl.views.autoRefresh(false);
        this.qtScanItv = setInterval(() => {
            if (!$.isEmptyObject(this.quickToggleObj)) {
                const dt = Object.keys(this.quickToggleObj)[0];
                const { processed } = this.quickToggleObj[dt];
                if (!processed) {
                    this.quickToggleObj[dt].processed = true;
                    this.doQuickToggle(dt);
                }
            }
        }, 500);
    }

    doQuickToggle(dt) {
        const recObj = this.quickToggleObj[dt];
        if ($.isEmptyObject(recObj) || !recObj.viewId || !recObj.fieldId) return;

        const apiData = { [recObj.fieldId]: recObj.value, ...recObj.additionalData };

        ktl.core.knAPI(recObj.viewId, recObj.recId, apiData, 'PUT', [], false /*must be false otherwise spinner blocks click events*/)
            .then(() => {
                if (this.quickToggleParams.showNotification) {
                    this.showProgress();
                }
                this.numToProcess--;
                delete this.quickToggleObj[dt];

                if ($.isEmptyObject(this.quickToggleObj)) {
                    clearInterval(this.qtScanItv);
                    this.qtScanItv = null;

                    if (this.quickToggleParams.showSpinner) {
                        Knack.showSpinner();
                    }

                    this.refreshTimer = setTimeout(() => {
                        ktl.core.removeInfoPopup();
                        ktl.views.refreshViewArray(this.viewsToRefresh)
                            .then(() => {
                                Knack.hideSpinner();
                                ktl.views.autoRefresh();
                            })
                            .catch(() => { })
                    }, 500);
                }
            })
            .catch(reason => {
                ktl.views.autoRefresh();
                const errorMsg = reason ? JSON.stringify(reason) : 'Unknown error';
                console.error('Quick Toggle operation failed:', reason);
                errorHandler.handleError(reason, {function: 'doQuickToggle'}, 'Quick Toggle Error')
                alert(`Error code KEC_1025 while processing Quick Toggle operation, reason: ${errorMsg}`);
            });
    }

    showProgress() {
        ktl.core.setInfoPopupText('Toggling... ' + this.numToProcess + ' items remaining.');
    }
}

/**
 * KnackError - Comprehensive error handling utility for Knack applications
 *
 * This class captures and logs detailed information about errors that occur in a Knack application.
 * It stores error information in a designated Knack table via the KnackAPI for later analysis.
 *
 * @version 1.3.0
 * @author Craig Winnall, GitHub Copilot
 */
class KnackError {
    /**
     * Creates a new KnackError instance
     * @param {Object} options - Configuration options
     * @param {string} options.sceneId - The scene ID/key for the error logging table
     * @param {string} options.viewId - The view ID/key for the error logging table
     * @param {Object} options.fieldMap - Mapping of error data to Knack field keys
     * @param {boolean} [options.captureUserData=true] - Whether to capture user information
     * @param {boolean} [options.captureSystemInfo=true] - Whether to capture system information
     * @param {boolean} [options.consoleLog=true] - Whether to also log errors to console
     * @param {boolean} [options.groupSimilarErrors=true] - Whether to group similar errors
     * @param {number} [options.maxErrorsPerMinute=10] - Rate limiting for error logging
     * @param {Array} [options.ignoredErrors=[]] - Error messages or patterns to ignore
     * @param {boolean} [options.captureKnackContext=true] - Whether to capture Knack context (scene, view, etc.)
     * @param {boolean} [options.separateContextFields=true] - Whether to store context in separate fields
     */
    constructor(options = {}) {
        this.options = {
            sceneId: options.sceneId || '',
            viewId: options.viewId || '',
            fieldMap: options.fieldMap || {},
            captureUserData: options.captureUserData !== undefined ? options.captureUserData : true,
            captureSystemInfo: options.captureSystemInfo !== undefined ? options.captureSystemInfo : true,
            consoleLog: options.consoleLog !== undefined ? options.consoleLog : true,
            groupSimilarErrors: options.groupSimilarErrors !== undefined ? options.groupSimilarErrors : true,
            maxErrorsPerMinute: options.maxErrorsPerMinute || 10,
            ignoredErrors: options.ignoredErrors || [],
            captureKnackContext: options.captureKnackContext !== undefined ? options.captureKnackContext : true,
            separateContextFields: options.separateContextFields !== undefined ? options.separateContextFields : true
        };

        // Initialize KnackAPI instance with spinner disabled
        this.api = new KnackAPI({ debug: false, showSpinner: false });

        this.boundHandleError = this.handleError.bind(this);

        // Rate limiting data
        this._errorCount = 0;
        this._lastResetTime = Date.now();
        this._errorHashes = new Map();

        // Track the last known context
        this._lastKnownContext = {
            sceneId: null,
            viewId: null,
            eventType: null,
            timestamp: null
        };

        // Setup context tracking if enabled
        if (this.options.captureKnackContext) {
            this._setupContextTracking();
        }

        // Validate required options
        this._validateOptions();

        // Performance metrics
        this.performanceData = {
            javaScriptErrors: 0,
            networkErrors: 0,
            apiErrors: 0,
            totalErrors: 0,
            slowestOperation: null,
            averageResponseTime: 0
        };
    }

    /**
     * Handles an error by logging it to the Knack table and optionally to console
     * @param {Error|string} error - The error object or message
     * @param {Object} [additionalInfo={}] - Additional information to log with the error
     * @param {string} [errorSource='Unknown'] - The source of the error (function name, component, etc)
     * @returns {Promise<Object|null>} - The created error record or null if logging failed
     */
    async handleError(error, additionalInfo = {}, errorSource = 'Unknown') {
        // Quickly check if we should process this error
        if (this._shouldIgnoreError(error) || this._isRateLimited()) {
            return null;
        }

        // Capture context data once
        if (this.options.captureKnackContext) {
            Object.assign(additionalInfo, this._captureContextData());
        }

        // Capture all error data
        const errorData = this._captureErrorData(error, additionalInfo, errorSource);

        // Handle error grouping
        if (this.options.groupSimilarErrors) {
            const existingError = this._processErrorGroup(errorData);
            if (existingError) return existingError.record;
        }

        // Track metrics
        this._updatePerformanceMetrics(errorData);

        // Console logging
        if (this.options.consoleLog) {
            console.error('KnackError:', errorData);
        }

        // Knack table logging
        if (this.options.sceneId && this.options.viewId) {
            try {
                return await this._logToKnackTable(errorData);
            } catch (loggingError) {
                console.error('Error logging to Knack table:', loggingError);
            }
        }

        return null;
    }

    /**
     * Creates a wrapper for Knack event handlers that automatically includes context
     * @param {string} eventType - The type of Knack event (e.g., 'knack-view-render')
     * @param {Function} handler - The event handler function to wrap
     * @returns {Function} - The wrapped handler function
     * @public
     */
    wrapEventHandler(eventType, handler) {
        const self = this;

        return async function (event, view, record) {
            try {
                // Store context information
                const context = {
                    eventType: eventType.replace('knack-', ''),
                    viewId: view ? view.key : null,
                    sceneId: self._getCurrentSceneId(),
                    recordId: record ? record.id : null,
                    timestamp: new Date().toISOString()
                };

                // Update last known context
                self._lastKnownContext = context;

                // Call the original handler
                return await handler.apply(this, arguments);
            } catch (error) {
                // Handle the error with context information
                await self.handleError(error, { knackContext: self._lastKnownContext }, `${eventType} Handler`);

                // Re-throw so the calling code knows an error occurred
                throw error;
            }
        };
    }

    /**
     * Sets up global error handling
     * @param {boolean} [unhandledRejections=true] - Whether to catch unhandled promise rejections
     * @returns {KnackError} - This instance for chaining
     */
    setupGlobalErrorHandling(unhandledRejections = true) {
        // Handle regular errors
        window.addEventListener('error', (event) => {
            this.handleError(
                event.error || event.message,
                {
                    errorFile: event.filename,
                    errorLine: event.lineno,
                    errorColumn: event.colno
                },
                'Global Error Event'
            );
        });

        // Handle unhandled promise rejections if enabled
        if (unhandledRejections) {
            window.addEventListener('unhandledrejection', (event) => {
                const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
                this.handleError(error, {}, 'Unhandled Promise Rejection');
            });
        }

        return this;
    }

    /**
     * Creates a function that wraps another function with error handling
     * @param {Function} fn - The function to wrap
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Wrapped function with error handling
     */
    wrapFunction(fn, source, additionalInfo = {}) {
        return this.executeFunction(fn, {
            source,
            rethrowError: true,
            additionalInfo
        });
    }

    /**
     * Creates a try-catch wrapper for use in async functions
     * @param {Function} fn - The function to wrap
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Function that returns a promise that resolves with the result or rejects with the error
     */
    tryCatch(fn, source, additionalInfo = {}) {
        const self = this;

        return async function (...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                self.handleError(error, {
                    functionArgs: JSON.stringify(args, (key, value) => {
                        if (typeof value === 'function') return 'function() { ... }';
                        if (value instanceof Node) return value.nodeName;
                        if (value instanceof Window) return 'Window';
                        return value;
                    }),
                    knackContext: self.getCurrentContext(),
                    ...additionalInfo
                }, source || fn.name || 'Anonymous Function');

                return {
                    success: false,
                    error: error,
                    message: error.message
                };
            }
        };
    }

    /**
     * Monitors the performance of function calls and logs errors
     * @param {Function} fn - The function to monitor
     * @param {string} [source] - Source identifier for the error
     * @param {number} [thresholdMs=1000] - Threshold in milliseconds for performance warnings
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Monitored function
     */
    monitorPerformance(fn, source, thresholdMs = 1000, additionalInfo = {}) {
        const self = this;
        return async function(...args) {
            const startTime = performance.now();
            try {
                const result = await fn.apply(this, args);
                const executionTime = performance.now() - startTime;

                // Only log if exceeding threshold
                if (executionTime > thresholdMs) {
                    console.warn(`Performance warning: ${source || fn.name || 'Anonymous'} took ${executionTime.toFixed(2)}ms`);
                    // Could also log this as a special type of "performance warning" error
                }

                return result;
            } catch (error) {
                const executionTime = performance.now() - startTime;
                self.handleError(error, {
                    functionArgs: JSON.stringify(args, (_, v) =>
                        typeof v === 'function' ? '[Function]' : v
                    ),
                    responseTime: executionTime.toFixed(2),
                    performanceContext: {
                        threshold: thresholdMs,
                        executionTime: executionTime.toFixed(2)
                    },
                    ...additionalInfo
                }, source || fn.name || 'Performance Monitor');

                throw error;
            }
        };
    }

        /**
     * Monitors a Knack API call and logs any errors that occur
     * @param {Function} apiCallFn - The API call function to monitor
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Function} - Wrapped API call function
     */
    monitorApiCall(apiCallFn, source = 'Knack API Call', additionalInfo = {}) {
        const self = this;
        return async function (...args) {
            const startTime = performance.now();
            try {
                const result = await apiCallFn.apply(this, args);
                const endTime = performance.now();

                // Log slow API calls (over 2000ms) as warnings
                const executionTime = endTime - startTime;
                if (executionTime > 2000) {
                    console.warn(`KnackError: Slow API call to ${source}: ${executionTime.toFixed(2)}ms`);
                }

                return result;
            } catch (error) {
                const endTime = performance.now();
                const executionTime = endTime - startTime;

                // Get parameters for the API call for better debugging
                let apiParams = {};
                if (args.length >= 2) {
                    apiParams = {
                        sceneKey: args[0] || null,
                        viewId: args[1] || null,
                        recordId: args.length > 2 ? args[2] : null,
                        requestData: args.length > 3 ? args[3] : null
                    };

                    // Determine request type from function name
                    if (apiCallFn.name) {
                        const fnName = apiCallFn.name.toLowerCase();
                        if (fnName.includes('create')) {
                            apiParams.requestType = 'POST';
                        } else if (fnName.includes('update')) {
                            apiParams.requestType = 'PUT';
                        } else if (fnName.includes('delete')) {
                            apiParams.requestType = 'DELETE';
                        } else if (fnName.includes('get')) {
                            apiParams.requestType = 'GET';
                        }
                    }
                }

                self.handleError(error, {
                    apiParams,
                    responseTime: executionTime.toFixed(2),
                    knackContext: self.getCurrentContext(),
                    ...additionalInfo
                }, source);

                throw error;
            }
        };
    }

    /**
     * Gets performance data collected by the error handler
     * @returns {Object} - Performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceData,
            errorRate: {
                total: this.performanceData.totalErrors,
                perMinute: this._errorCount / ((Date.now() - this._lastResetTime) / 60000)
            }
        };
    }

    /**
     * Adds an error pattern to the ignore list
     * @param {string|RegExp} pattern - Error message pattern to ignore
     * @returns {KnackError} - This instance for chaining
     */
    ignoreError(pattern) {
        this.options.ignoredErrors.push(pattern);
        return this;
    }

    /**
     * Wraps all methods of an object with error handling
     * @param {Object} obj - The object whose methods to wrap
     * @param {string} [source] - Source identifier prefix for the errors
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {Object} - Object with wrapped methods
     */
    wrapAllMethods(obj, source, additionalInfo = {}) {
        const wrapped = {};

        for (const key in obj) {
            if (typeof obj[key] === 'function') {
                wrapped[key] = this.wrapFunction(obj[key], source ? `${source}.${key}` : key, additionalInfo);
            } else {
                wrapped[key] = obj[key];
            }
        }

        return wrapped;
    }

    /**
     * Safely executes code and returns a result or default value on error
     * @param {Function} fn - Function to execute
     * @param {*} defaultValue - Default value to return on error
     * @param {string} [source] - Source identifier for the error
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {*} - Result of function or default value on error
     */
    safeExecute(fn, defaultValue, source, additionalInfo = {}) {
        return this.executeFunction(fn, {
            returnDefaultOnError: true,
            defaultValue,
            source,
            immediate: true,
            additionalInfo
        });
    }

    /**
     * Executes a function safely with error handling
     * @param {Function} fn - The function to execute
     * @param {Object} options - Configuration options
     * @param {boolean} [options.returnDefaultOnError=false] - Whether to return default value on error
     * @param {*} [options.defaultValue=null] - Default value to return on error
     * @param {boolean} [options.captureArgs=true] - Whether to capture function arguments in error logs
     * @param {boolean} [options.captureContext=true] - Whether to capture Knack context
     * @param {boolean} [options.rethrowError=true] - Whether to rethrow the error after logging
     * @param {string} [options.source] - Source identifier for the error
     * @param {Object} [options.additionalInfo={}] - Additional information to include in error logs
     * @returns {Function|*} - Either wrapped function or result of immediate execution
     */
    executeFunction(fn, options = {}) {
        const {
            returnDefaultOnError = false,
            defaultValue = null,
            captureArgs = true,
            captureContext = true,
            rethrowError = true,
            source = fn.name || 'Execute Function',
            immediate = false,
            immediateArgs = [],
            additionalInfo = {}
        } = options;

        const self = this;

        const wrappedFn = async function(...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                // Build error context
                const errorInfo = {
                    ...additionalInfo // Include any passed additionalInfo
                };

                if (captureArgs) {
                    errorInfo.functionArgs = JSON.stringify(args, (key, value) => {
                        if (typeof value === 'function') return 'function() { ... }';
                        if (value instanceof Node) return value.nodeName;
                        if (value instanceof Window) return 'Window';
                        return value;
                    });
                }

                if (captureContext) {
                    errorInfo.knackContext = self.getCurrentContext();
                }

                // Log the error
                self.handleError(error, errorInfo, source);

                // Either return default value or rethrow
                if (returnDefaultOnError) {
                    return defaultValue;
                } else if (rethrowError) {
                    throw error;
                }
            }
        };

        // Either return the wrapped function or execute immediately
        if (immediate) {
            return wrappedFn(...immediateArgs);
        }

        return wrappedFn;
    }

    /**
     * Creates a wrapper specifically for Knack event listeners
     * @param {string} viewId - The view ID to listen for events on
     * @param {string} eventType - The type of event (e.g., 'knack-view-render')
     * @param {Function} handler - The handler function for the event
     * @param {Object} [additionalInfo={}] - Additional information to include in error logs
     * @returns {KnackError} - This instance for chaining
     * @public
     */
    wrapKnackListener(viewId, eventType, handler, additionalInfo = {}) {
        const self = this;

        // Create a wrapped handler that includes error handling with the additionalInfo
        const wrappedHandler = function(event, view, record) {
            // Create a merged info object with dynamic context and passed additionalInfo
            const contextInfo = {
                ...additionalInfo,
                listenerViewId: viewId,
                listenerEventType: eventType
            };

            try {
                // Call the original handler with the original event arguments
                return handler.apply(this, arguments);
            } catch (error) {
                // Use the eventType and viewId to create a source string
                const source = `${eventType} Listener for ${viewId}`;

                // Handle the error with the contextInfo
                self.handleError(error, contextInfo, source);

                // Don't re-throw the error - this allows the view to continue rendering
                console.error(`Error in ${source}: ${error.message}`);
                // Optionally return a value if needed
                return undefined;
            }
        };

        // If viewId is 'any', capture all events of this type
        const eventSelector = viewId === 'any' ?
            `${eventType}.any` :
            `${eventType}.${viewId}`;

        $(document).on(eventSelector, wrappedHandler);

        return this;
    }

    /**
     * Gets the current Knack context (scene ID, view ID, event type)
     * @returns {Object} The current Knack context
     * @public
     */
    getCurrentContext() {
        const context = {
            ...this._lastKnownContext,
            currentSceneId: this._getCurrentSceneId(),
            currentViewId: this._getCurrentViewId(),
            url: window.location.href
        };

        // If we don't have a tracked scene ID, use the current one from the DOM
        if (!context.sceneId) {
            context.sceneId = context.currentSceneId;
        }

        // If we don't have a tracked view ID, use the current one from the DOM
        if (!context.viewId) {
            context.viewId = context.currentViewId;
        }

        return context;
    }

    /**
     * Sets up tracking for Knack context events
     * @private
     */
    _setupContextTracking() {
        // Handle all Knack events with a single handler
        const knackEvents = ['view-render', 'scene-render', 'form-submit', 'record-update', 'cell-update', 'record-delete'];

        knackEvents.forEach(eventType => {
            $(document).on(`knack-${eventType}.any`, (event, view, record) => {
                this._lastKnownContext = {
                    viewId: view?.key || null,
                    sceneId: this._getCurrentSceneId(),
                    eventType,
                    recordId: record?.id || null,
                    timestamp: new Date().toISOString()
                };
            });
        });
    }

    /**
     * Gets the current scene ID from the DOM
     * @returns {string|null} The current scene ID or null if not found
     * @private
     */
    _getCurrentSceneId() {
        // Try to get from the Knack object first
        if (typeof Knack !== 'undefined' && Knack.router && Knack.router.current_scene_key) {
            return Knack.router.current_scene_key;
        }

        // Try to get from the DOM
        const sceneElement = document.querySelector('.kn-scene');
        if (sceneElement) {
            const sceneId = sceneElement.id;
            if (sceneId && sceneId.startsWith('kn-scene_')) {
                return sceneId.replace('kn-', '');
            }
        }

        // Try to extract from URL
        return this._extractSceneIdFromUrl();
    }

    /**
     * Gets the current view ID from the DOM
     * @returns {string|null} The current view ID or null if not found
     * @private
     */
    _getCurrentViewId() {
        // Try each view finding method
        return this._getActiveViewId() || this._getFirstViewId();
    }

    /**
     * Gets the active view ID (the one with focus or most recently interacted with)
     * @returns {string|null} The active view ID or null if not found
     * @private
     */
    _getActiveViewId() {
        // Check for active form or last interacted element
        const activeElement = document.activeElement;
        if (activeElement) {
            // Traverse up to find a view container
            let currentElement = activeElement;
            while (currentElement && currentElement !== document.body) {
                // Check if this element is a view
                if (currentElement.id && currentElement.id.startsWith('view_')) {
                    return currentElement.id;
                }
                currentElement = currentElement.parentElement;
            }
        }
        return null;
    }

    /**
     * Gets the first view ID found in the current scene
     * @returns {string|null} The first view ID or null if not found
     * @private
     */
    _getFirstViewId() {
        const viewElement = document.querySelector('[id^="view_"]');
        return viewElement ? viewElement.id : null;
    }

    /**
     * Extracts the scene ID from the URL
     * @returns {string|null} The scene ID or null if not found
     * @private
     */
    _extractSceneIdFromUrl() {
        const url = window.location.href;
        // Knack URLs often follow the pattern /scene_XX/...
        const sceneMatch = url.match(/\/scene_(\d+)/i);
        if (sceneMatch && sceneMatch[1]) {
            return `scene_${sceneMatch[1]}`;
        }
        return null;
    }

    /**
     * Validates that required options are provided
     * @private
     */
    _validateOptions() {
        if (!this.options.sceneId || !this.options.viewId) {
            console.error('KnackError: Missing required options sceneId and viewId');
        }

        const requiredFields = ['errorMessage', 'errorSource', 'errorStack'];
        const missingFields = requiredFields.filter(field => !this.options.fieldMap[field]);

        if (missingFields.length > 0) {
            console.error(`KnackError: Missing required field mappings: ${missingFields.join(', ')}`);
        }
    }

        /**
     * Processes an error to handle grouping of similar errors
     * @param {Object} errorData - Error data to process
     * @returns {Object|null} - Existing error record if found, null otherwise
     * @private
     */
    _processErrorGroup(errorData) {
        // Generate a hash for this error to identify similar ones
        const errorHash = this._generateErrorHash(errorData);

        // Check if we've seen this error recently
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        if (this._errorHashes.has(errorHash)) {
            const existingError = this._errorHashes.get(errorHash);
            existingError.count++;
            existingError.lastSeen = now;

            // Only log if it's been a while since the last occurrence
            if (now - existingError.firstLogged > oneHour) {
                // Reset to treat as a fresh error after an hour
                this._errorHashes.set(errorHash, {
                    count: 1,
                    firstLogged: now,
                    lastSeen: now,
                    record: null
                });
                return null;
            }

            return existingError;
        } else {
            // New error, add to tracking
            this._errorHashes.set(errorHash, {
                count: 1,
                firstLogged: now,
                lastSeen: now,
                record: null
            });
            return null;
        }
    }

    /**
     * Checks if an error should be ignored based on predefined patterns
     * @param {Error|string} error - The error to check
     * @returns {boolean} - Whether the error should be ignored
     * @private
     */
    _shouldIgnoreError(error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check against ignored error patterns
        return this.options.ignoredErrors.some(pattern => {
            if (pattern instanceof RegExp) {
                return pattern.test(errorMessage);
            } else {
                return errorMessage.includes(pattern);
            }
        });
    }

    /**
     * Checks if error logging is currently rate limited
     * @returns {boolean} - Whether rate limiting is in effect
     * @private
     */
    _isRateLimited() {
        const now = Date.now();
        const oneMinute = 60 * 1000;

        // Reset counter if a minute has passed
        if (now - this._lastResetTime > oneMinute) {
            this._errorCount = 0;
            this._lastResetTime = now;
        }

        // Check if over limit after incrementing
        return ++this._errorCount > this.options.maxErrorsPerMinute;
    }

    /**
     * Generates a hash for an error to identify similar errors
     * @param {Object} errorData - Error data to hash
     * @returns {string} - Hash string representing the error
     * @private
     */
    _generateErrorHash(errorData) {
        // Create a more stable hash by focusing on key properties
        const keyParts = [
            errorData.errorName || '',
            errorData.errorMessage || '',
            errorData.errorSource || '',
            errorData.contextSceneId || '',
            errorData.contextViewId || '',
            errorData.contextEventType || ''
        ];

        return keyParts.join('|');
    }

    /**
     * Updates performance metrics based on error data
     * @param {Object} errorData - Error data to analyze
     * @private
     */
    _updatePerformanceMetrics(errorData) {
        this.performanceData.totalErrors++;

        // Categorize error types
        if (errorData.errorName === 'NetworkError' || errorData.errorMessage.includes('network')) {
            this.performanceData.networkErrors++;
        } else if (errorData.errorMessage.includes('API') ||
            errorData.errorSource.includes('API') ||
            errorData.errorSource.includes('caAPI')) {
            this.performanceData.apiErrors++;
        } else {
            this.performanceData.javaScriptErrors++;
        }

        // Track response time if available
        if (errorData.responseTime) {
            const responseTime = parseFloat(errorData.responseTime);
            if (!isNaN(responseTime)) {
                if (!this.performanceData.slowestOperation ||
                    responseTime > this.performanceData.slowestOperation.time) {
                    this.performanceData.slowestOperation = {
                        time: responseTime,
                        source: errorData.errorSource,
                        timestamp: errorData.errorTime
                    };
                }

                // Update average response time
                const prevTotal = this.performanceData.averageResponseTime *
                    (this.performanceData.totalErrors - 1);
                this.performanceData.averageResponseTime =
                    (prevTotal + responseTime) / this.performanceData.totalErrors;
            }
        }
    }

    /**
     * Captures and formats error data for logging
     * @param {Error|string} error - The error object or message
     * @param {Object} additionalInfo - Additional information to log
     * @param {string} errorSource - The source of the error
     * @returns {Object} - Formatted error data
     * @private
     */
    _captureErrorData(error, additionalInfo, errorSource) {
        // Create the base error object with all essential data
        const errorData = {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : 'CustomError',
            errorStack: error instanceof Error ? error.stack : new Error().stack,
            errorSource: errorSource,
            errorTime: new Date().toISOString(),
            errorUrl: window.location.href
        };

        // Add specific context fields from additionalInfo
        const contextFields = [
            'contextSceneId', 'contextViewId', 'contextEventType',
            'contextRecordId', 'contextUrl', 'contextTimestamp',
            'knackContext', 'knackContextFormatted'
        ];

        contextFields.forEach(field => {
            if (additionalInfo[field]) errorData[field] = additionalInfo[field];
        });

        // Add user data in one step if enabled
        if (this.options.captureUserData) {
            Object.assign(errorData, this._captureUserData());
        }

        // Add system info in one step if enabled
        if (this.options.captureSystemInfo) {
            Object.assign(errorData, this._captureSystemInfo());
        }

        // Add context data in one step if enabled
        if (this.options.captureKnackContext) {
            Object.assign(errorData, this._captureContextData(additionalInfo));
        }

        // Keep a clean copy of additionalInfo
        errorData.additionalInfo = { ...additionalInfo };

        return errorData;
    }

    /**
     * Captures user data if enabled
     * @returns {Object} - User data
     * @private
     * */
    _captureUserData() {
        const errorData = {};
        // User information if enabled
        if (this.options.captureUserData && Knack && Knack.getUserAttributes) {
            try {
                const userAttributes = Knack.getUserAttributes();
                errorData.userName = userAttributes.name || 'Unknown User';
                errorData.userId = userAttributes.id || 'Unknown ID';

                if (Knack.getUserRoleNames) {
                    errorData.userRoles = Knack.getUserRoleNames();
                }
            } catch (userInfoError) {
                errorData.userInfoError = 'Failed to capture user data';
            }
        }
        return errorData;
    }

    /**
     * Captures system information if enabled
     * @returns {Object} - System information
     * @private
     * */
    _captureSystemInfo() {
        const errorData = {};
        // System/browser information if enabled
        if (this.options.captureSystemInfo) {
            try {
                const userAgent = navigator.userAgent;
                errorData.userAgent = userAgent;
                errorData.browserName = this._getBrowserInfo(userAgent).name;
                errorData.browserVersion = this._getBrowserInfo(userAgent).version;
                errorData.deviceType = this._getDeviceType(userAgent);
                errorData.operatingSystem = this._getOperatingSystem(userAgent);
                errorData.screenSize = `${window.innerWidth}x${window.innerHeight}`;
                errorData.viewportSize = `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`;
                errorData.knackAppId = Knack ? Knack.application_id : 'Unknown';

                // Add network information
                if (navigator.connection) {
                    errorData.networkType = navigator.connection.effectiveType;
                    errorData.downlink = navigator.connection.downlink;
                }

                // Add memory information if available
                if (window.performance && window.performance.memory) {
                    const memory = window.performance.memory;
                    errorData.jsHeapSizeLimit = memory.jsHeapSizeLimit;
                    errorData.totalJSHeapSize = memory.totalJSHeapSize;
                    errorData.usedJSHeapSize = memory.usedJSHeapSize;
                }

                // Add timing information
                if (window.performance && window.performance.timing) {
                    const timing = window.performance.timing;
                    errorData.pageLoadTime = timing.loadEventEnd - timing.navigationStart;
                    errorData.domReadyTime = timing.domComplete - timing.domLoading;
                }
            } catch (systemInfoError) {
                errorData.systemInfoError = 'Failed to capture system data';
            }
        }
        return errorData;
    }

    /**
     * Captures context data if enabled
     * @param {Object} additionalInfo - Additional information to log
     * * @returns {Object} - Context data
     * @private
     * */
    _captureContextData(additionalInfo) {
        const errorData = {};
        // Knack context information if enabled
        if (this.options.captureKnackContext && this.options.separateContextFields) {
            try {
                const context = this.getCurrentContext();

                // Extract context into separate fields for better filtering and sorting in Knack
                errorData.contextSceneId = context.sceneId || context.currentSceneId || null;
                errorData.contextViewId = context.viewId || context.currentViewId || null;
                errorData.contextEventType = context.eventType || null;
                errorData.contextRecordId = context.recordId || null;
                errorData.contextTimestamp = context.timestamp || null;
                errorData.contextUrl = context.url || window.location.href;

                // If the event was a form submit or record action, include any record ID
                if (context.recordId) {
                    errorData.contextRecordId = context.recordId;
                }

                // Create a formatted context string for easy reading
                errorData.knackContextFormatted = this._formatKnackContext(context);
            } catch (contextError) {
                errorData.contextError = 'Failed to capture Knack context';
            }
        }

        return errorData;
    }

    /**
     * Formats Knack context into a readable string
     * @param {Object} context - The Knack context object
     * @returns {string} - Formatted context string
     * @private
     */
    _formatKnackContext(context) {
        const parts = [];

        if (context.eventType) {
            parts.push(`Event: ${context.eventType}`);
        }

        if (context.sceneId || context.currentSceneId) {
            parts.push(`Scene: ${context.sceneId || context.currentSceneId}`);
        }

        if (context.viewId || context.currentViewId) {
            parts.push(`View: ${context.viewId || context.currentViewId}`);
        }

        if (context.recordId) {
            parts.push(`Record: ${context.recordId}`);
        }

        if (context.timestamp) {
            // Format timestamp to be more readable
            const date = new Date(context.timestamp);
            const formattedDate = date.toLocaleString();
            parts.push(`Time: ${formattedDate}`);
        }

        return parts.join(' | ');
    }

        /**
     * Logs the error data to a Knack table
     * @param {Object} errorData - The error data to log
     * @returns {Promise<Object>} - The created record
     * @private
     */
    _logToKnackTable(errorData) {
        // Map the error data to Knack fields
        const recordData = {};

        // First handle all direct mappings from errorData (excluding additionalInfo)
        Object.entries(this.options.fieldMap).forEach(([errorKey, fieldId]) => {
            if (errorKey !== 'additionalInfo' && errorData[errorKey] !== undefined) {
                recordData[fieldId] = errorData[errorKey];
            }
        });

        // Handle the additionalInfo field specially - but first remove fields that already exist in the main record
        if (this.options.fieldMap.additionalInfo && errorData.additionalInfo) {
            const additionalInfoField = this.options.fieldMap.additionalInfo;

            // Create a copy of additionalInfo that doesn't include fields already captured elsewhere
            const filteredAdditionalInfo = { ...errorData.additionalInfo };

            // Remove fields that are already captured in dedicated fields
            Object.keys(this.options.fieldMap).forEach(key => {
                if (key !== 'additionalInfo') {
                    delete filteredAdditionalInfo[key];
                }
            });

            // Additional fields to exclude that might be in additionalInfo but are already in errorData
            const fieldsToExclude = [
                'contextSceneId', 'contextViewId', 'contextEventType',
                'contextRecordId', 'contextUrl', 'contextTimestamp',
                'knackContext', 'knackContextFormatted'
            ];

            fieldsToExclude.forEach(field => {
                delete filteredAdditionalInfo[field];
            });

            // Only include additionalInfo if it has content after filtering
            if (Object.keys(filteredAdditionalInfo).length > 0) {
                const stringifiedInfo = JSON.stringify(filteredAdditionalInfo, null, 2);
                recordData[additionalInfoField] = stringifiedInfo;
            }
        }

        // Create the error record in Knack
        return this.api.createRecord(this.options.sceneId, this.options.viewId, recordData);
    }

    /**
     * Extracts browser name and version from user agent
     * @param {string} userAgent - Browser user agent string
     * @returns {Object} - Object containing browser name and version
     * @private
     */
    _getBrowserInfo(userAgent) {
        const browsers = [
            { name: 'Edge', pattern: /Edge|Edg/i },
            { name: 'Chrome', pattern: /Chrome/i },
            { name: 'Firefox', pattern: /Firefox/i },
            { name: 'Safari', pattern: /Safari/i },
            { name: 'Opera', pattern: /Opera|OPR/i },
            { name: 'Internet Explorer', pattern: /Trident|MSIE/i }
        ];

        let browserInfo = { name: 'Unknown', version: 'Unknown' };

        for (const browser of browsers) {
            if (browser.pattern.test(userAgent)) {
                browserInfo.name = browser.name;

                // Extract version based on browser
                let versionMatch;
                switch (browser.name) {
                    case 'Edge':
                        versionMatch = userAgent.match(/Edge?\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Chrome':
                        versionMatch = userAgent.match(/Chrome\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Firefox':
                        versionMatch = userAgent.match(/Firefox\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Safari':
                        versionMatch = userAgent.match(/Version\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Opera':
                        versionMatch = userAgent.match(/OPR\/(\d+(\.\d+)?)/i) || userAgent.match(/Opera\/(\d+(\.\d+)?)/i);
                        break;
                    case 'Internet Explorer':
                        versionMatch = userAgent.match(/(?:MSIE |rv:)(\d+(\.\d+)?)/i);
                        break;
                }

                if (versionMatch && versionMatch[1]) {
                    browserInfo.version = versionMatch[1];
                }

                break;
            }
        }

        return browserInfo;
    }

    /**
     * Determines the device type from user agent
     * @param {string} userAgent - Browser user agent string
     * @returns {string} - Device type (Mobile, Tablet, Desktop)
     * @private
     */
    _getDeviceType(userAgent) {
        if (/Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
            if (/Tablet|iPad/i.test(userAgent)) {
                return 'Tablet';
            }
            return 'Mobile';
        }
        return 'Desktop';
    }

    /**
     * Determines the operating system from user agent
     * @param {string} userAgent - Browser user agent string
     * @returns {string} - Operating system name
     * @private
     */
    _getOperatingSystem(userAgent) {
        const systems = [
            { name: 'Windows', pattern: /Windows NT/i },
            { name: 'Windows Phone', pattern: /Windows Phone/i },
            { name: 'macOS', pattern: /Macintosh/i },
            { name: 'iOS', pattern: /iPhone|iPad|iPod/i },
            { name: 'Android', pattern: /Android/i },
            { name: 'Linux', pattern: /Linux/i }
        ];

        for (const system of systems) {
            if (system.pattern.test(userAgent)) {
                return system.name;
            }
        }

        return 'Unknown OS';
    }
}