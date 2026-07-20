const { saveJson, loadJson, parseJid } = require('../utils/helpers');
const path = require('path');
const config = require('../../config');

const ACCESS_FILE = path.join(__dirname, '..', '..', 'storage', 'access.json');

function getDb() {
  return loadJson(ACCESS_FILE, { users: {}, features: {} });
}

function saveDb(db) {
  saveJson(ACCESS_FILE, db);
}

function isAdmin(jid) {
  if (!jid) return false;
  var sender = parseJid(jid);
  if (!sender) return false;

  // 1. Connected Bot Account is always admin
  try {
    var { getClient } = require('../client');
    var sock = getClient();
    if (sock && sock.user) {
      var botNum = parseJid(sock.user.id || sock.user.jid || '');
      if (botNum && (botNum === sender || sender.endsWith(botNum) || botNum.endsWith(sender))) {
        return true;
      }
    }
  } catch (e) {}

  // 2. Check config.admins list
  if (config.admins && config.admins.length > 0) {
    for (var i = 0; i < config.admins.length; i++) {
      var adminNum = parseJid(config.admins[i]);
      if (adminNum && (adminNum === sender || sender.endsWith(adminNum) || adminNum.endsWith(sender))) {
        return true;
      }
    }
  }

  // 3. If no admin number configured, default to true for the first caller
  if (!config.admins || config.admins.length === 0) return true;

  return false;
}

function userKey(jid) {
  return parseJid(jid);
}

function isApproved(jid) {
  if (!config.access.enabled) return true;
  if (isAdmin(jid)) return true;
  const db = getDb();
  const key = userKey(jid);
  return !!db.users[key];
}

function canUse(jid, feature) {
  if (!config.access.enabled) return true;
  if (isAdmin(jid)) return true;
  const db = getDb();
  const key = userKey(jid);
  var user = db.users[key];
  if (!user) return false;
  if (!user.features || user.features.length === 0) return true;
  return user.features.indexOf(feature) !== -1 || user.features.indexOf('all') !== -1;
}

function getFeatures(jid) {
  if (isAdmin(jid)) return ['all'];
  const db = getDb();
  var user = db.users[userKey(jid)];
  return user ? (user.features || []) : [];
}

function addUser(identifier, features, name) {
  var db = getDb();
  var key = identifier.replace(/[^0-9]/g, '');
  if (!key) return { error: 'Invalid number.' };
  if (db.users[key]) return { error: 'User already approved.' };
  db.users[key] = {
    number: key,
    name: name || key,
    features: features || config.access.defaultFeatures || ['ai', 'agent', 'imagine', 'download'],
    approvedAt: Date.now(),
  };
  saveDb(db);
  return { success: true, user: db.users[key] };
}

function removeUser(identifier) {
  var db = getDb();
  var key = identifier.replace(/[^0-9]/g, '');
  if (!db.users[key]) return { error: 'User not found.' };
  delete db.users[key];
  saveDb(db);
  return { success: true };
}

function setFeatures(identifier, features) {
  var db = getDb();
  var key = identifier.replace(/[^0-9]/g, '');
  if (!db.users[key]) return { error: 'User not found.' };
  db.users[key].features = features;
  saveDb(db);
  return { success: true, user: db.users[key] };
}

function toggleFeature(identifier, feature) {
  var db = getDb();
  var key = identifier.replace(/[^0-9]/g, '');
  if (!db.users[key]) return { error: 'User not found.' };
  var features = db.users[key].features || [];
  var idx = features.indexOf(feature);
  if (idx === -1) {
    features.push(feature);
  } else {
    features.splice(idx, 1);
  }
  db.users[key].features = features;
  saveDb(db);
  return { success: true, user: db.users[key], enabled: idx === -1 };
}

function listUsers() {
  var db = getDb();
  return Object.values(db.users).sort(function(a, b) { return b.approvedAt - a.approvedAt; });
}

function lookupByIdentifier(identifier) {
  var key = identifier.replace(/[^0-9]/g, '');
  var db = getDb();
  for (var uid in db.users) {
    var u = db.users[uid];
    if (u.number === key) return u;
    if (u.name && u.name.toLowerCase() === identifier.toLowerCase()) return u;
  }
  return null;
}

module.exports = {
  isAdmin,
  isApproved,
  canUse,
  getFeatures,
  addUser,
  removeUser,
  setFeatures,
  toggleFeature,
  listUsers,
  lookupByIdentifier,
};
