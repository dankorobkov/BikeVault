import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

// `useNativeDriver` requires the RCTAnimation native module, which
// doesn't exist on web. Setting it true there triggers a noisy
// "useNativeDriver is not supported because the native animated
// module is missing" warning on every banner show. Falling back to
// the JS driver on web is fine — the banner is a one-shot fade and
// translate, not a 60fps gesture, so the perf delta is invisible.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  onHide?: () => void;
  duration?: number; // ms — default 2200
}

export default function SuccessBanner({ visible, title, subtitle, onHide, duration = 2200 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, tension: 120 }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(translateY, { toValue: -20, duration: 300, useNativeDriver: USE_NATIVE_DRIVER }),
        ]).start(() => onHide?.());
      }, duration);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.banner, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.iconBox}>
        <Ionicons name="checkmark-circle" size={22} color={Colors.good} />
      </View>
      <View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.good,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.goodDim ?? '#1a3a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
});
