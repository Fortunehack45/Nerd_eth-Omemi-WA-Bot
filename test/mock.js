/**
 * Mock WhatsApp socket for testing the bot without a real connection.
 * Records every outbound send so assertions can be made.
 */
class MockSock {
  constructor(opts = {}) {
    this.opts = opts;
    this.user = { id: opts.botJid || '2348000000000:1@s.whatsapp.net', name: 'TestBot' };
    this.sent = [];
    this.failSend = opts.failSend || false;
    this.failDl = opts.failDl || false;
    this.ppUrl = opts.ppUrl || 'https://example.com/pp.jpg';
  }

  async sendMessage(jid, content) {
    if (this.failSend) throw new Error('Mock send failure');
    this.sent.push({ jid, content, time: Date.now() });
    return { key: { id: 'MOCK' + this.sent.length, remoteJid: jid, fromMe: true }, message: content };
  }

  async sendPresenceUpdate(status, jid) {
    this.presence = { status, jid };
    return true;
  }

  async readMessages(keys) {
    this.reads = this.reads || [];
    this.reads.push(keys);
    return true;
  }

  async downloadMediaMessage(msg) {
    if (this.failDl) throw new Error('Mock download failure');
    return Buffer.from('mock-media-bytes');
  }

  async profilePictureUrl(jid, type) {
    if (this.opts.noPicture) throw new Error('no profile picture');
    return this.ppUrl;
  }

  async groupMetadata(jid) {
    return this.opts.groupMetadata || {
      id: jid,
      subject: 'Test Group',
      participants: [
        { id: this.user.id.split('@')[0] + '@s.whatsapp.net', admin: this.opts.botIsAdmin ? 'admin' : null },
        { id: '2348111111111@s.whatsapp.net', admin: 'superadmin' },
        { id: '2348222222222@s.whatsapp.net', admin: null },
        { id: '2348333333333@s.whatsapp.net', admin: null },
      ],
    };
  }

  async groupParticipantsUpdate(jid, participants, action) {
    this.updates = this.updates || [];
    this.updates.push({ jid, participants, action });
    return participants.map(id => ({ id, status: '200' }));
  }

  async groupInviteCode(jid) {
    return 'abcDefGhi';
  }

  async groupToggleEphemeral() { return true; }
  async groupSettingUpdate() { return true; }
  async groupUpdateSubject() { return true; }
  async groupUpdateDescription() { return true; }

  async block(jid) { this.blocked = jid; return true; }
  async updateBlockStatus(jid, action) { this.blocked = jid + ':' + action; return true; }

  async sendMessageReturnEvents() { return {}; }

  last() { return this.sent[this.sent.length - 1]; }
  texts() { return this.sent.map(s => (s.content && s.content.text) || '').filter(Boolean); }
  clear() { this.sent = []; }
}

function makeMsg(text, opts = {}) {
  return {
    key: {
      id: opts.id || 'TESTMSG' + Math.random().toString(36).slice(2),
      remoteJid: opts.remoteJid || '2348111111111@s.whatsapp.net',
      fromMe: opts.fromMe || false,
      participant: opts.participant,
    },
    pushName: opts.pushName || 'Tester',
    message: text !== undefined
      ? { conversation: text }
      : opts.message || { conversation: 'hi' },
  };
}

function makeGroupMsg(text, opts = {}) {
  return makeMsg(text, Object.assign({
    remoteJid: '120363021212121212@g.us',
    participant: opts.participant || '2348111111111@s.whatsapp.net',
  }, opts));
}

module.exports = { MockSock, makeMsg, makeGroupMsg };
