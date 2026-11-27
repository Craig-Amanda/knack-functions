/**
 * Minimal stand-ins for the globals Knack, KTL and the host app provide at runtime, so library functions can be
 * exercised in a plain page. Everything recorded here is readable from tests via window.__stub.
 */
window.__stub = { errors: [], notifications: [], navigations: [], spinner: 0 };

window.errorHandler = {
    handle(error, additionalInfo = {}, errorSource = 'Unknown') {
        window.__stub.errors.push({ message: error?.message ?? String(error), additionalInfo, errorSource });
        return null;
    },
    handleError(error, additionalInfo = {}, errorSource = 'Unknown') {
        return window.errorHandler.handle(error, additionalInfo, errorSource);
    },
};

window.Knack = {
    application_id: 'app_test',
    views: {},
    models: {},
    scenes: { models: [] },
    objects: { models: [] },
    fields: {},
    hash_id: '',
    router: {
        current_scene_key: 'scene_1',
        navigate(hash, options) { window.__stub.navigations.push({ hash, options }); },
    },
    getUserAttributes() { return { id: 'user_1', name: 'Test User', email: 'test@example.com', values: {}, roles: ['profile_1'] }; },
    getUserRoles() { return ['profile_1']; },
    getUserRoleNames() { return 'Developer'; },
    getUserToken() { return 'token'; },
    showSpinner() { window.__stub.spinner += 1; },
    hideSpinner() { window.__stub.spinner -= 1; },
    closeModal() {},
};

window.ktl = {
    core: {
        waitSelector(selector, timeout = 2000) {
            return new Promise((resolve, reject) => {
                const found = () => document.querySelector(selector);
                if (found()) return resolve(found());
                const observer = new MutationObserver(() => { if (found()) { observer.disconnect(); resolve(found()); } });
                observer.observe(document.documentElement, { childList: true, subtree: true });
                setTimeout(() => { observer.disconnect(); reject(new Error(`timeout: ${selector}`)); }, timeout);
            });
        },
        hasRoleAccess() { return true; },
    },
};

window.isDeveloper = false;
