import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { dialog } from './AppDialog';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import { COMPONENT_TYPES, BRAKE_SYSTEM_LABELS } from '../constants/componentTypes';
import { formatNumber } from '../constants/units';
import { ELECTRIC_CATEGORIES } from '../types';
import DateField from './DateField';
import { CHAIN_LUBE_TYPES, CHAIN_LUBE_ORDER } from '../constants/chainLube';
import type { BikeComponent, Bike, ChainLubeType } from '../types';

interface Props {
  visible: boolean;
  component: BikeComponent | null;
  bikes: Bike[];
  onClose: () => void;
  onSave: (
    componentId: string,
    updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>>
  ) => Promise<void>;
  onRetire: (componentId: string) => Promise<void>;
  onMoveToStock: (componentId: string) => Promise<void>;
  onInstallOnBike: (componentId: string, bikeId: string, installDistance: number) => Promise<void>;
  /**
   * Permanently delete the component. Only surfaced for retired
   * components — active and in-stock parts must be retired first so the
   * user can't accidentally wipe a part that's still being tracked.
   */
  onDelete: (componentId: string) => Promise<void>;
}

export default function EditComponentModal({
  visible,
  component,
  bikes,
  onClose,
  onSave,
  onRetire,
  onMoveToStock,
  onInstallOnBike,
  onDelete,
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  // Component weight in kilograms (string for the input — empty
  // means "not weighed", which is different from "0 kg"). Decimals
  // accepted via decimal-pad keyboard.
  const [weight, setWeight] = useState('');
  const [maxLifespan, setMaxLifespan] = useState('');
  const [attentionFreq, setAttentionFreq] = useState('');
  // Distance the part has been ridden BEFORE BikeVault tracked it.
  // Stored on the component as its own field (`priorWear`); the modal
  // surfaces it as a plain number. Pre-v8 documents without that field
  // get a one-shot seed below from (bikeDistance − installDistance) so
  // the legacy implicit encoding still presents sensibly.
  const [priorDistance, setPriorDistance] = useState('');
  const [isElectric, setIsElectric] = useState(false);
  const [chargeInterval, setChargeInterval] = useState('');
  // Chain-lube tracking (only shown when component.category === 'chain').
  const [lubeType, setLubeType] = useState<ChainLubeType | null>(null);
  const [lubeIntervalOverride, setLubeIntervalOverride] = useState('');
  const [lastLubedAt, setLastLubedAt] = useState<number>(Date.now());
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  // Editable install date — back-date for parts fitted before the user
  // started tracking them, or correct a mistake on a recent add.
  const [installDate, setInstallDate] = useState<number>(Date.now());
  const [saving, setSaving] = useState(false);

  // Strip commas/spaces before parsing so "1,000" doesn't become NaN.
  const parseNum = (s: string): number => {
    const cleaned = s.replace(/[,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  useEffect(() => {
    if (component && visible) {
      setName(component.name);
      setBrand(component.brand ?? '');
      setNotes(component.notes ?? '');
      setWeight(typeof component.weight === 'number' ? String(component.weight) : '');
      setMaxLifespan(formatNumber(component.maxLifespan));
      setAttentionFreq(component.attentionFrequency ? formatNumber(component.attentionFrequency) : '');
      // Seed priorDistance from the explicit priorWear field when set
      // (v8+ docs). For legacy components without it, fall back to the
      // old implicit encoding (bikeDistance − installDistance) so users
      // editing pre-v8 parts before the migration has run still see a
      // sensible number. In-stock / retired parts with no current bike
      // just show empty.
      if (typeof component.priorWear === 'number' && component.priorWear > 0) {
        setPriorDistance(formatNumber(component.priorWear));
      } else {
        const currentBike = bikes.find((b) => b.id === component.bikeId);
        const bikeKm = currentBike?.totalDistance ?? 0;
        const legacyPrior = Math.max(0, bikeKm - component.installDistance);
        setPriorDistance(legacyPrior > 0 ? formatNumber(legacyPrior) : '');
      }
      setIsElectric(component.isElectric ?? false);
      setChargeInterval(component.chargeIntervalDays ? String(component.chargeIntervalDays) : '');
      setSelectedBikeId(component.bikeId);
      setInstallDate(component.installDate || Date.now());
      setLubeType(component.lubeType ?? null);
      setLubeIntervalOverride(
        component.lubeIntervalKm ? String(component.lubeIntervalKm) : ''
      );
      setLastLubedAt(component.lastLubedAt ?? component.installDate ?? Date.now());
    }
  }, [component, visible, bikes]);

  if (!component) return null;

  const typeInfo = COMPONENT_TYPES[component.category] ?? {
    label: component.category,
    icon: 'construct-outline',
    defaultLifespan: 5000,
    group: 'other',
  };
  const canBeElectric = ELECTRIC_CATEGORIES.includes(component.category);
  const isActive = component.status === 'active';
  const isInStock = component.status === 'in-stock';
  const isRetired = component.status === 'retired';

  const bikeChanged = selectedBikeId !== component.bikeId;

  // Brake compatibility check
  const brakeFilter = typeInfo.brakeSystemFilter;
  const selectedBike = bikes.find((b) => b.id === selectedBikeId);
  const brakeIncompatible =
    selectedBikeId !== null &&
    brakeFilter !== undefined &&
    selectedBike !== undefined &&
    !brakeFilter.includes(selectedBike.brakeSystem);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // installDistance is the bike's odometer at install time (the
      // anchor for "km on this bike since install"). priorWear is a
      // separate, independent number that's preserved across every
      // migration. Stock parts have no install anchor.
      const prior = Math.max(0, parseNum(priorDistance));
      const targetBike = bikes.find((b) => b.id === selectedBikeId);
      const targetBikeKm = targetBike?.totalDistance ?? 0;
      const nextInstallDistance = selectedBikeId === null ? 0 : targetBikeKm;

      // Weight: empty input means "clear". `updateComponent` strips
      // `undefined`, so setting it to `undefined` here leaves the
      // existing value alone — which would lock users out of clearing
      // a weight once set. Use the same null-sentinel trick as the
      // chain-lube clear path, cast through unknown so the static
      // `BikeComponent` type doesn't have to widen for a write-time
      // sentinel.
      const parsedWeight = weight ? parseNum(weight) : 0;
      const weightUpdate: number | null =
        parsedWeight > 0 ? parsedWeight : null;

      const updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>> = {
        name: name.trim(),
        brand: brand.trim() || undefined,
        notes: notes.trim() || undefined,
        maxLifespan: parseNum(maxLifespan) || component.maxLifespan,
        attentionFrequency: attentionFreq ? parseNum(attentionFreq) : undefined,
        installDate,
        installDistance: nextInstallDistance,
        isElectric: canBeElectric && isElectric,
        chargeIntervalDays:
          canBeElectric && isElectric && chargeInterval
            ? parseNum(chargeInterval)
            : undefined,
        updatedAt: Date.now(),
      };
      // priorWear is a first-class column now. Writing > 0 sets it;
      // writing the null sentinel clears it (same trick used for
      // weight/lubeType further down). Skipping the property leaves
      // the existing value untouched, which matters when nothing in
      // the prior-distance input has changed.
      if (prior > 0) {
        updates.priorWear = prior;
      } else if (typeof component.priorWear === 'number' && component.priorWear > 0) {
        (updates as Record<string, unknown>).priorWear = null;
      }
      // Apply the weight write — `null` clears it server-side, a
      // positive number sets it. Skipping the property entirely keeps
      // the existing value (which is what we want when the input
      // hasn't been touched and the field was already empty).
      if (weightUpdate !== null) {
        updates.weight = weightUpdate;
      } else if (typeof component.weight === 'number') {
        (updates as Record<string, unknown>).weight = null;
      }

      // Chain-lube fields — only relevant for chains. Firestore rejects
      // plain `undefined`; `updateComponent` strips undefined keys, so
      // using `undefined` here leaves the existing value alone. To
      // actively clear a field (user turned tracking off), we'd need
      // `deleteField()` — for now the scanner / UI both gate on a
      // truthy `lubeType`, so writing null is enough to disable alerts.
      if (component.category === 'chain') {
        if (lubeType) {
          updates.lubeType = lubeType;
          updates.lastLubedAt = lastLubedAt;
          updates.lubeIntervalKm = lubeIntervalOverride
            ? parseNum(lubeIntervalOverride)
            : undefined;
          // If the user just logged a re-lube (or moved the date), anchor
          // lubeDistanceAtLastLube to the currently assigned bike's
          // odometer. This is the only sensible mapping from
          // "I lubed at date X" to a km baseline, since we don't keep a
          // per-day ride history. If they didn't change the date, preserve
          // the existing anchor.
          if (lastLubedAt !== component.lastLubedAt) {
            const currentBike = bikes.find((b) => b.id === selectedBikeId);
            updates.lubeDistanceAtLastLube = currentBike?.totalDistance ?? 0;
          }
        } else if (component.lubeType) {
          // User has turned off lube tracking on a chain that had it.
          // Cast through unknown so we can write the "disable" sentinel
          // without widening the BikeComponent type.
          (updates as Record<string, unknown>).lubeType = null;
        }
      }
      await onSave(component.id, updates);

      // Handle bike reassignment separately
      if (bikeChanged) {
        if (selectedBikeId === null) {
          await onMoveToStock(component.id);
        } else {
          await onInstallOnBike(component.id, selectedBikeId, nextInstallDistance);
        }
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRetire = async () => {
    const ok = await dialog.confirm({
      title: 'Retire Component',
      message: 'Mark "' + component.name + '" as retired?',
      confirmLabel: 'Retire',
      tone: 'warning',
    });
    if (!ok) return;
    await onRetire(component.id);
    onClose();
  };

  const handleMoveToStock = async () => {
    await onMoveToStock(component.id);
    onClose();
  };

  /**
   * Permanently delete a retired component. Two-step confirmation via
   * the app dialog because there's no undo — once Firestore + the local
   * store are cleared, the component is gone, including its install
   * date, lifespan and any chain-lube history.
   */
  const handleDelete = async () => {
    const ok = await dialog.confirm({
      title: 'Delete Permanently',
      message:
        'Permanently delete "' +
        component.name +
        '"? This removes its full history and cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    await onDelete(component.id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Edit Component</Text>
          <TouchableOpacity onPress={handleSave} disabled={!name.trim() || saving}>
            {saving ? (
              <ActivityIndicator color={C.accent} />
            ) : (
              <Text style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Category badge (read-only) */}
          <View style={styles.categoryBadge}>
            <Ionicons name={typeInfo.icon as any} size={16} color={C.accent} />
            <Text style={styles.categoryBadgeText}>{typeInfo.label}</Text>
            {isRetired && (
              <View style={styles.retiredBadge}>
                <Text style={styles.retiredBadgeText}>Retired</Text>
              </View>
            )}
          </View>

          {/* Details */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Component name *"
                placeholderTextColor={C.textTertiary}
                value={name}
                onChangeText={setName}
              />
              <View style={styles.divider} />
              <TextInput
                style={styles.input}
                placeholder="Brand (optional)"
                placeholderTextColor={C.textTertiary}
                value={brand}
                onChangeText={setBrand}
              />
              <View style={styles.divider} />
              {/* Component weight in kilograms (decimals allowed).
                  Clearing the field on Save removes the recorded
                  weight (handled in handleSave). */}
              <View style={styles.labeledRow}>
                <View style={styles.labelCol}>
                  <Text style={styles.fieldLabel}>Weight</Text>
                  <Text style={styles.fieldSub}>Optional — feeds the bike's total</Text>
                </View>
                <TextInput
                  style={styles.inlineInput}
                  placeholder="—"
                  placeholderTextColor={C.textTertiary}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  textAlign="right"
                />
                <Text style={styles.unitTag}>kg</Text>
              </View>
            </View>
          </View>

          {/* Wear tracking */}
          {!isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>WEAR TRACKING</Text>
              <View style={styles.inputGroup}>
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Date added</Text>
                    <Text style={styles.fieldSub}>When it was installed</Text>
                  </View>
                  <DateField
                    value={installDate}
                    onChange={setInstallDate}
                    maxDate={Date.now()}
                    align="right"
                    color={C.accent}
                    fontWeight="500"
                  />
                </View>
                <View style={styles.divider} />
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Already ridden</Text>
                    <Text style={styles.fieldSub}>
                      Distance already on this part
                    </Text>
                  </View>
                  <TextInput
                    style={styles.inlineInput}
                    placeholder="0"
                    placeholderTextColor={C.textTertiary}
                    value={priorDistance}
                    onChangeText={setPriorDistance}
                    keyboardType="numeric"
                    textAlign="right"
                  />
                  <Text style={styles.unitTag}>km</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Max lifespan</Text>
                    <Text style={styles.fieldSub}>Expected total distance</Text>
                  </View>
                  <TextInput
                    style={styles.inlineInput}
                    placeholder={formatNumber(typeInfo.defaultLifespan)}
                    placeholderTextColor={C.textTertiary}
                    value={maxLifespan}
                    onChangeText={setMaxLifespan}
                    keyboardType="numeric"
                    textAlign="right"
                  />
                  <Text style={styles.unitTag}>km</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Service every</Text>
                    <Text style={styles.fieldSub}>Maintenance reminder interval</Text>
                  </View>
                  <TextInput
                    style={styles.inlineInput}
                    placeholder="—"
                    placeholderTextColor={C.textTertiary}
                    value={attentionFreq}
                    onChangeText={setAttentionFreq}
                    keyboardType="numeric"
                    textAlign="right"
                  />
                  <Text style={styles.unitTag}>km</Text>
                </View>
              </View>
            </View>
          )}

          {/* Chain lube — only for chains, not when retired */}
          {component.category === 'chain' && !isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CHAIN LUBE</Text>
              <Text style={styles.hint}>
                Track what you lube with and we'll remind you when it's due.
              </Text>
              <View style={styles.bubblesRow}>
                <TouchableOpacity
                  style={[styles.bubble, lubeType === null && styles.bubbleActive]}
                  onPress={() => setLubeType(null)}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      lubeType === null && styles.bubbleTextActive,
                    ]}
                  >
                    Not tracking
                  </Text>
                </TouchableOpacity>
                {CHAIN_LUBE_ORDER.map((lt) => {
                  const meta = CHAIN_LUBE_TYPES[lt];
                  const isSelected = lubeType === lt;
                  return (
                    <TouchableOpacity
                      key={lt}
                      style={[styles.bubble, isSelected && styles.bubbleActive]}
                      onPress={() => setLubeType(lt)}
                    >
                      <View style={styles.lubeBubbleInner}>
                        <Ionicons
                          name={meta.icon}
                          size={14}
                          color={isSelected ? C.accent : C.textSecondary}
                        />
                        <Text
                          style={[
                            styles.bubbleText,
                            isSelected && styles.bubbleTextActive,
                          ]}
                        >
                          {meta.shortLabel}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {lubeType && (
                <>
                  <Text style={styles.hint}>
                    {CHAIN_LUBE_TYPES[lubeType].description}
                  </Text>
                  <View style={[styles.inputGroup, { marginTop: 4 }]}>
                    <View style={styles.labeledRow}>
                      <View style={styles.labelCol}>
                        <Text style={styles.fieldLabel}>Last lubed</Text>
                        <Text style={styles.fieldSub}>
                          When you most recently applied lube
                        </Text>
                      </View>
                      <DateField
                        value={lastLubedAt}
                        onChange={setLastLubedAt}
                        maxDate={Date.now()}
                        align="right"
                        color={C.accent}
                        fontWeight="500"
                      />
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.labeledRow}>
                      <View style={styles.labelCol}>
                        <Text style={styles.fieldLabel}>Re-lube every</Text>
                        <Text style={styles.fieldSub}>
                          Default:{' '}
                          {formatNumber(CHAIN_LUBE_TYPES[lubeType].defaultIntervalKm)} km
                        </Text>
                      </View>
                      <TextInput
                        style={styles.inlineInput}
                        placeholder={formatNumber(
                          CHAIN_LUBE_TYPES[lubeType].defaultIntervalKm
                        )}
                        placeholderTextColor={C.textTertiary}
                        value={lubeIntervalOverride}
                        onChangeText={setLubeIntervalOverride}
                        keyboardType="numeric"
                        textAlign="right"
                      />
                      <Text style={styles.unitTag}>km</Text>
                    </View>
                  </View>

                  {/* "Log re-lube" — shortcut: sets lastLubed=now and
                      anchors the odometer to the current bike distance. */}
                  <TouchableOpacity
                    style={styles.relubeBtn}
                    onPress={() => {
                      setLastLubedAt(Date.now());
                    }}
                  >
                    <Ionicons name="refresh-outline" size={16} color={C.accent} />
                    <Text style={styles.relubeBtnText}>Log re-lube — set to today</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Bike assignment */}
          {!isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ASSIGNED TO</Text>
              <View style={styles.bikeList}>
                {/* In Stock option */}
                <TouchableOpacity
                  style={[styles.bikeRow, selectedBikeId === null && styles.bikeRowActive]}
                  onPress={() => setSelectedBikeId(null)}
                >
                  <View style={[styles.bikeIconBox, selectedBikeId === null && styles.bikeIconBoxActive]}>
                    <Ionicons
                      name="archive-outline"
                      size={16}
                      color={selectedBikeId === null ? C.accent : C.textSecondary}
                    />
                  </View>
                  <Text style={[styles.bikeName, selectedBikeId === null && styles.bikeNameActive]}>
                    In Stock (Garage)
                  </Text>
                  {selectedBikeId === null && (
                    <Ionicons name="checkmark-circle" size={18} color={C.accent} />
                  )}
                </TouchableOpacity>
                <View style={styles.divider} />
                {/* Each bike */}
                {bikes.map((b) => (
                  <React.Fragment key={b.id}>
                    <TouchableOpacity
                      style={[styles.bikeRow, selectedBikeId === b.id && styles.bikeRowActive]}
                      onPress={() => setSelectedBikeId(b.id)}
                    >
                      <View
                        style={[
                          styles.bikeIconBox,
                          { backgroundColor: b.color + '33' },
                          selectedBikeId === b.id && styles.bikeIconBoxActive,
                        ]}
                      >
                        <Ionicons
                          name="bicycle-outline"
                          size={16}
                          color={selectedBikeId === b.id ? C.accent : b.color}
                        />
                      </View>
                      <Text
                        style={[styles.bikeName, selectedBikeId === b.id && styles.bikeNameActive]}
                        numberOfLines={1}
                      >
                        {b.name}
                      </Text>
                      {selectedBikeId === b.id && (
                        <Ionicons name="checkmark-circle" size={18} color={C.accent} />
                      )}
                    </TouchableOpacity>
                    <View style={styles.divider} />
                  </React.Fragment>
                ))}
              </View>
            </View>
          )}

          {/* Brake compatibility warning */}
          {brakeIncompatible && selectedBike && (
            <View style={styles.compatWarning}>
              <Ionicons name="warning" size={16} color={C.warning} />
              <Text style={styles.compatWarningText}>
                <Text style={{ fontWeight: '700' }}>{typeInfo.label}</Text> is designed for{' '}
                {brakeFilter!.map((s) => BRAKE_SYSTEM_LABELS[s]).join(' or ')} brakes,
                but {selectedBike.name} uses{' '}
                {BRAKE_SYSTEM_LABELS[selectedBike.brakeSystem]} brakes.
                Consider putting this in stock instead.
              </Text>
            </View>
          )}

          {/* Electric */}
          {canBeElectric && !isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ELECTRONIC COMPONENT</Text>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Di2 / eTap / electronic component</Text>
                  <Text style={styles.switchSub}>Enables battery tracking</Text>
                </View>
                <Switch
                  value={isElectric}
                  onValueChange={setIsElectric}
                  trackColor={{ true: C.accent, false: C.border }}
                  thumbColor={C.white}
                />
              </View>
              {isElectric && (
                <View style={[styles.inputGroup, { marginTop: 8 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Days from full charge to empty"
                    placeholderTextColor={C.textTertiary}
                    value={chargeInterval}
                    onChangeText={setChargeInterval}
                    keyboardType="numeric"
                  />
                </View>
              )}
            </View>
          )}

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Any notes (optional)"
              placeholderTextColor={C.textTertiary}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          {/* Actions */}
          {!isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ACTIONS</Text>
              <View style={styles.actionsGroup}>
                {isActive && (
                  <TouchableOpacity style={styles.actionRow} onPress={handleMoveToStock}>
                    <Ionicons name="archive-outline" size={18} color={C.accent} />
                    <Text style={styles.actionText}>Move to Stock</Text>
                    <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
                  </TouchableOpacity>
                )}
                {isActive && <View style={styles.divider} />}
                <TouchableOpacity style={styles.actionRow} onPress={handleRetire}>
                  <Ionicons name="checkmark-done-outline" size={18} color={C.warning} />
                  <Text style={[styles.actionText, { color: C.warning }]}>
                    Retire Component
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Danger zone — permanent deletion. Gated to retired
              components so a still-tracked part can't be wiped by
              accident. The retire flow is the documented off-ramp;
              once retired, the user can clear the record entirely. */}
          {isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DANGER ZONE</Text>
              <Text style={styles.hint}>
                Permanently delete this retired component. Its history will be removed and this can't be undone.
              </Text>
              <View style={styles.actionsGroup}>
                <TouchableOpacity style={styles.actionRow} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color={C.danger} />
                  <Text style={[styles.actionText, { color: C.danger }]}>
                    Delete Permanently
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (C: ColorPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: { fontSize: 17, fontWeight: '600', color: C.text },
  cancelBtn: { fontSize: 16, color: C.textSecondary },
  saveBtn: { fontSize: 16, fontWeight: '600', color: C.accent },
  saveBtnDisabled: { opacity: 0.4 },
  content: { padding: 20, gap: 20, paddingBottom: 48 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accentDim,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  categoryBadgeText: { fontSize: 14, fontWeight: '600', color: C.accent },
  retiredBadge: {
    backgroundColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  retiredBadgeText: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 1,
  },
  inputGroup: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text },
  labeledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  labelCol: { flex: 1 },
  fieldLabel: { fontSize: 15, fontWeight: '500', color: C.text },
  fieldSub: { fontSize: 12, color: C.textSecondary, marginTop: 1 },
  inlineInput: {
    fontSize: 15,
    fontWeight: '500',
    color: C.accent,
    minWidth: 60,
    textAlign: 'right',
  },
  unitTag: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: C.card,
    borderRadius: 14,
  },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
  bikeList: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  bikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  bikeRowActive: { backgroundColor: C.accentDim },
  bikeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bikeIconBoxActive: { backgroundColor: C.accentDim },
  bikeName: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  bikeNameActive: { color: C.accent },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '500', color: C.text },
  switchSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  compatWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.warningDim,
    borderRadius: 12,
    padding: 12,
  },
  compatWarningText: {
    flex: 1,
    fontSize: 13,
    color: C.warning,
    lineHeight: 19,
  },
  actionsGroup: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '500', color: C.text },
  hint: { fontSize: 12, color: C.textTertiary, lineHeight: 17 },
  bubblesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  bubbleActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accent,
  },
  bubbleText: { fontSize: 14, color: C.textSecondary, fontWeight: '500' },
  bubbleTextActive: { color: C.accent, fontWeight: '600' },
  lubeBubbleInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  relubeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accentDim,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  relubeBtnText: { fontSize: 14, fontWeight: '600', color: C.accent },
});
