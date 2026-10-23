'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('manifest matches the MeshCentral server-plugin format', () => {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
    assert.equal(config.shortName, 'scripttask');
    assert.equal(config.version, '1.0.9');
    assert.equal(config.hasAdminPanel, true);
    assert.equal(config.meshCentralCompat, '>=1.2.5');
    assert.equal(config.versionHistoryUrl, undefined);
    assert.equal(config.downloadUrl, 'https://raw.githubusercontent.com/maxdorx/MeshCentral-ScriptTask/scripttask-current/release-assets/MeshCentral-ScriptTask.zip');
});

test('release ZIP has the plugin directory expected by MeshCentral', () => {
    const archive = fs.readFileSync(path.join(root, 'release-assets', 'MeshCentral-ScriptTask.zip'));
    const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    const endOffset = archive.lastIndexOf(endSignature);
    assert.notEqual(endOffset, -1);
    const entryCount = archive.readUInt16LE(endOffset + 10);
    let offset = archive.readUInt32LE(endOffset + 16);
    const entries = [];
    for (let index = 0; index < entryCount; index++) {
        assert.equal(archive.readUInt32LE(offset), 0x02014b50);
        const nameLength = archive.readUInt16LE(offset + 28);
        const extraLength = archive.readUInt16LE(offset + 30);
        const commentLength = archive.readUInt16LE(offset + 32);
        entries.push(archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
        offset += 46 + nameLength + extraLength + commentLength;
    }
    for (const required of [
        'scripttask/', 'scripttask/config.json', 'scripttask/scripttask.js',
        'scripttask/db.js', 'scripttask/nemongo.js', 'scripttask/views/user.handlebars',
        'scripttask/modules_meshcore/scripttask.js'
    ]) assert.ok(entries.includes(required), `${required} is required`);
    assert.ok(entries.indexOf('scripttask/views/') < entries.indexOf('scripttask/views/user.handlebars'));
});

test('release channel provides the stable installer and legacy upgrade aliases', () => {
    const current = fs.readFileSync(path.join(root, 'release-assets', 'MeshCentral-ScriptTask.zip'));
    const versioned = fs.readFileSync(path.join(root, 'release-assets', 'MeshCentral-ScriptTask-1.0.9.zip'));
    assert.deepEqual(versioned, current);
    for (const version of ['1.0.4', '1.0.5', '1.0.6', '1.0.7']) {
        const compatibility = fs.readFileSync(path.join(root, 'release-assets', `MeshCentral-ScriptTask-${version}.zip`));
        assert.deepEqual(compatibility, current, `${version} installer URL must upgrade to the current package`);
    }
});

test('top-level navigation uses MeshCentral shared plugin page', () => {
    const source = fs.readFileSync(path.join(root, 'scripttask.js'), 'utf8');
    assert.match(source, /goPlugin\('scripttask', 'ScriptTask'\)/);
    assert.match(source, /document\.getElementById\('p43iframe'\)/);
    assert.doesNotMatch(source, /var pageId = 70/);
    assert.doesNotMatch(source, /req\.query\.user != 1/);
});

test('top-level navigation opens and reuses MeshCentral view 43', () => {
    const previous = {
        document: global.document, window: global.window, go: global.go,
        goPlugin: global.goPlugin, urlargs: global.urlargs, pluginHandler: global.pluginHandler
    };
    let source = '';
    let pluginLoads = 0;
    let pageLoads = 0;
    const frame = { getAttribute(name) { return name === 'src' ? source : ''; } };
    try {
        global.document = { title: 'MeshCentral', getElementById(id) { return id === 'p43iframe' ? frame : null; } };
        global.window = {
            location: { href: 'https://mesh.example/?viewmode=1' },
            history: { replaceState() {} },
            setTimeout(callback) { callback(); }
        };
        global.urlargs = {};
        global.go = function (page) { if (page === 43) pageLoads++; };
        global.goPlugin = function (name, title) {
            assert.equal(name, 'scripttask');
            assert.equal(title, 'ScriptTask');
            pluginLoads++;
        };
        const handler = { parent: { debug() {} } };
        const plugin = require('../scripttask').scripttask(handler);
        handler.scripttask = plugin;
        global.pluginHandler = handler;
        plugin.setScriptTaskUrlMarker = function () {};
        plugin.setScriptTaskHostChrome = function () {};
        plugin.fitScriptTaskFrame = function () {};
        plugin.setScriptTaskHeading = function () {};
        plugin.setScriptTaskSelected = function () {};
        plugin.openScriptTask();
        assert.equal(pluginLoads, 1);
        source = '/pluginadmin.ashx?pin=scripttask';
        plugin.openScriptTask();
        assert.equal(pageLoads, 1);
        assert.equal(pluginLoads, 1);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete global[key]; else global[key] = value;
        }
    }
});

