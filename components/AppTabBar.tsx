import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

type TabName = 'bikes' | 'garage' | 'settings';

interface Props {
  active: TabName;
}

const TABS: { name: TabName; label: string; icon: string; path: string }[] = [
  { name: 'bikes', label: 'Bikes', icon: 'bicycle-outline', path: '/' },
  { name: 'garage', label: 'Garage', icon: 'construct-outline', path: '/garage' },
  { name: 'settings', label: 'Settings', icon: 'settings-outline', path: '/settings' },
];

export default function AppTabBar({ active }: Props) {
  const router = useRouter();
  const [bottomInset, setBottomInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const div = document.createElement('div');
    div.style.cssText =
      'position:fixed;pointer-events:none;visibility:hidden;' +
      'bottom:0;left:0;width:1px;height:1px;' +
      'padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(div);
    const val = parseFloat(getComputedStyle(div).paddingBottom) || 0;
    document.body.removeChild(div);
    setBottomInset(val);
  }, []);

  const pbBottom = Platform.OS === 'web'
    ? Math.max(bottomInset + 8, 8)
    : 28;

  return (
    <View style={[styles.bar, { paddingBottom: pbBottom, height: 52 + pbBottom }]}>
      {TABS.map((tab) => {
        const isActive = tab.name === active;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => router.replace(tab.path as any)}
          >
            <Ionicons
              name={tab.icon as any}
              size={24}
              color={isActive ? Colors.accent : Colors.textTertiary}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
});
