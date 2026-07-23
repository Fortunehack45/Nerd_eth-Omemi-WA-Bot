var fs = require('fs');
var path = require('path');
var { loadJson, saveJson } = require('../utils/helpers');
var config = require('../../config');

var SCHEDULE_FILE = path.join(__dirname, '..', '..', 'storage', 'schedules.json');
var CHECK_INTERVAL = 10000; // Check every 10 seconds for precise execution
var interval = null;
var sockRef = null;

function cleanTargetJid(rawTarget, defaultTarget) {
  if (!rawTarget) return defaultTarget || '';
  if (typeof rawTarget !== 'string') return defaultTarget || '';
  
  var trimmed = rawTarget.trim();

  if (trimmed.endsWith('@g.us')) return trimmed;
  if (trimmed.endsWith('@s.whatsapp.net')) return trimmed;

  var digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length >= 7) {
    return digits + '@s.whatsapp.net';
  }

  return defaultTarget || trimmed;
}

function getSchedules() {
  return loadJson(SCHEDULE_FILE, []);
}

function saveSchedules(schedules) {
  saveJson(SCHEDULE_FILE, schedules);
}

function generateId() {
  return 'sched_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
}

function createSchedule(name, type, timeConfig, message, target) {
  var schedules = getSchedules();
  var id = generateId();
  var formattedTarget = cleanTargetJid(target, (config.ownerNumber || '') + '@s.whatsapp.net');

  var schedule = {
    id: id,
    name: name,
    type: type,
    timeConfig: timeConfig,
    message: message,
    target: formattedTarget,
    enabled: true,
    createdAt: Date.now(),
    lastRun: null,
    nextRun: calculateNextRun(type, timeConfig),
    runCount: 0,
  };
  schedules.push(schedule);
  saveSchedules(schedules);
  return { success: true, schedule: schedule };
}

function calculateNextRun(type, tc) {
  var now = new Date();
  var next = new Date(now);

  switch (type) {
    case 'daily': {
      var parts = tc.time.split(':');
      next.setHours(parseInt(parts[0]) || 8, parseInt(parts[1]) || 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    }
    case 'once':
    case 'timer': {
      if (tc.delayMs) {
        next = new Date(now.getTime() + tc.delayMs);
      } else if (tc.time) {
        var parts = tc.time.split(':');
        next.setHours(parseInt(parts[0]) || 8, parseInt(parts[1]) || 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
      } else if (tc.minutes) {
        next = new Date(now.getTime() + (tc.minutes * 60000));
      }
      break;
    }
    case 'weekly': {
      var targetDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf((tc.day || 'mon').toLowerCase());
      if (targetDay === -1) targetDay = 1;
      var parts = tc.time.split(':');
      next.setHours(parseInt(parts[0]) || 8, parseInt(parts[1]) || 0, 0, 0);
      while (next.getDay() !== targetDay || next <= now) {
        next.setDate(next.getDate() + 1);
      }
      break;
    }
    case 'monthly': {
      var day = parseInt(tc.day) || 1;
      var parts = tc.time.split(':');
      next.setDate(day);
      next.setHours(parseInt(parts[0]) || 8, parseInt(parts[1]) || 0, 0, 0);
      if (next <= now) next.setMonth(next.getMonth() + 1);
      break;
    }
    case 'yearly': {
      var monthDay = (tc.date || '01-01').split('-');
      next.setMonth((parseInt(monthDay[0]) || 1) - 1, parseInt(monthDay[1]) || 1);
      var parts = tc.time.split(':');
      next.setHours(parseInt(parts[0]) || 8, parseInt(parts[1]) || 0, 0, 0);
      if (next <= now) next.setFullYear(next.getFullYear() + 1);
      break;
    }
    case 'interval': {
      var mins = parseInt(tc.minutes) || 60;
      next.setMinutes(next.getMinutes() + mins);
      break;
    }
    default:
      return null;
  }
  return next.getTime();
}

function listSchedules() {
  return getSchedules();
}

function getSchedule(id) {
  var schedules = getSchedules();
  return schedules.find(function(s) { return s.id === id; }) || null;
}

function updateSchedule(id, updates) {
  var schedules = getSchedules();
  var idx = schedules.findIndex(function(s) { return s.id === id; });
  if (idx === -1) return { error: 'Schedule not found.' };
  Object.assign(schedules[idx], updates);
  if (updates.target) {
    schedules[idx].target = cleanTargetJid(updates.target, schedules[idx].target);
  }
  if (updates.timeConfig || updates.type) {
    schedules[idx].nextRun = calculateNextRun(schedules[idx].type, schedules[idx].timeConfig);
  }
  saveSchedules(schedules);
  return { success: true, schedule: schedules[idx] };
}

function deleteSchedule(id) {
  var schedules = getSchedules();
  var idx = schedules.findIndex(function(s) { return s.id === id; });
  if (idx === -1) return { error: 'Schedule not found.' };
  var removed = schedules.splice(idx, 1)[0];
  saveSchedules(schedules);
  return { success: true, schedule: removed };
}

function toggleSchedule(id) {
  var schedules = getSchedules();
  var idx = schedules.findIndex(function(s) { return s.id === id; });
  if (idx === -1) return { error: 'Schedule not found.' };
  schedules[idx].enabled = !schedules[idx].enabled;
  if (schedules[idx].enabled) {
    schedules[idx].nextRun = calculateNextRun(schedules[idx].type, schedules[idx].timeConfig);
  }
  saveSchedules(schedules);
  return { success: true, enabled: schedules[idx].enabled, schedule: schedules[idx] };
}

var executing = new Set();

async function executeSchedule(schedule) {
  if (executing.has(schedule.id)) return;
  executing.add(schedule.id);
  try {
    if (!sockRef) return;
    var targetJid = cleanTargetJid(schedule.target, sockRef?.user?.id);
    var msg = '📅 *Scheduled Task: ' + schedule.name + '*\n\n' + schedule.message;
    await sockRef.sendMessage(targetJid, { text: msg });
    console.log('[Scheduler] Executed schedule "' + schedule.name + '" to ' + targetJid);
    var schedules = getSchedules();
    var idx = schedules.findIndex(function(s) { return s.id === schedule.id; });
    if (idx !== -1) {
      if (schedules[idx].type === 'once' || schedules[idx].type === 'timer') {
        schedules.splice(idx, 1);
      } else {
        schedules[idx].lastRun = Date.now();
        schedules[idx].runCount = (schedules[idx].runCount || 0) + 1;
        schedules[idx].nextRun = calculateNextRun(schedules[idx].type, schedules[idx].timeConfig);
      }
      saveSchedules(schedules);
    }
  } catch (err) {
    console.error('[Scheduler Execution Error]', err.message);
  } finally {
    executing.delete(schedule.id);
  }
}

async function checkSchedules() {
  var { isFeatureDisabled } = require('./featureService');
  if (isFeatureDisabled('schedule')) return;

  var schedules = getSchedules();
  var now = Date.now();
  for (var s of schedules) {
    if (!s.enabled) continue;
    if (s.nextRun && s.nextRun <= now) {
      await executeSchedule(s);
    }
  }
}

function startScheduler(sock) {
  sockRef = sock;
  if (interval) clearInterval(interval);
  interval = setInterval(checkSchedules, CHECK_INTERVAL);
  checkSchedules(); // run immediate check upon startup
  console.log('Scheduler started (check interval: ' + (CHECK_INTERVAL / 1000) + 's)');
  return { success: true };
}

function stopScheduler() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

module.exports = {
  init: startScheduler,
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  deleteSchedule,
  toggleSchedule,
  startScheduler,
  stopScheduler,
};
