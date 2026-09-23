/**
 * Generates eslint/knack-functions-globals.json from knackFunctions.js, so consuming apps' `no-undef`
 * check knows every name this bundle puts on the page - without anyone maintaining that list by hand.
 *
 * Run via `npm run build:eslint-globals` (part of `npm run build`). The output is committed and shipped
 * in each release tag, so a consumer pinned to tag vX.Y.Z lints against exactly the globals vX.Y.Z loads.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const SOURCE_PATH = fileURLToPath(new URL('../knackFunctions.js', import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL('./knack-functions-globals.json', import.meta.url));
const GLOBAL_OBJECT_NAMES = new Set(['globalThis', 'window', 'self']);

/**
 * Names declared at the top level of the bundle. knackFunctions.js loads as a classic <script>, so each
 * of these is reachable by bare name from any other script on the page.
 * @param {import('acorn').Program} ast
 * @returns {Set<string>}
 */
function collectTopLevelDeclarations(ast) {
    const names = new Set();
    for (const node of ast.body) {
        if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) {
            names.add(node.id.name);
        } else if (node.type === 'VariableDeclaration') {
            for (const declarator of node.declarations) {
                if (declarator.id.type === 'Identifier') names.add(declarator.id.name);
            }
        }
    }
    return names;
}

/**
 * Depth-first walk over every AST node, calling `visit` on each one.
 * @param {object} node
 * @param {(node: object) => void} visit
 */
function walk(node, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
        else if (value && typeof value.type === 'string') walk(value, visit);
    }
}

/**
 * Names the bundle attaches to the global object explicitly (e.g. `globalThis.KnackBulkActions = ...`),
 * usually from inside a function or `if` block where a top-level declaration isn't possible.
 * @param {import('acorn').Program} ast
 * @returns {Set<string>}
 */
function collectAssignedGlobals(ast) {
    const names = new Set();
    walk(ast, (node) => {
        // Matches `globalThis.foo = ...`, `window['foo'] ??= ...` etc. Dynamic keys (`globalThis[name]`) are
        // skipped - their name isn't knowable statically.
        if (node.type !== 'AssignmentExpression' || node.left.type !== 'MemberExpression') return;
        const { object, property, computed } = node.left;
        if (object.type !== 'Identifier' || !GLOBAL_OBJECT_NAMES.has(object.name)) return;
        if (!computed && property.type === 'Identifier') names.add(property.name);
        else if (computed && property.type === 'Literal' && typeof property.value === 'string') names.add(property.value);
    });
    return names;
}

const ast = parse(readFileSync(SOURCE_PATH, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
const names = [...new Set([...collectTopLevelDeclarations(ast), ...collectAssignedGlobals(ast)])].sort();
const globals = Object.fromEntries(names.map((name) => [name, 'readonly']));

writeFileSync(OUTPUT_PATH, `${JSON.stringify(globals, null, 4)}\n`);
console.log(`Wrote ${names.length} globals to ${OUTPUT_PATH}`);