test('server plugin page renders without the legacy user query parameter', async () => {
    const handler = { parent: { debug() {} } };
    const plugin = require('../scripttask').scripttask(handler);
    let rendered = null;
    const response = {
        setHeader() {},
        sendStatus(code) { throw new Error(`unexpected status ${code}`); },
        render(view, data) { rendered = { view, data }; }
    };
    plugin.handleAdminReq({ query: {} }, response, { _id: 'user//admin', domain: '' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(rendered);
    assert.match(rendered.view.replace(/\\/g, '/'), /views\/user$/);
    assert.equal(rendered.data.layout, false);
});

test('browser template parses and preserves filtering focus', () => {
    const template = fs.readFileSync(path.join(root, 'views', 'user.handlebars'), 'utf8');
    const script = template.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(script, 'inline application script');
    assert.doesNotThrow(() => new Function(script[1]));
    assert.match(template, /id="deviceSearch"/);
    assert.match(template, /id="resultSearch"/);
    assert.match(template, /refocus\(focusId,caret\)/);
    assert.match(template, /Select a script to view its results\./);
    assert.doesNotMatch(template, /<h1>ScriptTask<\/h1>/);
});

test('browser template follows the active MeshCentral theme', () => {
    const template = fs.readFileSync(path.join(root, 'views', 'user.handlebars'), 'utf8');
    assert.match(template, /id="scriptTaskTheme"/);
    assert.match(template, /getElementById\('theme-stylesheet'\)/);
    assert.match(template, /parent\.getComputedStyle/);
    assert.match(template, /--bs-body-bg/);
    assert.match(template, /--bs-body-color/);
    assert.match(template, /--bs-primary/);
    assert.match(template, /new MutationObserver\(update\)/);
    assert.match(template, /watchTheme\(\);refresh\(\)/);
    assert.doesNotMatch(template, /prefers-color-scheme/);
});

test('results use contained scrolling, pagination, and collapsed output', () => {
    const template = fs.readFileSync(path.join(root, 'views', 'user.handlebars'), 'utf8');
    assert.match(template, /html,body\{height:100%;min-height:0;margin:0;overflow:hidden\}/);
    assert.match(template, /\.view\.results\{display:flex;flex-direction:column;overflow:hidden\}/);
    assert.match(template, /class="tablewrap"/);
    assert.match(template, /resultPageSize:50/);
    assert.match(template, /\[25,50,100\]/);
    assert.match(template, /\.sort\(function\(a,b\)\{return resultTime\(b\)-resultTime\(a\)\}\)/);
    assert.match(template, /<details class="resultdetails">/);
});

test('fleet run view uses the compact full-height device layout', () => {
    const template = fs.readFileSync(path.join(root, 'views', 'user.handlebars'), 'utf8');
    assert.match(template, /\.hero>div\{display:flex;align-items:baseline/);
    assert.match(template, /\.view\.run,\.view\.results\{display:flex;flex-direction:column;overflow:hidden\}/);
    assert.match(template, /class="devicecontrols"/);
    assert.match(template, /\.devicelist\{flex:1 1 auto;min-height:0;overflow:auto\}/);
    assert.doesNotMatch(template, /max-height:430px/);
});

test('browser actions wait for MeshCentral and dialogs avoid theme collisions', () => {
    const template = fs.readFileSync(path.join(root, 'views', 'user.handlebars'), 'utf8');
    assert.match(template, /server\.State!==2/);
    assert.match(template, /attempt<60/);
    assert.match(template, /MeshCentral connection is unavailable\./);
    assert.match(template, /class="st-dialog"/);
    assert.match(template, /\.st-dialog\{display:block/);
    assert.doesNotMatch(template, /class="modal"/);
});

test('only the Shared root folder is protected from rename and delete', () => {
    const template = fs.readFileSync(path.join(root, 'views', 'user.handlebars'), 'utf8');
    assert.match(template, /i&&i\.type==='folder'&&i\.path==='Shared'/);
    assert.match(template, /deleteBtn'\)\.disabled=!i\|\|root/);
    assert.match(template, /renameBtn'\)\.disabled=!i\|\|root/);
    assert.doesNotMatch(template, /disabled=!i\|\|i\.path==='Shared'/);
});
