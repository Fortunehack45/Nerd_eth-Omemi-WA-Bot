const { saveJson, loadJson } = require('../utils/helpers');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '..', '..', 'storage', 'users.json');
const CONVOS_DIR = path.join(__dirname, '..', '..', 'storage', 'conversations');
const NOTES_FILE = path.join(__dirname, '..', '..', 'storage', 'notes.json');

let usersDb = null;

function getDb() {
  if (!usersDb) usersDb = loadJson(MEMORY_FILE, {});
  return usersDb;
}

function saveDb() {
  saveJson(MEMORY_FILE, usersDb);
}

function getUserId(jid) {
  return jid.replace(/[^0-9]/g, '');
}

function getUser(jid) {
  const db = getDb();
  const uid = getUserId(jid);
  if (!db[uid]) {
    db[uid] = {
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      name: '',
      pushName: '',
      about: '',
      messageCount: 0,
      facts: [],
      preferences: {},
      tags: [],
      notes: '',
      interactionCount: 0,
      lastLearned: null,
    };
    saveDb();
  }
  db[uid].lastSeen = Date.now();
  return db[uid];
}

function updateUser(jid, updates) {
  const user = getUser(jid);
  Object.assign(user, updates);
  saveDb();
}

function addFact(jid, fact) {
  const user = getUser(jid);
  const trimmed = fact.trim();
  if (trimmed && trimmed.length > 2 && trimmed.length < 200 && !user.facts.includes(trimmed)) {
    user.facts.push(trimmed);
    if (user.facts.length > 50) user.facts.shift();
    user.lastLearned = Date.now();
    saveDb();
    return true;
  }
  return false;
}

function addTag(jid, tag) {
  const user = getUser(jid);
  const t = tag.trim().toLowerCase();
  if (t && !user.tags.includes(t)) {
    user.tags.push(t);
    saveDb();
    return true;
  }
  return false;
}

function removeTag(jid, tag) {
  const user = getUser(jid);
  user.tags = user.tags.filter(t => t !== tag.trim().toLowerCase());
  saveDb();
}

function setPreference(jid, key, value) {
  const user = getUser(jid);
  user.preferences[key] = value;
  saveDb();
}

function getConversationHistory(jid, limit) {
  limit = limit || 10;
  const uid = getUserId(jid);
  const file = path.join(CONVOS_DIR, uid + '.json');
  const history = loadJson(file, []);
  return history.slice(-limit);
}

function addToConversation(jid, role, content) {
  const uid = getUserId(jid);
  if (!require('fs').existsSync(CONVOS_DIR)) {
    require('fs').mkdirSync(CONVOS_DIR, { recursive: true });
  }
  const file = path.join(CONVOS_DIR, uid + '.json');
  const history = loadJson(file, []);
  history.push({ role: role, content: content, timestamp: Date.now() });
  if (history.length > 100) history.splice(0, history.length - 100);
  saveJson(file, history);
}

function getUserContext(jid) {
  const user = getUser(jid);
  const history = getConversationHistory(jid, 6);
  const parts = [];

  if (user.name) parts.push('Name: ' + user.name);
  if (user.pushName) parts.push('Display Name: ' + user.pushName);
  if (user.about) parts.push('About: ' + user.about);
  if (user.facts && user.facts.length > 0) parts.push('Known facts about user: ' + user.facts.join('; '));
  if (Object.keys(user.preferences || {}).length > 0) {
    const prefs = Object.entries(user.preferences).map(function(kv) { return kv[0] + ': ' + kv[1]; }).join(', ');
    parts.push('Preferences: ' + prefs);
  }
  if (user.tags && user.tags.length > 0) parts.push('Tags: ' + user.tags.join(', '));
  if (user.notes) parts.push('Notes: ' + user.notes);

  parts.push('Total interactions: ' + (user.interactionCount || 0));
  parts.push('Messages sent: ' + (user.messageCount || 0));

  const historyText = history.map(function(h) { return '[' + h.role.toUpperCase() + '] ' + h.content; }).join('\n');

  return {
    summary: parts.join('\n'),
    history: historyText,
  };
}

function matchPattern(text, regex) {
  var results = [];
  var g = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  var match;
  while ((match = g.exec(text)) !== null) {
    results.push(match);
  }
  return results;
}

