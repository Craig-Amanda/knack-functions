// Developer flag (safe-check against missing Knack API)
window.isDeveloper = (function () {
    try {
        const roles = (typeof Knack.getUserRoleNames === 'function') ? Knack.getUserRoleNames() : [];
        let roleList = [];
        if (Array.isArray(roles)) roleList = roles;
        else if (typeof roles === 'string') roleList = roles.split(/\s*,\s*/).filter(Boolean);
        return Array.isArray(roleList) && roleList.includes('Developer');
    } catch (e) { return false; }
})();

// --- Configuration Constants ---
const CDN_REPO = 'Craig-Amanda/knack-functions';
const CDN_FILE_PATH = '/dist/knackFunctions.global.min.js';
const JSDELIVR_META_URL = 'https://data.jsdelivr.com/v1/package/gh/' + CDN_REPO;
const MIN_TAG = 'v1.0.4';
const PROD_PINNED_VERSION = 'v1.0.4';
const SWITCHER_POSITION = 'right'; // 'left' | 'right'

// --- LocalStorage Keys ---
const LS_SOURCE_KEY = 'knackFunctionsSource';   // 'local' | 'cdn'
const LS_VERSION_KEY = 'knackFunctionsVersion'; // e.g. 'v1.0.2'

// --- Sources Configuration ---
const SOURCES = {
    'local': 'http://localhost:3001/knackFunctions.js',
    'cdn': null // computed from selected version
};

// --- Global State Variables ---
let versionsCache = null;   // available versions (>= MIN_TAG) that have both files present
let latestTagCache = null;  // latest among available
let selectedSource = localStorage.getItem(LS_SOURCE_KEY) || (window.isDeveloper ? 'local' : 'cdn');
let selectedCdnVersion = ensureV(localStorage.getItem(LS_VERSION_KEY) || '') || null;

// --- Initial Setup ---
// Validate and repair selectedSource
if (!['local', 'cdn'].includes(selectedSource)) {
    selectedSource = window.isDeveloper ? 'local' : 'cdn';
    localStorage.setItem(LS_SOURCE_KEY, selectedSource);
}

// Ensure we have a valid (>= MIN_TAG) version with sidecar; repair if needed
// Only run heavy CDN metadata checks for developers
if (window.isDeveloper) (async function ensureVersion() {
    try {
        const { available, latest } = await getAvailableVersions();
        versionsCache = available;
        latestTagCache = latest;

        const stored = ensureV(localStorage.getItem(LS_VERSION_KEY) || '');
        const needsRepair =
            !stored ||
            !semverGte(stored, MIN_TAG) ||
            !available.includes(stored);

        if (needsRepair) {
            const pin = latest || MIN_TAG;
            console.warn('Pinned version invalid or too old; switching to', pin);
            localStorage.setItem(LS_VERSION_KEY, pin);
            selectedCdnVersion = pin;
            if (selectedSource === 'cdn') handleSourceChange();
        } else {
            // normalise stored form
            if (stored !== localStorage.getItem(LS_VERSION_KEY)) {
                localStorage.setItem(LS_VERSION_KEY, stored);
            }
            selectedCdnVersion = stored;
        }
    } catch (err) {
        console.warn('Could not resolve available versions; using minimum. Reason:', err && err.message);
        const fallback = MIN_TAG;
        localStorage.setItem(LS_VERSION_KEY, fallback);
        selectedCdnVersion = fallback;
        if (selectedSource === 'cdn') handleSourceChange();
    }
})();

