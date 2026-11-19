// WhatsApp number parsing (js/whatsapp.js): no browser, no network. Run: node tests/whatsapp.mjs
import { normalizeWhatsapp as n } from '../js/phone.js';
let bad = 0;
const eq = (input, want) => { const got = n(input); if (got !== want) { bad++; console.log('  FAIL', JSON.stringify(input), '->', got, 'want', want); } };
// accepted: all forms of the same Indonesian number
for (const x of ['081234567890', '0812-3456-7890', '0812 3456 7890', '+62 812 3456 7890', '+6281234567890', '6281234567890', '81234567890', '006281234567890', '(0812) 3456.7890', '  081234567890  '])
  eq(x, '6281234567890');
// accepted: another country with "+"
eq('+60 12-345 6789', '60123456789');
eq('+1 (415) 555-2671', '14155552671');
// rejected
for (const x of ['', '   ', 'abc', '0812abc3456', '12345', '0812345', '08123456789012345', '0712345678', '+62 712 3456 7890', '+0123456789', '+12345', '081234567890 ext 5', null, undefined])
  eq(x, null);
// the migration's placeholder must itself be a stored-looking number (62 + ten zeros) that the form would reject as a real one
if (n('620000000000') !== null) { bad++; console.log('  FAIL placeholder must not pass as a real number'); }
console.log(bad ? `${bad} failed` : 'whatsapp number parsing OK');
process.exitCode = bad ? 1 : 0;