function extractFactsFromMessage(text, jid) {
  var patterns = [
    { regex: /my name is (\w+(?:\s+\w+)?)/i, label: 'name', group: 1 },
    { regex: /call me (\w+(?:\s+\w+)?)/i, label: 'name', group: 1 },
    { regex: /you can call me (\w+(?:\s+\w+)?)/i, label: 'name', group: 1 },
    { regex: /i am (\d+) years? old/i, label: 'age', group: 0 },
    { regex: /my (?:age|birthday)(?:\s*is)? (\d+)/i, label: 'age', group: 0 },
    { regex: /i(?:'?)m (?:from|in) (\w+(?:\s+\w+)?)/i, label: 'location', group: 0 },
    { regex: /i live in (\w+(?:\s+\w+)?)/i, label: 'location', group: 0 },
    { regex: /i work (?:as|at) (\w+(?:\s+\w+)?)/i, label: 'job', group: 0 },
    { regex: /my (?:job|profession|occupation)(?:\s*is)? (\w+(?:\s+\w+)?)/i, label: 'job', group: 0 },
    { regex: /i(?:'?)m (?:a|an) (\w+(?:\s+\w+)?)/i, label: 'identity', group: 0 },
    { regex: /i like (\w+(?:\s+\w+)*)/gi, label: 'interest', group: 0 },
    { regex: /i love (\w+(?:\s+\w+)*)/gi, label: 'love', group: 0 },
    { regex: /i hate (\w+(?:\s+\w+)*)/gi, label: 'dislike', group: 0 },
    { regex: /my (?:favorite|favourite) (\w+) is (\w+(?:\s+\w+)*)/i, label: 'favorite', group: 0 },
    { regex: /i (?:have|got) a (\w+(?:\s+\w+)?)/i, label: 'possession', group: 0 },
    { regex: /i (?:study|learn) (\w+(?:\s+\w+)?)/i, label: 'study', group: 0 },
    { regex: /i (?:speak|know) (\w+(?:\s+\w+)?)/i, label: 'language', group: 0 },
    { regex: /my (?:phone|number)(?:\s*is)? (\d+)/i, label: 'phone', group: 0 },
    { regex: /i (?:need|want) (\w+(?:\s+\w+)?)/i, label: 'desire', group: 0 },
  ];

  var learned = [];
  var nameMatch = null;

  for (var p = 0; p < patterns.length; p++) {
    var pattern = patterns[p];
    var matches = matchPattern(text, pattern.regex);
    for (var m = 0; m < matches.length; m++) {
      var match = matches[m];
      var fact = match[0].trim();
      if (fact.length > 2 && fact.length < 150) {
        if (addFact(jid, fact)) {
          learned.push({ fact: fact, label: pattern.label });
          if (pattern.label === 'name' && !nameMatch) {
            nameMatch = match[pattern.group || 1];
          }
        }
      }
    }
  }

  if (nameMatch && nameMatch.length > 1) {
    updateUser(jid, { name: nameMatch });
  }

  return learned;
}

function getAllUsers() {
  const db = getDb();
  return Object.entries(db).map(function(entry) {
    return Object.assign({ id: entry[0] }, entry[1]);
  }).sort(function(a, b) { return b.lastSeen - a.lastSeen; });
}

function searchUsers(query) {
  var q = query.toLowerCase();
  return getAllUsers().filter(function(u) {
    return (u.name && u.name.toLowerCase().includes(q)) ||
      (u.pushName && u.pushName.toLowerCase().includes(q)) ||
      (u.id && u.id.includes(q)) ||
      (u.tags && u.tags.some(function(t) { return t.includes(q); })) ||
      (u.facts && u.facts.some(function(f) { return f.toLowerCase().includes(q); }));
  });
}

function addNote(jid, note) {
  const user = getUser(jid);
  var existing = user.notes || '';
  var timestamp = new Date().toLocaleString();
  var newNote = '[' + timestamp + '] ' + note;
  user.notes = existing ? existing + '\n' + newNote : newNote;
  saveDb();
  return true;
}

function getNotes(jid) {
  const user = getUser(jid);
  return user.notes || '';
}

function clearNotes(jid) {
  updateUser(jid, { notes: '' });
}

function getRecentLearnings(limit) {
  limit = limit || 10;
  const db = getDb();
  var results = [];
  for (var uid in db) {
    var user = db[uid];
    if (user.lastLearned && user.facts && user.facts.length > 0) {
      results.push({
        id: uid,
        name: user.name || user.pushName || uid,
        facts: user.facts.slice(-3),
        lastLearned: user.lastLearned,
      });
    }
  }
  results.sort(function(a, b) { return b.lastLearned - a.lastLearned; });
  return results.slice(0, limit);
}

module.exports = {
  getUser,
  updateUser,
  addFact,
  addTag,
  removeTag,
  setPreference,
  getConversationHistory,
  addToConversation,
  getUserContext,
  extractFactsFromMessage,
  getAllUsers,
  searchUsers,
  addNote,
  getNotes,
  clearNotes,
  getRecentLearnings,
};
