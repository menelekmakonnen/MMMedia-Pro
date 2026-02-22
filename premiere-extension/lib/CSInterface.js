/**************************************************************************************************
 *
 * ADOBE SYSTEMS INCORPORATED
 * Copyright 2013 Adobe Systems Incorporated
 * All Rights Reserved.
 *
 * NOTICE:  Adobe permits you to use, modify, and distribute this file in accordance with the
 * terms of the Adobe license agreement accompanying it.  If you have received this file from a
 * source other than Adobe, then your use, modification, or distribution of it requires the prior
 * written permission of Adobe.
 *
 **************************************************************************************************/

/**
 * CSInterface - v11.0.0
 */

function CSInterface() {
    this.hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
}

CSInterface.prototype.getHostEnvironment = function () {
    this.hostEnvironment = JSON.parse(window.__adobe_cep__.getHostEnvironment());
    return this.hostEnvironment;
};

CSInterface.prototype.evalScript = function (script, callback) {
    if (callback === null || callback === undefined) {
        callback = function (result) { };
    }
    window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getApplicationID = function () {
    var appId = this.hostEnvironment.appId;
    return appId;
};

CSInterface.prototype.getHostCapabilities = function () {
    var capabilities = JSON.parse(window.__adobe_cep__.getHostCapabilities());
    return capabilities;
};

CSInterface.prototype.dispatchEvent = function (event) {
    window.__adobe_cep__.dispatchEvent(JSON.stringify(event));
};

CSInterface.prototype.addEventListener = function (type, listener, obj) {
    window.__adobe_cep__.addEventListener(type, listener, obj);
};

CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    window.__adobe_cep__.removeEventListener(type, listener, obj);
};

CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    window.__adobe_cep__.requestOpenExtension(extensionId, params);
};

CSInterface.prototype.getSystemPath = function (pathType) {
    var path = window.__adobe_cep__.getSystemPath(pathType);
    return path;
};

CSInterface.prototype.closeExtension = function () {
    window.__adobe_cep__.closeExtension();
};
