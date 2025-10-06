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

// --- Repo + path (adjust only if you change repo or file layout) ---
const CDN_REPO = 'Craig-Amanda/knack-functions';
const CDN_FILE_PATH = 'dist/knackFunctions.iife.min.js';
const JSDELIVR_META_URL = 'https://data.jsdelivr.com/v1/package/gh/' + CDN_REPO;

// --- Minimum allowed tag: exclude anything lower than this ---
const MIN_TAG = 'v1.0.2';
// Production pinned version used for non-developers
const PROD_PINNED_VERSION = 'v1.0.2';

// LocalStorage keys
const LS_SOURCE_KEY  = 'knackFunctionsSource';   // 'local' | 'cdn'
const LS_VERSION_KEY = 'knackFunctionsVersion';  // e.g. 'v1.0.2'

// Sources
const SOURCES = {
    'local': 'http://localhost:3001/knackFunctions.js',
    'cdn': null // computed from selected version
};

// Cache for versions metadata
let versionsCache = null;   // available versions (>= MIN_TAG) that have both files present
let latestTagCache = null;  // latest among available

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

// Decide initial source
const defaultSource = window.isDeveloper ? 'local' : 'cdn';
let selectedSource = localStorage.getItem(LS_SOURCE_KEY) || defaultSource;
if (!['local', 'cdn'].includes(selectedSource)) {
    selectedSource = defaultSource;
    localStorage.setItem(LS_SOURCE_KEY, selectedSource);
}

// Version selection (pinned if present)
let selectedCdnVersion = ensureV(localStorage.getItem(LS_VERSION_KEY) || '') || null;

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

// Local server reachability (fallback to CDN if not reachable)
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

// Developer UI: Lazy-load Source + Version switcher
// Helper: inject the full asset-loader styles (id: kf-assetloader-styles)
function injectAssetLoaderStyles() {
    if (document.getElementById('kf-assetloader-styles')) return;
    try {
        const css = `
#knackFunctionsSourceSwitcher { position: fixed; bottom: 20px; left: 20px; background: #ffffffee; padding: 12px; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.18); z-index: 9999; font-size: 13px; border: 1px solid #e1e1e1; width: 300px; max-width: calc(100% - 40px); }
#knackFunctionsSourceSwitcher .title { font-weight: 600; color: #222; margin: 0 0 10px 0; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px; border-radius:6px; }
#knackFunctionsSourceSwitcher select { padding: 6px 10px; border-radius: 4px; border: 1px solid #ccc; background: #fff; cursor: pointer; outline: none; min-width: 120px; }
#knackFunctionsSourceSwitcher button { padding: 6px 10px; border-radius: 4px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
.kf-switcher-close { background: transparent; border: none; color: #666; font-size: 16px; line-height: 1; padding: 4px 6px; cursor: pointer; border-radius: 4px; }
.kf-switcher-close:hover { background: rgba(0,0,0,0.06); color: #111; }
.kf-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.kf-row-version { margin-bottom:6px; }
.kf-row-latest { margin-bottom:4px; }
.kf-loader-notice { position: fixed; top: 10px; right: 10px; color: #fff; padding: 10px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 9999; font-size: 14px; }
.kf-loader-notice.info { background: #ff9800; }
.kf-loader-notice.error { background: #d32f2f; }
/* nicer Dev trigger */
.kf-dev-trigger, #kf-dev-trigger { position: fixed; bottom: 20px; left: 20px; z-index: 10000; padding: 8px 10px; border-radius: 8px; background: linear-gradient(135deg,#0d6efd,#6610f2); color: #fff; border: none; cursor: pointer; font-size: 13px; box-shadow: 0 6px 18px rgba(13,110,253,0.24); transition: transform 120ms ease, box-shadow 120ms ease; }
.kf-dev-trigger:hover, #kf-dev-trigger:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(13,110,253,0.28); }

/* Source-based color accents */
.kf-source-local .title { background: linear-gradient(90deg,#198754,#28a745); color: #fff; }
.kf-source-cdn   .title { background: linear-gradient(90deg,#0d6efd,#6610f2); color: #fff; }
.kf-source-local select, .kf-source-local button { border-color: #198754; }
.kf-source-cdn select, .kf-source-cdn button { border-color: #0d6efd; }
        `;
        const style = document.createElement('style');
        style.id = 'kf-assetloader-styles';
        style.textContent = css;
        document.head.appendChild(style);
    } catch (e) {
        /* ignore failures to inject CSS in restrictive environments */
    }
}

