import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAppStore } from '../store/useAppStore';
import {
  InviteCodeError,
  redeemInviteCode,
} from '../services/inviteCodesService';
import { createUserProfile } from '../services/userService';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import { dialog } from '../components/AppDialog';

export default function InviteCodeScreen() {
  const router = useRouter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const {
    userId,
    userDisplayName,
    userEmail,
    userPhotoUrl,
    setHasProfile,
  } = useAppStore();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!userId) {
      dialog.alert({
        title: 'Not signed in',
        message: 'Please sign in again.',
        tone: 'warning',
      });
      return;
    }
    if (!code.trim()) {
      dialog.alert({
        title: 'Missing code',
        message: 'Enter your invite code to continue.',
        tone: 'warning',
      });
      return;
    }
    setSubmitting(true);
    try {
      const normalized = await redeemInviteCode(code, userId);
      await createUserProfile(userId, {
        email: userEmail,
        displayName: userDisplayName,
        photoUrl: userPhotoUrl,
        signupCode: normalized,
      });
      setHasProfile(true);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      let message = 'Could not verify code.';
      if (e instanceof InviteCodeError) {
        switch (e.code) {
          case 'invalid-format':
            message = 'Code format looks wrong. Example: TST-5G8S0GDGS4!D';
            break;
          case 'unknown-code':
            message = 'This code is not recognised. Double-check it and try again.';
            break;
          case 'already-redeemed':
            message = 'This code has already been used by someone else.';
            break;
          default:
            message = e.message;
        }
      } else if (e instanceof Error) {
        message = e.message;
      }
      dialog.alert({
        title: 'Invalid code',
        message,
        tone: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    // User doesn't have a valid code — sign them out so they can try a
    // different account, or fall back to anonymous mode.
    await firebaseSignOut(auth);
    router.replace('/login');
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.logoBox}>
            <Ionicons name="key-outline" size={44} color={C.accent} />
          </View>
          <Text style={styles.title}>Enter invite code</Text>
          <Text style={styles.subtitle}>
            BikeVault is in private beta. Enter the code you received to
            finish setting up your account.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>INVITE CODE</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
            placeholder="TST-XXXXXXXXXX!X"
            placeholderTextColor={C.textTertiary}
            style={styles.input}
            maxLength={20}
            editable={!submitting}
          />

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={C.white} />
                <Text style={styles.submitBtnText}>Verify & continue</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={submitting}
          >
            <Text style={styles.cancelBtnText}>Use a different account</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.helper}>
          Each code works for a single account. Need an invite? Reach out to
          the BikeVault team.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C: ColorPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 40,
    gap: 32,
  },
  hero: { alignItems: 'center', gap: 14 },
  logoBox: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: C.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: { gap: 12 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  input: {
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: C.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    letterSpacing: 1.2,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: C.white },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: C.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  helper: {
    fontSize: 12,
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 'auto',
  },
});
