const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../knackFunctions.js'), 'utf8');
const start = source.indexOf('function applyKnackViewFilters(');
const helper = source.slice(start, source.indexOf('\n}\n', start) + 2);

/**
 * Builds applyKnackViewFilters against a fake Knack with one table view.
 * @param {object} options
 * @param {string} [options.hash] - Current URL hash, e.g. `#owner-events/?view_1_page=3`.
 * @param {number} [options.page] - The view's current page.
 * @param {boolean} [options.fail] - Make the fetch fail.
 * @returns {{ apply: Function, Knack: object, calls: object }}
 */
function buildHelper({ hash = '#scene/', page = 1, fail = false } = {}) {
    const calls = { navigate: [], filters: [], fetches: 0, spinner: [] };
    const location = { hash };
    const view = { key: 'view_1', source: { page }, pagination_meta: { page } };
    const Knack = {
        hash_vars: {},
        setHashVars() {
            const query = location.hash.split('?')[1] || '';
            this.hash_vars = Object.fromEntries(query.split('&').filter(Boolean).map((pair) => pair.split('=')));
        },
        getSceneHash: () => location.hash.split('?')[0].replace(/^#/, ''),
        router: {
            navigate(fragment, trigger) {
                calls.navigate.push({ fragment, trigger });
                location.hash = `#${fragment}`;
            },
        },
        showSpinner: () => calls.spinner.push('show'),
        hideSpinner: () => calls.spinner.push('hide'),
        models: {
            view_1: {
                view,
                setFilters: (filters) => calls.filters.push(filters),
                fetch({ success, error }) {
                    calls.fetches += 1;
                    if (fail) error({}, { status: 500 });
                    else success();
                },
            },
        },
    };
    const knackNavigator = {
        normalizeViewId: (value) => /^(view_)?\d+$/.test(String(value).trim()) ? `view_${String(value).trim().replace('view_', '')}` : '',
    };
    const apply = new Function('Knack', 'knackNavigator', `${helper}\nreturn applyKnackViewFilters;`)(Knack, knackNavigator);
    return { apply, Knack, calls, view, location };
}

const parkFilter = { match: 'and', rules: [{ field: 'field_407', operator: 'is', value: 'abc' }] };

test('filters in place, resets the page and keeps other views in the hash', async () => {
    const { apply, calls, view, location } = buildHelper({ hash: '#scene/?view_9_page=2&view_1_page=3', page: 3 });

    assert.equal(await apply('view_1', parkFilter), true);

    assert.equal(view.source.page, 1);
    assert.equal(view.pagination_meta.page, 1);
    assert.deepEqual(calls.filters, [parkFilter]);
    assert.equal(calls.fetches, 1);
    assert.equal(calls.navigate[0].trigger, false);
    assert.equal(location.hash, `#scene/?view_9_page=2&view_1_page=1&view_1_filters=${encodeURIComponent(JSON.stringify(parkFilter))}`);
    assert.deepEqual(calls.spinner, ['show', 'hide']);
});

test('sets and clears the keyword search in the hash', async () => {
    const { apply, location } = buildHelper({ hash: '#scene/?view_1_search=old' });

    await apply(1, null, { search: 'Christmas fair' });
    assert.equal(location.hash, '#scene/?view_1_search=Christmas%20fair&view_1_page=1');

    await apply(1, null, { search: '' });
    assert.equal(location.hash, '#scene/?view_1_page=1');
});

test('leaves the search alone when it is not given, and clears empty filters', async () => {
    const { apply, calls, location } = buildHelper({ hash: '#scene/?view_1_search=keep&view_1_filters=x' });

    await apply('view_1', { match: 'and', rules: [] });

    assert.equal(location.hash, '#scene/?view_1_search=keep&view_1_page=1');
    assert.deepEqual(calls.filters, [[]]);
});

test('keeps the current page when asked', async () => {
    const { apply, view } = buildHelper({ page: 4 });

    await apply('view_1', parkFilter, { resetPage: false });
    assert.equal(view.source.page, 4);

    await apply('view_1', parkFilter, { page: 2 });
    assert.equal(view.source.page, 2);
});

test('does not touch the hash when syncHash is false and no search is given', async () => {
    const { apply, calls } = buildHelper();

    await apply('view_1', parkFilter, { syncHash: false });
    assert.equal(calls.navigate.length, 0);
});

test('resolves false for a view that is not rendered and rejects when the fetch fails', async () => {
    assert.equal(await buildHelper().apply('view_2', parkFilter), false);

    const { apply, calls } = buildHelper({ fail: true });
    await assert.rejects(apply('view_1', parkFilter), /status 500/);
    assert.deepEqual(calls.spinner, ['show', 'hide']);
});
