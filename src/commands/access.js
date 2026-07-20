const { isAdmin, addUser, removeUser, toggleFeature, setFeatures, listUsers, lookupByIdentifier } = require('../services/accessControl');
const { parseFlags } = require('../utils/helpers');

var HELP = '*🔐 Access Control* (Admin only)\n\nManage who can use the bot\'s AI features.\n\n*Subcommands:*\n  `list`              List all approved users\n  `add <number>`      Approve a user (default: all features)\n  `remove <number>`   Remove a user\'s access\n  `feature <number> <name>`  Toggle a feature on/off for a user\n\n*Features:*\n  `ai`       AI chat (!ai, automatic responses)\n  `agent`    Multi-agent system (!agent)\n  `imagine`  Image generation (!imagine)\n  `download` Media download (!download)\n  `all`      Grant all features\n\n*Flags:*\n  `--features`, `-f`   Comma-separated features (default: all)\n  `--name`, `-n`       Display name for the user\n\n*Examples:*\n  `!access add 2348012345678`\n  `!access add 2348012345678 --features ai,download --name John`\n  `!access remove 2348012345678`\n  `!access feature 2348012345678 agent`\n  `!access list`';

var FEATURE_LIST = ['ai', 'agent', 'imagine', 'download', 'all'];

module.exports = {
  name: 'access',
  alias: ['permission', 'auth', 'whitelist'],
  description: 'Manage user access to AI features (admin only)',
  usage: '!access <subcommand> [args] [flags]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parsed = parseFlags(args);
    var sub = parsed.positional[0] && parsed.positional[0].toLowerCase();
    var rest = parsed.positional.slice(1).join(' ');
    var flags = parsed.flags;

    if (flags.help || flags.h) {
      return sock.sendMessage(sender, { text: HELP });
    }

    switch (sub) {
      case 'list':
      case 'ls':
      case 'all': {
        var users = listUsers();
        if (users.length === 0) {
          return sock.sendMessage(sender, { text: 'No approved users yet. Add one with `!access add <number>`\n\nNote: Admin always has access to everything.' });
        }
        var text = '*🔐 Approved Users*\n\n';
        users.forEach(function(u) {
          text += '▸ *' + u.name + '* (' + u.number + ')\n';
          text += '   Features: ' + (u.features ? u.features.join(', ') : 'all') + '\n';
          text += '   Approved: ' + new Date(u.approvedAt).toLocaleDateString() + '\n\n';
        });
        text += 'Total: ' + users.length + ' user(s)';
        await sock.sendMessage(sender, { text: text.substring(0, 4000) });
        break;
      }

      case 'add':
      case 'grant':
      case 'allow': {
        var identifier = rest;
        if (!identifier) return sock.sendMessage(sender, { text: 'Usage: `!access add <number> [--features ai,agent] [--name <name>]`' });
        var featureStr = flags.features || flags.f || flags.feature || '';
        var features = featureStr ? featureStr.split(',').map(function(f) { return f.trim().toLowerCase(); }).filter(Boolean) : null;
        var name = flags.name || flags.n || '';
        if (features) {
          var invalid = features.filter(function(f) { return FEATURE_LIST.indexOf(f) === -1; });
          if (invalid.length > 0) {
            return sock.sendMessage(sender, { text: 'Invalid features: ' + invalid.join(', ') + '\nValid: ' + FEATURE_LIST.join(', ') });
          }
        }
        var result = addUser(identifier, features, name);
        if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
        await sock.sendMessage(sender, {
          text: '✅ User approved!\n*Number:* ' + result.user.number + '\n*Name:* ' + result.user.name + '\n*Features:* ' + (result.user.features ? result.user.features.join(', ') : 'all'),
        });
        break;
      }

      case 'remove':
      case 'revoke':
      case 'delete':
      case 'del': {
        var identifier = rest;
        if (!identifier) return sock.sendMessage(sender, { text: 'Usage: `!access remove <number>`' });
        var result = removeUser(identifier);
        if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
        await sock.sendMessage(sender, { text: '✅ User removed: ' + identifier });
        break;
      }

      case 'feature':
      case 'toggle':
      case 'features': {
        var parts = rest.split(/\s+/);
        var ident = parts[0];
        var feature = parts[1] && parts[1].toLowerCase();
        if (!ident || !feature) return sock.sendMessage(sender, { text: 'Usage: `!access feature <number> <feature>`\n\nFeatures: ' + FEATURE_LIST.join(', ') });
        if (FEATURE_LIST.indexOf(feature) === -1) {
          return sock.sendMessage(sender, { text: 'Invalid feature: "' + feature + '"\nValid: ' + FEATURE_LIST.join(', ') });
        }
        var result = toggleFeature(ident, feature);
        if (result.error) return sock.sendMessage(sender, { text: 'Error: ' + result.error });
        await sock.sendMessage(sender, {
          text: '✅ Feature "' + feature + '" ' + (result.enabled ? 'enabled' : 'disabled') + ' for ' + result.user.number + '\nCurrent features: ' + (result.user.features.length ? result.user.features.join(', ') : 'none'),
        });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: 'Unknown subcommand: `' + sub + '`.\n\nUse `!access --help` to see all subcommands.' });
    }
  },
};
