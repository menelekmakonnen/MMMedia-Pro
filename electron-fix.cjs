const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
    if (path === 'electron') {
        try {
            // In Electron, the 'electron' module is built-in.
            // When we are in the main process, this should return the API.
            const electron = originalRequire.apply(this, arguments);
            if (typeof electron === 'string') {
                // If it's a string, it's the path to the electron package.
                // We want the internal 'electron' module.
                // We can try to get it from the process if it's exposed, 
                // but usually Electron handles this.
                console.warn('[Fix] Intercepted electron require returning string path:', electron);
                // Attempt to force it?
            }
            return electron;
        } catch (e) {
            console.error('[Fix] Error requiring electron:', e);
            throw e;
        }
    }
    return originalRequire.apply(this, arguments);
};
