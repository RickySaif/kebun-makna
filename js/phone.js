// phone.js — WhatsApp number parsing (pure: no DOM, so tests can run it in Node).
// Numbers are kept as digits with the country code and no "+", for example 6281234567890.

/** "0812-3456-7890", "+62 812 3456 7890", "6281234567890", "8123456789" -> "6281234567890" (null if it is not a phone number).
 *  Indonesian mobile numbers must look like 628…; a number with another "+" country code is accepted as typed. */
export function normalizeWhatsapp(input) {
  let s = String(input || '').trim();
  if (!s || /[^\d\s+\-().]/.test(s)) return null;
  const plus = s.startsWith('+');
  s = s.replace(/\D/g, '');
  if (plus || s.startsWith('00')) { if (!plus) s = s.slice(2); }
  else if (s.startsWith('0')) s = '62' + s.slice(1);
  else if (s.startsWith('8')) s = '62' + s;
  if (s.startsWith('62')) return /^628[0-9]{8,11}$/.test(s) ? s : null;
  return /^[1-9][0-9]{7,14}$/.test(s) ? s : null;
}
export const showWhatsapp = d => '+' + d;

/** The stand-in number given to accounts that existed before the number became mandatory (see the migration). */
export const PLACEHOLDER_WHATSAPP = '620000000000';
export const isPlaceholderWhatsapp = d => d === PLACEHOLDER_WHATSAPP;