// Local server reachability check (fallback to CDN if not reachable)
if (selectedSource === 'local' && window.isDeveloper) {
    (async function checkLocalServer() {
        const originalSource = selectedSource;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const response = await fetch(SOURCES.local, { method: 'HEAD', signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('HTTP ' + response.status);
        } catch (error) {
            console.warn('Local server is not available:', error && error.message);
            selectedSource = 'cdn';
            localStorage.setItem(LS_SOURCE_KEY, selectedSource);
            showLocalServerNotification();
            if (originalSource !== selectedSource) handleSourceChange();
        }
    })();
}

// --- Script Loading Execution ---
const resolved = resolveKnackFunctionsUrlAndVersion();
let KNACK_FUNCTIONS_URL = resolved.url;
let KNACK_FUNCTIONS_VERSION = resolved.version;

if (!KNACK_FUNCTIONS_URL) {
    console.warn('Selected source has no URL; forcing CDN with minimum version.');
    selectedSource = 'cdn';
    const fallback = ensureV(localStorage.getItem(LS_VERSION_KEY) || selectedCdnVersion || MIN_TAG);
    localStorage.setItem(LS_SOURCE_KEY, selectedSource);
    localStorage.setItem(LS_VERSION_KEY, fallback);
    KNACK_FUNCTIONS_URL = cdnUrlFor(fallback);
    KNACK_FUNCTIONS_VERSION = fallback;
}

// Files to load (SRI fetched dynamically for the CDN file)
loadExternalFiles([
    { type: 'script', url: 'https://unpkg.com/react@18/umd/react.development.js' },
    { type: 'script', url: 'https://unpkg.com/react-dom@18/umd/react-dom.development.js' },
    { type: 'script', url: KNACK_FUNCTIONS_URL }, // SRI applied dynamically
    { type: 'script', url: 'https://ctrnd.s3.amazonaws.com/Lib/KTL/KTL_Start.js' },
    { type: 'favicon', url: 'https://arcproject.org.uk/wp-content/uploads/2020/01/cropped-favicon-square-2-32x32.jpg' }
]);

// =========================================================================
// UTILITY FUNCTIONS AND UI COMPONENTS - PLACE AT BOTTOM AFTER KTL BRACKETS
// =========================================================================

// Helpers
function ensureV(tag) {
    if (!tag) return null;
    const t = String(tag).trim();
    return /^v/i.test(t) ? 'v' + t.replace(/^v/i, '') : 'v' + t;
}

function compareSemverTags(a, b) {
    const pa = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n || '0', 10));
    const pb = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n || '0', 10));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0, db = pb[i] || 0;
        if (da !== db) return da - db;
    }
    return 0;
}

function semverGte(a, b) { return compareSemverTags(ensureV(a), ensureV(b)) >= 0; }

function cdnUrlFor(version) {
    return 'https://cdn.jsdelivr.net/gh/' + CDN_REPO + '@' + version + '/' + CDN_FILE_PATH;
}

function sriSidecarUrlFor(cdnScriptUrl) { return cdnScriptUrl + '.sha384'; }

function extractVersionFromCdn(url) {
    const m = url && url.match(/@([^/]+)/);
    return m ? ensureV(m[1]) : null;
}

function getFallbackVersion() { return MIN_TAG; }

// Determine the visual state for the small Dev trigger button.
// Returns one of: 'local' | 'pinned' | 'earlier' | 'later' | 'cdn' (fallback)
function getDevTriggerState() {
    if (selectedSource === 'local') return 'local';
    if (selectedSource !== 'cdn') return 'cdn';

    try {
        const chosen = ensureV(localStorage.getItem(LS_VERSION_KEY) || selectedCdnVersion || MIN_TAG);
        const pinned = ensureV(PROD_PINNED_VERSION || MIN_TAG);
        const comparison = compareSemverTags(chosen, pinned);

        if (comparison === 0) return 'pinned';
        return comparison < 0 ? 'earlier' : 'later';
    } catch (e) {
        return 'cdn';
    }
}

// Unified function to apply visual state to elements
function applyVisualState(element, state) {
    if (!element || !element.classList) return;

    const stateClasses = ['kf-state-local', 'kf-state-pinned', 'kf-state-earlier', 'kf-state-later'];
    element.classList.remove(...stateClasses);
    element.classList.add('kf-state-' + state);
}

function applyDevTriggerState(btn) {
    const state = getDevTriggerState();
    applyVisualState(btn, state);
    try {
        btn.setAttribute('aria-label', 'Open developer controls — ' + state);
    } catch (e) { }
}

// Apply the same visual state to the switcher title so it matches the small dev trigger.
function applySwitcherState(box) {
    try {
        if (!box) return;
        const title = box.querySelector('.title');
        const state = getDevTriggerState();

        // Apply state to both title and box
        applyVisualState(title, state);
        applyVisualState(box, state);

        // Also update small dev trigger if present
        const trigger = document.getElementById('kf-dev-trigger');
        if (trigger) applyDevTriggerState(trigger);
    } catch (e) { /* ignore */ }
}

