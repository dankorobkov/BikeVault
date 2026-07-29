import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAppStore } from '../store/useAppStore';
import { deleteBike } from '../services/bikesService';
import { deleteComponent } from '../services/componentsService';
import { setOverLimitSince as persistOverLimitSince } from '../services/userService';
import { dialog } from '../components/AppDialog';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import { FREE_BIKE_LIMIT, FREE_COMPONENT_LIMIT } from '../constants/subscription';

/**
 * Mandatory "choose what to keep" gate. Reached (via AuthGate in
 * app/_layout.tsx) when a free-tier account has been over the
 * FREE_BIKE_LIMIT / FREE_COMPONENT_LIMIT caps for more than the 30-day
 * grace period — typically after unsubscribing or a mock subscription
 * expiring while the garage had grown past the free limits.
 *
 * Two steps, skipped individually when not needed:
 *   1. Pick exactly FREE_BIKE_LIMIT bikes to keep (only shown if over the
 *      bike cap). Everything else — and all of ITS components — is
 *      deleted.
 *   2. Pick exactly FREE_COMPONENT_LIMIT components to keep from what's
 *      left (components on kept bikes + in-stock). Only shown if that
 *      set is still over the component cap.
 *
 * Deletion happens once, on confirm, after a destructive-action dialog.
 * There's no way back into the app until the account is back under both
 * caps — the only escape hatch is signing out (mirrors the invite-code
 * gate's "use a different account").
 */
