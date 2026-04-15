import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
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

  return (
    <View style={styles.bar}>
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
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
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
    height: Platform.OS === 'web' ? 60 : 88,
    paddingBottom: Platform.OS === 'web' ? 8 : 28,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  labelActive: {
    color: Colors.accent,
  },
});
