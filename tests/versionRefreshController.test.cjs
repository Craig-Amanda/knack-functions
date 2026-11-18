const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const start = source.indexOf('function createVersionRefreshController(');
const controllerSource = source.slice(start, source.indexOf('\n}\n', start) + 2);

const MESSAGE = { source: 'test-app', type: 'version-refresh' };
const ORIGIN = 'https://example.knack.com';

/**
 * Creates a shared browser: one localStorage and one clock that moves on 1 ms per Date.now() call,
 * so "loaded before" and "seen after" are always strictly ordered.
 * @returns {{ store: Map, clock: { now: number } }} Shared browser state.
 */
function browser() {
    return { store: new Map(), clock: { now: 1000 } };
}

/**
 * Builds a controller (one page load) against fake browser globals.
 * @param {Object} [options={}] - Extra controller options.
 * @param {{ iframe?: boolean, shared?: { store: Map, clock: { now: number } }, tab?: Map }} [env={}] - Window kind, shared browser, and the tab's sessionStorage (pass the same Map to reload in the same tab).
 * @returns {{ controller: Object, reloads: string[], posted: Object[], errors: Error[], runTimers: Function }} Test handles.
 */
function build(options = {}, { iframe = false, shared = browser(), tab = new Map() } = {}) {
    const timers = [];
    const reloads = [];
    const reloadUserVersions = [];
    const posted = [];
    const errors = [];
    const fakeWindow = {
        location: { origin: ORIGIN, hash: '#home' },
        sessionStorage: {
            getItem: (key) => tab.get(key) ?? null,
            setItem: (key, value) => tab.set(key, value),
            removeItem: (key) => tab.delete(key),
        },
        setTimeout(fn) {
            timers.push(fn);
            return timers.length;
        },
        clearTimeout() {},
        addEventListener() {},
    };
    fakeWindow.parent = iframe ? { postMessage: (data) => posted.push(data) } : fakeWindow;

    class FakeDate extends Date {
        static now() {
            shared.clock.now += 1;
            return shared.clock.now;
        }
    }
    class HTMLElement {}
    class MutationObserver {
        observe() {}
        disconnect() {}
    }
    const document = { body: new HTMLElement(), querySelectorAll: () => [] };
    const knackValueResolver = { toStringSafe: (value) => (value == null ? '' : String(value).trim()) };
    const knackNavigator = {
        normalizeFieldId: (id) => (id ? `field_${String(id).replace(/^field_/, '')}` : ''),
        normalizeViewId: (id) => (id ? `view_${String(id).replace(/^view_/, '')}` : ''),
        getSceneInfoForView: () => null,
    };

    const create = new Function(
        'window', 'document', 'HTMLElement', 'MutationObserver', 'knackValueResolver', 'knackNavigator', 'Date', 'performance',
        `${controllerSource}\nreturn createVersionRefreshController;`
    )(fakeWindow, document, HTMLElement, MutationObserver, knackValueResolver, knackNavigator, FakeDate, undefined);

    const controller = create({
        storageKey: 'versionState',
        storageAdapter: { get: (key) => shared.store.get(key), set: (key, value) => shared.store.set(key, value) },
        messageSource: MESSAGE.source,
        messageType: MESSAGE.type,
        isIframeWindow: () => iframe,
        getCurrentUserId: () => 'user1',
        renderUserVersion() {},
        canRefreshNow: () => true,
        showRefreshWait() {},
        showRefreshNow() {},
        syncUserVersionViewId: 2077,
        syncUserVersionFieldId: 1311,
        reload: (target, userVersion) => {
            reloads.push(target);
            reloadUserVersions.push(userVersion);
        },
        onSyncError: (error) => errors.push(error),
        ...options,
    });

    return {
        controller,
        reloads,
        reloadUserVersions,
        posted,
        errors,
        runTimers() {
            while (timers.length) {
                timers.shift()();
            }
        },
    };
}

/**
 * Sends an iframe message to a main-window controller and runs any reload timer.
 * @param {{ controller: Object, runTimers: Function }} page - Main-window page from build().
 * @param {string} targetVersion - Version the page should move to ('' when the user record is in sync).
 * @param {string} userVersion - Version on the user's record.
 * @returns {void}
 */