function resolveKnackFunctionsUrlAndVersion() {
    // Non-developers should load the pinned production version for stability
    if (!window.isDeveloper) {
        const version = PROD_PINNED_VERSION || MIN_TAG;
        return { url: cdnUrlFor(version), version };
    }
    if (selectedSource === 'cdn') {
        const stored = ensureV(localStorage.getItem(LS_VERSION_KEY) || selectedCdnVersion || MIN_TAG);
        const version = semverGte(stored, MIN_TAG) ? stored : MIN_TAG;
        const url = cdnUrlFor(version);
        return { url, version };
    }
    return { url: SOURCES.local, version: null };
}

function handleSourceChange() {
    localStorage.setItem('forcingReload', 'true');
    localStorage.setItem(LS_SOURCE_KEY, selectedSource);
    const ts = Date.now();
    const sep = window.location.href.indexOf('?') === -1 ? '?' : '&';
    const newUrl = window.location.href + sep + '_reload=' + ts;
    try {
        setTimeout(function() {
            window.location.replace(newUrl);
            setTimeout(function() { window.location.reload(true); }, 100);
        }, 50);
    } catch (e) {
        window.location.href = newUrl;
    }
}

function showLocalServerNotification() {
    if (localStorage.getItem('forcingReload') === 'true') return;
    const n = document.createElement('div');
    n.className = 'kf-loader-notice info';
    n.textContent = 'Local server unavailable. Using CDN instead.';
    document.body.appendChild(n);
    setTimeout(function() { n.remove(); }, 5000);
}

function showCdnErrorNotification() {
    if (localStorage.getItem('forcingReload') === 'true') return;
    const n = document.createElement('div');
    n.className = 'kf-loader-notice error';
    n.textContent = 'CDN script failed to load (or SRI sidecar missing).';
    document.body.appendChild(n);
    setTimeout(function() { n.remove(); }, 7000);
}

async function fetchCdnMeta() {
    const res = await fetch(JSDELIVR_META_URL, { method: 'GET' });
    if (!res.ok) throw new Error('jsDelivr meta HTTP ' + res.status);
    const json = await res.json();

    // Accept "1.0.2" and "v1.0.2"; normalise to "v1.0.2"
    const rawVersions = Array.isArray(json.versions) ? json.versions : [];
    const versions = rawVersions
        .filter(v => /^(?:v)?\d+\.\d+\.\d+$/i.test(String(v)))
        .map(ensureV)
        .filter(v => semverGte(v, MIN_TAG)); // ⬅️ exclude anything < MIN_TAG

    // Prefer provided latest; else compute from filtered list
    const latestRaw = json.tags && json.tags.latest ? json.tags.latest : null;
    let latest = latestRaw ? ensureV(latestRaw) : (versions.length ? versions.sort(compareSemverTags).slice(-1)[0] : null);
    if (latest && !semverGte(latest, MIN_TAG)) latest = null;

    return { versions, latest };
}

// Check that a URL exists (HEAD 200)
async function headOk(url) {
    try {
        const r = await fetch(url, { method: 'HEAD' });
        return r.ok;
    } catch (_) { return false; }
}

// From metadata, return only versions that actually have BOTH the JS and the .sha384
async function getAvailableVersions() {
    const meta = await fetchCdnMeta();
    const candidates = meta.versions || [];
    const checks = await Promise.all(
        candidates.map(async v => {
            const jsOk  = await headOk(cdnUrlFor(v));
            const sriOk = await headOk(cdnUrlFor(v) + '.sha384');
            return (jsOk && sriOk) ? v : null;
        })
    );
    const available = checks.filter(Boolean).sort(compareSemverTags);
    const latest = available.length ? available[available.length - 1] : null;
    return { available, latest };
}

