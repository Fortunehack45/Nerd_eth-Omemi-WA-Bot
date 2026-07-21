const { isStealthEnabled, setStealthEnabled, getStealthStats, getSessionFingerprint } = require('../services/stealthService');

const HELP = `*🥷 Stealth Mode — Anti-Detection System* (Admin Only)

Hides from WhatsApp's bot detection algorithms using fingerprint rotation, human typing simulation, and presence spoofing.

*Commands:*
  \`!stealth on\`           Enable all stealth mode protections
  \`!stealth off\`          Disable stealth mode
  \`!stealth status\`       View current stealth configuration
  \`!stealth aggressive\`   Enable maximum stealth (slower responses)
  \`!stealth standard\`     Enable standard stealth (balanced)

*What Stealth Mode Does:*
  🔄 *Fingerprint Rotation* — Rotates browser fingerprint every 24h
  ⌨️ *Human Typing Delays* — Simulates real human typing speed
  📖 *Read Receipt Delay* — Delays replies like a real human reading
  👻 *Presence Spoofing* — Randomizes online/offline status
  🆔 *Message ID Spoof* — Uses human-like message IDs (avoids bot ID patterns)
  🌐 *Browser Masking* — Appears as real WhatsApp Web browser session

*Aliases:* \`!ghost\`, \`!invisible\`, \`!antidect\``;

module.exports = {
  name: 'stealth',
  alias: ['ghost', 'invisible', 'antidect', 'stealthmode'],
  description: 'Anti-detection stealth mode — makes bot appear as a real WhatsApp Web user',
  usage: '!stealth [on|off|status|aggressive|standard]',
  adminOnly: true,
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var sub = args.trim().split(/\s+/)[0].toLowerCase();

    switch (sub) {
      case 'on':
      case 'enable':
      case 'start': {
        setStealthEnabled(true, {
          fingerprintRotation: true,
          presenceSpoofing: true,
          humanTypingDelays: true,
          readReceiptDelay: true,
          messageIdSpoof: true,
          onlineStatusRandomize: true,
        });
        var fp = getSessionFingerprint();
        return sock.sendMessage(sender, {
          text: [
            '🥷 *Stealth Mode ACTIVATED!*',
            '',
            '✅ Fingerprint Rotation: ON',
            '✅ Human Typing Delays: ON',
            '✅ Read Receipt Delay: ON',
            '✅ Presence Spoofing: ON',
            '✅ Message ID Spoofing: ON',
            '✅ Online Status Randomizer: ON',
            '',
            '🔐 Active fingerprint: `' + (fp ? fp.join(' / ') : 'randomized') + '`',
            '',
            'WhatsApp now sees this session as a regular browser, not a bot.',
          ].join('\n'),
        });
      }

      case 'off':
      case 'disable':
      case 'stop': {
        setStealthEnabled(false);
        return sock.sendMessage(sender, { text: '⚠️ *Stealth Mode DISABLED.*\nBot is now running in standard mode.' });
      }

      case 'aggressive':
      case 'max':
      case 'full': {
        setStealthEnabled(true, {
          aggressiveMode: true,
          fingerprintRotation: true,
          presenceSpoofing: true,
          humanTypingDelays: true,
          readReceiptDelay: true,
          messageIdSpoof: true,
          onlineStatusRandomize: true,
        });
        return sock.sendMessage(sender, {
          text: [
            '🥷⚡ *Aggressive Stealth Mode ACTIVATED!*',
            '',
            'Maximum anti-detection enabled.',
            '⚠️ Note: Responses will feel slower (more human-like).',
            '',
            '✅ All stealth features active',
            '✅ Aggressive timing jitter',
            '✅ Extended presence randomization',
            '✅ Fingerprint rotation: every session',
          ].join('\n'),
        });
      }

      case 'standard':
      case 'normal':
      case 'balanced': {
        setStealthEnabled(true, {
          aggressiveMode: false,
          fingerprintRotation: true,
          presenceSpoofing: true,
          humanTypingDelays: true,
          readReceiptDelay: false, // disabled for speed
          messageIdSpoof: true,
          onlineStatusRandomize: false,
        });
        return sock.sendMessage(sender, {
          text: [
            '🥷 *Standard Stealth Mode ACTIVATED!*',
            '',
            'Balanced stealth with minimal response delay.',
            '✅ Fingerprint Rotation: ON',
            '✅ Human Typing Delays: ON',
            '✅ Message ID Spoofing: ON',
            '⚡ Read Receipt Delay: OFF (for speed)',
            '⚡ Online Status Randomizer: OFF (for speed)',
          ].join('\n'),
        });
      }

      case 'status':
      case 'stats':
      case 'info': {
        var stats = getStealthStats();
        var text = '*🥷 Stealth Mode Status*\n\n';
        text += 'Status: ' + (stats.enabled ? '🟢 ACTIVE' : '🔴 DISABLED') + '\n';
        text += (stats.aggressiveMode ? '⚡ Mode: Aggressive\n' : '⚖️ Mode: Standard\n');
        text += '\n*Feature Status:*\n';
        text += (stats.fingerprintRotation ? '✅' : '❌') + ' Fingerprint Rotation\n';
        text += (stats.humanTypingDelays ? '✅' : '❌') + ' Human Typing Delays\n';
        text += (stats.readReceiptDelay ? '✅' : '❌') + ' Read Receipt Delay\n';
        text += (stats.presenceSpoofing ? '✅' : '❌') + ' Presence Spoofing\n';
        text += (stats.messageIdSpoof ? '✅' : '❌') + ' Message ID Spoofing\n';
        text += (stats.onlineStatusRandomize ? '✅' : '❌') + ' Online Status Randomizer\n';
        text += '\n🔐 Current Fingerprint: `' + (Array.isArray(stats.currentFingerprint) ? stats.currentFingerprint.join(' / ') : stats.currentFingerprint) + '`\n';
        text += '🔄 Last Rotated: ' + stats.lastRotated + '\n';
        text += '⏱️ Rotation Interval: ' + stats.rotationInterval;
        return sock.sendMessage(sender, { text: text });
      }

      default:
        return sock.sendMessage(sender, { text: HELP });
    }
  },
};
