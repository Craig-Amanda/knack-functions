/**
 * Quill editor glue: the link/image dialog escapes its values, the image button works without a selection, image-only
 * content is kept, and a failing editor reverts only itself. Quill, React and ReactDOM are stubbed.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { realm, V2, shutdown } = require('./harness.cjs');

after(shutdown);

const HTML = `<div id="view_1"><div class="kn-input kn-input-rich_text" id="kn-input-field_1"><label class="kn-label">A</label><div class="redactor-editor"></div><textarea class="rich_text"></textarea></div>
<div class="kn-input kn-input-rich_text" id="kn-input-field_2"><div class="redactor-editor"></div><textarea class="rich_text"></textarea></div></div>`;
const NAMES = ['QuillModal', 'createQuillModules', 'replaceKnackRichTextWithQuillEditor', 'initializeQuillIcons', 'QuillEditor', 'escapeHtml'];

test('quill dialog and editor glue', async () => {
    const r = await realm({ file: V2, names: NAMES, html: HTML, before: `window.Quill = { imports: {} }; window.__roots = [];
window.React = { createElement: (fn, props) => ({ fn, props }), useRef: () => ({}), useEffect: () => {} };
window.ReactDOM = { createRoot: (el) => { const root = { render: (node) => { if (el.dataset.for === 'kn-input-field_2') throw new Error('boom'); window.__roots.push(node.props); } }; return root; } };` });
    const out = await r.run(() => {
        const res = {};
        QuillModal.show({ type: 'link', url: 'https://x.com/?a="b"', label: 'say "hi" <b>' });
        res.link = [document.getElementById('ql-link-url').value, document.getElementById('ql-link-label').value, document.querySelectorAll('#ql-modal-fields input').length];
        const calls = []; const fake = { getSelection: (focus) => (focus ? { index: 0, length: 0 } : null), setSelection: () => {}, insertEmbed: (...a) => calls.push(a) };
        createQuillModules().toolbar.handlers.image.call({ quill: fake });
        document.getElementById('ql-image-url').value = 'https://img/x.png'; document.getElementById('ql-modal-save').click();
        res.image = calls;
        res.mounted = replaceKnackRichTextWithQuillEditor('view_1');
        const props = window.__roots[0]; const ta = document.querySelector('#kn-input-field_1 textarea');
        const events = []; ta.addEventListener('change', () => events.push('change'));
        props.onChange('<p><br></p>'); res.empty = ta.value;
        props.onChange('<p><img src="a.png"></p>'); res.imageOnly = ta.value;
        props.onChange('<p>hi</p>'); res.text = ta.value; res.events = events.length;
        res.revert = [document.querySelector('#kn-input-field_1 .redactor-editor').classList.contains('ktlHidden'), document.querySelector('#kn-input-field_2 .redactor-editor').classList.contains('ktlHidden'), document.querySelectorAll('.my-react-editor').length];
        return res;
    });
    await r.close();
    assert.deepEqual(out.link, ['https://x.com/?a="b"', 'say "hi" <b>', 2]);
    assert.deepEqual(out.image, [[0, 'image', 'https://img/x.png', 'user']]);
    assert.equal(out.empty, ''); assert.equal(out.imageOnly, '<p><img src="a.png"></p>'); assert.equal(out.text, '<p>hi</p>'); assert.equal(out.events, 3);
    assert.deepEqual(out.revert, [true, false, 1]);
});
