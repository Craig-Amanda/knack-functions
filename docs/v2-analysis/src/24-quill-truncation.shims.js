/**
 * @deprecated V1 was a React component; Quill is now mounted straight onto an element. Use createQuillEditor.
 * Still works as a React component for any page code that rendered it.
 * @param {{value?: string, onChange?: Function, modules?: Object, theme?: string, readOnly?: boolean}} props - Editor props.
 * @returns {Object} React element.
 */
function QuillEditor({ value, onChange, modules, theme = "snow", readOnly = false }) {
    warnDeprecated('QuillEditor', 'createQuillEditor');
    let controller = null;
    return React.createElement('div', {
        ref: (element) => {
            controller?.destroy();
            controller = element ? createQuillEditor(element, { value, onChange, modules, theme, readOnly }) : null;
        },
    });
}
