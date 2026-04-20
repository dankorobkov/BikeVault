import { Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { Colors } from '../../constants/colors';
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

export default function TabsLayout() {
  return (
    <>
      <ScreenViewTracker />
      <Tabs
      screenOptions={{
        // Each tab screen manages its own title; disable Navigator-level header
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 60 : 88,
          paddingBottom: Platform.OS === 'web' ? 8 : 28,
          paddingTop: 10,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bikes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bicycle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garage',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
    </>
  );
}
