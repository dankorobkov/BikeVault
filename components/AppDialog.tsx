import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

/**
 * App-styled imperative dialog service.
 *
 * Replaces native Alert.alert / window.confirm which look jarring next
 * to the rest of the UI. Call `dialog.confirm(...)` / `dialog.alert(...)`
 * from anywhere after <DialogRoot /> has been mounted (once, in the
 * root layout).
 *
 * Implementation notes:
 * - Module-level subscriber pattern so any caller can push a dialog
 *   without threading a hook through. Only one dialog at a time — if
 *   one is already open, the new request queues until the current
 *   dialog resolves.
 * - Returns a Promise<boolean> for confirm and Promise<void> for alert
 *   so callers can `await` the user's choice inline. Native Alert.alert's
 *   callback style doesn't fire reliably on RN Web, which is what drove
 *   this replacement.
 */

type Tone = 'default' | 'destructive' | 'warning' | 'info';

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tone of the primary button. 'destructive' -> red, 'warning' -> amber. */
  tone?: Tone;
  /** Extra detail text, smaller and dimmer, shown under the message. */
  hint?: string;
}

interface AlertOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  tone?: Tone;
}

interface ChooseOpts<T extends string> {
  title: string;
  message?: string;
  /**
   * Two-or-more option picker. For 2 options, rendered as a side-by-side
   * row (like a normal confirm). For 3+ the buttons stack vertically to
   * stay readable. The first option whose `cancel: true` is treated as
   * the cancel action (dismissable by overlay tap / back button).
   */
  options: {
    label: string;
    value: T;
    tone?: Tone;
    /** Mark this option as the cancel/escape choice. */
    cancel?: boolean;
  }[];
}

interface QueuedDialog {
  kind: 'confirm' | 'alert' | 'choose';
  opts: ConfirmOpts | AlertOpts | ChooseOpts<string>;
  resolve: (value: any) => void;
}

// ── Module-level state ───────────────────────────────────────────────────
let queue: QueuedDialog[] = [];
let notifySubscriber: (() => void) | null = null;

function push(
  kind: 'confirm' | 'alert' | 'choose',
  opts: ConfirmOpts | AlertOpts | ChooseOpts<string>
) {
  return new Promise<any>((resolve) => {
    queue.push({ kind, opts, resolve });
    notifySubscriber?.();
  });
}

export const dialog = {
  /** Two-button confirm. Resolves to true (confirm) / false (cancel). */
  confirm(opts: ConfirmOpts): Promise<boolean> {
    return push('confirm', opts);
  },
  /** Single-button informational alert. Resolves when dismissed. */
  alert(opts: AlertOpts): Promise<void> {
    return push('alert', opts);
  },
  /**
   * Multi-option picker. Resolves to the chosen option's `value`, or
   * `null` if dismissed via overlay / back.
   */
  choose<T extends string>(opts: ChooseOpts<T>): Promise<T | null> {
    return push('choose', opts as ChooseOpts<string>);
  },
};

// ── Component ────────────────────────────────────────────────────────────

export function DialogRoot() {
  // tick forces a re-render whenever the queue changes so the head of
  // the queue is picked up. We never depend on `current` itself in
  // effects — it's derived directly from the queue each render.
  const [, setTick] = React.useState(0);
  const rerender = React.useCallback(() => setTick((n) => n + 1), []);

  React.useEffect(() => {
    notifySubscriber = rerender;
    return () => {
      notifySubscriber = null;
    };
  }, [rerender]);

  const current = queue[0];

  const handleDismiss = (value: boolean | string | null | void) => {
    const head = queue.shift();
    head?.resolve(value);
    rerender();
  };

  if (!current) return null;

  const kind = current.kind;
  const opts = current.opts as ConfirmOpts & AlertOpts & ChooseOpts<string>;

  // Determine dismiss value based on kind.
  const dismissValue =
    kind === 'confirm'
      ? false
      : kind === 'choose'
      ? null
      : undefined;

  const tone: Tone =
    (opts.tone as Tone) ?? (kind === 'alert' ? 'info' : 'default');

  const primaryColor = toneToColor(tone);
  const iconName = toneToIcon(tone);
  const iconTint = primaryColor;

  const renderButtons = () => {
    if (kind === 'choose') {
      // Stack vertically once we have 3+ options so the labels stay
      // legible. In stacked mode flex:1 would expand height, not
      // width — override with alignSelf:'stretch' per button.
      const stack = opts.options.length >= 3;
      return (
        <View style={stack ? styles.buttonsStacked : styles.buttons}>
          {opts.options.map((o) => {
            const optTone: Tone = (o.tone ?? (o.cancel ? 'default' : tone)) as Tone;
            const isCancel = o.cancel;
            const stretch = stack ? { flex: 0, alignSelf: 'stretch' as const } : null;
            return (
              <TouchableOpacity
                key={o.value + (isCancel ? ':cancel' : '')}
                style={
                  isCancel
                    ? [styles.cancelBtn, stretch]
                    : [styles.primaryBtn, { backgroundColor: toneToColor(optTone) }, stretch]
                }
                // Cancel options resolve to null so callers can use a
                // single `=== null` check for "user backed out".
                onPress={() => handleDismiss(isCancel ? null : o.value)}
              >
                <Text style={isCancel ? styles.cancelBtnText : styles.primaryBtnText}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    const isConfirm = kind === 'confirm';
    return (
      <View style={styles.buttons}>
        {isConfirm && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleDismiss(false)}
          >
            <Text style={styles.cancelBtnText}>
              {opts.cancelLabel ?? 'Cancel'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
          onPress={() => handleDismiss(isConfirm ? true : undefined)}
        >
          <Text style={styles.primaryBtnText}>
            {opts.confirmLabel ?? (isConfirm ? 'Confirm' : 'OK')}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType={Platform.OS === 'ios' ? 'fade' : 'fade'}
      onRequestClose={() => handleDismiss(dismissValue)}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={() => handleDismiss(dismissValue)}
      >
        {/* Inner Pressable stops the tap-to-dismiss when clicking the card */}
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation?.()}>
          <View style={[styles.iconWrap, { backgroundColor: iconTint + '22' }]}>
            <Ionicons name={iconName as any} size={26} color={iconTint} />
          </View>

          <Text style={styles.title}>{opts.title}</Text>
          {opts.message ? (
            <Text style={styles.message}>{opts.message}</Text>
          ) : null}
          {opts.hint ? <Text style={styles.hint}>{opts.hint}</Text> : null}

          {renderButtons()}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function toneToColor(tone: Tone): string {
  if (tone === 'destructive') return Colors.danger;
  if (tone === 'warning') return Colors.warning;
  return Colors.accent;
}

function toneToIcon(tone: Tone): string {
  if (tone === 'destructive') return 'warning';
  if (tone === 'warning') return 'alert-circle-outline';
  if (tone === 'info') return 'information-circle-outline';
  return 'help-circle-outline';
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    // Soft shadow — subtle on dark bg.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 2,
  },
  hint: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 17,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    width: '100%',
  },
  buttonsStacked: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 16,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
});
