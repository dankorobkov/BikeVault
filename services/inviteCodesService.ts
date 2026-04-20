import {
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  isKnownInviteCode,
  isValidInviteCodeFormat,
  normalizeInviteCode,
} from '../constants/inviteCodes';

export type InviteRedemptionError =
  | 'invalid-format'
  | 'unknown-code'
  | 'already-redeemed'
  | 'unknown';

export class InviteCodeError extends Error {
  code: InviteRedemptionError;
  constructor(code: InviteRedemptionError, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Atomically claims an invite code for `userId`. Returns the normalized code
 * on success. Throws `InviteCodeError` with one of the `InviteRedemptionError`
 * values on failure.
 *
 * The code must:
 *   1. Match the TST-XXXXXXXXXX!X format.
 *   2. Appear in the embedded whitelist (constants/inviteCodes.ts).
 *   3. Not already be claimed by another user in Firestore.
 *
 * Redemption is performed inside a Firestore transaction so two users
 * cannot claim the same code simultaneously.
 */
export async function redeemInviteCode(
  rawCode: string,
  userId: string
): Promise<string> {
  const code = normalizeInviteCode(rawCode);

  if (!isValidInviteCodeFormat(code)) {
    throw new InviteCodeError('invalid-format', 'Code format is invalid.');
  }
  if (!isKnownInviteCode(code)) {
    throw new InviteCodeError('unknown-code', 'That code is not recognised.');
  }

  const ref = doc(db, 'inviteCodes', code);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (data.consumedBy && data.consumedBy !== userId) {
          throw new InviteCodeError(
            'already-redeemed',
            'This code has already been redeemed.'
          );
        }
        // Same user re-redeeming — allow idempotently
        return;
      }
      tx.set(ref, {
        code,
        consumedBy: userId,
        consumedAt: serverTimestamp(),
      });
    });
  } catch (e) {
    if (e instanceof InviteCodeError) throw e;
    throw new InviteCodeError(
      'unknown',
      e instanceof Error ? e.message : 'Could not redeem code.'
    );
  }

  return code;
}
