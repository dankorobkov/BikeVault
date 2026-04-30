import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';

interface Props {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  /** Optional primary CTA shown under the subtitle. */
  actionLabel?: string;
  onAction?: () => void;
  /** Icon shown on the action button (defaults to "add"). */
  actionIcon?: React.ComponentProps<typeof Ionicons>['name'];
}

export default function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  actionIcon = 'add',
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={40} color={C.textTertiary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={styles.actionBtn}
          activeOpacity={0.8}
        >
          <Ionicons name={actionIcon} size={18} color={C.onAccent} />
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 10,
    },
    iconBox: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: C.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: C.text,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: C.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 32,
      lineHeight: 20,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.accent,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 14,
      marginTop: 14,
    },
    actionBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: C.onAccent,
    },
  });
