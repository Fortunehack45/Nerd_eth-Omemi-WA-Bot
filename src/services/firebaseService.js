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
