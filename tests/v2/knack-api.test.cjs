/**
 * Characterisation tests for KnackAPI: V1 and V2 must make the same calls, log the same messages and return the same
 * results, so the V2 internals can be refactored (shared paging and batch-write helpers) without changing behaviour.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const NAMES = ['KnackAPI', 'getKnackApiClient', 'KnackError', 'knackNavigator', 'knackValueResolver'];
const BEFORE = `Knack.application_id = 'app1'; Knack.getUserToken = () => 'tok'; Knack.showSpinner = () => {}; Knack.hideSpinner = () => {};`;

async function same(scenario) {
    const { v1, v2, v1Console, v2Console } = await both({ names: NAMES, html: '<p></p>', before: BEFORE }, scenario);
    assert.deepEqual(v2, v1);
    assert.deepEqual(v2Console.map((m) => m.text), v1Console.map((m) => m.text));
    assert.deepEqual([...v1Console, ...v2Console].filter((m) => m.type === 'pageerror'), []);
    return v1;
}

test('getAllRecords and getAllRecordChildren page the same way', async () => {
    const result = await same(async () => {
        const out = {}; const make = () => { const api = new KnackAPI({ showSpinner: false, debug: false }); api.logs = []; api._log = (m, d, l) => api.logs.push([m, d, l]); return api; };
        const pageData = (n, total) => ({ total_pages: total, total_records: total * 2, records: [{ id: `p${n}a` }, { id: `p${n}b` }] });
        const scenarios = [['all ok', 4, {}], ['concurrency 2', 5, { pageConcurrency: 2, rows: 50, filters: { f: 1 }, sorters: [{ field: 'x' }] }], ['one page', 1, {}], ['empty', 0, {}], ['bad page tolerated', 4, { failPage: 3 }], ['bad page fatal', 4, { failPage: 3, failOnPageError: true }], ['bad concurrency', 3, { pageConcurrency: -4 }]];
        for (const [label, total, opts] of scenarios) {
            for (const kind of ['records', 'children']) {
                const api = make(); const calls = []; const progress = [];
                const fetchPage = async (...args) => { const o = args.at(-1); calls.push([kind, ...args.slice(0, -1), { ...o }]); if (o.page === opts.failPage) throw new Error('page ' + o.page + ' failed'); return total === 0 ? { total_pages: 0, total_records: 0, records: [] } : pageData(o.page, total); };
                if (kind === 'records') api.getRecords = fetchPage; else api.getRecordChildren = fetchPage;
                let res; try { res = kind === 'records' ? await api.getAllRecords('s', 'v', { ...opts, onProgress: (p) => progress.push(p) }) : await api.getAllRecordChildren('s', 'v', 'rec', '#parent', { ...opts, onProgress: (p) => progress.push(p) }); } catch (e) { res = 'THROWN ' + e.message; }
                out[`${label}/${kind}`] = { res: Array.isArray(res) ? res.map((r) => r.id) : res, calls, progress, logs: api.logs };
            }
        }
        return JSON.parse(JSON.stringify(out));
    });
    assert.equal(Object.keys(result).length, 14);
    assert.ok(result['all ok/records'].calls.length === 4 && result['bad page fatal/children'].res.startsWith('THROWN'));
});

test('createRecords, updateRecords and deleteRecords batch the same way', async () => {
    const result = await same(async () => {
        const out = {};
        const make = (failOn = []) => {
            const api = new KnackAPI({ showSpinner: false, debug: false }); api.log = [];
            api._refreshAfterWrite = async (v) => api.log.push(['refresh', v]); api._logBatchFailures = (...a) => api.log.push(['failures', ...a]); api._logBatchSummary = (...a) => api.log.push(['summary', ...a]);
            const fail = (key) => { if (failOn.includes(key)) throw new Error('boom ' + key); };
            api.createRecord = async (s, v, data, o) => { api.log.push(['create', s, v, data, Object.keys(o).sort()]); fail(data.n); return data.noId ? {} : { id: 'new' + data.n }; };
            api.updateRecord = async (s, v, id, data, o) => { api.log.push(['update', s, v, id, data, Object.keys(o).sort()]); fail(id); return { id }; };
            api.deleteRecord = async (s, v, id, o) => { api.log.push(['delete', s, v, id, Object.keys(o).sort()]); fail(id); return { id }; };
            return api;
        };
        const run = async (label, fn, failOn) => { const api = make(failOn); const progress = []; let res; try { res = await fn(api, (p) => progress.push(p)); } catch (e) { res = 'THROWN ' + e.message; } out[label] = { res, progress, log: api.log.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }; };
        const recs = [{ n: 'a' }, null, { n: 'b' }, { n: 'c' }];
        await run('create ok', (a, p) => a.createRecords('s', 'v', recs, { onProgress: p, refreshViews: 'view_1' }));
        await run('create fail continue', (a, p) => a.createRecords('s', 'v', recs, { onProgress: p }), ['b']);
        await run('create fail stop', (a, p) => a.createRecords('s', 'v', recs, { onProgress: p, continueOnError: false }), ['a']);
        await run('create requireId', (a, p) => a.createRecords('s', 'v', [{ n: 'x', noId: true }, { n: 'y' }], { onProgress: p, requireRecordId: true }));
        await run('create empty', (a) => a.createRecords('s', 'v', []));
        await run('create bad', (a) => a.createRecords('s', 'v', 'no'));
        await run('create bad opts', (a) => a.createRecords('s', 'v', recs, []));
        await run('update shared', (a, p) => a.updateRecords('s', 'v', ['r1', '', 'r2', 'r3'], { f: 1 }, { onProgress: p, refreshViews: ['view_2'] }));
        await run('update fail', (a, p) => a.updateRecords('s', 'v', ['r1', 'r2', 'r3'], { f: 1 }, { onProgress: p }), ['r2']);
        await run('update per-record', (a, p) => a.updateRecords('s', 'v', [{ id: 'r1', data: { a: 1 } }, { recordId: 'r2', recordData: { b: 2 } }, { id: '', data: {} }], { onProgress: p }));
        await run('update mixed', (a) => a.updateRecords('s', 'v', ['r1', { id: 'r2', data: {} }], {}));
        await run('update stop', (a, p) => a.updateRecords('s', 'v', ['r1', 'r2'], {}, { onProgress: p, continueOnError: false }), ['r1']);
        await run('update empty', (a) => a.updateRecords('s', 'v', [], {}));
        await run('delete ok', (a, p) => a.deleteRecords('s', 'v', ['r1', 'r2', null], { onProgress: p, refreshViews: 'view_3', staggerMs: 1 }));
        await run('delete fail', (a, p) => a.deleteRecords('s', 'v', ['r1', 'r2'], { onProgress: p }), ['r2']);
        await run('delete stop', (a, p) => a.deleteRecords('s', 'v', ['r1', 'r2', 'r3'], { onProgress: p, continueOnError: false }), ['r1']);
        await run('delete bad', (a) => a.deleteRecords('s', 'v', 'x'));
        return JSON.parse(JSON.stringify(out));
    });
    assert.equal(Object.keys(result).length, 17);
    assert.deepEqual(result['create fail continue'].res.failed, 1);
    assert.ok(result['update per-record'].res.updated === 2 && result['delete stop'].res.startsWith('THROWN'));
});

test('request headers and update verification: same as V1, except verification now checks what was sent', async () => {
    const result = await same(async () => {
        const api = new KnackAPI({ showSpinner: false, debug: false }); api.logs = []; api._log = (m, d, l) => api.logs.push([m, l]);
        const out = { headers: [api._buildHeaders(), api._buildHeaders(false)] };
        out.upload = typeof api._buildUploadHeaders === 'function' ? [api._buildUploadHeaders(), api._buildUploadHeaders(false)] : [api._buildHeaders(true, { json: false }), api._buildHeaders(false, { json: false })];
        const fetched = []; const realFetch = window.fetch; window.fetch = async (url, init) => { fetched.push([url.replace(/^.*\/pages/, '/pages'), Object.keys(init.headers).sort(), init.headers['Content-Type'] ?? null]); return { ok: true, status: 200, headers: { get: () => null, forEach() {} }, json: async () => ({ record: { id: 'r1', field_1: 'plain' } }), text: async () => '' }; };
        await api.updateRecord('scene_1', 'view_1', 'r1', { field_1: 'plain' }); await api.updateRecord('scene_1', 'view_1', 'r1', { field_1: 'wrong' });
        out.fetched = fetched; out.verify = api.logs.filter(([m]) => m.startsWith('Field update verification'));
        window.fetch = realFetch;
        return JSON.parse(JSON.stringify(out));
    });
    assert.equal(result.fetched.length, 2);
    assert.ok(!('Content-Type' in result.upload[0]) && result.headers[0]['Content-Type'] === 'application/json', 'uploads omit the JSON content type');
});

test('V2 update verification compares the prepared payload (V1 compared the raw one, so uploads always looked failed)', async () => {
    const { realm, V2 } = require('./harness.cjs');
    const run = async (file) => {
        const r = await realm({ file, names: NAMES, html: '<p></p>', before: BEFORE });
        try {
            return await r.run(async () => {
                const api = new KnackAPI({ showSpinner: false, debug: false }); const logs = []; api._log = (m, d, l) => logs.push([m, l]);
                api._prepareRecordData = async () => ({ field_9: { id: 'asset1' } });
                api._request = async () => ({ record: { id: 'r1', field_9_raw: { id: 'asset1' }, field_9: 'a.pdf' } });
                await api.updateRecord('scene_1', 'view_1', 'r1', { field_9: new Blob(['x']) });
                return logs.filter(([m]) => m.startsWith('Field update verification: failures')).length;
            });
        } finally { await r.close(); }
    };
    const { V1 } = require('./harness.cjs');
    assert.equal(await run(V1), 1, 'V1 flags the upload as a failed verification');
    assert.equal(await run(V2), 0, 'V2 compares what was actually sent');
});

test('rate-limit snapshots are built the same way for headers, dev-server payloads and failures', async () => {
    await same(() => {
        Date.now = () => 1700000000000;
        const api = new KnackAPI({ showSpinner: false, debug: false });
        const headerSets = [null, {}, { 'X-PlanLimit-Remaining': '40', 'X-PlanLimit-Limit': '100', 'X-PlanLimit-Reset': '99' }, { 'x-rate-limit-remaining': '5' }, { other: '1' }, new Headers({ 'X-Rate-Limit-Limit': '10', 'X-Rate-Limit-Remaining': '3' })];
        const payloads = [null, 'x', { available: true, limit: '10', remaining: '4', headers: { A: 1 } }, { reason: ' nope ' }, { limit: 7, remaining: 9, used: 2, observedAt: '2024-01-01T00:00:00Z', status: '201', headerNames: ['B', 'A'] }, { observedAt: 'junk', reset: 'x' }, {}];
        return {
            extract: headerSets.flatMap((h) => [api._extractRateLimitSnapshot(h, 200), api._extractRateLimitSnapshot(h)]),
            external: payloads.flatMap((p) => [api._normalizeExternalRateLimitSnapshot(p, 429), api._normalizeExternalRateLimitSnapshot(p)]),
            unavailable: [api._createUnavailableRateLimitSnapshot(' why ', 500, { Z: 1 }), api._createUnavailableRateLimitSnapshot('', 'x'), api._createUnavailableRateLimitSnapshot()],
            empty: api._createEmptyRateLimitSnapshot(), headers: [api._normalizeResponseHeaders(null), api._normalizeResponseHeaders({ A: 1 }), api._normalizeResponseHeaders(new Headers({ B: '2' }))],
            status: api.getRateLimitStatus(),
        };
    });
});