// Ensure we have a valid (>= MIN_TAG) version with sidecar; repair if needed
// Only run heavy CDN metadata checks for developers
// ============================================================================
// UTILITY FUNCTIONS SECTION - Moved to bottom for better code organization
// ============================================================================
function injectAssetLoaderStyles() {
    if (document.getElementById('kf-assetloader-styles')) return;
    try {
    const css = `
/* Modernized switcher - positioning based on SWITCHER_POSITION */
#knackFunctionsSourceSwitcher { position: fixed; bottom: 20px; ${SWITCHER_POSITION === 'right' ? 'right' : 'left'}: 20px; background: rgba(255,255,255,0.98); padding: 14px; border-radius: 12px; box-shadow: 0 10px 30px rgba(12,12,12,0.18); z-index: 9999; font-size: 13px; border: 2px solid rgba(16,24,40,0.06); width: 340px; max-width: calc(100% - 40px); font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; transition: border-color 200ms ease; }
#knackFunctionsSourceSwitcher .title { font-weight: 700; color: #fff; margin: 0 0 12px 0; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border-radius:8px; box-shadow: inset 0 -1px 0 rgba(255,255,255,0.03); font-size:14px; }
#knackFunctionsSourceSwitcher .title .label { display:block; color:inherit; }
#knackFunctionsSourceSwitcher .title small { display:block; font-weight:600; opacity:0.9; font-size:12px; color:rgba(255,255,255,0.92); }
#knackFunctionsSourceSwitcher .content { display:block; padding: 6px 2px 2px 2px; }
#knackFunctionsSourceSwitcher select { padding: 8px 10px; border-radius: 8px; border: 2px solid rgba(16,24,40,0.15); background: #fff; cursor: pointer; outline: none; min-width: 150px; box-shadow: 0 6px 18px rgba(11,22,44,0.08); font-weight: 500; color: #2c3e50; transition: border-color 200ms ease, box-shadow 200ms ease; }
#knackFunctionsSourceSwitcher select:hover { border-color: rgba(16,24,40,0.25); box-shadow: 0 8px 24px rgba(11,22,44,0.12); }
#knackFunctionsSourceSwitcher select:focus { border-color: #007bff; box-shadow: 0 0 0 3px rgba(0,123,255,0.1); }
#knackFunctionsSourceSwitcher button { padding: 8px 14px; border-radius: 8px; border: 2px solid rgba(16,24,40,0.15); background: linear-gradient(90deg, #f8f9fa, #fff); cursor: pointer; font-weight: 600; color: #2c3e50; transition: all 200ms ease; box-shadow: 0 4px 12px rgba(11,22,44,0.06); }
#knackFunctionsSourceSwitcher button:hover { border-color: #007bff; background: linear-gradient(90deg, #e3f2fd, #f0f9ff); color: #0056b3; transform: translateY(-1px); box-shadow: 0 6px 18px rgba(11,22,44,0.1); }
#knackFunctionsSourceSwitcher button:active { transform: translateY(0); }
.kf-switcher-close { background: #fff !important; border: 2px solid #000 !important; color: #000 !important; font-size: 16px !important; font-weight: 900 !important; line-height: 1 !important; padding: 0 !important; cursor: pointer !important; border-radius: 50% !important; transition: all 120ms ease !important; text-shadow: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.6) !important; min-width: 28px !important; min-height: 28px !important; width: 28px !important; height: 28px !important; display: flex !important; align-items: center !important; justify-content: center !important; position: relative !important; z-index: 100 !important; margin: 0 !important; flex-shrink: 0 !important; font-family: Arial, sans-serif !important; text-align: center !important; vertical-align: middle !important; }
.kf-switcher-close:hover { background: #f0f0f0 !important; border-color: #000 !important; transform: scale(1.15) !important; box-shadow: 0 4px 12px rgba(0,0,0,0.7) !important; }
.kf-row { display:flex; gap:10px; align-items:center; margin-bottom:10px; }
.kf-row > div:first-child { min-width: 64px; font-weight:600; color:#324055; }
.kf-row-version { margin-bottom:6px; }
.kf-row-buttons { margin-bottom:6px; display:flex; justify-content:space-between; gap:10px; }
.kf-row-buttons button { min-width: 120px; flex: 1; }
.kf-loader-notice { position: fixed; top: 14px; right: 14px; color: #fff; padding: 10px 12px; border-radius: 8px; box-shadow: 0 6px 18px rgba(12,24,40,0.2); z-index: 9999; font-size: 14px; }
.kf-loader-notice.info { background: linear-gradient(90deg,#fb8c00,#ffb74d); }
.kf-loader-notice.error { background: linear-gradient(90deg,#d32f2f,#f44336); }
/* Dev trigger visual states mirror the same palette as the title */
.kf-dev-trigger, #kf-dev-trigger { position: fixed; bottom: 20px; ${SWITCHER_POSITION === 'right' ? 'right' : 'left'}: 20px; z-index: 10000; padding: 8px 12px; border-radius: 10px; color: #fff; border: none; cursor: pointer; font-size: 13px; transition: transform 120ms ease, box-shadow 120ms ease; box-shadow: 0 6px 18px rgba(16,24,40,0.12); }
.kf-dev-trigger:hover, #kf-dev-trigger:hover { transform: translateY(-2px); }
/* State: pinned (production CDN pinned) - green */
.kf-dev-trigger.kf-state-pinned, #kf-dev-trigger.kf-state-pinned { background: linear-gradient(90deg,#198754,#28a745); box-shadow: 0 8px 22px rgba(25,135,84,0.18); color: #fff !important; }
/* State: local - orange */
.kf-dev-trigger.kf-state-local, #kf-dev-trigger.kf-state-local { background: linear-gradient(90deg,#ff9800,#ffb74d); box-shadow: 0 8px 22px rgba(255,152,0,0.16); color: #1a1a1a !important; }
/* State: earlier than pinned - red */
.kf-dev-trigger.kf-state-earlier, #kf-dev-trigger.kf-state-earlier { background: linear-gradient(90deg,#d32f2f,#f05454); box-shadow: 0 8px 22px rgba(211,47,47,0.16); color: #fff !important; }
/* State: later than pinned - purple */
.kf-dev-trigger.kf-state-later, #kf-dev-trigger.kf-state-later { background: linear-gradient(90deg,#6f42c1,#8e44ff); box-shadow: 0 8px 22px rgba(111,66,193,0.16); color: #fff !important; }

/* Title states (match the dev trigger colors) with improved text contrast */
.kf-source-local .title.kf-state-local, .title.kf-state-local { background: linear-gradient(90deg,#ff9800,#ffb74d); color: #1a1a1a !important; }
.kf-source-cdn .title.kf-state-pinned, .title.kf-state-pinned { background: linear-gradient(90deg,#198754,#28a745); color: #fff !important; }
.title.kf-state-earlier { background: linear-gradient(90deg,#d32f2f,#f05454); color: #fff !important; }
.title.kf-state-later { background: linear-gradient(90deg,#6f42c1,#8e44ff); color: #fff !important; }

/* Ensure close button text remains visible on all backgrounds */
.kf-source-local .title.kf-state-local .kf-switcher-close, .title.kf-state-local .kf-switcher-close { background: #1a1a1a !important; color: #fff !important; border-color: #1a1a1a !important; }
.kf-source-local .title.kf-state-local .kf-switcher-close:hover, .title.kf-state-local .kf-switcher-close:hover { background: #333 !important; border-color: #333 !important; }

/* Switcher border states (match the title colors) */
#knackFunctionsSourceSwitcher:has(.title.kf-state-pinned) { border-color: rgba(25,135,84,0.3); }
#knackFunctionsSourceSwitcher:has(.title.kf-state-local) { border-color: rgba(255,152,0,0.3); }
#knackFunctionsSourceSwitcher:has(.title.kf-state-earlier) { border-color: rgba(211,47,47,0.3); }
#knackFunctionsSourceSwitcher:has(.title.kf-state-later) { border-color: rgba(111,66,193,0.3); }

/* Fallback for browsers without :has() support */
.kf-source-local.kf-state-local #knackFunctionsSourceSwitcher,
#knackFunctionsSourceSwitcher.kf-state-local { border-color: rgba(255,152,0,0.3); }
.kf-source-cdn.kf-state-pinned #knackFunctionsSourceSwitcher,
#knackFunctionsSourceSwitcher.kf-state-pinned { border-color: rgba(25,135,84,0.3); }
#knackFunctionsSourceSwitcher.kf-state-earlier { border-color: rgba(211,47,47,0.3); }
#knackFunctionsSourceSwitcher.kf-state-later { border-color: rgba(111,66,193,0.3); }

/* Source-based subtle accents for controls */
.kf-source-local select, .kf-source-local button { border-color: rgba(255,152,0,0.16); }
.kf-source-cdn select, .kf-source-cdn button { border-color: rgba(13,110,253,0.12); }
        `;
        const style = document.createElement('style');
        style.id = 'kf-assetloader-styles';
        style.textContent = css;
        document.head.appendChild(style);
    } catch (e) {
        /* ignore failures to inject CSS in restrictive environments */
    }
}

