'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scripttask } = require('../scripttask');

function scenario() {
    const domain = 'site';
    const user = { _id: 'user/site/admin', name: 'admin' };
    const now = Math.floor(Date.now() / 1000);
    const script = { _id: 'script', name: 'Deploy script', type: 'script', content: '' };
    const visible = new Set(['device-1', 'device-2', 'device-3']);
    const scheduled = { domain, scriptId: script._id, scheduledBy: user.name, recur: 'hourly',
        interval: 1, startAt: now - 3600, endAt: now + 7200 };
    const schedules = [
        { ...scheduled, _id: 'schedule-1', node: 'device-1', lastRun: now - 1800 },
        { ...scheduled, _id: 'schedule-2', node: 'device-2', lastOutcome: 'reported' },
        { ...scheduled, _id: 'schedule-3', node: 'device-3', deploymentId: 'separate-rollout' }
    ];
    const jobs = [
        { _id: 'waiting', domain, scriptId: script._id, node: 'device-1', jobSchedule: 'schedule-1', completeTime: null, dispatchTime: null },
        { _id: 'sent', domain, scriptId: script._id, node: 'device-2', jobSchedule: 'schedule-2', completeTime: null, dispatchTime: now },
        { _id: 'hidden', domain, scriptId: script._id, node: 'hidden-device', completeTime: null, dispatchTime: null },
        { _id: 'foreign', domain: 'other', scriptId: script._id, node: 'device-1', completeTime: null, dispatchTime: null },
        { _id: 'failed', domain, scriptId: script._id, node: 'device-1', jobSchedule: 'schedule-1', completeTime: now - 1800, errorVal: 'DNS failure' }
    ];
    let response;
    const delivered = [], webserver = {
        wsagents: { 'device-1': { send: text => delivered.push(JSON.parse(text)) } },
        GetNodeWithRights(domainConfig, requester, id, callback) {
            callback({ _id: id }, 0xFFFFFFFF, visible.has(id));
        }
    };
    const plugin = scripttask({ parent: {
        config: { domains: { [domain]: {} } }, webserver,
        DispatchEvent(targets, source, event) { if (event.pluginaction === 'operationResult') response(event); }
    } });
    plugin.cleanHistory = () => {};
    plugin.db = {
        async ensureDomainDefaults() {},
        async getScriptTree() { return [script]; },
        async getJobHistory() { return []; },
        async getVariables() { return []; },
        async getJobSchedules(requestedDomain) { return schedules.filter(row => row.domain === requestedDomain); },
        async getSchedulesDueForJob() { return []; },
        async getPausedScheduleIds() { return schedules.filter(row => row.paused); },
        async getPendingJobs(nodes) { return jobs.filter(job => nodes.includes(job.node) && job.completeTime == null); },
        async getScheduleJobs(ids, requestedDomain, completed) {
            return jobs.filter(job => ids.includes(job.jobSchedule) && job.domain === requestedDomain &&
                (completed ? job.completeTime != null && !job.jobState : job.completeTime == null));
        },
        async getOpenJobs(requestedDomain, ids) {
            return jobs.filter(job => job.domain === requestedDomain && job.completeTime == null && (!ids || ids.includes(job._id)));
        },
        async cancelJobs(ids, requestedDomain, dispatched, changes) {
            const selected = jobs.filter(job => ids.includes(job._id) && job.domain === requestedDomain &&
                job.completeTime == null && (job.dispatchTime != null) === dispatched);
            selected.forEach(job => Object.assign(job, changes));
            return { modifiedCount: selected.length };
        },
        async updateJobSchedules(ids, requestedDomain, changes) {
            const selected = schedules.filter(row => row.domain === requestedDomain && ids.includes(row._id));
            selected.forEach(row => Object.assign(row, changes));
            return { modifiedCount: selected.length };
        },
        async expireQueuedJobs(time) {
            jobs.filter(job => job.completeTime == null && job.dispatchTime == null && job.expiresAt && job.expiresAt <= time)
                .forEach(job => Object.assign(job, { completeTime: time, jobState: 'expired' }));
        },
        async get() { return [script]; },
        async getForDomain() { return [script]; },
        async update(id, changes) { Object.assign(jobs.find(job => job._id === id), changes); }
    };
    const load = () => plugin.getDashboardData(user, { deploymentData: true, queueData: true });
    const action = command => new Promise(resolve => {
        response = resolve;
        plugin.serveraction(command, { user, domain: {} }, webserver);
    });
    return { plugin, now, schedules, jobs, visible, delivered, load, action };
}