function send(page, targetVersion, userVersion) {
    page.controller.handleRefreshMessage({ origin: ORIGIN, data: { ...MESSAGE, targetVersion, userVersion } });
    page.runTimers();
}

test('an old user version does not reload until the iframe reports the save', () => {
    const page = build();

    send(page, '1.3.7', '1.2.5');
    assert.deepEqual(page.reloads, [], 'must not reload while the save is pending');

    send(page, '', '1.3.7');
    assert.deepEqual(page.reloads, ['1.3.7']);
});

test('a failed save never reloads, however often the iframe repeats the old version', () => {
    const page = build();

    for (let i = 0; i < 5; i += 1) {
        send(page, '1.3.7', '1.2.5');
    }

    assert.deepEqual(page.reloads, []);
});

test('a clock moved backwards does not make the reloaded tab reload again', () => {
    const shared = browser();
    const tab = new Map();
    const before = build({}, { shared, tab });
    send(before, '1.3.7', '1.2.5');
    send(before, '', '1.3.7');
    assert.deepEqual(before.reloads, ['1.3.7']);

    shared.clock.now -= 60000;
    const after = build({}, { shared, tab });
    send(after, '', '1.3.7');
    assert.deepEqual(after.reloads, []);
});

test('state stored by an older version without targetSeenAt still reloads an open page', () => {
    const shared = browser();
    const page = build({}, { shared });
    shared.store.set('versionState', JSON.stringify({ targetVersion: '1.3.7', userVersion: '1.2.5' }));

    send(page, '1.3.7', '1.2.5');
    send(page, '', '1.3.7');

    assert.deepEqual(page.reloads, ['1.3.7']);
});

test('a message with no sync field set reloads straight away, and only once per target', () => {
    const shared = browser();
    const before = build({ syncUserVersionFieldId: '' }, { shared });
    send(before, '1.3.7', '1.3.6');
    assert.deepEqual(before.reloads, ['1.3.7']);

    // Nothing saves the user version, so the reloaded page still hears the old version.
    const after = build({ syncUserVersionFieldId: '' }, { shared });
    for (let i = 0; i < 5; i += 1) {
        send(after, '1.3.7', '1.3.6');
    }
    assert.deepEqual(after.reloads, []);
});

test('a page that has already reloaded does not reload again when its iframe reports the saved version', () => {
    const shared = browser();
    const before = build({}, { shared });
    send(before, '1.3.7', '1.2.5');
    send(before, '', '1.3.7');

    const after = build({}, { shared });
    send(after, '', '1.3.7');

    assert.deepEqual(after.reloads, []);
});

test('a page opened after the target was seen does not reload, even while the save keeps failing', () => {
    const shared = browser();
    const first = build({}, { shared });
    send(first, '1.3.7', '1.2.5');

    const later = build({}, { shared });
    send(later, '1.3.7', '1.2.5');
    send(later, '', '1.3.7');

    assert.deepEqual(later.reloads, []);
});

test('a second tab reloads when its iframe reports the save made by the first tab', () => {
    const shared = browser();
    const tabA = build({}, { shared });
    const tabB = build({}, { shared });

    send(tabA, '1.3.7', '1.2.5');
    send(tabA, '', '1.3.7');
    // Tab B never saw the target message: its iframe refreshed after tab A's save.
    send(tabB, '', '1.3.7');

    assert.deepEqual(tabA.reloads, ['1.3.7']);
    assert.deepEqual(tabB.reloads, ['1.3.7']);
});

test('every open tab reloads once for a new target', () => {
    const shared = browser();
    const tabs = [build({}, { shared }), build({}, { shared }), build({}, { shared }), build({}, { shared })];

    tabs.forEach((tab) => send(tab, '1.3.7', '1.2.5'));
    tabs.forEach((tab) => send(tab, '', '1.3.7'));

    assert.deepEqual(tabs.map((tab) => tab.reloads.length), [1, 1, 1, 1]);
});

