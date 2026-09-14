/**
 * Utility for masking phone numbers and JIDs to preserve privacy.
 * Conforms to PROJECT.md and apiPrivacy.test.js specifications.
 */

/**
 * Safely masks a phone number or JID.
 * Strips JID domains (@s.whatsapp.net, @lid, etc.) and device suffixes (:1, :2) before masking.
 * 
 * Formats:
 * - Nigerian: +234 916 *** 9200
 * - US/North American: +1 (415) ***-2671
 * - International: +<prefix> *** <suffix>
 * - Short numbers: preserved as-is
 * - Empty / null / undefined: returned as ''
 * 
 * @param {string|number|null|undefined} phoneOrJid
 * @returns {string}
 */
function maskPhoneNumber(phoneOrJid) {
  if (phoneOrJid === null || phoneOrJid === undefined || phoneOrJid === '') {
    return '';
  }

  const rawStr = String(phoneOrJid).trim();
  if (!rawStr) return '';
  if (rawStr.includes('***')) return rawStr;

  // 1. Safely strip JID domains (@s.whatsapp.net, @lid, @g.us, etc.)
  const withoutDomain = rawStr.split('@')[0];

  // 2. Safely strip device suffixes (:1, :2, etc.)
  const withoutDevice = withoutDomain.split(':')[0];

  // 3. Extract only digits
  const clean = withoutDevice.replace(/\D/g, '');

  // If not enough digits to mask, return withoutDevice
  if (!clean || clean.length < 7) {
    return withoutDevice;
  }

  // Nigerian standard: +234 916 *** 9200
  if (clean.startsWith('234') && clean.length === 13) {
    const country = clean.slice(0, 3);
    const prefix = clean.slice(3, 6);
    const suffix = clean.slice(-4);
    return `+${country} ${prefix} *** ${suffix}`;
  }

  // Nigerian local: 080... or 091... (11 digits)
  if (clean.startsWith('0') && clean.length === 11) {
    const prefix = clean.slice(1, 4);
    const suffix = clean.slice(-4);
    return `+234 ${prefix} *** ${suffix}`;
  }

  // US / North American numbers: +1 (415) ***-2671
  if (clean.length === 11 && clean.startsWith('1')) {
    const country = clean.slice(0, 1);
    const area = clean.slice(1, 4);
    const suffix = clean.slice(-4);
    return `+${country} (${area}) ***-${suffix}`;
  }

  // Generic international fallback: +<prefix> *** <suffix>
  const head = clean.slice(0, 3);
  const tail = clean.slice(-3);
  return `+${head} *** ${tail}`;
}

module.exports = {
  maskPhoneNumber,
  default: maskPhoneNumber
};
