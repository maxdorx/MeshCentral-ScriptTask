/** 
* @description MeshCentral ScriptTask
* @author Ryan Blenis
* @copyright 
* @license Apache-2.0
*/

"use strict";

module.exports.scripttask = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.db = null;
    obj.intervalTimer = null;
    obj.debug = obj.meshServer.debug;
    obj.VIEWS = __dirname + '/views/';
    obj.exports = [
        'onWebUIStartupEnd',
        'installNavigation',
        'trackPluginFrame',
        'fitScriptTaskFrame',
        'setScriptTaskHostChrome',
        'setScriptTaskUrlMarker',
        'setScriptTaskHeading',
        'setScriptTaskSelected',
        'openScriptTask',
        'getScriptTaskFrame',
        'goPageStart',
        'resizeContent',
        'historyData',
        'variableData',
        'newScriptTree',
        'dashboardData',
        'scriptData',
        'operationResult',
        'refreshData',
        'malix_triggerOption'
    ];

    // ScriptTask is a fleet tool. Use MeshCentral's shared server-plugin page
    // (view 43), just like the Inventory plugin, instead of creating a private
    // page number that the host router does not know about.
    obj.onWebUIStartupEnd = function() {
        pluginHandler.scripttask.installNavigation();
        try {
            var params = new URLSearchParams(window.location.search);
            if (params.get('viewmode') === '43' && params.get('scripttaskplugin') === '1') {
                pluginHandler.scripttask.openScriptTask();
            }
        } catch (e) { }
    };

    obj.installNavigation = function() {
        if (document.getElementById('MainMenuScriptTask') == null) {
            var row = document.querySelector('#MainMenuSpan tr');
            if (row) {
            var cell = document.createElement('td');
            cell.id = 'MainMenuScriptTask';
            cell.className = 'topbar_td style3x';
            cell.tabIndex = 0;
            cell.textContent = 'ScriptTask';
            cell.title = 'Run and schedule scripts across devices';
                cell.onmouseup = function() { return pluginHandler.scripttask.openScriptTask(); };
                cell.onkeypress = function(e) { if (e.key == 'Enter') pluginHandler.scripttask.openScriptTask(); };
                var devicesCell = document.getElementById('MainMenuMyDevices');
                row.insertBefore(cell, devicesCell && devicesCell.parentNode === row ? devicesCell.nextSibling : row.querySelector('.topbar_td_end'));
            }
        }

        if (document.getElementById('LeftMenuScriptTask') == null) {
            var devicesItem = document.getElementById('LeftMenuMyDevices');
            if (devicesItem && devicesItem.parentNode) {
                var item = devicesItem.cloneNode(false);
                item.id = 'LeftMenuScriptTask';
                item.title = 'ScriptTask';
                item.className = devicesItem.className.replace(/lbbuttonsel/g, '').replace(/active/g, '');
                item.removeAttribute('data-target');
                item.removeAttribute('onmouseup');
                item.removeAttribute('onkeypress');
                item.innerHTML = '<i class="fa-solid fa-terminal me-2"></i>';
                item.onclick = function(e) { if (e) e.preventDefault(); return pluginHandler.scripttask.openScriptTask(); };
                devicesItem.parentNode.insertBefore(item, devicesItem.nextSibling);
            }
        }
        pluginHandler.scripttask.trackPluginFrame();
    };

    obj.setScriptTaskUrlMarker = function(enabled) {
        try {
            if (typeof urlargs === 'object' && urlargs != null) {
                if (enabled) urlargs.scripttaskplugin = '1';
                else delete urlargs.scripttaskplugin;
            }
            var url = new URL(window.location.href);
            if (enabled) {
                url.searchParams.set('viewmode', '43');
                url.searchParams.set('scripttaskplugin', '1');
            } else {
                url.searchParams.delete('scripttaskplugin');
            }
            window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        } catch (e) { }
        if (!enabled) pluginHandler.scripttask.setScriptTaskSelected(false);
    };

    obj.setScriptTaskHostChrome = function(enabled) {
        var submenu = document.getElementById('ServerSubMenuSpan');
        var content = document.getElementById('column_l');
        if (enabled) {
            if (submenu && !submenu.hasAttribute('data-scripttask-display')) {
                submenu.setAttribute('data-scripttask-display', submenu.style.display || '');
            }
            if (submenu) submenu.style.setProperty('display', 'none', 'important');
            if (content && !content.hasAttribute('data-scripttask-room')) {
                content.setAttribute('data-scripttask-room', content.classList.contains('room4submenu') ? '1' : '0');
            }
            if (content) content.classList.remove('room4submenu');
            return;
        }
        if (submenu && submenu.hasAttribute('data-scripttask-display')) {
            var display = submenu.getAttribute('data-scripttask-display');
            if (display) submenu.style.display = display; else submenu.style.removeProperty('display');
            submenu.removeAttribute('data-scripttask-display');
        }
        if (content && content.hasAttribute('data-scripttask-room')) {
            content.classList.toggle('room4submenu', content.getAttribute('data-scripttask-room') === '1');
            content.removeAttribute('data-scripttask-room');
        }
    };

    obj.setScriptTaskSelected = function(enabled) {
        var top = document.getElementById('MainMenuScriptTask');
        if (top) {
            top.classList.toggle('style3sel', enabled === true);
            if (!enabled) top.classList.remove('fullselect', 'semiselect');
        }
        var left = document.getElementById('LeftMenuScriptTask');
        if (left) {
            left.classList.toggle('active', enabled === true);
            left.classList.toggle('lbbuttonsel', enabled === true);
            if (!enabled) left.classList.remove('lbbuttonsel2');
        }
    };

    obj.setScriptTaskHeading = function(enabled) {
        var title = document.getElementById('p43title');
        var heading = title && title.parentNode;
        if (!heading) return;
        if (enabled) {
            if (!heading.hasAttribute('data-scripttask-heading')) {
                heading.setAttribute('data-scripttask-heading', heading.innerHTML);
            }
            heading.textContent = '';
            var label = document.createElement('span');
            label.id = 'p43title';
            label.textContent = 'ScriptTask';
            heading.appendChild(label);
        } else if (heading.hasAttribute('data-scripttask-heading')) {
            heading.innerHTML = heading.getAttribute('data-scripttask-heading');
            heading.removeAttribute('data-scripttask-heading');
        }
    };

    obj.fitScriptTaskFrame = function(enabled) {
        var frame = document.getElementById('p43iframe');
        if (!frame) return;
        if (enabled) {
            if (!frame.hasAttribute('data-scripttask-height')) frame.setAttribute('data-scripttask-height', frame.style.height || '');
            if (!frame.hasAttribute('data-scripttask-max-height')) frame.setAttribute('data-scripttask-max-height', frame.style.maxHeight || '');
            var height = Math.max(240, Math.floor(window.innerHeight - Math.max(0, frame.getBoundingClientRect().top))) + 'px';
            if (frame.style.height !== height) frame.style.height = height;
            if (frame.style.maxHeight !== height) frame.style.maxHeight = height;
            return;
        }
        if (frame.hasAttribute('data-scripttask-height')) {
            frame.style.height = frame.getAttribute('data-scripttask-height');
            frame.style.maxHeight = frame.getAttribute('data-scripttask-max-height');
            frame.removeAttribute('data-scripttask-height');
            frame.removeAttribute('data-scripttask-max-height');
        }
    };

    obj.trackPluginFrame = function() {
        var frame = document.getElementById('p43iframe');
        if (!frame || frame.getAttribute('data-scripttask-watch') === '1') return;
        frame.setAttribute('data-scripttask-watch', '1');
        window.addEventListener('resize', function() {
            var src = frame.getAttribute('src') || '';
            if (src.indexOf('pin=scripttask') >= 0) pluginHandler.scripttask.fitScriptTaskFrame(true);
        });
        try {
            new MutationObserver(function() {
                var src = frame.getAttribute('src') || '';
                if (src.indexOf('pin=scripttask') < 0) {
                    pluginHandler.scripttask.setScriptTaskHostChrome(false);
                    pluginHandler.scripttask.fitScriptTaskFrame(false);
                    pluginHandler.scripttask.setScriptTaskUrlMarker(false);
                    pluginHandler.scripttask.setScriptTaskHeading(false);
                } else {
                    window.setTimeout(function() { pluginHandler.scripttask.fitScriptTaskFrame(true); }, 0);
                }
            }).observe(frame, { attributes: true, attributeFilter: ['src', 'style'] });
        } catch (e) { }
    };

    obj.openScriptTask = function() {
        pluginHandler.scripttask.setScriptTaskUrlMarker(true);
        var frame = document.getElementById('p43iframe');
        var src = frame ? (frame.getAttribute('src') || '') : '';
        if (src.indexOf('pin=scripttask') >= 0) go(43);
        else goPlugin('scripttask', 'ScriptTask');
        pluginHandler.scripttask.setScriptTaskUrlMarker(true);
        pluginHandler.scripttask.setScriptTaskHostChrome(true);
        window.setTimeout(function() {
            pluginHandler.scripttask.setScriptTaskHostChrome(true);
            pluginHandler.scripttask.fitScriptTaskFrame(true);
            pluginHandler.scripttask.setScriptTaskHeading(true);
            pluginHandler.scripttask.setScriptTaskSelected(true);
        }, 0);
        return false;
    };

    obj.getScriptTaskFrame = function() {
        var frame = document.getElementById('p43iframe');
        if (frame && String(frame.getAttribute('src') || '').indexOf('pin=scripttask') >= 0) return frame;
        return document.getElementById('pluginIframeScriptTask');
    };

    obj.goPageStart = function(x) {
        if (x == 43) return;
        pluginHandler.scripttask.setScriptTaskHostChrome(false);
        pluginHandler.scripttask.fitScriptTaskFrame(false);
        pluginHandler.scripttask.setScriptTaskUrlMarker(false);
        pluginHandler.scripttask.setScriptTaskHeading(false);
        pluginHandler.scripttask.setScriptTaskSelected(false);
    };
    
    obj.malix_triggerOption = function(selectElem) {
        selectElem.options.add(new Option("ScriptTask - Run Script", "scripttask_runscript"));
    }
    obj.malix_triggerFields_scripttask_runscript = function() {
        
    }
    obj.resetQueueTimer = function() {
        clearTimeout(obj.intervalTimer);
        obj.intervalTimer = setInterval(obj.queueRun, 1 * 60 * 1000); // every minute
    };
    
    obj.server_startup = function() {
        if (typeof parent.registerPermissions == 'function') {
            parent.registerPermissions('scripttask', {
                view: { title: 'View ScriptTask', desc: 'View scripts, results and schedules.', default: 'allowed' },
                run: { title: 'Run scripts', desc: 'Run or schedule scripts on permitted devices.', default: 'allowed' },
                edit: { title: 'Manage scripts', desc: 'Create, edit, move and delete scripts and folders.', default: 'denied' },
                variables: { title: 'Manage variables', desc: 'Create, edit and delete ScriptTask variables.', default: 'denied' }
            });
            if (typeof parent.loadPluginPermissions == 'function') parent.loadPluginPermissions('scripttask');
        }
        obj.meshServer.pluginHandler.scripttask_db = require (__dirname + '/db.js').CreateDB(obj.meshServer);
        obj.db = obj.meshServer.pluginHandler.scripttask_db;
        obj.resetQueueTimer();
    };
    
    // may not be needed, saving for later. Can be called to resize iFrame
    obj.resizeContent = function() {
        pluginHandler.scripttask.fitScriptTaskFrame(true);
    };
    
    obj.queueRun = async function() {
        var onlineAgents = Object.keys(obj.meshServer.webserver.wsagents);
        //obj.debug('ScriptTask', 'Queue Running', Date().toLocaleString(), 'Online agents: ', onlineAgents);

        obj.db.getPendingJobs(onlineAgents)
        .then((jobs) => {
            if (jobs.length == 0) return;
            //@TODO check for a large number and use taskLimiter to queue the jobs
            jobs.forEach(job => {
                obj.db.get(job.scriptId)
                .then(async (script) => {
                    if (script.length != 1 || script[0].type != 'script') return;
                    script = script[0];
                    var foundVars = script.content.match(/#(.*?)#/g);
                    var replaceVars = {};
                    if (foundVars != null && foundVars.length > 0) {
                        var foundVarNames = [];
                        foundVars.forEach(fv => {
                            foundVarNames.push(fv.replace(/^#+|#+$/g, ''));
                        });
                        
                        var limiters = { 
                            scriptId: job.scriptId,
                            nodeId: job.node,
                            meshId: obj.meshServer.webserver.wsagents[job.node]['dbMeshKey'],
                            names: foundVarNames
                        };
                        var finvals = await obj.db.getVariables(limiters, job.domain);
                        var ordering = { 'global': 0, 'script': 1, 'mesh': 2, 'node': 3 }
                        finvals.sort((a, b) => {
                            return (ordering[a.scope] - ordering[b.scope])
                              || a.name.localeCompare(b.name);
                        });
                        finvals.forEach(fv => {
                            replaceVars[fv.name] = fv.value;
                        });
                        replaceVars['GBL:meshId'] = obj.meshServer.webserver.wsagents[job.node]['dbMeshKey'];
                        replaceVars['GBL:nodeId'] = job.node;
                        replaceVars['GBL:runBy'] = job.runBy || 'unknown';
                        //console.log('FV IS', finvals);
                        //console.log('RV IS', replaceVars);
                    }
                    var dispatchTime = Math.floor(new Date() / 1000);
                    var jObj = { 
                        action: 'plugin', 
                        plugin: 'scripttask', 
                        pluginaction: 'triggerJob',
                        jobId: job._id,
                        scriptId: job.scriptId,
                        replaceVars: replaceVars,
                        scriptHash: script.contentHash,
                        dispatchTime: dispatchTime
                    };
                    //obj.debug('ScriptTask', 'Sending job to agent');
                    try { 
                        obj.meshServer.webserver.wsagents[job.node].send(JSON.stringify(jObj));
                        obj.db.update(job._id, { dispatchTime: dispatchTime });
                    } catch (e) { }
                })
                .catch(e => console.log('PLUGIN: ScriptTask: Could not dispatch job.', e));
            });
        })
        .then(() => {
            obj.makeJobsFromSchedules();
            obj.cleanHistory();
        })
        .catch(e => { console.log('PLUGIN: ScriptTask: Queue Run Error: ', e); });
    };
    
    obj.cleanHistory = function() {
        if (Math.round(Math.random() * 100) == 99) {
            //obj.debug('Plugin', 'ScriptTask', 'Running history cleanup');
            obj.db.deleteOldHistory();
        }
    };
    
    obj.getDomainId = function(user) {
        if (user == null) return '';
        if (typeof user.domain == 'string') return user.domain;
        if (typeof user._id == 'string') return user._id.split('/')[1] || '';
        return '';
    };

    obj.hasPermission = function(user, permission, context) {
        if (user == null) return Promise.resolve(false);
        if (typeof parent.getAccessPermissions != 'function') return Promise.resolve(true);
        return parent.getAccessPermissions('scripttask', user, context || {}).then(function(check) { return check(permission); });
    };

    obj.downloadFile = function(req, res, user) {
        var id = req.query.dl;
        obj.db.getForDomain(id, obj.getDomainId(user))
        .then(found => {
          if (found.length != 1 || found[0].type != 'script') { res.sendStatus(404); return; }
          var file = found[0];
          res.setHeader('Content-disposition', 'attachment; filename="' + String(file.name).replace(/["\r\n]/g, '') + '"');
          res.setHeader('Content-type', 'text/plain');
          res.send(file.content);
        }).catch(function() { res.sendStatus(500); });
    };
    
    obj.updateFrontEnd = function(ids) {
        var targets = (ids && ids.userid) ? [ids.userid] : ['server-users'];
        obj.meshServer.DispatchEvent(targets, obj, {
            nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: 'refreshData'
        });
    };

    obj.sendUserEvent = function(user, action, data) {
        if (user == null) return;
        var event = Object.assign({ nolog: true, action: 'plugin', plugin: 'scripttask', pluginaction: action }, data || {});
        obj.meshServer.DispatchEvent([user._id], obj, event);
    };

    obj.getDashboardData = function(user) {
        var domain = obj.getDomainId(user);
        return obj.db.ensureDomainDefaults(domain).then(function() { return Promise.all([
            obj.db.getScriptTree(domain),
            obj.db.getJobHistory(domain, 1000),
            obj.db.getJobSchedules(domain),
            obj.db.getVariables(null, domain),
            obj.hasPermission(user, 'run'),
            obj.hasPermission(user, 'edit'),
            obj.hasPermission(user, 'variables')
        ]); }).then(function(data) {
            return Promise.all([obj.filterVisibleRows(user, data[1]), obj.filterVisibleRows(user, data[2])]).then(function(filtered) {
                return {
                    tree: data[0], history: filtered[0], schedules: filtered[1], variables: data[3],
                    permissions: { run: data[4], edit: data[5], variables: data[6] }
                };
            });
        });
    };

    obj.filterVisibleRows = function(user, rows) {
        var nodeIds = [];
        rows.forEach(function(row) { if (typeof row.node == 'string' && nodeIds.indexOf(row.node) < 0) nodeIds.push(row.node); });
        if (nodeIds.length == 0) return Promise.resolve([]);
        var domain = obj.meshServer.config.domains[obj.getDomainId(user)];
        return new Promise(function(resolve) {
            var visible = {}, remaining = nodeIds.length;
            nodeIds.forEach(function(nodeId) {
                obj.meshServer.webserver.GetNodeWithRights(domain, user, nodeId, function(node, rights, isVisible) {
                    if (node != null && isVisible === true) visible[nodeId] = true;
                    if (--remaining == 0) resolve(rows.filter(function(row) { return visible[row.node] === true; }));
                });
            });
        });
    };
    
    obj.handleAdminReq = function(req, res, user) {
        var path = require('path');
        obj.hasPermission(user, 'view').then(function(canView) {
            if (!canView) { res.sendStatus(403); return; }
            if (req.query.include == 1) {
                var includeRoot = path.resolve(__dirname, 'includes');
                var includeFile = path.resolve(includeRoot, String(req.query.path || ''));
                if (includeFile !== includeRoot && !includeFile.startsWith(includeRoot + path.sep)) { res.sendStatus(404); return; }
                var ext = path.extname(includeFile).toLowerCase();
                if (ext == '.css') res.contentType('text/css');
                if (ext == '.js') res.contentType('text/javascript');
                res.sendFile(includeFile);
                return;
            }
            if (req.query.dl != null) { obj.downloadFile(req, res, user); return; }
            if (req.query.report == 'csv') {
                var domain = obj.getDomainId(user);
                obj.db.getJobHistory(domain, 5000).then(function(rows) { return obj.filterVisibleRows(user, rows); }).then(function(rows) {
                    if (req.query.scriptId) rows = rows.filter(function(r) { return String(r.scriptId) == String(req.query.scriptId); });
                    function csv(v) {
                        var value = String(v == null ? '' : v);
                        if (/^[=+\-@]/.test(value)) value = "'" + value;
                        return '"' + value.replace(/"/g, '""') + '"';
                    }
                    var output = ['Time,Device ID,Script,Run By,Status,Output,Error'];
                    rows.forEach(function(r) {
                        var status = r.errorVal != null ? 'Error' : (r.returnVal != null ? 'Completed' : (r.dispatchTime != null ? 'Running' : 'Queued'));
                        output.push([new Date(((r.completeTime || r.dispatchTime || r.queueTime) || 0) * 1000).toISOString(), r.node, r.scriptName || r.scriptId, r.runBy, status, r.returnVal, r.errorVal].map(csv).join(','));
                    });
                    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                    res.setHeader('Content-Disposition', 'attachment; filename="scripttask-results.csv"');
                    res.send('\ufeff' + output.join('\r\n'));
                }).catch(function() { res.sendStatus(500); });
                return;
            }
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.render(obj.VIEWS + 'user', { layout: false, scriptTree: '[]' });
        }).catch(function() { res.sendStatus(500); });
    };
    
    obj.historyData = function (message) {
        if (typeof pluginHandler.scripttask.loadHistory == 'function') pluginHandler.scripttask.loadHistory(message);
        if (typeof pluginHandler.scripttask.loadSchedule == 'function') pluginHandler.scripttask.loadSchedule(message);
    };
    
    obj.variableData = function (message) {
        if (typeof pluginHandler.scripttask.loadVariables == 'function') pluginHandler.scripttask.loadVariables(message);
    };

    obj.newScriptTree = function(message) {
        if (typeof pluginHandler.scripttask.loadTree == 'function') pluginHandler.scripttask.loadTree(message);
    };

    obj.dashboardData = function(message) {
        var frame = pluginHandler.scripttask.getScriptTaskFrame();
        if (frame && frame.contentWindow && typeof frame.contentWindow.scriptTaskReceive == 'function') frame.contentWindow.scriptTaskReceive('dashboard', message.event);
    };

    obj.scriptData = function(message) {
        var frame = pluginHandler.scripttask.getScriptTaskFrame();
        if (frame && frame.contentWindow && typeof frame.contentWindow.scriptTaskReceive == 'function') frame.contentWindow.scriptTaskReceive('script', message.event);
    };

    obj.operationResult = function(message) {
        var frame = pluginHandler.scripttask.getScriptTaskFrame();
        if (frame && frame.contentWindow && typeof frame.contentWindow.scriptTaskReceive == 'function') frame.contentWindow.scriptTaskReceive('operation', message.event);
    };

    obj.refreshData = function() {
        var frame = pluginHandler.scripttask.getScriptTaskFrame();
        if (frame && frame.contentWindow && typeof frame.contentWindow.scriptTaskRefresh == 'function') frame.contentWindow.scriptTaskRefresh();
    };
    
    obj.determineNextJobTime = function(s) {
        var nextTime = null;
        var nowTime = Math.floor(new Date() / 1000);
        
        // special case: we've reached the end of our run
        if (s.endAt !== null && s.endAt <= nowTime) {
            return nextTime;
        }

        switch (s.recur) {
            case 'once':
                if (s.nextRun == null) nextTime = s.startAt;
                else nextTime = null;
            break;
            case 'minutes':
                /*var lRun = s.nextRun || nowTime;
                if (lRun == null) lRun = nowTime;
                nextTime = lRun + (s.interval * 60);
                if (s.startAt > nextTime) nextTime = s.startAt;*/
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60);
                // this prevents "catch-up" tasks being scheduled if an endpoint is offline for a long period of time
                // e.g. always make sure the next scheduled time is relevant to the scheduled interval, but in the future
                if (nextTime < nowTime) {
                    // initially I was worried about this causing event loop lockups
                    // if there was a long enough time gap. Testing over 50 years of backlog for a 3 min interval
                    // still ran under a fraction of a second. Safe to say this approach is safe! (~8.5 million times)
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
            break;
            case 'hourly':
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60 * 60);
                if (nextTime < nowTime) {
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60 * 60);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
            break;
            case 'daily':
                if (s.nextRun == null) { // hasn't run yet, set to start time
                    nextTime = s.startAt;
                    break;
                }
                nextTime = s.nextRun + (s.interval * 60 * 60 * 24);
                if (nextTime < nowTime) {
                    while (nextTime < nowTime) {
                        nextTime = nextTime + (s.interval * 60 * 60 * 24);
                    }
                }
                if (s.startAt > nextTime) nextTime = s.startAt;
            break;
            case 'weekly':
                var tempDate = new Date();
                var nowDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), tempDate.getDate());
                
                if (s.daysOfWeek.length == 0) {
                    nextTime = null;
                    break;
                }
                s.daysOfWeek = s.daysOfWeek.map(el => Number(el));
                var baseTime = s.startAt;
                //console.log('dow is ', s.daysOfWeek);
                var lastDayOfWeek = Math.max(...s.daysOfWeek);
                var startX = 0;
                //console.log('ldow is ', lastDayOfWeek);
                if (s.nextRun != null) {
                    baseTime = s.nextRun;
                    //console.log('basetime 2: ', baseTime);
                    if (nowDate.getDay() == lastDayOfWeek) {
                        baseTime = baseTime + ( s.interval * 604800 ) - (lastDayOfWeek * 86400);
                        //console.log('basetime 3: ', baseTime);
                    }
                    startX = 0;
                } else if (s.startAt < nowTime) {
                    baseTime = Math.floor(nowDate.getTime() / 1000);
                    //console.log('basetime 4: ', baseTime);
                }
                //console.log('startX is: ', startX);
                //var secondsFromMidnight = nowTimeDate.getSeconds() + (nowTimeDate.getMinutes() * 60) + (nowTimeDate.getHours() * 60 * 60);
                //console.log('seconds from midnight: ', secondsFromMidnight);
                //var dBaseTime = new Date(0); dBaseTime.setUTCSeconds(baseTime);
                //var dMidnight = new Date(dBaseTime.getFullYear(), dBaseTime.getMonth(), dBaseTime.getDate());
                //baseTime = Math.floor(dMidnight.getTime() / 1000);
                for (var x = startX; x <= 7; x++){
                    var checkDate = baseTime + (86400 * x);
                    var d = new Date(0); d.setUTCSeconds(checkDate);
                    var dm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                    
                    // Test candidate weekdays until the next matching date is found.
                    //console.log('if break check :', (s.daysOfWeek.indexOf(d.getDay()) !== -1 && checkDate >= nowTime));
                    //console.log('checkDate vs nowTime: ', (checkDate - nowTime), ' if positive, nowTime is less than checkDate');
                    if (s.nextRun == null && s.daysOfWeek.indexOf(dm.getDay()) !== -1 && dm.getTime() >= nowDate.getTime()) break;
                    if (s.daysOfWeek.indexOf(dm.getDay()) !== -1 && dm.getTime() > nowDate.getTime()) break;
                    //if (s.daysOfWeek.indexOf(d.getDay()) !== -1 && Math.floor(d.getTime() / 1000) >= nowTime) break;
                }
                var sa = new Date(0); sa.setUTCSeconds(s.startAt);
                var sad = new Date(sa.getFullYear(), sa.getMonth(), sa.getDate());
                var diff = (sa.getTime() - sad.getTime()) / 1000;
                nextTime = Math.floor(dm.getTime() / 1000) + diff;
                //console.log('next schedule is ' + d.toLocaleString());
            break;
            default:
                nextTime = null;
            break;
        }
        
        if (s.endAt != null && nextTime > s.endAt) nextTime = null; // if the next time reaches the bound of the endAt time, nullify
        
        return nextTime;
    };

    obj.makeJobsFromSchedules = function(scheduleId) {
        //obj.debug('ScriptTask', 'makeJobsFromSchedules starting');
        return obj.db.getSchedulesDueForJob(scheduleId)
        .then(schedules => {
            //obj.debug('ScriptTask', 'Found ' + schedules.length + ' schedules to process. Current time is: ' + Math.floor(new Date() / 1000));
            if (schedules.length) {
                schedules.forEach(s => {
                    var nextJobTime = obj.determineNextJobTime(s);
                    var nextJobScheduled = false;
                    if (nextJobTime === null) {
                        //obj.debug('ScriptTask', 'Removing Job Schedule for', JSON.stringify(s));
                        obj.db.removeJobSchedule(s._id);
                    } else {
                        //obj.debug('ScriptTask', 'Scheduling Job for', JSON.stringify(s));
                        obj.db.get(s.scriptId)
                        .then(scripts => {
                            // if a script is scheduled to run, but a previous run hasn't completed, 
                            // don't schedule another job for the same (device probably offline).
                            // results in the minimum jobs running once an agent comes back online.
                            return obj.db.getIncompleteJobsForSchedule(s._id)
                            .then((jobs) => {
                                if (jobs.length > 0) { /* obj.debug('Plugin', 'ScriptTask', 'Skipping job creation'); */ return Promise.resolve(); }
                                else { /* obj.debug('Plugin', 'ScriptTask', 'Creating new job'); */ nextJobScheduled = true; return obj.db.addJob( { scriptId: s.scriptId, scriptName: scripts[0].name, node: s.node, runBy: s.scheduledBy, dontQueueUntil: nextJobTime, jobSchedule: s._id, domain: s.domain || '' } ); }
                            });
                        })
                        .then(() => {
                            
                            if (nextJobScheduled) { /* obj.debug('Plugin', 'ScriptTask', 'Updating nextRun time'); */ return obj.db.update(s._id, { nextRun: nextJobTime }); }
                            else { /* obj.debug('Plugin', 'ScriptTask', 'NOT updating nextRun time'); */ return Promise.resolve(); }
                        })
                        .then(() => {
                            obj.updateFrontEnd( { scriptId: s.scriptId, nodeId: s.node } );
                        })
                        .catch((e) => { console.log('PLUGIN: ScriptTask: Error managing job schedules: ', e); });
                    }
                });
            }
        });
    };
    
    obj.cleanName = function(value) {
        value = String(value || '').trim();
        if (value.length == 0 || value.length > 160 || /[\r\n\\/]/.test(value)) throw new Error('Invalid name.');
        return value;
    };

    obj.authorizedNodes = function(myparent, grandparent, requested, callback) {
        requested = Array.isArray(requested) ? requested : [requested];
        requested = requested.filter(function(id, index) { return typeof id == 'string' && requested.indexOf(id) == index; }).slice(0, 10000);
        if (requested.length == 0) { callback([]); return; }
        var remaining = requested.length, allowed = [];
        requested.forEach(function(id) {
            grandparent.GetNodeWithRights(myparent.domain, myparent.user, id, function(node, rights, visible) {
                if (node != null && visible === true && (rights == 0xFFFFFFFF || (((rights & 0x00020000) != 0) && ((rights & 0x00000200) == 0)))) allowed.push(id);
                if (--remaining == 0) callback(allowed);
            });
        });
    };

    obj.serveraction = function(command, myparent, grandparent) {
        var action = command.pluginaction;

        // Agent-originated messages are intentionally kept separate from browser actions.
        if (myparent.user == null) {
            if (action == 'getScript') {
                obj.db.getPendingJobForNodeScript(myparent.dbNodeKey, command.scriptId).then(function(jobs) {
                    if (jobs.length == 0) return;
                    return obj.db.get(command.scriptId).then(function(scripts) {
                        if (scripts.length != 1) return;
                        myparent.send(JSON.stringify({ action: 'plugin', plugin: 'scripttask', pluginaction: 'cacheScript', nodeid: myparent.dbNodeKey, rights: true, sessionid: true, script: scripts[0] }));
                    });
                }).catch(function(e) { console.log('PLUGIN: ScriptTask: Failed to provide script.', e); });
                return;
            }
            if (action == 'jobComplete') {
                obj.db.get(command.jobId).then(function(jobs) {
                    if (jobs.length != 1 || jobs[0].node != myparent.dbNodeKey || String(jobs[0].scriptId) != String(command.scriptId) || jobs[0].completeTime != null) return;
                    var completeTime = Math.floor(Date.now() / 1000);
                    return obj.db.update(command.jobId, { completeTime: completeTime, returnVal: command.retVal, errorVal: command.errVal, dispatchTime: command.dispatchTime })
                        .then(function() {
                            if (jobs[0].jobSchedule == null) return;
                            return obj.db.update(jobs[0].jobSchedule, { lastRun: completeTime }).then(function() { obj.makeJobsFromSchedules(jobs[0].jobSchedule); });
                        }).then(function() { obj.updateFrontEnd({}); });
                }).catch(function(e) { console.log('PLUGIN: ScriptTask: Failed to complete job.', e); });
                return;
            }
            if (action == 'clearAllPendingJobs') obj.db.deletePendingJobsForNode(myparent.dbNodeKey);
            return;
        }

        var user = myparent.user;
        var domain = obj.getDomainId(user);
        function result(ok, message, extra) {
            obj.sendUserEvent(user, 'operationResult', Object.assign({ ok: ok, message: message || '' }, extra || {}));
            if (ok) obj.updateFrontEnd({ userid: user._id });
        }
        function fail(e) {
            console.log('PLUGIN: ScriptTask: ' + action + ' failed.', e);
            result(false, e && e.message ? e.message : 'The operation failed.');
        }
        function requirePermission(permission, fn) {
            obj.hasPermission(user, permission).then(function(allowed) {
                if (!allowed) { result(false, 'Permission denied.'); return; }
                fn();
            }).catch(fail);
        }

        if (action == 'loadDashboard') {
            obj.hasPermission(user, 'view').then(function(allowed) {
                if (!allowed) { result(false, 'Permission denied.'); return; }
                return obj.getDashboardData(user).then(function(data) { obj.sendUserEvent(user, 'dashboardData', { data: data }); });
            }).catch(fail);
            return;
        }

        if (action == 'getScriptContent') {
            obj.hasPermission(user, 'view').then(function(allowed) {
                if (!allowed) throw new Error('Permission denied.');
                return obj.db.getForDomain(command.scriptId, domain);
            }).then(function(scripts) {
                if (scripts.length != 1 || scripts[0].type != 'script') throw new Error('Script not found.');
                obj.sendUserEvent(user, 'scriptData', { script: scripts[0] });
            }).catch(fail);
            return;
        }

        if (action == 'runScript' || action == 'addScheduledJob') {
            requirePermission('run', function() {
                obj.db.getForDomain(command.scriptId, domain).then(function(scripts) {
                    if (scripts.length != 1 || scripts[0].type != 'script') throw new Error('Script not found.');
                    var script = scripts[0];
                    var requestedNodes = (Array.isArray(command.nodes) ? command.nodes : [command.nodes]).filter(function(id, index, list) { return typeof id == 'string' && list.indexOf(id) == index; });
                    obj.authorizedNodes(myparent, grandparent, requestedNodes, function(nodes) {
                        if (nodes.length == 0) { result(false, 'No selected device allows remote script execution.'); return; }
                        var skipped = requestedNodes.length - nodes.length;
                        var skippedText = skipped > 0 ? ' ' + skipped + ' device' + (skipped == 1 ? ' was' : 's were') + ' skipped because of permissions.' : '';
                        if (action == 'runScript') {
                            Promise.all(nodes.map(function(nodeId) {
                                return obj.db.addJob({ scriptId: script._id, scriptName: script.name, node: nodeId, runBy: user.name, domain: domain });
                            })).then(function() {
                                obj.resetQueueTimer(); obj.queueRun();
                                result(true, 'Queued on ' + nodes.length + ' device' + (nodes.length == 1 ? '.' : 's.') + skippedText, { queued: nodes.length, skipped: skipped });
                            }).catch(fail);
                            return;
                        }
                        var sj = command.schedule || {};
                        var recur = ['once', 'minutes', 'hourly', 'daily', 'weekly'].indexOf(sj.recur) >= 0 ? sj.recur : 'once';
                        var interval = Math.max(1, Math.floor(Number(sj.interval) || 1));
                        var startAt = Math.floor(Number(sj.startAt));
                        var endAt = sj.endAt == null ? null : Math.floor(Number(sj.endAt));
                        if (!Number.isFinite(startAt) || startAt <= 0) { result(false, 'Select a valid start date and time.'); return; }
                        if (endAt != null && (!Number.isFinite(endAt) || endAt <= startAt)) { result(false, 'The end time must be after the start time.'); return; }
                        var dayVals = Array.isArray(sj.dayVals) ? sj.dayVals.map(Number).filter(function(v) { return v >= 0 && v <= 6; }) : [];
                        if (recur == 'weekly' && dayVals.length == 0) { result(false, 'Select at least one weekday.'); return; }
                        Promise.all(nodes.map(function(nodeId) {
                            return obj.db.addJobSchedule({ scriptId: script._id, node: nodeId, scheduledBy: user.name, recur: recur, interval: interval, daysOfWeek: dayVals, startAt: startAt, endAt: endAt, lastRun: null, nextRun: null, domain: domain });
                        })).then(function() {
                            obj.makeJobsFromSchedules();
                            result(true, 'Scheduled on ' + nodes.length + ' device' + (nodes.length == 1 ? '.' : 's.') + skippedText, { queued: nodes.length, skipped: skipped });
                        }).catch(fail);
                    });
                }).catch(fail);
            });
            return;
        }

        if (action == 'deleteSchedule') {
            requirePermission('run', function() {
                obj.db.getForDomain(command.id, domain).then(function(found) {
                    if (found.length != 1 || found[0].type != 'jobSchedule') throw new Error('Schedule not found.');
                    return obj.db.deletePendingJobsForSchedule(found[0]._id).then(function() { return obj.db.delete(found[0]._id); });
                }).then(function() { result(true, 'Schedule deleted.'); }).catch(fail);
            });
            return;
        }

        if (action == 'addScript' || action == 'new' || action == 'newFolder' || action == 'rename' || action == 'move' || action == 'editScript' || action == 'delete') {
            requirePermission('edit', function() {
                if (action == 'addScript') {
                    var uploadName = obj.cleanName(command.name);
                    var uploadType = String(command.filetype || '').toLowerCase();
                    if (['ps1', 'bat', 'bash'].indexOf(uploadType) < 0) { result(false, 'Only PowerShell, BAT and Bash scripts are supported.'); return; }
                    if (String(command.content || '').length > 2097152) { result(false, 'Script is larger than 2 MB.'); return; }
                    obj.db.addScript(uploadName, String(command.content || ''), String(command.path || 'Shared'), uploadType, domain).then(function() { result(true, 'Script uploaded.'); }).catch(fail);
                    return;
                }
                if (action == 'new' || action == 'newFolder') {
                    var newName = obj.cleanName(command.name);
                    var getParent = command.parent_id ? obj.db.getForDomain(command.parent_id, domain) : Promise.resolve([]);
                    getParent.then(function(found) {
                        var parentPath = (found.length && found[0].type == 'folder') ? found[0].path : 'Shared';
                        if (action == 'newFolder') return obj.db.addFolder(newName, parentPath + '/' + newName, domain);
                        var filetype = String(command.filetype || '').toLowerCase();
                        if (['ps1', 'bat', 'bash'].indexOf(filetype) < 0) throw new Error('Unsupported script type.');
                        return obj.db.addScript(newName, '', parentPath, filetype, domain);
                    }).then(function() { result(true, action == 'newFolder' ? 'Folder created.' : 'Script created.'); }).catch(fail);
                    return;
                }
                obj.db.getForDomain(command.id || command.scriptId, domain).then(function(found) {
                    if (found.length != 1) throw new Error('Item not found.');
                    var item = found[0];
                    if (action == 'rename') {
                        var renamed = obj.cleanName(command.name);
                        var changes = [];
                        if (item.type == 'folder') {
                            if (item.path == 'Shared') throw new Error('The Shared root cannot be renamed.');
                            var oldPath = item.path, newPath = oldPath.substring(0, oldPath.length - item.name.length) + renamed;
                            changes.push(obj.db.update(item._id, { name: renamed, path: newPath }));
                            changes.push(obj.db.getByPath(oldPath, domain).then(function(children) { return Promise.all(children.map(function(child) { return obj.db.update(child._id, { path: newPath }); })); }));
                        } else {
                            changes.push(obj.db.update(item._id, { name: renamed }));
                            changes.push(obj.db.updateScriptJobName(item._id, renamed));
                        }
                        return Promise.all(changes).then(function() { result(true, 'Renamed.'); });
                    }
                    if (action == 'editScript') {
                        if (item.type != 'script') throw new Error('Script not found.');
                        var editName = obj.cleanName(command.scriptName);
                        var content = String(command.scriptContent || '');
                        if (content.length > 2097152) throw new Error('Script is larger than 2 MB.');
                        return obj.db.update(item._id, { type: 'script', name: editName, filetype: item.filetype, content: content }).then(function() { return obj.db.updateScriptJobName(item._id, editName); }).then(function() { result(true, 'Script saved.'); });
                    }
                    if (action == 'delete') {
                        if (item.type != 'script' && item.type != 'folder') throw new Error('Item cannot be deleted here.');
                        if (item.type == 'folder' && item.path == 'Shared') throw new Error('The Shared root cannot be deleted.');
                        var prep = Promise.resolve();
                        if (item.type == 'folder') prep = obj.db.deleteByPath(item.path, domain);
                        if (item.type == 'script') prep = Promise.all([obj.db.deleteSchedulesForScript(item._id, domain), obj.db.deletePendingJobsForScript(item._id, domain)]);
                        if (item.type == 'jobSchedule') prep = obj.db.deletePendingJobsForSchedule(item._id);
                        return prep.then(function() { return obj.db.delete(item._id); }).then(function() { result(true, 'Deleted.'); });
                    }
                    if (action == 'move') {
                        return obj.db.getForDomain(command.to, domain).then(function(targets) {
                            if (targets.length != 1 || targets[0].type != 'folder') throw new Error('Target folder not found.');
                            if (item.type == 'folder') throw new Error('Folder moves are not supported in this release.');
                            return obj.db.update(item._id, { path: targets[0].path });
                        }).then(function() { result(true, 'Script moved.'); });
                    }
                }).catch(fail);
            });
            return;
        }

        if (action == 'newVar' || action == 'editVar' || action == 'deleteVar') {
            requirePermission('variables', function() {
                var validScopes = ['global', 'script', 'mesh', 'node'];
                if (action == 'newVar') {
                    var varName = obj.cleanName(command.name);
                    if (validScopes.indexOf(command.scope) < 0) { result(false, 'Invalid variable scope.'); return; }
                    obj.db.addVariable(varName, command.scope, command.scopeTarget || null, String(command.value || ''), domain).then(function() { result(true, 'Variable created.'); }).catch(fail);
                    return;
                }
                obj.db.getForDomain(command.id, domain).then(function(found) {
                    if (found.length != 1 || found[0].type != 'variable') throw new Error('Variable not found.');
                    if (action == 'deleteVar') return obj.db.delete(found[0]._id);
                    var varName = obj.cleanName(command.name);
                    if (validScopes.indexOf(command.scope) < 0) throw new Error('Invalid variable scope.');
                    return obj.db.update(found[0]._id, { name: varName, scope: command.scope, scopeTarget: command.scopeTarget || null, value: String(command.value || '') });
                }).then(function() { result(true, action == 'deleteVar' ? 'Variable deleted.' : 'Variable saved.'); }).catch(fail);
            });
            return;
        }

        result(false, 'Unknown ScriptTask action.');
    };
    
    return obj;
}