test('a stale user version from another tab does not block this tab after its own save', () => {
    const shared = browser();
    const tabA = build({}, { shared });
    const tabB = build({}, { shared });

    send(tabA, '1.3.7', '1.2.5');
    // Tab B's iframe still holds the cached old record and writes it to the shared state.
    send(tabB, '1.3.7', '1.2.5');
    send(tabA, '', '1.3.7');

    assert.deepEqual(tabA.reloads, ['1.3.7']);
});

test('a custom syncUserVersion that resolves to undefined still counts as a save', async () => {
    const { controller, posted, errors } = build({ syncUserVersion: async () => undefined }, { iframe: true });
    controller.cacheCurrentUserRecord({ field_1311: '1.2.5' });

    await controller.syncIframeVersion({ userVersion: '1.2.5', targetVersion: '1.3.7' });

    assert.deepEqual(errors, []);
    assert.equal(posted[0]?.userVersion, '1.3.7');
});

test('a custom syncUserVersion that resolves to true counts as a save', async () => {
    const { controller, posted, errors } = build({ syncUserVersion: async () => true }, { iframe: true });
    controller.cacheCurrentUserRecord({ field_1311: '1.2.5' });

    await controller.syncIframeVersion({ userVersion: '1.2.5', targetVersion: '1.3.7' });

    assert.deepEqual(errors, []);
    assert.equal(posted[0]?.userVersion, '1.3.7');
});

test('resetState lets a tab reload again for a target it already reloaded for', () => {
    const shared = browser();
    const tab = new Map();
    const before = build({}, { shared, tab });
    send(before, '1.3.7', '1.2.5');
    send(before, '', '1.3.7');
    assert.deepEqual(before.reloads, ['1.3.7']);

    // Same tab, loaded before the target is announced again: only the cleared marker allows this reload.
    const after = build({}, { shared, tab });
    after.controller.resetState();
    shared.store.set('versionState', JSON.stringify({ targetVersion: '1.3.7', targetSeenAt: shared.clock.now + 10, userVersion: '1.3.7' }));
    send(after, '', '1.3.7');
    assert.deepEqual(after.reloads, ['1.3.7']);
});

test('reload receives the user version current when the timer fires', () => {
    const page = build();
    send(page, '1.3.7', '1.2.5');
    page.controller.handleRefreshMessage({ origin: ORIGIN, data: { ...MESSAGE, targetVersion: '', userVersion: '1.3.7' } });
    page.controller.handleRefreshMessage({ origin: ORIGIN, data: { ...MESSAGE, targetVersion: '', userVersion: '1.3.8' } });
    page.runTimers();

    assert.deepEqual(page.reloads, ['1.3.7']);
    assert.deepEqual(page.reloadUserVersions, ['1.3.8']);
});

for (const [label, result] of [['an empty string', ''],['false', false], ['null', null]]) {
    test(`the iframe treats ${label} from syncUserVersion as a failure and does not ask for a reload`, async () => {
        const { controller, posted, errors } = build({ syncUserVersion: async () => result }, { iframe: true });
        controller.cacheCurrentUserRecord({ field_1311: '1.2.5' });

        await controller.syncIframeVersion({ userVersion: '1.2.5', targetVersion: '1.3.7' });

        assert.equal(errors.length, 1);
        assert.deepEqual(posted, []);
    });
}

test('the iframe asks for a reload after a successful save', async () => {
    const { controller, posted, errors } = build({ syncUserVersion: async (target) => target }, { iframe: true });
    controller.cacheCurrentUserRecord({ field_1311: '1.2.5' });

    await controller.syncIframeVersion({ userVersion: '1.2.5', targetVersion: '1.3.7' });

    assert.deepEqual(errors, []);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].targetVersion, '');
    assert.equal(posted[0].userVersion, '1.3.7');
});

test('a save still reports success when the user record is cleared while it runs', async () => {
    let page;
    page = build({
        syncUserVersion: async (target) => {
            page.controller.cacheCurrentUserRecord(null);
            return target;
        },
    }, { iframe: true });
    page.controller.cacheCurrentUserRecord({ field_1311: '1.2.5' });

    await page.controller.syncIframeVersion({ userVersion: '1.2.5', targetVersion: '1.3.7' });

    assert.deepEqual(page.errors, []);
    assert.equal(page.posted[0]?.userVersion, '1.3.7');
});