test('legacy schedules form a rollout and new IDs keep identical schedules separate', async () => {
    const { load } = scenario();
    const data = await load();
    assert.equal(data.deployments.length, 2);
    const legacy = data.deployments.find(group => group.id.startsWith('legacy-'));
    assert.deepEqual(legacy.targets.map(target => target.node), ['device-1', 'device-2']);
    assert.equal(legacy.reported, 1);
    assert.equal(legacy.errors, 1);
    assert.equal(data.deployments[1].id, 'separate-rollout');
    assert.deepEqual(data.queue.map(job => job._id), ['waiting', 'sent']);
});

test('pausing a rollout holds its waiting jobs until resumed', async () => {
    const { plugin, load, action, schedules, delivered } = scenario();
    const id = (await load()).deployments[0].id;
    assert.equal((await action({ pluginaction: 'pauseDeployment', id })).ok, true);
    assert.ok(schedules.slice(0, 2).every(row => row.paused && row.deploymentId === id));
    await plugin.queueRun();
    assert.deepEqual(delivered.map(job => job.jobId), ['foreign']);
    assert.equal((await action({ pluginaction: 'resumeDeployment', id })).ok, true);
    await plugin.queueRun();
    assert.ok(delivered.some(job => job.jobId === 'waiting'));
});

test('deployment controls require visibility of every target', async () => {
    const { visible, load, action, schedules } = scenario();
    visible.delete('device-2');
    const group = (await load()).deployments[0];
    assert.equal(group.targets.length, 1);
    assert.equal(group.canManage, false);
    assert.equal((await action({ pluginaction: 'pauseDeployment', id: group.id })).ok, false);
    assert.equal(schedules.some(row => row.paused), false);
});

test('queue cancellation keeps separate guards for unsent jobs and stopped retries', async () => {
    const { action, jobs } = scenario();
    const selection = ['waiting', 'sent', 'hidden', 'foreign', 'failed'];
    const canceled = await action({ pluginaction: 'cancelQueuedJobs', ids: selection });
    assert.equal(canceled.message, 'Canceled 1 job. 4 jobs were unavailable.');
    assert.equal(jobs[0].jobState, 'canceled');
    assert.equal(jobs[0].cancelReason, 'Canceled in queue');
    assert.equal(jobs[1].completeTime, null);
    const stopped = await action({ pluginaction: 'cancelQueuedJobs', ids: selection, dispatched: true });
    assert.equal(stopped.message, 'Stopped retries for 1 job. 4 jobs were unavailable.');
    assert.equal(jobs[1].cancelReason, 'Retries stopped');
    assert.ok(jobs[1].dispatchTime);
    assert.ok(jobs.slice(2).every(job => !job.jobState));
});

test('retry failed promotes its waiting job without adding a duplicate', async () => {
    const { plugin, now, load, action, jobs } = scenario();
    plugin.queueRun = async () => {};
    jobs[0].dontQueueUntil = now + 3600;
    const id = (await load()).deployments[0].id;
    const retry = await action({ pluginaction: 'retryDeployment', id });
    assert.equal(retry.message, 'Queued retries on 1 device.');
    assert.ok(jobs[0].dontQueueUntil < now + 10);
    assert.equal(jobs[1].dontQueueUntil, undefined);
    assert.equal(jobs.length, 5);
});

test('editing a rollout retires waiting attempts and leaves dispatched jobs intact', async () => {
    const { plugin, now, load, action, jobs, schedules } = scenario();
    plugin.queueRun = async () => {};
    const id = (await load()).deployments[0].id;
    const edit = await action({ pluginaction: 'editDeployment', id, schedule: { recur: 'daily', interval: 2, startAt: now + 86400 } });
    assert.equal(edit.ok, true);
    assert.ok(schedules.slice(0, 2).every(row => row.recur === 'daily' && row.interval === 2 && row.deploymentId === id));
    assert.equal(jobs[0].cancelReason, 'Schedule changed');
    assert.equal(jobs[1].completeTime, null);
});

test('expired waiting jobs are marked before dispatch', async () => {
    const { plugin, now, jobs, delivered } = scenario();
    jobs[0].expiresAt = now - 1;
    jobs[1].expiresAt = now - 1;
    await plugin.queueRun();
    assert.equal(jobs[0].jobState, 'expired');
    assert.equal(jobs[1].completeTime, null);
    assert.deepEqual(delivered.map(job => job.jobId), ['foreign']);
});