async function addSourceSwitcher(attempts = 0) {
    // Dynamic check: the static `window.isDeveloper` flag may have been computed before the
    // Knack API was available. Re-evaluate at runtime so the switcher appears for real devs.
    let runtimeIsDev = false;
    try {
        if (window.isDeveloper) {
            runtimeIsDev = true;
        } else if (typeof Knack !== 'undefined' && typeof Knack.getUserRoleNames === 'function') {
            try {
                const roles = Knack.getUserRoleNames();
                let roleList = [];
                if (Array.isArray(roles)) roleList = roles;
                else if (typeof roles === 'string') roleList = roles.split(/\s*,\s*/).filter(Boolean);
                runtimeIsDev = Array.isArray(roleList) && roleList.includes('Developer');
            } catch (e) {
                console.warn('[assetLoader] Error reading Knack roles', e && e.message);
                runtimeIsDev = false;
            }
        }
    } catch (e) {
        console.warn('[assetLoader] Error during runtime developer check', e && e.message);
        runtimeIsDev = false;
    }

    // If Knack isn't defined yet, retry a few times (small delay) because the initial
    // script may execute before Knack is injected on the page.
    if (!runtimeIsDev) {
        if (typeof Knack === 'undefined' && attempts < 6) {
            setTimeout(function() { addSourceSwitcher(attempts + 1); }, 400);
            return;
        }
        return; // not a developer — nothing to do
    }

    // If switcher already built, do nothing
    if (document.getElementById('knackFunctionsSourceSwitcher')) return;

    // Create a small trigger button that opens the full UI when clicked
    if (!document.getElementById('kf-dev-trigger')) {
        const btn = document.createElement('button');
        btn.id = 'kf-dev-trigger';
        btn.type = 'button';
        btn.title = 'Show dev controls';
        btn.textContent = 'Dev';
        btn.className = 'kf-dev-trigger';
        btn.setAttribute('aria-label', 'Open developer controls');
        // Ensure full styles are present so the button and switcher are styled immediately
        injectAssetLoaderStyles();
        btn.addEventListener('click', async function onClick() {
            try {
                // prevent double-build
                btn.removeEventListener('click', onClick);
                btn.remove();
                await buildSourceSwitcher();
            } catch (e) {
                console.warn('Failed to open dev switcher', e && e.message);
            }
        });
        document.body.appendChild(btn);
        // apply initial visual state (pinned/local/earlier/later)
        try { applyDevTriggerState(btn); } catch (e) { /* ignore */ }
    }
}

