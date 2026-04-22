import React, { useState } from 'react';
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
import { Colors } from '../constants/colors';
import { dialog } from '../components/AppDialog';

export default function InviteCodeScreen() {
  const router = useRouter();
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
            <Ionicons name="key-outline" size={44} color={Colors.accent} />
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
            placeholderTextColor={Colors.textTertiary}
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
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
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
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: { gap: 12 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    color: Colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    letterSpacing: 1.2,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  helper: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 'auto',
  },
});
