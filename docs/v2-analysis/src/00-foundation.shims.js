/**
 * Curried operator helper from V1 (`evaluate(a)('<')(b)`).
 * @deprecated Use the JavaScript operator directly; kept so existing page code keeps working.
 * @param {*} a - Left operand.
 * @returns {(operator: string) => (b: *) => *} Applies `operator` to `a` and `b`; `'Invalid operation'` for unknown operators.
 */
const evaluate = (a) => (operator) => (b) => {
    warnDeprecated('evaluate', 'the JavaScript operator directly');
    const operations = {
        '+': () => a + b, '-': () => a - b, '/': () => a / b, '*': () => a * b, '%': () => a % b,
        '>': () => a > b, '>=': () => a >= b, '<': () => a < b, '<=': () => a <= b,
        '==': () => a == b, '===': () => a === b, '!=': () => a != b, '!==': () => a !== b,
    };
    return operations[operator] ? operations[operator]() : 'Invalid operation';
};

// jQuery pseudo-selector `:textEquals(text)` from V1: exact trimmed-text match ignoring Knack's required marker (*).
// Prefer getElementByText() in new code.
if (globalThis.jQuery?.expr?.[':']) {
    globalThis.jQuery.expr[':'].textEquals = (element, _index, match) => element.textContent.replace('*', '').trim() === match[3];
}
