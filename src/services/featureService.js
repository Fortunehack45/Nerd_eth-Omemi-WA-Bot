const path = require('path');
const { loadJson, saveJson } = require('../utils/helpers');

const FEATURE_FILE = path.join(__dirname, '..', '..', 'storage', 'features.json');

function getFeatureConfig() {
  return loadJson(FEATURE_FILE, {
    disabledCommands: [],
    disabledFeatures: [], // 'autoreply', 'schedule', 'ai', 'proactive', etc.
  });
}

function isCommandDisabled(cmdName) {
  var cfg = getFeatureConfig();
  var name = (cmdName || '').toLowerCase().trim();
  return (cfg.disabledCommands || []).includes(name);
}

function isFeatureDisabled(featureName) {
  var cfg = getFeatureConfig();
  var name = (featureName || '').toLowerCase().trim();
  return (cfg.disabledFeatures || []).includes(name);
}

function disableItem(name) {
  var cfg = getFeatureConfig();
  var key = name.toLowerCase().trim();
  var isFeat = ['autoreply', 'schedule', 'proactive', 'ai', 'status', 'viewonce'].includes(key);

  if (isFeat) {
    if (!cfg.disabledFeatures.includes(key)) cfg.disabledFeatures.push(key);
  } else {
    if (!cfg.disabledCommands.includes(key)) cfg.disabledCommands.push(key);
  }
  saveJson(FEATURE_FILE, cfg);
  return { success: true, isFeature: isFeat, config: cfg };
}

function enableItem(name) {
  var cfg = getFeatureConfig();
  var key = name.toLowerCase().trim();
  cfg.disabledFeatures = (cfg.disabledFeatures || []).filter(f => f !== key);
  cfg.disabledCommands = (cfg.disabledCommands || []).filter(c => c !== key);
  saveJson(FEATURE_FILE, cfg);
  return { success: true, config: cfg };
}

module.exports = {
  getFeatureConfig,
  isCommandDisabled,
  isFeatureDisabled,
  disableItem,
  enableItem,
};
