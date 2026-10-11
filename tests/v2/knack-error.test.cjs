/**
 * Characterisation of the KnackError function wrappers: same results, same data passed to handleError as V1,
 * except the documented serialiser fix (monitorPerformance no longer throws on circular args such as window).
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { both, shutdown } = require('./harness.cjs');

after(shutdown);

const NAMES = ['KnackError', 'KnackAPI', 'knackNavigator', 'knackValueResolver', 'getKnackApiClient'];

test('KnackError wrappers return the same values and report the same details as V1', async () => {
    const { v1, v2 } = await both({ names: NAMES, html: '<div id="knack-body"></div>' }, async () => {
        const e = new KnackError({ sceneId: 'scene_1', viewId: 'view_1' });
        const reports = [];
        e.handleError = (err, info, source) => { reports.push([err && err.message, source, Object.keys(info).sort(), info.functionArgs, info.responseTime === undefined ? null : typeof info.responseTime, info.performanceContext && Object.keys(info.performanceContext), info.apiParams]); return null; };
        e.getCurrentContext = () => ({ ctx: 1 });
        const boom = (a) => { throw new Error('boom ' + a); };
        const ok = async (a, b) => a + b;
        const out = {};
        out.wrapOk = await e.wrapFunction(ok, 'src')(1, 2);
        try { await e.wrapFunction(boom, 'src', { extra: 1 })(el => el, document.body, 'x'); } catch (x) { out.wrapThrew = x.message; }
        out.tryOk = await e.tryCatch(ok)(2, 3);
        const tc = await e.tryCatch(boom, null, { extra: 2 })('t'); out.tryFail = [tc.success, tc.message];
        out.safe = [await e.safeExecute(() => 5, 'd'), await e.safeExecute(boom, 'dflt', 'safe')];
        out.exec = await e.executeFunction(boom, { returnDefaultOnError: true, defaultValue: 7, captureArgs: false, immediate: true, immediateArgs: [1] });
        try { await e.executeFunction(boom, { rethrowError: true, source: 'ex' })('z'); } catch (x) { out.execThrew = x.message; }
        out.exec2 = await e.executeFunction(boom, { rethrowError: false })('q');
        out.perfOk = await e.monitorPerformance(ok, 'perf', 1000)(4, 5);
        try { await e.monitorPerformance(boom, 'perf', 1000, { extra: 3 })(7, 'p'); } catch (x) { out.perfThrew = x.message; }
        const api = async function updateRecord() { throw new Error('api'); };
        try { await e.monitorApiCall(api, 'api src')('scene_1', 'view_1', 'rec', { a: 1 }); } catch (x) { out.apiThrew = x.message; }
        const wrapped = e.wrapAllMethods({ a: () => 1, b: 2, c: boom }, 'obj');
        out.all = [await wrapped.a(), wrapped.b]; try { await wrapped.c('w'); } catch (x) { out.allThrew = x.message; }
        reports.forEach(r => { if (typeof r[3] === 'string') r[3] = r[3].replace(/\s/g, ''); });
        out.reports = reports;
        return JSON.parse(JSON.stringify(out));
    });
    assert.deepEqual(v2, v1);
});
