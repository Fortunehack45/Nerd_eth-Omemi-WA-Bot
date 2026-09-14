/**
 * Firebase Database Adapter for Multi-User WhatsApp Bot
 * Supports persistent cloud storage for sessions, memory, and bot analytics.
 * Works via Firestore/RTDB REST API (zero extra dependencies required)
 * and optionally integrates with firebase-admin if installed.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class FirebaseService {
  constructor(options = {}) {
    this.projectId = options.projectId || process.env.FIREBASE_PROJECT_ID || null;
    this.databaseUrl = options.databaseUrl || process.env.FIREBASE_DATABASE_URL || null;
    this.apiKey = options.apiKey || process.env.FIREBASE_API_KEY || null;
    this.serviceAccount = null;
    this.adminApp = null;
    this.firestore = null;
    this.isInitialized = false;

    this._init();
  }

  _init() {
    // Attempt to parse service account if provided
    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (saEnv) {
      try {
        if (fs.existsSync(saEnv)) {
          this.serviceAccount = JSON.parse(fs.readFileSync(saEnv, 'utf8'));
        } else {
          // Might be inline JSON or base64 encoded
          const raw = saEnv.trim().startsWith('{')
            ? saEnv.trim()
            : Buffer.from(saEnv, 'base64').toString('utf8');
          this.serviceAccount = JSON.parse(raw);
        }
        if (this.serviceAccount && this.serviceAccount.project_id) {
          this.projectId = this.serviceAccount.project_id;
        }
      } catch (err) {
        console.warn('[FIREBASE] Could not parse FIREBASE_SERVICE_ACCOUNT credentials:', err.message);
      }
    }

    // Attempt to load firebase-admin if available
    try {
      const admin = require('firebase-admin');
      if (this.serviceAccount) {
        this.adminApp = admin.initializeApp({
          credential: admin.credential.cert(this.serviceAccount),
          databaseURL: this.databaseUrl || `https://${this.projectId}.firebaseio.com`
        }, 'nerd-bot-firebase');
        this.firestore = this.adminApp.firestore();
        this.isInitialized = true;
        console.log(`[FIREBASE] ✅ Connected to Firebase Firestore via Admin SDK (project: ${this.projectId})`);
        return;
      }
    } catch (e) {
      // firebase-admin not installed or not configured with cert, fallback to REST mode
    }

    // Check if REST configuration is active
    if (this.projectId || this.databaseUrl) {
      this.isInitialized = true;
      console.log(`[FIREBASE] 🌐 Connected in REST Mode (project: ${this.projectId || 'RTDB'})`);
    } else {
      this.isInitialized = false;
    }
  }

  /**
   * Check if Firebase is configured and ready
   */
  isAvailable() {
    return this.isInitialized && Boolean(this.projectId || this.databaseUrl || this.firestore);
  }

  /**
   * Get public/safe status for diagnostics
   */
  getStatus() {
    return {
      available: this.isAvailable(),
      mode: this.firestore ? 'admin-sdk' : (this.databaseUrl ? 'rtdb-rest' : (this.projectId ? 'firestore-rest' : 'none')),
      projectId: this.projectId ? `${this.projectId.substring(0, 3)}***` : null,
      hasDatabaseUrl: Boolean(this.databaseUrl)
    };
  }

  /**
   * Save session document to Firebase
   * @param {string} sessionId 
   * @param {object} data 
   */
  async saveSession(sessionId, data = {}) {
    if (!this.isAvailable()) return null;
    const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const docData = {
      ...data,
      updatedAt: new Date().toISOString()
    };

    // 1. Admin SDK Mode
    if (this.firestore) {
      try {
        await this.firestore.collection('sessions').doc(safeId).set(docData, { merge: true });
        return true;
      } catch (err) {
        console.error(`[FIREBASE] saveSession failed for ${safeId}:`, err.message);
        return false;
      }
    }

    // 2. Realtime Database REST Mode
    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/sessions/${safeId}.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        await axios.patch(url, docData);
        return true;
      } catch (err) {
        console.error(`[FIREBASE] RTDB saveSession failed for ${safeId}:`, err.message);
        return false;
      }
    }

    // 3. Firestore REST Mode
    if (this.projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/sessions/${safeId}${this.apiKey ? `?key=${this.apiKey}` : ''}`;
        const fields = this._serializeToFirestoreFields(docData);
        await axios.patch(url, { fields });
        return true;
      } catch (err) {
        console.error(`[FIREBASE] Firestore REST saveSession failed for ${safeId}:`, err.message);
        return false;
      }
    }

    return false;
  }

  /**
   * Retrieve session document from Firebase
   * @param {string} sessionId 
   */
  async getSession(sessionId) {
    if (!this.isAvailable()) return null;
    const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (this.firestore) {
      try {
        const doc = await this.firestore.collection('sessions').doc(safeId).get();
        return doc.exists ? doc.data() : null;
      } catch (err) {
        console.error(`[FIREBASE] getSession failed for ${safeId}:`, err.message);
        return null;
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/sessions/${safeId}.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        const res = await axios.get(url);
        return res.data;
      } catch (err) {
        return null;
      }
    }

    if (this.projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/sessions/${safeId}${this.apiKey ? `?key=${this.apiKey}` : ''}`;
        const res = await axios.get(url);
        return this._deserializeFirestoreFields(res.data.fields || {});
      } catch (err) {
        return null;
      }
    }

    return null;
  }

  /**
   * Delete session document from Firebase
   * @param {string} sessionId 
   */
  async deleteSession(sessionId) {
    if (!this.isAvailable()) return false;
    const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (this.firestore) {
      try {
        await this.firestore.collection('sessions').doc(safeId).delete();
        return true;
      } catch (err) {
        return false;
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/sessions/${safeId}.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        await axios.delete(url);
        return true;
      } catch (err) {
        return false;
      }
    }

    if (this.projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/sessions/${safeId}${this.apiKey ? `?key=${this.apiKey}` : ''}`;
        await axios.delete(url);
        return true;
      } catch (err) {
        return false;
      }
    }

    return false;
  }

  /**
   * Save bot memory (users/facts/notes)
   */
  async saveMemory(userId, memoryData) {
    if (!this.isAvailable()) return false;
    const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (this.firestore) {
      try {
        await this.firestore.collection('memory').doc(safeId).set({
          ...memoryData,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        return true;
      } catch (err) {
        return false;
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/memory/${safeId}.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        await axios.patch(url, memoryData);
        return true;
      } catch (err) {
        return false;
      }
    }

    return false;
  }

  /**
   * Save aggregate platform statistics
   */
  async saveStats(statsData) {
    if (!this.isAvailable()) return false;

    if (this.firestore) {
      try {
        await this.firestore.collection('stats').doc('platform').set({
          ...statsData,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        return true;
      } catch (err) {
        return false;
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/stats/platform.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        await axios.patch(url, statsData);
        return true;
      } catch (err) {
        return false;
      }
    }

    return false;
  }

  /**
   * Dynamically reconfigure Firebase at runtime
   */
  configure(options = {}) {
    if (options.projectId) this.projectId = options.projectId;
    if (options.databaseUrl) this.databaseUrl = options.databaseUrl;
    if (options.apiKey) this.apiKey = options.apiKey;
    if (options.serviceAccount) this.serviceAccount = options.serviceAccount;
    this._init();
    return this.getStatus();
  }

  /**
   * Save WhatsApp authentication files (creds.json and keys) to cloud database
   * @param {string} sessionId
   * @param {Object} filesMap Map of filename -> JSON string content
   */
  async saveCredentials(sessionId, filesMap = {}) {
    if (!this.isAvailable()) return null;
    const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const docData = {
      files: filesMap,
      updatedAt: new Date().toISOString()
    };

    if (this.firestore) {
      try {
        await this.firestore.collection('whatsapp_credentials').doc(safeId).set(docData, { merge: true });
        return true;
      } catch (err) {
        console.error(`[FIREBASE] saveCredentials failed for ${safeId}:`, err.message);
        return false;
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/whatsapp_credentials/${safeId}.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        await axios.put(url, docData);
        return true;
      } catch (err) {
        console.error(`[FIREBASE] RTDB saveCredentials failed for ${safeId}:`, err.message);
        return false;
      }
    }

    if (this.projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/whatsapp_credentials/${safeId}${this.apiKey ? `?key=${this.apiKey}` : ''}`;
        const fields = this._serializeToFirestoreFields(docData);
        await axios.patch(url, { fields });
        return true;
      } catch (err) {
        console.error(`[FIREBASE] Firestore REST saveCredentials failed for ${safeId}:`, err.message);
        return false;
      }
    }

    return false;
  }

  /**
   * Retrieve WhatsApp credentials document
   * @param {string} sessionId
   */
  async getCredentials(sessionId) {
    if (!this.isAvailable()) return null;
    const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (this.firestore) {
      try {
        const doc = await this.firestore.collection('whatsapp_credentials').doc(safeId).get();
        return doc.exists ? doc.data() : null;
      } catch (err) {
        return null;
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/whatsapp_credentials/${safeId}.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        const res = await axios.get(url);
        return res.data;
      } catch (err) {
        return null;
      }
    }

    if (this.projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/whatsapp_credentials/${safeId}${this.apiKey ? `?key=${this.apiKey}` : ''}`;
        const res = await axios.get(url);
        const data = this._deserializeFirestoreFields(res.data.fields || {});
        if (data && typeof data.files === 'string') {
          try { data.files = JSON.parse(data.files); } catch (e) {}
        }
        return data;
      } catch (err) {
        return null;
      }
    }

    return null;
  }

  /**
   * Delete WhatsApp credentials document from cloud database
   * @param {string} sessionId
   */
  async deleteCredentials(sessionId) {
    if (!this.isAvailable()) return false;
    const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (this.firestore) {
      try {
        await this.firestore.collection('whatsapp_credentials').doc(safeId).delete();
        return true;
      } catch (err) {
        return false;
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/whatsapp_credentials/${safeId}.json${this.apiKey ? `?auth=${this.apiKey}` : ''}`;
        await axios.delete(url);
        return true;
      } catch (err) {
        return false;
      }
    }

    if (this.projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/whatsapp_credentials/${safeId}${this.apiKey ? `?key=${this.apiKey}` : ''}`;
        await axios.delete(url);
        return true;
      } catch (err) {
        return false;
      }
    }

    return false;
  }

  /**
   * List all session IDs currently stored in cloud database
   * @returns {Promise<Array<string>>}
   */
  async listAllCredentialSessionIds() {
    if (!this.isAvailable()) return [];

    if (this.firestore) {
      try {
        const snap = await this.firestore.collection('whatsapp_credentials').get();
        return snap.docs.map(d => d.id);
      } catch (err) {
        return [];
      }
    }

    if (this.databaseUrl) {
      try {
        const url = `${this.databaseUrl.replace(/\/$/, '')}/whatsapp_credentials.json?shallow=true${this.apiKey ? `&auth=${this.apiKey}` : ''}`;
        const res = await axios.get(url);
        return res.data ? Object.keys(res.data) : [];
      } catch (err) {
        return [];
      }
    }

    if (this.projectId) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/whatsapp_credentials${this.apiKey ? `?key=${this.apiKey}` : ''}`;
        const res = await axios.get(url);
        if (!res.data?.documents) return [];
        return res.data.documents.map(d => d.name.split('/').pop());
      } catch (err) {
        return [];
      }
    }

    return [];
  }

  /**
   * Backup all session files from local disk to Firebase
   * @param {string} sessionId
   * @param {string} sessionDir
   */
  async backupSessionFiles(sessionId, sessionDir) {
    if (!this.isAvailable() || !fs.existsSync(sessionDir)) return false;
    try {
      const files = fs.readdirSync(sessionDir);
      const filesMap = {};
      let hasCreds = false;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(sessionDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          filesMap[file] = content;
          if (file === 'creds.json') hasCreds = true;
        } catch (e) {}
      }

      if (!hasCreds) return false;
      return await this.saveCredentials(sessionId, filesMap);
    } catch (err) {
      console.error(`[FIREBASE] backupSessionFiles failed for ${sessionId}:`, err.message);
      return false;
    }
  }

  /**
   * Restore all session files from Firebase to local disk
   * @param {string} sessionId
   * @param {string} targetDir
   */
  async restoreSessionFiles(sessionId, targetDir) {
    if (!this.isAvailable()) return false;
    try {
      const credDoc = await this.getCredentials(sessionId);
      if (!credDoc || !credDoc.files) return false;

      let files = credDoc.files;
      if (typeof files === 'string') {
        try { files = JSON.parse(files); } catch (e) {}
      }
      if (typeof files !== 'object' || files === null) return false;

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let restoredCount = 0;
      for (const [filename, content] of Object.entries(files)) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || filename.includes('..')) continue;
        const destPath = path.join(targetDir, filename);
        const strContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        fs.writeFileSync(destPath, strContent, 'utf8');
        restoredCount++;
      }

      console.log(`[FIREBASE] 📦 Restored ${restoredCount} file(s) for session "${sessionId}"`);
      return restoredCount > 0;
    } catch (err) {
      console.error(`[FIREBASE] restoreSessionFiles failed for ${sessionId}:`, err.message);
      return false;
    }
  }

  /**
   * Helper to format JavaScript objects into Firestore REST fields
   */
  _serializeToFirestoreFields(obj) {
    const fields = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) {
        fields[key] = { nullValue: null };
      } else if (typeof val === 'string') {
        fields[key] = { stringValue: val };
      } else if (typeof val === 'boolean') {
        fields[key] = { booleanValue: val };
      } else if (typeof val === 'number') {
        if (Number.isInteger(val)) {
          fields[key] = { integerValue: String(val) };
        } else {
          fields[key] = { doubleValue: val };
        }
      } else if (typeof val === 'object') {
        fields[key] = { stringValue: JSON.stringify(val) };
      }
    }
    return fields;
  }

  /**
   * Helper to unpack Firestore REST fields back to JavaScript object
   */
  _deserializeFirestoreFields(fields) {
    const res = {};
    for (const [key, desc] of Object.entries(fields)) {
      if ('stringValue' in desc) {
        try {
          const parsed = JSON.parse(desc.stringValue);
          res[key] = (typeof parsed === 'object' && parsed !== null) ? parsed : desc.stringValue;
        } catch (e) {
          res[key] = desc.stringValue;
        }
      } else if ('integerValue' in desc) {
        res[key] = parseInt(desc.integerValue, 10);
      } else if ('doubleValue' in desc) {
        res[key] = parseFloat(desc.doubleValue);
      } else if ('booleanValue' in desc) {
        res[key] = desc.booleanValue;
      } else if ('nullValue' in desc) {
        res[key] = null;
      }
    }
    return res;
  }
}

// Singleton instance
const firebaseService = new FirebaseService();
module.exports = firebaseService;
