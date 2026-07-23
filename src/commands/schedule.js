var { createSchedule, listSchedules, getSchedule, deleteSchedule, toggleSchedule } = require('../services/schedulerService');

var HELP = '*📅 Schedule Manager* (Admin only)\n\nSchedule recurring tasks — messages sent automatically at set times.\n\n*Usage:* `!schedule <subcommand> [args] [flags]`\n\n*Subcommands:*\n  `create`     Create a new scheduled task\n  `list`       List all scheduled tasks\n  `info`       Show details for a specific schedule\n  `toggle`     Enable/disable a schedule\n  `delete`     Remove a schedule\n\n*Schedule Types:*\n  daily    — Runs every day at a specific time\n  weekly   — Runs on a specific day of the week\n  monthly  — Runs on a specific day of the month\n  yearly   — Runs on a specific date each year\n  interval — Runs every N minutes (min: 10)\n\n*Flags for create:*\n  `--type, -t`     daily|weekly|monthly|yearly|interval (required)\n  `--time, -ti`    Time in 24h format, e.g. 08:00 or 14:30 (default: 08:00)\n  `--day, -d`      Day of week for weekly: mon, tue, wed, thu, fri, sat, sun (default: mon)\n  `--date, -dt`    Date for monthly (1-31) or yearly (MM-DD, e.g. 12-25)\n  `--minutes, -m`  Minutes between runs for interval type (min: 10)\n  `--target, -ta`  JID to send to (default: owner)\n\n*Examples:*\n  `!schedule create Good Morning --type daily --time 08:00 --target 2348012345678@s.whatsapp.net`\n  `!schedule create Weekend Vibes --type weekly --day fri --time 17:00`\n  `!schedule create Monthly Report --type monthly --date 1 --time 09:00`\n  `!schedule create New Year --type yearly --date 01-01 --time 00:00`\n  `!schedule create Keep Alive --type interval --minutes 30`';