export default function TrimSelectionScreen() {
  const router = useRouter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const {
    userId,
    bikes,
    components,
    removeBikeLocal,
    removeComponentLocal,
    setOverLimitSinceLocal,
    signOut,
  } = useAppStore();

  const needsBikeStep = bikes.length > FREE_BIKE_LIMIT;

  const [phase, setPhase] = useState<'bikes' | 'components'>(
    needsBikeStep ? 'bikes' : 'components'
  );
  const [selectedBikeIds, setSelectedBikeIds] = useState<Set<string>>(
    needsBikeStep ? new Set() : new Set(bikes.map((b) => b.id))
  );
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Safety net: if the garage is no longer over limit (data changed from
  // under us, or this got reached in error), don't strand the user here.
  useEffect(() => {
    if (bikes.length <= FREE_BIKE_LIMIT && components.length <= FREE_COMPONENT_LIMIT) {
      router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bikes.length, components.length]);

  const keptBikeIds = needsBikeStep ? selectedBikeIds : new Set(bikes.map((b) => b.id));

  const eligibleComponents = useMemo(
    () => components.filter((c) => c.bikeId === null || keptBikeIds.has(c.bikeId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [components, needsBikeStep, selectedBikeIds]
  );
  const needsComponentStep = eligibleComponents.length > FREE_COMPONENT_LIMIT;

  const bikeName = (id: string | null) =>
    id ? bikes.find((b) => b.id === id)?.name ?? 'Unknown bike' : 'In stock';

  const toggleBike = (id: string) => {
    setSelectedBikeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < FREE_BIKE_LIMIT) next.add(id);
      return next;
    });
  };

  const toggleComponent = (id: string) => {
    setSelectedComponentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < FREE_COMPONENT_LIMIT) next.add(id);
      return next;
    });
  };

  const handleContinueFromBikes = () => {
    if (selectedBikeIds.size !== FREE_BIKE_LIMIT) return;
    setPhase('components');
    setSelectedComponentIds(new Set());
  };

  const canConfirm =
    (!needsBikeStep || selectedBikeIds.size === FREE_BIKE_LIMIT) &&
    (!needsComponentStep || selectedComponentIds.size === FREE_COMPONENT_LIMIT);

  const handleConfirm = async () => {
    if (!userId || !canConfirm) return;

    const finalComponentIds = needsComponentStep
      ? selectedComponentIds
      : new Set(eligibleComponents.map((c) => c.id));

    const discardedBikes = bikes.filter((b) => !keptBikeIds.has(b.id));
    const componentsOnDiscardedBikes = components.filter(
      (c) => c.bikeId !== null && !keptBikeIds.has(c.bikeId)
    );
    const discardedEligibleComponents = eligibleComponents.filter(
      (c) => !finalComponentIds.has(c.id)
    );
    const discardedComponentCount =
      componentsOnDiscardedBikes.length + discardedEligibleComponents.length;
    const totalDiscarded = discardedBikes.length + discardedComponentCount;

    if (totalDiscarded === 0) {
      // Nothing left to discard (edge case) — just clear the gate.
      await finish();
      return;
    }

    const ok = await dialog.confirm({
      title: 'Delete the rest?',
      message:
        `This deletes ${discardedBikes.length} bike${discardedBikes.length === 1 ? '' : 's'} and ` +
        `${discardedComponentCount} component${discardedComponentCount === 1 ? '' : 's'} ` +
        `you didn't select. This can't be undone.`,
      confirmLabel: 'Delete & continue',
      tone: 'destructive',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      for (const b of discardedBikes) {
        try {
          await deleteBike(userId, b.id);
        } catch (e) {
          console.warn('Failed to delete bike during trim:', e);
        }
        removeBikeLocal(b.id); // also strips its components from local state
      }
      // Components on discarded bikes are gone locally already (via
      // removeBikeLocal above) but bikesService.deleteBike doesn't
      // cascade in Firestore — delete them explicitly so they don't
      // silently keep counting toward the free-tier cap.
      for (const c of componentsOnDiscardedBikes) {
        try {
          await deleteComponent(userId, c.id);
        } catch (e) {
          console.warn('Failed to delete orphaned component during trim:', e);
        }
      }
      for (const c of discardedEligibleComponents) {
        try {
          await deleteComponent(userId, c.id);
        } catch (e) {
          console.warn('Failed to delete component during trim:', e);
        }
        removeComponentLocal(c.id);
      }
      await finish();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      dialog.alert({ title: 'Could not finish', message: msg, tone: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const finish = async () => {
    if (userId) {
      try {
        await persistOverLimitSince(userId, null);
      } catch (e) {
        console.warn('Failed to clear overLimitSince:', e);
      }
    }
    setOverLimitSinceLocal(null);
    router.replace('/(tabs)');
  };

  const handleSignOut = async () => {
    const ok = await dialog.confirm({
      title: 'Sign out',
      message: 'You can come back and finish choosing what to keep any time.',
      confirmLabel: 'Sign Out',
      tone: 'destructive',
    });
    if (!ok) return;
    await firebaseSignOut(auth);
    signOut();
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.iconBox}>
            <Ionicons name="funnel-outline" size={36} color={C.accent} />
          </View>
          <Text style={styles.title}>Choose what to keep</Text>
          <Text style={styles.subtitle}>
            Your garage is over the free plan limit ({FREE_BIKE_LIMIT} bikes /{' '}
            {FREE_COMPONENT_LIMIT} components) and the 30-day grace period has ended.
            Subscribe from Settings to keep everything, or pick what to keep below —
            the rest will be deleted.
          </Text>
        </View>

        {phase === 'bikes' ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              PICK {FREE_BIKE_LIMIT} BIKES TO KEEP ({selectedBikeIds.size}/{FREE_BIKE_LIMIT})
            </Text>
            <View style={styles.card}>
              {bikes.map((b, idx) => {
                const checked = selectedBikeIds.has(b.id);
                const disabled = !checked && selectedBikeIds.size >= FREE_BIKE_LIMIT;
                return (
                  <View key={b.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <TouchableOpacity
                      style={[styles.optionRow, disabled && styles.optionRowDisabled]}
                      onPress={() => toggleBike(b.id)}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.bikeDot, { backgroundColor: b.color ?? C.accent }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle}>{b.name}</Text>
                        <Text style={styles.optionSub}>
                          {b.brand ? b.brand + ' · ' : ''}
                          {Math.round(b.totalDistance)} km
                        </Text>
                      </View>
                      <Ionicons
                        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={checked ? C.accent : C.textTertiary}
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, selectedBikeIds.size !== FREE_BIKE_LIMIT && styles.confirmBtnDisabled]}
              onPress={handleContinueFromBikes}
              disabled={selectedBikeIds.size !== FREE_BIKE_LIMIT}
            >
              <Text style={styles.confirmBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            {needsComponentStep ? (
              <>
                <Text style={styles.sectionLabel}>
                  PICK {FREE_COMPONENT_LIMIT} COMPONENTS TO KEEP ({selectedComponentIds.size}/
                  {FREE_COMPONENT_LIMIT})
                </Text>
                <View style={styles.card}>
                  {eligibleComponents.map((c, idx) => {
                    const checked = selectedComponentIds.has(c.id);
                    const disabled = !checked && selectedComponentIds.size >= FREE_COMPONENT_LIMIT;
                    return (
                      <View key={c.id}>
                        {idx > 0 && <View style={styles.divider} />}
                        <TouchableOpacity
                          style={[styles.optionRow, disabled && styles.optionRowDisabled]}
                          onPress={() => toggleComponent(c.id)}
                          disabled={disabled}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.optionTitle}>{c.name}</Text>
                            <Text style={styles.optionSub}>{bikeName(c.bikeId)}</Text>
                          </View>
                          <Ionicons
                            name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={checked ? C.accent : C.textTertiary}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>KEEPING</Text>
                <View style={styles.card}>
                  {eligibleComponents.map((c, idx) => (
                    <View key={c.id}>
                      {idx > 0 && <View style={styles.divider} />}
                      <View style={styles.optionRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.optionTitle}>{c.name}</Text>
                          <Text style={styles.optionSub}>{bikeName(c.bikeId)}</Text>
                        </View>
                        <Ionicons name="checkmark-circle" size={22} color={C.accent} />
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {needsBikeStep && (
              <TouchableOpacity style={styles.backLink} onPress={() => setPhase('bikes')}>
                <Ionicons name="chevron-back" size={16} color={C.textSecondary} />
                <Text style={styles.backLinkText}>Change bikes</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.confirmBtn, (!canConfirm || submitting) && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm || submitting}
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm & continue</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.signOutLink} onPress={handleSignOut} disabled={submitting}>
          <Text style={styles.signOutLinkText}>Sign out instead</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    scroll: { flexGrow: 1, padding: 20, paddingTop: 64, paddingBottom: 40, gap: 24 },
    hero: { alignItems: 'center', gap: 12, marginBottom: 4 },
    iconBox: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: C.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 24, fontWeight: '800', color: C.text, textAlign: 'center', letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
    section: { gap: 10 },
    sectionLabel: { fontSize: 11, fontWeight: '600', color: C.textSecondary, letterSpacing: 1 },
    card: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },
    divider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 16,
    },
    optionRowDisabled: { opacity: 0.4 },
    optionTitle: { fontSize: 15, fontWeight: '500', color: C.text },
    optionSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    bikeDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: C.border },
    confirmBtn: {
      backgroundColor: C.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    confirmBtnDisabled: { opacity: 0.4 },
    confirmBtnText: { fontSize: 16, fontWeight: '700', color: C.white },
    backLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'center', padding: 6 },
    backLinkText: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
    signOutLink: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 'auto' },
    signOutLinkText: { color: C.danger, fontSize: 14, fontWeight: '600' },
  });
