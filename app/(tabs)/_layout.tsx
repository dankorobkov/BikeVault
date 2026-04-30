import { Tabs, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import BikeIcon, { type BikeIconName } from '../../components/BikeIcon';
import { useThemeColors } from '../../theme/ThemeProvider';
import { Analytics } from '../../services/analytics';

function ScreenViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    // Map route paths to human-readable screen names
    const nameMap: Record<string, string> = {
      '/': 'Bikes',
      '/(tabs)': 'Bikes',
      '/(tabs)/': 'Bikes',
      '/(tabs)/garage': 'Garage',
      '/(tabs)/settings': 'Settings',
    };
    const screenName = nameMap[pathname] ?? pathname;
    Analytics.screenView(screenName);
  }, [pathname]);
  return null;
}

/**
 * Tab-bar icon factory — renders the new BikeIcon set, switching the
 * line variant for inactive tabs and the filled variant for the
 * active one. Matches the Apex spec: outline → filled when selected.
 */
const tabIcon =
  (name: BikeIconName) =>
  ({ color, focused }: { color: string; focused: boolean }) =>
    (
      <BikeIcon
        name={name}
        variant={focused ? 'fill' : 'line'}
        size={24}
        color={color}
        accent={color}
      />
    );

export default function TabsLayout() {
  const C = useThemeColors();

  return (
    <>
      <ScreenViewTracker />
      <Tabs
      screenOptions={{
        // Each tab screen manages its own title; disable Navigator-level header
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 60 : 88,
          paddingBottom: Platform.OS === 'web' ? 8 : 28,
          paddingTop: 10,
        },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textTertiary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bikes',
          tabBarIcon: tabIcon('bike'),
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garage',
          tabBarIcon: tabIcon('garage'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: tabIcon('settings'),
        }}
      />
    </Tabs>
    </>
  );
}
