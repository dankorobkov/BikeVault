/**
 * Invite codes for BikeVault private beta.
 *
 * Each code can be redeemed exactly once. Redemption is tracked in Firestore
 * under `inviteCodes/{code}`; the embedded list below is the whitelist of
 * valid codes that the server will accept.
 *
 * Format: TST-XXXXXXXXXX!X  (prefix, 10 alphanumeric chars, "!", 1 alphanumeric char)
 */

export const INVITE_CODES: readonly string[] = [
  'TST-05MV9NYZ5D!U',
  'TST-0O6SM9ND7E!3',
  'TST-1YX1SLWXOJ!3',
  'TST-2AMR1G15IF!H',
  'TST-2SMYGPMDQT!O',
  'TST-5VDY7BE5JD!P',
  'TST-645TFOB2M3!Z',
  'TST-6NJ2EV98Y8!A',
  'TST-6QYEU97692!J',
  'TST-7034V8U4W8!R',
  'TST-76W4SMH7LZ!1',
  'TST-83CUAICRIF!W',
  'TST-87M5PII9MY!T',
  'TST-8BLET86OC7!B',
  'TST-8OAVM95H71!X',
  'TST-9600OVIH4B!8',
  'TST-9PP7IV7ADR!S',
  'TST-ASREHNSGM4!Z',
  'TST-BCK04ERH6W!H',
  'TST-BYZN2ZTC71!D',
  'TST-C553Q84XYR!G',
  'TST-D9VQWKTKDW!E',
  'TST-DCFV9TXGQC!L',
  'TST-DQ0TEIEGSF!Y',
  'TST-EGAKDIAV8A!L',
  'TST-FHWJYF33ED!G',
  'TST-GW6ORSQXBJ!J',
  'TST-HPX9UO1QK4!5',
  'TST-IHQ71VSY6H!D',
  'TST-J6H8JPWOUS!4',
  'TST-JOH6NXLAW2!0',
  'TST-M19VUU71NR!G',
  'TST-NQCBWFOQ1U!T',
  'TST-O4M1RTEEF9!9',
  'TST-OU17U04JWA!J',
  'TST-Q1DV2SHG14!M',
  'TST-Q6K3WNNS40!O',
  'TST-QE5VUAIDPX!Z',
  'TST-R1PCLTBJX8!C',
  'TST-R67WX2IKHL!8',
  'TST-RDWXJ373XC!T',
  'TST-RH2W15R222!5',
  'TST-SCUVWOLV6Q!Y',
  'TST-TXEOKMZ2KE!F',
  'TST-U6974IPW11!P',
  'TST-UQT4PTUIKJ!J',
  'TST-VG8559L6Q7!V',
  'TST-W86HKKBA1K!N',
  'TST-XSWY8E79TO!T',
  'TST-YI2AZ5AOY0!H',
] as const;

const CODE_SET = new Set(INVITE_CODES);

/** Normalises user-typed codes (uppercases + trims). */
export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/** Shape validation only — does not check whether the code has been consumed. */
export function isValidInviteCodeFormat(code: string): boolean {
  return /^TST-[A-Z0-9]{10}![A-Z0-9]$/.test(code);
}

/** Returns true if `code` is in the embedded whitelist. */
export function isKnownInviteCode(code: string): boolean {
  return CODE_SET.has(code);
}
