'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scripttask } = require('../scripttask');

function fixture() {
    const visible = 'node/domain/visible';
    const schedules = Array.from({ length: 254 }, (_, i) => ({
        _id: 'schedule-' + i, domain: 'domain', node: visible, scriptId: 'script'
    }));
    schedules.push(
        { _id: 'hidden', domain: 'domain', node: 'node/domain/hidden' },
        { _id: 'foreign', domain: 'another', node: visible }
    );
    const jobs = [
        { jobSchedule: 'schedule-0', completeTime: null },
        { jobSchedule: 'schedule-0', completeTime: 100 },
        { jobSchedule: 'schedule-253', completeTime: null },
        { jobSchedule: 'hidden', completeTime: null }
    ];
    let operationResult;
    const webserver = {
        GetNodeWithRights(domain, user, id, callback) {
            callback({ _id: id }, 0xFFFFFFFF, id === visible);
        }
    };
    const plugin = scripttask({
        parent: {
            config: { domains: { domain: {} } }, webserver,
            DispatchEvent(targets, source, event) {
                if (event.pluginaction === 'operationResult') operationResult(event);
            }
        }
    });
    plugin.db = {
        async getJobSchedulesByIds(ids, domain) {
            return schedules.filter(schedule => ids.includes(schedule._id) && schedule.domain === domain);
        },
        async deletePendingJobsForSchedules(ids) {
            for (let i = jobs.length - 1; i >= 0; i--) {
                if (ids.includes(jobs[i].jobSchedule) && jobs[i].completeTime === null) jobs.splice(i, 1);
            }
        },
        async deleteJobSchedules(ids, domain) {
            let deletedCount = 0;
            for (let i = schedules.length - 1; i >= 0; i--) {
                if (ids.includes(schedules[i]._id) && schedules[i].domain === domain) {
                    schedules.splice(i, 1);
                    deletedCount++;
                }
            }
            return { deletedCount };
        }
    };
    function action(command) {
        return new Promise(resolve => {
            operationResult = resolve;
            plugin.serveraction(command, { user: { _id: 'user/domain/operator' } }, webserver);
        });
    }
    return { plugin, schedules, jobs, action };
}

test('bulk deletion removes only selected accessible schedules and their incomplete runs', async () => {
    const { schedules, jobs, action } = fixture();
    const response = await action({
        pluginaction: 'deleteSchedules', ids: ['schedule-0', 'schedule-0', 'hidden', 'foreign', 'missing']
    });
    assert.equal(response.ok, true);
    assert.equal(response.message, '1 schedule deleted. 3 schedules were unavailable.');
    assert.equal(schedules.length, 255);
    assert.deepEqual(jobs, [
        { jobSchedule: 'schedule-0', completeTime: 100 },
        { jobSchedule: 'schedule-253', completeTime: null },
        { jobSchedule: 'hidden', completeTime: null }
    ]);
});

test('deleting all 254 selected schedules leaves the other schedules intact', async () => {
    const { schedules, action } = fixture();
    const response = await action({ pluginaction: 'deleteSchedules', ids: schedules.slice(0, 254).map(schedule => schedule._id) });
    assert.equal(response.ok, true);
    assert.equal(response.message, '254 schedules deleted.');
    assert.deepEqual(schedules.map(schedule => schedule._id), ['hidden', 'foreign']);
});

test('deletion waits for schedule generation and clears the run it queued', async () => {
    const { plugin, schedules, jobs, action } = fixture();
    let releaseInsert;
    let insertStarted;
    const started = new Promise(resolve => { insertStarted = resolve; });
    plugin.determineNextJobTime = () => 100;
    Object.assign(plugin.db, {
        async getSchedulesDueForJob() { return schedules.filter(schedule => schedule._id === 'schedule-1'); },
        async get() { return [{ name: 'script' }]; },
        async getIncompleteJobsForSchedule() { return []; },
        async addJob(job) {
            await new Promise(resolve => { releaseInsert = resolve; insertStarted(); });
            jobs.push({ jobSchedule: job.jobSchedule, completeTime: null });
        },
        async update() {}
    });
    const processing = plugin.makeJobsFromSchedules();
    await started;
    const deletion = action({ pluginaction: 'deleteSchedule', id: 'schedule-1' });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(schedules.some(schedule => schedule._id === 'schedule-1'));
    releaseInsert();
    await processing;
    assert.equal((await deletion).ok, true);
    assert.ok(!schedules.some(schedule => schedule._id === 'schedule-1'));
    assert.ok(!jobs.some(job => job.jobSchedule === 'schedule-1'));
});
