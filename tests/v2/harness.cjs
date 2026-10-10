/**
 * Playwright harness for differential tests: load the same functions from knackFunctions.js (V1) and
 * knackFunctionsV2.js (V2) into separate pages with identical fixtures, run a scenario in each, and compare.
 *
 * Browser: uses the `playwright` package if installed, else `playwright-core` with the preinstalled Chromium
 * (PW_CHROMIUM or /opt/pw-browsers/chromium). jQuery comes from JQUERY_PATH or the resolvable `jquery` package.
 * Set KF_TEST_DEPS to a node_modules directory holding jquery / playwright-core when they are not installed here.
 */
const fs = require('node:fs');
const path = require('node:path');
const { extract } = require('./extract.cjs');

const V1 = 'knackFunctions.js';
const V2 = process.env.KF_V2_PATH || 'knackFunctionsV2.js'; // KF_V2_PATH lets a preview assembly be tested before it lands

function resolveFrom(request) {
    const paths = [path.join(__dirname, '..', '..'), process.env.KF_TEST_DEPS, process.env.KF_TEST_DEPS && path.dirname(process.env.KF_TEST_DEPS)].filter(Boolean);
    return require.resolve(request, { paths });
}

function loadPlaywright() {
    try { return require(resolveFrom('playwright')); } catch { /* fall through */ }
    return require(resolveFrom('playwright-core'));
}

function jquerySource() {
    const file = process.env.JQUERY_PATH || resolveFrom('jquery/dist/jquery.min.js');
    return fs.readFileSync(file, 'utf8');
}

const stubsSource = fs.readFileSync(path.join(__dirname, 'stubs.js'), 'utf8');

let browserPromise = null;
function browser() {
    if (!browserPromise) {
        const { chromium } = loadPlaywright();
        const executablePath = process.env.PW_CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
        browserPromise = chromium.launch({ headless: true, executablePath });
    }
    return browserPromise;
}

/**
 * Open a page holding `html`, jQuery, the stubs and the named functions (plus in-file dependencies) from `file`.
 * @param {object} options
 * @param {string} options.file V1 or V2 bundle path.
 * @param {string[]} options.names Top-level names to load.
 * @param {string} [options.html] Body markup.
 * @param {string[]} [options.exclude] In-file names to leave out (when the test stubs them).
 * @param {string} [options.before] Extra script to run before the library loads (e.g. app globals).
 * @param {string} [options.fallback] Bundle that supplies declarations `file` lacks (V2 realms default to V1).
 * @param {string[]} [options.statements] Substrings identifying bare top-level statements to load too (see extract).
 */
async function realm({ file, names, html = '', exclude = [], before = '', statements = [], fallback = file === V2 ? V1 : undefined }) {
    const page = await (await browser()).newPage();
    const consoleMessages = [];
    page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', (error) => consoleMessages.push({ type: 'pageerror', text: error.message }));
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`);
    await page.addScriptTag({ content: jquerySource() });
    await page.addScriptTag({ content: stubsSource });
    if (before) await page.addScriptTag({ content: before });
    await page.addScriptTag({ content: extract(file, names, { exclude, fallback, statements }) });
    return {
        page,
        consoleMessages,
        /** Run `fn` (serialised) in the page with `arg` and return its JSON-able result. */
        run: (fn, arg) => page.evaluate(fn, arg),
        bodyHtml: () => page.evaluate(() => document.body.innerHTML),
        close: () => page.close(),
    };
}

/** Run the same scenario against V1 and V2 and return both results. */
async function both({ names, html, exclude, before, statements }, scenario, arg) {
    const [v1, v2] = await Promise.all([
        realm({ file: V1, names, html, exclude, before, statements }),
        realm({ file: V2, names, html, exclude, before, statements, fallback: V1 }),
    ]);
    try {
        const [r1, r2] = await Promise.all([v1.run(scenario, arg), v2.run(scenario, arg)]);
        return { v1: r1, v2: r2, v1Console: v1.consoleMessages, v2Console: v2.consoleMessages };
    } finally {
        await Promise.all([v1.close(), v2.close()]);
    }
}

async function shutdown() {
    if (browserPromise) { const b = await browserPromise; browserPromise = null; await b.close(); }
}

module.exports = { V1, V2, realm, both, shutdown, extract };