// Build the full source switcher UI (runs only when the dev triggers it)
async function buildSourceSwitcher() {
    if (document.getElementById('knackFunctionsSourceSwitcher')) return;
    // Create the container box and title
    const box = document.createElement('div');
    box.id = 'knackFunctionsSourceSwitcher';
    // Add a class to reflect current source so we can color the UI accordingly
    box.classList.add(selectedSource === 'local' ? 'kf-source-local' : 'kf-source-cdn');
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'knackFunctions.js';
    // add a small close button in the title bar
    const closeBtn = document.createElement('button');
    closeBtn.className = 'kf-switcher-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close dev controls');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', function() {
        try {
            box.remove();
        } catch (e) { /* ignore */ }
        // Re-create the small Dev trigger so the switcher can be reopened easily.
        // Use a short delay to avoid racing with any DOM teardown.
        setTimeout(function() { try { addSourceSwitcher(); } catch (e) { /* ignore */ } }, 50);
    });
    title.appendChild(closeBtn);
    box.appendChild(title);

    // Apply title state (pinned/local/earlier/later)
    try { applySwitcherState(box); } catch (e) { /* ignore */ }

    // Source selector
    const srcRow = document.createElement('div');
    srcRow.className = 'kf-row kf-row-source';
    const srcLabel = document.createElement('div');
    srcLabel.textContent = 'Source:';
    const srcSelect = document.createElement('select');
    [['local', 'Local (localhost:3001)'], ['cdn', 'CDN (jsDelivr)']].forEach(function(pair) {
        const o = document.createElement('option'); o.value = pair[0]; o.textContent = pair[1];
        if (pair[0] === selectedSource) o.selected = true;
        srcSelect.appendChild(o);
    });
    srcSelect.addEventListener('change', function() {
        selectedSource = this.value;
        localStorage.setItem(LS_SOURCE_KEY, selectedSource);
        // update the box class so the UI gives an immediate visual cue
        if (box && box.classList) {
            box.classList.remove('kf-source-local', 'kf-source-cdn');
            box.classList.add(selectedSource === 'local' ? 'kf-source-local' : 'kf-source-cdn');
        }
        // update tiny dev trigger state if present
        try { const t = document.getElementById('kf-dev-trigger'); if (t) applyDevTriggerState(t); } catch (e) { /* ignore */ }
        handleSourceChange();
    });
    srcRow.appendChild(srcLabel); srcRow.appendChild(srcSelect);
    box.appendChild(srcRow);

    // Version selector (CDN only)
    const verRow = document.createElement('div');
    verRow.className = 'kf-row kf-row-version';
    const verLabel = document.createElement('div');
    verLabel.textContent = 'Version';
    const verSelect = document.createElement('select');

    const pinned = ensureV(localStorage.getItem(LS_VERSION_KEY) || selectedCdnVersion || MIN_TAG);
    const seed = document.createElement('option');
    seed.value = pinned;
    seed.textContent = pinned;
    seed.selected = true;
    verSelect.appendChild(seed);

    verSelect.addEventListener('change', function() {
        const chosen = this.value;
        if (chosen) {
            localStorage.setItem(LS_VERSION_KEY, chosen);
            selectedCdnVersion = chosen;
            // Update visual state immediately
            try { applySwitcherState(box); } catch (e) { /* ignore */ }
            if (selectedSource === 'cdn') handleSourceChange();
        }
    });

    verRow.appendChild(verLabel); verRow.appendChild(verSelect);
    box.appendChild(verRow);

    // Buttons row (Latest and Production side by side)
    const buttonsRow = document.createElement('div');
    buttonsRow.className = 'kf-row kf-row-buttons';

    const latestBtn = document.createElement('button');
    latestBtn.textContent = 'Set to latest';
    latestBtn.addEventListener('click', async function() {
        try {
            if (!versionsCache || !latestTagCache) {
                const meta = await getAvailableVersions();
                versionsCache = meta.available || [];
                latestTagCache = meta.latest || null;
            }
            if (latestTagCache) {
                localStorage.setItem(LS_VERSION_KEY, latestTagCache);
                selectedCdnVersion = latestTagCache;
                if (selectedSource === 'cdn') handleSourceChange();
            }
        } catch (e) {
            console.warn('Could not fetch latest version:', e && e.message);
        }
    });

    const prodBtn = document.createElement('button');
    prodBtn.textContent = 'Set to production';
    prodBtn.addEventListener('click', function() {
        try {
            const prodVersion = ensureV(PROD_PINNED_VERSION || MIN_TAG);
            localStorage.setItem(LS_VERSION_KEY, prodVersion);
            selectedCdnVersion = prodVersion;
            // Update the version selector to show the production version
            if (verSelect) {
                for (let i = 0; i < verSelect.options.length; i++) {
                    if (verSelect.options[i].value === prodVersion) {
                        verSelect.selectedIndex = i;
                        break;
                    }
                }
            }
            // Update visual state
            try { applySwitcherState(box); } catch (e) { /* ignore */ }
            if (selectedSource === 'cdn') handleSourceChange();
        } catch (e) {
            console.warn('Could not set production version:', e && e.message);
        }
    });

    buttonsRow.appendChild(latestBtn);
    buttonsRow.appendChild(prodBtn);
    box.appendChild(buttonsRow);

    // Ensure styles are injected for the switcher (single source of truth)
    injectAssetLoaderStyles();

    setTimeout(function() { document.body.appendChild(box); }, 200);

    // Populate the versions list with only available (>= MIN_TAG) + sidecar-present
    try {
        if (!versionsCache) {
            const meta = await getAvailableVersions();
            versionsCache = meta.available || [];
            latestTagCache = meta.latest || null;
        }
        const current = ensureV(localStorage.getItem(LS_VERSION_KEY) || selectedCdnVersion || MIN_TAG);

        if (versionsCache.length) {
            verSelect.innerHTML = '';
            versionsCache.forEach(function(tag) {
                const vtag = ensureV(tag);
                const o = document.createElement('option');
                o.value = vtag; o.textContent = vtag;
                if (vtag === current) o.selected = true;
                verSelect.appendChild(o);
            });
            // Update title state once versions are populated (selectedCdnVersion may have changed)
            try { applySwitcherState(box); } catch (e) { /* ignore */ }
        } else {
            console.warn('No available versions ≥ ' + MIN_TAG + '; keeping pinned entry only.');
            verSelect.options[0].value = current;
            verSelect.options[0].textContent = current + ' (pinned)';
            verSelect.options[0].selected = true;
        }
    } catch (e) {
        console.warn('Failed to load versions for selector; keeping pinned entry. Reason:', e && e.message);
    }
}

