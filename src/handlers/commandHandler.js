const { extractCommand, randomBetween } = require('../utils/helpers');
const config = require('../../config');
const { checkRateLimit, simulateTyping } = require('../services/antiBanService');
const { logCommand } = require('../../server');
const fs = require('fs');
const path = require('path');

const commands = new Map();
const aliases = new Map();
const commandCooldowns = new Map();

function isNumber(jid) {
  return jid.replace(/[^0-9]/g, '');
}

function registerCommand(cmd) {
  if (!cmd.name) return;
  commands.set(cmd.name.toLowerCase(), cmd);
  if (cmd.alias && Array.isArray(cmd.alias)) {
    cmd.alias.forEach(function(a) { aliases.set(a.toLowerCase(), cmd.name.toLowerCase()); });
  }
  if (cmd.alias && typeof cmd.alias === 'string') {
    aliases.set(cmd.alias.toLowerCase(), cmd.name.toLowerCase());
  }
}

function getCommand(name) {
  var lower = name.toLowerCase();
  if (commands.has(lower)) return commands.get(lower);
  if (aliases.has(lower)) return commands.get(aliases.get(lower));
  return null;
}

function loadCommands() {
  var commandsDir = path.join(__dirname, '..', 'commands');
  var files = fs.readdirSync(commandsDir).filter(function(f) { return f.endsWith('.js'); });

  files.forEach(function(file) {
    try {
      var cmd = require(path.join(commandsDir, file));
      registerCommand(cmd);
      if (cmd.restricted) {
        console.log('  [RESTRICTED] ' + cmd.name + ' (' + cmd.restrictedFeature + ')');
      } else if (cmd.adminOnly) {
        console.log('  [ADMIN] ' + cmd.name);
      } else {
        console.log('  [PUBLIC] ' + cmd.name);
      }
    } catch (err) {
      console.error('Failed to load command ' + file + ':', err.message);
    }
  });
}

async function handleCommand(sock, msg, text) {
  var sender = msg.key.remoteJid;
  var isGroup = sender.endsWith('@g.us');
  var senderId = msg.key.participant || sender;
  var pushName = msg.pushName || 'User';

  var extracted = extractCommand(text);
  var command = extracted.command;
  var args = extracted.args;

  var cmd = getCommand(command);
  if (!cmd) return null;

  if (config.antiBan.enabled) {
    var cooldownKey = 'cmd_' + cmd.name + '_' + senderId;
    var now = Date.now();
    if (commandCooldowns.has(cooldownKey)) {
      var lastUsed = commandCooldowns.get(cooldownKey);
      if (now - lastUsed < 2000) return true;
    }
    commandCooldowns.set(cooldownKey, now);
    if (!checkRateLimit('cmd_' + cmd.name, 20)) return true;
  }

  if (cmd.groupOnly && !isGroup) {
    await sock.sendMessage(sender, { text: 'This command can only be used in groups.' });
    return true;
  }

  if (cmd.privateOnly && isGroup) {
    await sock.sendMessage(sender, { text: 'This command can only be used in private chat.' });
    return true;
  }

  try {
    if (config.antiBan.enabled && config.antiBan.humanTyping && !cmd.noTyping) {
      await simulateTyping(sock, sender, args || 'command');
    }
    await cmd.execute(sock, msg, args, {
      sender: sender,
      senderId: senderId,
      pushName: pushName,
      isGroup: isGroup,
      command: command,
    });
    logCommand(command, isNumber(senderId), 'ok');
  } catch (err) {
    console.error('Error executing ' + command + ':', err);
    await sock.sendMessage(sender, { text: 'Error: ' + err.message });
    logCommand(command, isNumber(senderId), 'error: ' + err.message);
  }

  return true;
}

function getCommandsList() {
  var list = [];
  commands.forEach(function(cmd, name) {
    list.push({
      name: cmd.name,
      description: cmd.description || 'No description',
      usage: cmd.usage || '!' + cmd.name,
      alias: cmd.alias || null,
      adminOnly: cmd.adminOnly || false,
      restricted: cmd.restricted || false,
      restrictedFeature: cmd.restrictedFeature || null,
    });
  });
  return list;
}

function getCommandByName(name) {
  return getCommand(name);
}

module.exports = { loadCommands, handleCommand, getCommandsList, getCommandByName, registerCommand };
