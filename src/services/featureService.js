const path = require('path');
const { loadJson, saveJson } = require('../utils/helpers');

const FEATURE_FILE = path.join(__dirname, '..', '..', 'storage', 'features.json');
const PROTECTED_COMMANDS = ['disable', 'enable', 'disabled', 'toggle', 'togglefeature', 'access', 'setkey', 'help', 'ping'];
const KNOWN_FEATURES = ['schedule', 'proactive', 'ai', 'status', 'viewonce'];

function normalizeKey(str) {
  if (!str) return '';
  return str.toLowerCase().trim().replace(/^[!/]+/, '');
}

function resolveCommandName(name) {
  var key = normalizeKey(name);
  if (!key) return '';
  try {
    var commandHandler = require('../handlers/commandHandler');
    if (commandHandler && typeof commandHandler.getCommandByName === 'function') {
      var cmdObj = commandHandler.getCommandByName(key);
      if (cmdObj && cmdObj.name) {
        return cmdObj.name.toLowerCase();
      }
    }
  } catch (e) {}
  return key;
}

function getFeatureConfig() {
  return loadJson(FEATURE_FILE, {
    disabledCommands: [],
    disabledFeatures: [],
  });
}

function isCommandDisabled(cmdName) {
  var cfg = getFeatureConfig();
  var rawKey = normalizeKey(cmdName);
  if (!rawKey) return false;

  var disabledCmds = cfg.disabledCommands || [];
  var disabledFeats = cfg.disabledFeatures || [];

  if (disabledCmds.includes(rawKey) || disabledFeats.includes(rawKey)) return true;

  var canonical = resolveCommandName(rawKey);
  if (canonical && (disabledCmds.includes(canonical) || disabledFeats.includes(canonical))) return true;

  return false;
}

function isFeatureDisabled(featureName) {
  var cfg = getFeatureConfig();
  var rawKey = normalizeKey(featureName);
  if (!rawKey) return false;

  var disabledCmds = cfg.disabledCommands || [];
  var disabledFeats = cfg.disabledFeatures || [];

  if (disabledFeats.includes(rawKey) || disabledCmds.includes(rawKey)) return true;

  var canonical = resolveCommandName(rawKey);
  if (canonical && (disabledFeats.includes(canonical) || disabledCmds.includes(canonical))) return true;

  return false;
}

function disableItem(name) {
  var rawKey = normalizeKey(name);
  if (!rawKey) {
    return { success: false, error: 'Invalid item name provided.' };
  }

  if (PROTECTED_COMMANDS.includes(rawKey)) {
    return { success: false, error: '⚠️ System command `!' + rawKey + '` cannot be disabled.' };
  }

  var canonical = resolveCommandName(rawKey);
  if (canonical && PROTECTED_COMMANDS.includes(canonical)) {
    return { success: false, error: '⚠️ System command `!' + canonical + '` cannot be disabled.' };
  }

  var cfg = getFeatureConfig();
  if (!cfg.disabledCommands) cfg.disabledCommands = [];
  if (!cfg.disabledFeatures) cfg.disabledFeatures = [];

  var targetName = canonical || rawKey;
  var isFeat = KNOWN_FEATURES.includes(rawKey) || KNOWN_FEATURES.includes(targetName);

  if (isFeat) {
    var featKey = KNOWN_FEATURES.includes(rawKey) ? rawKey : targetName;
    if (!cfg.disabledFeatures.includes(featKey)) cfg.disabledFeatures.push(featKey);
    if (!cfg.disabledCommands.includes(featKey)) cfg.disabledCommands.push(featKey);
  }

  if (!cfg.disabledCommands.includes(targetName)) cfg.disabledCommands.push(targetName);

  saveJson(FEATURE_FILE, cfg);
  return { success: true, isFeature: isFeat, target: targetName, config: cfg };
}

function enableItem(name) {
  var rawKey = normalizeKey(name);
  if (!rawKey) {
    return { success: false, error: 'Invalid item name provided.' };
  }

  var canonical = resolveCommandName(rawKey);
  var targetName = canonical || rawKey;
  var cfg = getFeatureConfig();

  cfg.disabledFeatures = (cfg.disabledFeatures || []).filter(function(f) {
    return f !== rawKey && f !== targetName;
  });
  cfg.disabledCommands = (cfg.disabledCommands || []).filter(function(c) {
    return c !== rawKey && c !== targetName;
  });

  saveJson(FEATURE_FILE, cfg);
  return { success: true, target: targetName, config: cfg };
}

module.exports = {
  getFeatureConfig,
  isCommandDisabled,
  isFeatureDisabled,
  disableItem,
  enableItem,
};