// NOTE: non-essential debug logs removed for production; keep warnings/errors/info only.

async function addSourceSwitcher(attempts = 0) {
    // entry (no debug log)
    // Dynamic check: the static `window.isDeveloper` flag may have been computed before the
    // Knack API was available. Re-evaluate at runtime so the switcher appears for real devs.
    let runtimeIsDev = false;
    try {
        if (window.isDeveloper) {
            runtimeIsDev = true;
            // Runtime dev detected
        } else if (typeof Knack !== 'undefined' && typeof Knack.getUserRoleNames === 'function') {
            try {
                const roles = Knack.getUserRoleNames();
                // Knack roles retrieved
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
    // runtimeIsDev is false
        if (typeof Knack === 'undefined' && attempts < 6) {
            // Knack not present yet: retry a few times silently
            setTimeout(function() { addSourceSwitcher(attempts + 1); }, 400);
            return;
        }
    devLog('[assetLoader] Not a developer or max attempts reached; not showing dev switcher.');
        return; // not a developer — nothing to do
    }

    // If switcher already built, do nothing
    if (document.getElementById('knackFunctionsSourceSwitcher')) return;

    // Create a small trigger button that opens the full UI when clicked
    if (!document.getElementById('kf-dev-trigger')) {
    // Creating dev trigger button
        const btn = document.createElement('button');
        btn.id = 'kf-dev-trigger';
        btn.type = 'button';
        btn.title = 'Show dev controls';
        btn.textContent = 'Dev';
        // Styling moved to external CSS (`assetLoader.css`). Add a class so styles are applied when
        // you copy the CSS into your project.
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
    }
}

// Build the full source switcher UI (runs only when the dev triggers it)
async function buildSourceSwitcher() {
    // buildSourceSwitcher invoked
    if (document.getElementById('knackFunctionsSourceSwitcher')) return;
    // Create the container box and title (was accidentally removed earlier)
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
        handleSourceChange();
    });
    srcRow.appendChild(srcLabel); srcRow.appendChild(srcSelect);
    box.appendChild(srcRow);

    // Version selector (CDN only)
    const verRow = document.createElement('div');
    verRow.className = 'kf-row kf-row-version';
    const verLabel = document.createElement('div');
    verLabel.textContent = 'Version (≥ ' + MIN_TAG + '):';
    const verSelect = document.createElement('select');

    const pinned = ensureV(localStorage.getItem(LS_VERSION_KEY) || selectedCdnVersion || MIN_TAG);
    const seed = document.createElement('option');
    seed.value = pinned;
    seed.textContent = pinned + ' (pinned)';
    seed.selected = true;
    verSelect.appendChild(seed);

    verSelect.addEventListener('change', function() {
        const chosen = this.value;
        if (chosen) {
            localStorage.setItem(LS_VERSION_KEY, chosen);
            selectedCdnVersion = chosen;
            if (selectedSource === 'cdn') handleSourceChange();
        }
    });

    verRow.appendChild(verLabel); verRow.appendChild(verSelect);
    box.appendChild(verRow);

    // Latest button
    const latestRow = document.createElement('div');
    latestRow.className = 'kf-row kf-row-latest';
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
    latestRow.appendChild(latestBtn);
    box.appendChild(latestRow);

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

// Resolve URL & version for this page load
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

// NOTE: CSS for the loader UI has been extracted to `assestLoader.css` in this folder
// for convenience (so you can copy/paste it). We do not auto-inject it by default.

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
                    loadKtl($, callback, (typeof KnackApp === 'function' ? KnackApp : null), '0.32.3', 'full');
                    Knack.hideSpinner();
                    console.log('[assetLoader] All external files loaded — calling addSourceSwitcher()');
                    addSourceSwitcher();
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