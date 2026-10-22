/** 
* @description MeshCentral-ScriptTask database module
* @author Ryan Blenis
* @copyright Ryan Blenis 2019
* @license Apache-2.0
*/

"use strict";
var Datastore = null;
var formatId = null;

module.exports.CreateDB = function(meshserver) {
    var obj = {};
    var NEMongo = require(__dirname + '/nemongo.js');
    module.paths.push(require('path').join(meshserver.parentpath, 'node_modules')); // we need to push the node_modules folder for nedb
    obj.dbVersion = 1;
    
    obj.initFunctions = function () {
        obj.domainFilter = function(domain) {
            if (domain == null) domain = '';
            if (domain === '') return { $or: [ { domain: '' }, { domain: { $exists: false } } ] };
            return { domain: domain };
        };

        obj.withDomain = function(query, domain) {
            return { $and: [ query, obj.domainFilter(domain) ] };
        };

        obj.updateDBVersion = function(new_version) {
          return obj.scriptFile.updateOne({type: "db_version"}, { $set: {version: new_version} }, {upsert: true});
        };
        
        obj.getDBVersion = function() {
            return new Promise(function(resolve, reject) {
                obj.scriptFile.find( { type: "db_version" } ).project( { _id: 0, version: 1 } ).toArray(function(err, vers){
                    if (vers.length == 0) resolve(1);
                    else resolve(vers[0]['version']);
                });
            });
        };

        obj.addScript = function(name, content, path, filetype, domain) {
            if (path == null) path = "Shared"
            if (filetype == 'bash') content = content.split('\r\n').join('\n').split('\r').join('\n');
            var sObj = { 
                type: 'script',
                path: path,
                name: name,
                content: content,
                contentHash: require('crypto').createHash('sha384').update(content).digest('hex'),
                filetype: filetype,
                domain: domain || ''
            };
            return obj.scriptFile.insertOne(sObj);
        };
        
        obj.addFolder = function(name, path, domain) {
            var sObj = {
                type: 'folder',
                path: path,
                name: name,
                domain: domain || ''
            };
            return obj.scriptFile.insertOne(sObj);
        };
        
        obj.getScriptTree = function(domain) {
            return obj.scriptFile.find(
                obj.withDomain({ type:
                    { $in: [ 'script', 'folder' ] }
                }, domain)
            ).sort(
                { path: 1, type: 1, name: 1 }
            ).project(
                { name: 1, path: 1, type: 1, filetype: 1 }
            ).toArray();
        };
        
        obj.update = function(id, args) {
            id = formatId(id);
            if (args.type == 'script' && args.content !== null) { 
                if (args.filetype == 'bash') {
                    args.content = args.content.split('\r\n').join('\n').split('\r').join('\n');
                }
                args.contentHash = require('crypto').createHash('sha384').update(args.content).digest('hex');
            }
            return obj.scriptFile.updateOne( { _id: id }, { $set: args } );
        };
        obj.delete = function(id) {
            id = formatId(id);
            return obj.scriptFile.deleteOne( { _id: id } );
        };
        obj.deleteByPath = function(path, domain) {
          var query = { path: path, type: { $in: ['script', 'folder'] } };
          return obj.scriptFile.deleteMany(domain == null ? query : obj.withDomain(query, domain));
        };
        obj.deleteSchedulesForScript = function(id, domain) {
            id = formatId(id);
            var query = { type: 'jobSchedule', scriptId: id };
            return obj.scriptFile.deleteMany(domain == null ? query : obj.withDomain(query, domain));
        };
        obj.deletePendingJobsForScript = function(id, domain) {
            id = formatId(id);
            var query = { type: 'job', scriptId: id, completeTime: null };
            return obj.scriptFile.deleteMany(domain == null ? query : obj.withDomain(query, domain));
        };
        obj.getByPath = function(path, domain) {
          var query = { type: { $in: [ 'script', 'folder' ] }, path: path };
          return obj.scriptFile.find(domain == null ? query : obj.withDomain(query, domain)).toArray();
        };
        obj.get = function(id) {
            if (id == null || id == 'null') return new Promise(function(resolve, reject) { resolve([]); });
            id = formatId(id);
            return obj.scriptFile.find( { _id: id } ).toArray();
        };
        obj.getForDomain = function(id, domain) {
            if (id == null || id == 'null') return Promise.resolve([]);
            id = formatId(id);
            return obj.scriptFile.find(obj.withDomain({ _id: id }, domain)).toArray();
        };
        obj.addJob = function(passedObj) {
          var nowTime = Math.floor(new Date() / 1000);
          var defaultObj = { 
              type: 'job',
              queueTime: nowTime,
              dontQueueUntil: nowTime,
              dispatchTime: null,
              completeTime: null,
              node: null,
              scriptId: null,
              scriptName: null, // in case the original reference is deleted in the future
              replaceVars: null,
              returnVal: null,
              errorVal: null,
              returnAct: null,
              runBy: null,
              jobSchedule: null
          };
          var jObj = {...defaultObj, ...passedObj};
          
          if (jObj.node == null || jObj.scriptId == null) { console.log('PLUGIN: SciptTask: Could not add job'); return false; }
          
          return obj.scriptFile.insertOne(jObj);
        };
        obj.addJobSchedule = function(schedObj) {
            schedObj.type = 'jobSchedule';
            if (schedObj.node == null || schedObj.scriptId == null) { console.log('PLUGIN: SciptTask: Could not add job schedule'); return false; }
            return obj.scriptFile.insertOne(schedObj);
        };
        obj.removeJobSchedule = function (id) {
            return obj.delete(id);
        };
        obj.getSchedulesDueForJob = function(scheduleId) {
            var nowTime = Math.floor(new Date() / 1000);
            var scheduleIdLimiter = {};
            if (scheduleId != null) {
                scheduleIdLimiter._id = scheduleId;
            }
            return obj.scriptFile.find( { 
                type: 'jobSchedule',
                // startAt: { $gte: nowTime },
                $and: [
                    { $or: [ { endAt: null }, { endAt: { $gte: nowTime } } ] },
                    { $or: [ { nextRun: null }, { nextRun: { $lte: (nowTime + 60) } } ] }
                ],
                ...scheduleIdLimiter
            }).toArray();
        };
        obj.deletePendingJobsForNode = function(node) {
            return obj.scriptFile.deleteMany({ 
                type: 'job', 
                node: node,
                completeTime: null,
            });
        };
        obj.getPendingJobs = function(nodeScope) {
          if (nodeScope == null || !Array.isArray(nodeScope)) {
            return false;
          }
          // return jobs that has online nodes and queue time requirements have been met
          return obj.scriptFile.find( { 
              type: 'job', 
              node: { $in: nodeScope },
              completeTime: null,
              //dispatchTime: null,
              $or: [
                  { dontQueueUntil: null }, 
                  { dontQueueUntil: { $lte: Math.floor(new Date() / 1000) } }
              ]
          }).toArray();
        };
        obj.getPendingJobForNodeScript = function(nodeId, scriptId) {
            return obj.scriptFile.find({ type: 'job', node: nodeId, scriptId: formatId(scriptId), completeTime: null }).limit(1).toArray();
        };
        obj.getJobNodeHistory = function(nodeId, domain) {
            return obj.scriptFile.find( { 
                type: 'job', 
                node: nodeId,
                ...(domain == null ? {} : obj.domainFilter(domain))
            }).sort({ queueTime: -1 }).limit(500).toArray();
        };
        obj.getJobScriptHistory = function(scriptId, domain) {
            return obj.scriptFile.find( { 
                type: 'job', 
                scriptId: scriptId,
                ...(domain == null ? {} : obj.domainFilter(domain))
            }).sort({ completeTime: -1, queueTime: -1 }).limit(500).toArray();
        };
        obj.getJobHistory = function(domain, limit) {
            return obj.scriptFile.find(obj.withDomain({ type: 'job' }, domain))
                .sort({ completeTime: -1, queueTime: -1 }).limit(limit || 1000).toArray();
        };
        obj.updateScriptJobName = function(scriptId, scriptName) {
            return obj.scriptFile.updateMany({ type: 'job', scriptId: scriptId }, { $set: { scriptName: scriptName } });    
        };
        obj.getJobSchedulesForScript = function(scriptId, domain) {
            var query = { type: 'jobSchedule', scriptId: scriptId };
            return obj.scriptFile.find(domain == null ? query : obj.withDomain(query, domain)).toArray();
        };
        obj.getJobSchedulesForNode = function (nodeId) {
            return obj.scriptFile.find( { type: 'jobSchedule', node: nodeId } ).toArray();
        };
        obj.getJobSchedules = function(domain) {
            return obj.scriptFile.find(obj.withDomain({ type: 'jobSchedule' }, domain)).sort({ startAt: -1 }).toArray();
        };
        obj.getIncompleteJobsForSchedule = function (schedId) {
            return obj.scriptFile.find( { type: 'job', jobSchedule: schedId, completeTime: null } ).toArray();
        };
        obj.deletePendingJobsForSchedule = function (schedId) {
            return obj.scriptFile.deleteMany( { type: 'job', jobSchedule: schedId, completeTime: null } );
        };
        obj.deleteOldHistory = function() {
            var nowTime = Math.floor(new Date() / 1000);
            var oldTime = nowTime - (86400 * 90); // 90 days
            return obj.scriptFile.deleteMany( { type: 'job', completeTime: { $lte: oldTime } } );
        };
        obj.addVariable = function(name, scope, scopeTarget, value, domain) {
            var vObj = { 
                type: 'variable',
                name: name,
                scope: scope,
                scopeTarget: scopeTarget,
                value: value,
                domain: domain || ''
            };
            return obj.scriptFile.insertOne(vObj);
        };
        obj.getVariables = function(limiters, domain) {
            if (limiters != null) {
                var find = { 
                    type: 'variable',
                    name: { $in: limiters.names },
                    $or: [ 
                        { scope: 'global' },
                        { $and: [
                            { scope: 'script' },
                            { scopeTarget: limiters.scriptId }
                          ]
                        },
                        { $and: [
                            { scope: 'mesh' },
                            { scopeTarget: limiters.meshId }
                          ]
                        },
                        { $and: [
                            { scope: 'node' },
                            { scopeTarget: limiters.nodeId }
                          ]
                        }
                    ]
                };
                return obj.scriptFile.find(domain == null ? find : obj.withDomain(find, domain)).sort({ name: 1 }).toArray();
            }
            else {
                var query = { type: 'variable' };
                return obj.scriptFile.find(domain == null ? query : obj.withDomain(query, domain)).sort({ name: 1 }).toArray();
            }
        };
        obj.checkDefaults = function() {
            obj.scriptFile.find( { type: 'folder', name: 'Shared', path: 'Shared' } ).toArray()
            .then(found => {
              if (found.length == 0) obj.addFolder('Shared', 'Shared', '');
            })
            .catch(e => { console.log('PLUGIN: ScriptTask: Default folder check failed. Error was: ', e); });
        };
        obj.ensureDomainDefaults = function(domain) {
            return obj.scriptFile.find(obj.withDomain({ type: 'folder', name: 'Shared', path: 'Shared' }, domain)).toArray()
                .then(function(found) { if (found.length == 0) return obj.addFolder('Shared', 'Shared', domain); });
        };
        
        obj.checkDefaults();
    };
    
    if (meshserver.args.mongodb) { // use MongDB
      require('mongodb').MongoClient.connect(meshserver.args.mongodb, { useNewUrlParser: true, useUnifiedTopology: true }, function (err, client) {
          if (err != null) { console.log("Unable to connect to database: " + err); process.exit(); return; }
          
          var dbname = 'meshcentral';
          if (meshserver.args.mongodbname) { dbname = meshserver.args.mongodbname; }
          const db = client.db(dbname);
          
          obj.scriptFile = db.collection('plugin_scripttask');
          obj.scriptFile.indexes(function (err, indexes) {
              // Check if we need to reset indexes
              var indexesByName = {}, indexCount = 0;
              for (var i in indexes) { indexesByName[indexes[i].name] = indexes[i]; indexCount++; }
              if ((indexCount != 7) || (indexesByName['ScriptName1'] == null) || (indexesByName['ScriptPath1'] == null) || (indexesByName['JobTime1'] == null) || (indexesByName['JobNode1'] == null) || (indexesByName['JobScriptID1'] == null) || (indexesByName['Domain1'] == null)) {
                  // Reset all indexes
                  console.log('Resetting plugin (ScriptTask) indexes...');
                  obj.scriptFile.dropIndexes(function (err) {
                      obj.scriptFile.createIndex({ name: 1 }, { name: 'ScriptName1' });
                      obj.scriptFile.createIndex({ path: 1 }, { name: 'ScriptPath1' });
                      obj.scriptFile.createIndex({ queueTime: 1 }, { name: 'JobTime1' });
                      obj.scriptFile.createIndex({ node: 1 }, { name: 'JobNode1' });
                      obj.scriptFile.createIndex({ scriptId: 1 }, { name: 'JobScriptID1' });
                      obj.scriptFile.createIndex({ domain: 1 }, { name: 'Domain1' });
                  }); 
              }
          });
          
          
          if (typeof require('mongodb').ObjectID == 'function') {
              formatId = require('mongodb').ObjectID;
          } else {
              formatId = require('mongodb').ObjectId;
          }
          obj.initFunctions();
    });  
    } else { // use NeDb
        try { Datastore = require('@seald-io/nedb'); } catch (ex) { } // This is the NeDB with Node 23 support.
        if (Datastore == null) {
            try { Datastore = require('@yetzt/nedb'); } catch (ex) { } // This is the NeDB with fixed security dependencies.
            if (Datastore == null) { Datastore = require('nedb'); } // So not to break any existing installations, if the old NeDB is present, use it.
        }
        if (obj.scriptFilex == null) {
            obj.scriptFilex = new Datastore({ filename: meshserver.getConfigFilePath('plugin-scripttask.db'), autoload: true });
            obj.scriptFilex.setAutocompactionInterval(40000);
            obj.scriptFilex.ensureIndex({ fieldName: 'name' });
            obj.scriptFilex.ensureIndex({ fieldName: 'path' });
            obj.scriptFilex.ensureIndex({ fieldName: 'queueTime' });
            obj.scriptFilex.ensureIndex({ fieldName: 'node' });
            obj.scriptFilex.ensureIndex({ fieldName: 'scriptId' });
            obj.scriptFilex.ensureIndex({ fieldName: 'domain' });
        }
        obj.scriptFile = new NEMongo(obj.scriptFilex);
        formatId = function(id) { return id; };
        obj.initFunctions();
    }
    
    return obj;
}