module.exports = {
  name: 'schedule',
  alias: ['sched', 'cron', 'timer', 'recurring'],
  description: 'Schedule recurring tasks (admin only)',
  usage: '!schedule create | list | info | toggle | delete',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parts = args.split(/\s+/);
    var sub = parts[0].toLowerCase();
    var rest = parts.slice(1);
    var flags = {};
    for (var i = 0; i < rest.length; i++) {
      if (rest[i].startsWith('--') || rest[i].startsWith('-')) {
        var key = rest[i].replace(/^-+/, '');
        var next = rest[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    }
    var positional = rest.filter(function(p) { return !p.startsWith('-'); });

    switch (sub) {
      case 'create':
      case 'add':
      case 'new': {
        var name = positional.join(' ');
        var type = flags.type || flags.t;
        if (!name) return sock.sendMessage(sender, { text: 'Usage: `!schedule create <name> --type <type> [flags]`\n\n' + HELP });
        if (!type || !['daily', 'weekly', 'monthly', 'yearly', 'interval'].includes(type)) {
          return sock.sendMessage(sender, { text: 'Invalid or missing type. Valid: daily, weekly, monthly, yearly, interval\n\n' + HELP });
        }

        var timeConfig = { time: flags.time || flags.ti || '08:00' };

        if (type === 'weekly') {
          timeConfig.day = flags.day || flags.d || 'mon';
        } else if (type === 'monthly') {
          timeConfig.day = flags.date || flags.dt || '1';
        } else if (type === 'yearly') {
          timeConfig.date = flags.date || flags.dt || '01-01';
        } else if (type === 'interval') {
          var mins = parseInt(flags.minutes || flags.m);
          if (!mins || mins < 10) return sock.sendMessage(sender, { text: 'Interval must be at least 10 minutes. Use `--minutes, -m <number>`' });
          timeConfig.minutes = mins;
        }

        var rawTarget = flags.target || flags.ta;
        var targetJid = sender;

        if (rawTarget) {
          var trimmed = String(rawTarget).trim();
          if (!trimmed.endsWith('@g.us')) {
            var digits = trimmed.replace(/[^0-9]/g, '');
            if (digits && digits.length >= 7) {
              if (sock && typeof sock.onWhatsApp === 'function') {
                try {
                  var onWaRes = await sock.onWhatsApp(digits);
                  if (onWaRes && onWaRes.length > 0) {
                    var match = onWaRes.find(function(r) { return r.exists; });
                    if (match && match.exists) {
                      targetJid = match.jid || (digits + '@s.whatsapp.net');
                    } else {
                      return sock.sendMessage(sender, {
                        text: '❌ *Target Error:* Phone number `+' + digits + '` is not registered on WhatsApp. Task creation cancelled.'
                      });
                    }
                  } else {
                    targetJid = digits + '@s.whatsapp.net';
                  }
                } catch (e) {
                  targetJid = digits + '@s.whatsapp.net';
                }
              } else {
                targetJid = digits + '@s.whatsapp.net';
              }
            }
          } else {
            targetJid = trimmed;
          }
        }

        var result = createSchedule(name, type, timeConfig, name, targetJid);
        if (result.success) {
          var next = new Date(result.schedule.nextRun).toLocaleString();
          await sock.sendMessage(sender, {
            text: '✅ *Schedule Created & Verified!*\n*Name:* ' + result.schedule.name + '\n*Type:* ' + type + '\n*Target:* ' + result.schedule.target + '\n*Next Run:* ' + next + '\n*ID:* `' + result.schedule.id + '`',
          });
        } else {
          await sock.sendMessage(sender, { text: 'Error: ' + (result.error || 'Unknown error') });
        }
        break;
      }

      case 'list':
      case 'ls':
      case 'all': {
        var schedules = listSchedules();
        if (schedules.length === 0) {
          return sock.sendMessage(sender, { text: 'No schedules configured. Create one with `!schedule create <name> --type <type>`' });
        }
        var text = '*📅 Scheduled Tasks*\n\n';
        schedules.forEach(function(s) {
          var status = s.enabled ? '✅ Active' : '⏸ Paused';
          var next = s.nextRun ? new Date(s.nextRun).toLocaleString() : 'N/A';
          text += '▸ *' + s.name + '*\n';
          text += '   Type: ' + s.type + ' | Status: ' + status + '\n';
          text += '   Next: ' + next + ' | Runs: ' + (s.runCount || 0) + '\n';
          text += '   ID: `' + s.id + '`\n\n';
        });
        text += 'Total: ' + schedules.length + ' schedules';
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'info':
      case 'detail':
      case 'show': {
        var id = positional[0];
        if (!id) return sock.sendMessage(sender, { text: 'Usage: `!schedule info <id>`\nGet ID from `!schedule list`' });
        var sched = getSchedule(id);
        if (!sched) return sock.sendMessage(sender, { text: 'Schedule "' + id + '" not found.' });
        var text = '*📅 Schedule: ' + sched.name + '*\n\n';
        text += '*ID:* `' + sched.id + '`\n';
        text += '*Type:* ' + sched.type + '\n';
        text += '*Status:* ' + (sched.enabled ? '✅ Active' : '⏸ Paused') + '\n';
        text += '*Config:* ' + JSON.stringify(sched.timeConfig) + '\n';
        text += '*Target:* ' + sched.target + '\n';
        text += '*Created:* ' + new Date(sched.createdAt).toLocaleString() + '\n';
        text += '*Last Run:* ' + (sched.lastRun ? new Date(sched.lastRun).toLocaleString() : 'Never') + '\n';
        text += '*Next Run:* ' + (sched.nextRun ? new Date(sched.nextRun).toLocaleString() : 'N/A') + '\n';
        text += '*Total Runs:* ' + (sched.runCount || 0) + '\n';
        text += '*Message:* ' + sched.message.substring(0, 200);
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'toggle':
      case 'pause':
      case 'resume':
      case 'enable':
      case 'disable': {
        var id = positional[0];
        if (!id) return sock.sendMessage(sender, { text: 'Usage: `!schedule toggle <id>`' });
        var result = toggleSchedule(id);
        if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
        await sock.sendMessage(sender, { text: '✅ Schedule "' + result.schedule.name + '" is now ' + (result.enabled ? '✅ Active' : '⏸ Paused') });
        break;
      }

      case 'delete':
      case 'del':
      case 'remove': {
        var id = positional[0];
        if (!id) return sock.sendMessage(sender, { text: 'Usage: `!schedule delete <id>`' });
        var result = deleteSchedule(id);
        if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
        await sock.sendMessage(sender, { text: '✅ Schedule "' + result.schedule.name + '" deleted.' });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: 'Unknown subcommand: `' + sub + '`. Use `!schedule --help` for usage.' });
    }
  },
};
