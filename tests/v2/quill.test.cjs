/**
 * Quill editor glue (Quill 2.x, no React): the link/image dialog escapes its values and is keyboard accessible, the image
 * button works without a selection, image-only content is kept, a failing editor reverts only itself, and the
 * deprecated React `QuillEditor` still mounts. Quill is stubbed.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `<div id="view_1"><div class="kn-input kn-input-rich_text" id="kn-input-field_1"><label class="kn-label">A</label><div class="redactor-editor"></div><textarea class="rich_text"></textarea></div>
<div class="kn-input kn-input-rich_text" id="kn-input-field_2"><div class="redactor-editor"></div><textarea class="rich_text"></textarea></div></div>`;
const NAMES = ['QuillModal', 'createQuillModules', 'createQuillEditor', 'replaceKnackRichTextWithQuillEditor', 'initializeQuillIcons', 'labelQuillToolbar', 'ensureQuillMousedownGuard', 'quillEditorControllers', 'QUILL_FORMATS', 'QUILL_TOOLBAR_TIPS', 'QUILL_ALIGN_TIPS', 'QuillEditor', 'escapeHtml', 'resolveElement', 'warnDeprecated'];
const BEFORE = `window.__made = [];
window.Quill = class { static imports = {};
  constructor(el, opts) { if (el.dataset.for === 'kn-input-field_2') throw new Error('boom'); this.opts = opts; this.handlers = []; this.root = document.createElement('div'); this.root.className = 'ql-editor'; el.before(Object.assign(document.createElement('div'), { className: 'ql-toolbar', innerHTML: '<button class="ql-bold"></button><span class="ql-align ql-picker"><span class="ql-picker-item"></span><span class="ql-picker-item" data-value="center"></span></span>' })); el.append(this.root); window.__made.push(this); this.clipboard = { convert: ({ html }) => ({ html }) }; }
  setContents(delta, source) { this.contents = [delta, source]; } on(evt, fn) { this.handlers.push(fn); } off(evt, fn) { this.handlers = this.handlers.filter((h) => h !== fn); } enable(on) { this.enabled = on; }
  emit(html) { this.root.innerHTML = html; this.handlers.forEach((h) => h()); } };`;

test('quill dialog, editor glue and deprecated React wrapper', async () => {
    const r = await realm({ file: V2, names: NAMES, html: HTML, before: BEFORE });
    const out = await r.run(() => {
        const res = {};
        QuillModal.show({ type: 'link', url: 'https://x.com/?a="b"', label: 'say "hi" <b>', onCancel: () => { res.cancelled = true; } });
        res.link = [document.getElementById('ql-link-url').value, document.getElementById('ql-link-label').value, document.querySelectorAll('#ql-modal-fields input').length, document.activeElement.id];
        const modal = document.getElementById('quill-universal-modal');
        res.a11y = [modal.querySelector('[role=dialog]')?.getAttribute('aria-modal'), modal.querySelector('[role=dialog]').getAttribute('aria-labelledby')];
        modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); res.closed = modal.style.display; res.cancelled = !!res.cancelled;
        const calls = []; const fake = { getSelection: (focus) => (focus ? { index: 0, length: 0 } : null), setSelection: () => {}, insertEmbed: (...a) => calls.push(a) };
        createQuillModules().toolbar.handlers.image.call({ quill: fake });
        const imageInput = document.getElementById('ql-image-url'); imageInput.value = 'https://img/x.png';
        imageInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        res.image = [calls, modal.style.display];

        res.mounted = replaceKnackRichTextWithQuillEditor('view_1');
        const quill = window.__made[0]; const ta = document.querySelector('#kn-input-field_1 textarea');
        res.opts = [quill.opts.theme, quill.opts.formats.includes('link'), quill.opts.formats.includes('strike'), quill.opts.modules.clipboard.matchVisual];
        res.toolbar = [document.querySelector('.ql-bold').title, document.querySelector('.ql-bold').getAttribute('aria-label'), document.querySelector('.ql-picker-item[data-value=center]').title];
        const events = []; ta.addEventListener('change', () => events.push('change'));
        quill.emit('<p><br></p>'); res.empty = ta.value;
        quill.emit('<p><img src="a.png"></p>'); res.imageOnly = ta.value;
        quill.emit('<p>hi</p>'); res.text = ta.value; res.events = events.length; res.mirrored = document.querySelector('#kn-input-field_1 .redactor-editor').innerHTML;
        res.revert = [document.querySelector('#kn-input-field_1 .redactor-editor').classList.contains('ktlHidden'), document.querySelector('#kn-input-field_2 .redactor-editor').classList.contains('ktlHidden'), document.querySelectorAll('.my-react-editor').length];
        replaceKnackRichTextWithQuillEditor('view_1'); res.remounted = window.__made.length;

        const host = document.createElement('div'); host.dataset.for = 'x'; document.body.append(host);
        const loaded = []; const ctl = createQuillEditor(host, { value: '<p>init</p>', onChange: (h) => loaded.push(h), readOnly: true });
        res.load = [ctl.quill.contents, loaded.length, ctl.quill.opts.readOnly]; ctl.setReadOnly(false); res.enabled = ctl.quill.enabled; ctl.destroy(); res.handlersLeft = ctl.quill.handlers.length;
        res.noQuill = (() => { const q = window.Quill; window.Quill = undefined; const v = createQuillEditor(host); window.Quill = q; return v; })();

        window.React = { createElement: (tag, props) => ({ tag, props }) };
        const el = QuillEditor({ value: '<p>r</p>' }); const hostEl = document.createElement('div'); hostEl.dataset.for = 'y'; el.props.ref(hostEl);
        res.shim = [el.tag, window.__made.length];
        return res;
    });
    await r.close();
    assert.deepEqual(out.link, ['https://x.com/?a="b"', 'say "hi" <b>', 2, 'ql-link-url']);
    assert.deepEqual(out.a11y, ['true', 'ql-modal-title']);
    assert.equal(out.closed, 'none'); assert.equal(out.cancelled, true);
    assert.deepEqual(out.image, [[[0, 'image', 'https://img/x.png', 'user']], 'none']);
    assert.equal(out.mounted, 2);
    assert.deepEqual(out.opts, ['snow', true, false, false]);
    assert.deepEqual(out.toolbar, ['Bold (Ctrl+B)', 'Bold (Ctrl+B)', 'Align Center']);
    assert.equal(out.empty, ''); assert.equal(out.imageOnly, '<p><img src="a.png"></p>'); assert.equal(out.text, '<p>hi</p>'); assert.equal(out.events, 3); assert.equal(out.mirrored, '<p>hi</p>');
    assert.deepEqual(out.revert, [true, false, 1]);
    assert.equal(out.remounted, 1);
    assert.deepEqual(out.load, [[{ html: '<p>init</p>' }, 'silent'], 0, true]); assert.equal(out.enabled, true); assert.equal(out.handlersLeft, 0); assert.equal(out.noQuill, null);
    assert.deepEqual(out.shim, ['div', 3]);
});