function loadExternalFiles(externalFiles) {

    function loadError(file, next) {
        try {
            console.error('Failed to load external file:', file);
            if (file && file.url === KNACK_FUNCTIONS_URL) {
                if (selectedSource === 'local') {
                    console.warn('Falling back to CDN because local failed.');
                    selectedSource = 'cdn';
                    localStorage.setItem(LS_SOURCE_KEY, selectedSource);
                    handleSourceChange();
                    return;
                } else if (selectedSource === 'cdn') {
                    showCdnErrorNotification();
                }
            }
        } finally {
            if (typeof next === 'function') next();
        }
    }

    KnackInitAsync = function ($, callback) {
        Knack.showSpinner();
        window.$ = $; window.jQuery = $;

        loadFiles(externalFiles);

        function loadFiles(files) {
            let index = 0;

            function next() {
                if (index >= files.length) {
                    console.log('all external files loaded');

                    // Enhanced callback that adds the source switcher after KTL loads
                    const enhancedCallback = function(...args) {
                        // Call the original callback first (if provided)
                        if (typeof callback === 'function') {
                            callback.apply(this, args);
                        }

                        // Then add the source switcher after KTL initialization is complete
                        console.log('[assetLoader] KTL loaded — calling addSourceSwitcher()');
                        addSourceSwitcher();
                    };

                    loadKtl($, enhancedCallback, (typeof KnackApp === 'function' ? KnackApp : null), '0.32.3', 'full');
                    Knack.hideSpinner();
                    return;
                }

                const file = files[index++];

                if (!file || !file.type) { return next(); }
                if ((file.type === 'script' || file.type === 'link') && !file.url) {
                    return loadError(file, next);
                }

                if (file.type === 'script') {
                    const isKnackFnsCdn = (file.url === KNACK_FUNCTIONS_URL) && selectedSource === 'cdn';

                    function appendScript(withIntegrity) {
                        const script = document.createElement('script');
                        script.src = file.url;
                        script.async = false;
                        if (withIntegrity) {
                            script.integrity = withIntegrity;
                            script.crossOrigin = file.crossorigin || 'anonymous';
                        }
                        script.onload = function() {
                            if (file.url === KNACK_FUNCTIONS_URL) {
                                const version = KNACK_FUNCTIONS_VERSION || extractVersionFromCdn(file.url) || '(unknown)';
                                console.info('[knackFunctions] Loaded source:', selectedSource,
                                             'version:', ensureV(version),
                                             'url:', file.url,
                                             (script.integrity ? '(SRI enforced)' : '(no SRI)'));
                            }
                            next();
                        };
                        script.onerror = function() { loadError(file, next); };
                        document.head.appendChild(script);
                    }

                    if (isKnackFnsCdn) {
                        fetch(sriSidecarUrlFor(file.url), { method: 'GET' })
                            .then(function(res){ return res.ok ? res.text() : ''; })
                            .then(function(text){
                                const sri = (text || '').trim();
                                if (/^sha384-[A-Za-z0-9+/=]+={0,2}$/.test(sri)) {
                                    appendScript(sri);
                                } else {
                                    console.warn('SRI sidecar missing/invalid for', file.url, '- loading without SRI.');
                                    appendScript(null);
                                }
                            })
                            .catch(function(){
                                console.warn('Failed to fetch SRI sidecar for', file.url, '- loading without SRI.');
                                appendScript(null);
                            });
                        return; // wait for sidecar fetch
                    }

                    // Non-CDN scripts (or local source)
                    appendScript(null);

                } else if (file.type === 'link') {
                    const link = document.createElement('link');
                    link.href = file.url;
                    link.rel = 'stylesheet';
                    link.onload = next;
                    link.onerror = function() { loadError(file, next); };
                    document.head.appendChild(link);

                } else if (file.type === 'favicon') {
                    const existing = document.querySelectorAll('link[rel*=\'icon\']');
                    existing.forEach(function(el) { el.remove(); });
                    const link = document.createElement('link');
                    link.href = file.url;
                    link.rel = 'shortcut icon';
                    link.type = 'image/x-icon';
                    document.head.appendChild(link);
                    next();

                } else {
                    next();
                }
            }

            next();
        }
    }
}