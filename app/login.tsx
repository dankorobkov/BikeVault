import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInAnonymously,
  signInWithPopup,
} from 'firebase/auth';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { auth } from '../config/firebase';
import { Analytics } from '../services/analytics';
import { Colors } from '../constants/colors';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState<'google' | 'anon' | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'bikevault',
    path: 'auth',
  });

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      usePKCE: false,
    },
    discovery
  );

  const handleGoogle = async () => {
    setLoading('google');
    try {
      if (Platform.OS === 'web') {
        // Web: use Firebase popup directly
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        Analytics.login('google');
        // Root layout will react to auth state change and route to either
        // the invite-code screen (first sign-in) or /(tabs).
      } else {
        // Native: use expo-auth-session, then exchange with Firebase
        if (!GOOGLE_CLIENT_ID) {
          throw new Error(
            'Google sign-in is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.'
          );
        }
        const result = await promptAsync();
        if (result?.type === 'success') {
          const { id_token, access_token } = result.params;
          const credential = GoogleAuthProvider.credential(id_token, access_token);
          await signInWithCredential(auth, credential);
          Analytics.login('google');
        } else if (result?.type === 'error') {
          throw new Error(result.error?.message ?? 'Google sign-in failed');
        } else {
          setLoading(null);
          return;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      Alert.alert('Sign-in error', msg);
      setLoading(null);
    }
  };

  const handleAnonymous = async () => {
    setLoading('anon');
    try {
      await signInAnonymously(auth);
      Analytics.login('anonymous');
      // Root layout will react to auth state change
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not sign in';
      Alert.alert('Error', msg);
      setLoading(null);
    }
  };

  return (
    <View style={styles.root}>
      {/* Logo area */}
      <View style={styles.hero}>
        <View style={styles.logoBox}>
          <Ionicons name="bicycle" size={52} color={Colors.accent} />
        </View>
        <Text style={styles.appName}>BikeVault</Text>
        <Text style={styles.tagline}>Track every part. Ride with confidence.</Text>
      </View>

      {/* Auth buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.googleBtn]}
          onPress={handleGoogle}
          disabled={loading !== null}
        >
          {loading === 'google' ? (
            <ActivityIndicator color={Colors.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={Colors.text} />
              <Text style={[styles.btnText, { color: Colors.text }]}>
                Continue with Google
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.btn, styles.anonBtn]}
          onPress={handleAnonymous}
          disabled={loading !== null}
        >
          {loading === 'anon' ? (
            <ActivityIndicator color={Colors.textSecondary} />
          ) : (
            <>
              <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.btnText, { color: Colors.textSecondary }]}>
                Continue without account
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Google sign-in lets you save bikes and components across devices
          and sync with Strava. Anonymous mode shows demo data only — nothing
          is saved to the cloud.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 100,
    paddingBottom: 60,
  },
  hero: { alignItems: 'center', gap: 16 },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: Colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: { gap: 14 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: 16,
  },
  googleBtn: { backgroundColor: Colors.card },
  anonBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnText: { fontSize: 16, fontWeight: '600' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '500',
  },
  disclaimer: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
});
