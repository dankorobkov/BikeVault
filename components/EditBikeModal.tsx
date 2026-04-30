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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import {
  BIKE_TYPE_LABELS,
  BIKE_TYPE_ICONS,
  BIKE_COLORS,
  BRAKE_SYSTEM_LABELS,
  STRAVA_ACTIVITY_LABELS,
  STRAVA_ACTIVITY_ICONS,
} from '../constants/componentTypes';
import {
  isIndoorBike,
  defaultActivityForBikeType,
  formatWeight,
  sumComponentWeights,
  type Bike,
  type BikeType,
  type BikeWeightMode,
  type BrakeSystem,
  type StravaActivityType,
} from '../types';
import { useAppStore } from '../store/useAppStore';

interface Props {
  visible: boolean;
  bike: Bike | null;
  /**
   * Activities owned by OTHER bikes (the bike being edited is expected
   * to be excluded by the caller). These are disabled in the picker so
   * two bikes can't share a default activity — activity-based Strava
   * sync relies on a unique mapping to attribute rides.
   */
  takenActivities?: ReadonlySet<StravaActivityType>;
  onClose: () => void;
  onSave: (data: {
    name: string;
    brand: string;
    type: BikeType;
    brakeSystem: BrakeSystem;
    color: string;
    defaultActivity: StravaActivityType;
    /**
     * Bike weight in kilograms (decimals OK). `null` clears any
     * previously stored value (used when the user empties the field).
     * `undefined` would be stripped by `updateBike`'s undefined-filter
     * and leave the old value in place.
     */
    weight: number | null;
    weightMode: BikeWeightMode;
  }) => Promise<void>;
}

const BIKE_TYPES = Object.entries(BIKE_TYPE_LABELS) as [BikeType, string][];
const BRAKE_SYSTEMS = Object.entries(BRAKE_SYSTEM_LABELS) as [BrakeSystem, string][];
const STRAVA_ACTIVITIES = Object.entries(STRAVA_ACTIVITY_LABELS) as [
  StravaActivityType,
  string,
][];

export default function EditBikeModal({
  visible,
  bike,
  takenActivities,
  onClose,
  onSave,
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { components } = useAppStore();
  const taken = takenActivities ?? new Set<StravaActivityType>();
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState<BikeType>('road');
  const [brakeSystem, setBrakeSystem] = useState<BrakeSystem>('disc-hydraulic');
  const [color, setColor] = useState<string>(C.accent);
  const [defaultActivity, setDefaultActivity] = useState<StravaActivityType>('Ride');
  // Tracks whether the user has explicitly picked an activity this
  // session. If they haven't, changing the bike type updates the
  // activity to the matching default — matches the Add flow UX.
  const [activityTouched, setActivityTouched] = useState(false);
  // Weight in kilograms (string for the input — empty = "no manual
  // weight"). Decimals accepted via decimal-pad keyboard.
  const [weight, setWeight] = useState('');
  const [weightMode, setWeightMode] = useState<BikeWeightMode>('manual');
  const [saving, setSaving] = useState(false);

  // Live components-sum used by the Mixed-mode hint. Computed from the
  // store so the number tracks any add/edit/remove without needing to
  // reopen the modal. Ignored entirely in Manual mode.
  const componentsSum = bike ? sumComponentWeights(bike.id, components) : 0;

  // Sync fields whenever the bike changes or modal opens
  useEffect(() => {
    if (bike && visible) {
      setName(bike.name);
      setBrand(bike.brand ?? '');
      setType(bike.type);
      setBrakeSystem(bike.brakeSystem ?? 'disc-hydraulic');
      setColor(bike.color ?? C.accent);
      setDefaultActivity(
        bike.defaultActivity ?? defaultActivityForBikeType(bike.type)
      );
      setActivityTouched(false);
      setWeight(typeof bike.weight === 'number' && bike.weight > 0 ? String(bike.weight) : '');
      setWeightMode(bike.weightMode ?? 'manual');
    }
  }, [bike, visible]);

  const handleTypeChange = (next: BikeType) => {
    setType(next);
    if (!activityTouched) {
      // Only auto-update if the type-derived activity isn't already
      // owned by another bike — otherwise leave the existing pick so
      // we don't silently land on a disabled chip.
      const candidate = defaultActivityForBikeType(next);
      if (!taken.has(candidate)) setDefaultActivity(candidate);
    }
  };

  const handleActivityChange = (next: StravaActivityType) => {
    if (taken.has(next)) return; // Disabled — owned by another bike.
    setDefaultActivity(next);
    setActivityTouched(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // Weight: empty input → null (clears the field on Firestore).
      // Positive number → store as-is. Sum mode ignores the field but
      // we still preserve whatever the user previously typed in case
      // they switch back to manual.
      const parsedWeight = Number(weight.replace(/[,\s]/g, ''));
      const weightForSave: number | null =
        Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : null;

      await onSave({
        name: name.trim(),
        brand: brand.trim(),
        type,
        brakeSystem,
        color,
        defaultActivity,
        weight: weightForSave,
        weightMode,
      });
      onClose();
    } finally {
      setSaving(false);
    }
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
          <Text style={styles.title}>Edit Bike</Text>
          <TouchableOpacity onPress={handleSave} disabled={!name.trim() || saving}>
            {saving ? (
              <ActivityIndicator color={C.accent} />
            ) : (
              <Text style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Name & Brand */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Bike name *"
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
            </View>
          </View>

          {/* Weight — same layout as the Add flow. Mixed-mode hint
              shows the live components-sum so users can sanity-check
              their scale reading against what's tracked. */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>WEIGHT</Text>
            <View style={styles.chipRow}>
              {(
                [
                  ['manual', 'Manual'],
                  ['sum', 'Sum of parts'],
                  ['mixed', 'Mixed'],
                ] as [BikeWeightMode, string][]
              ).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, weightMode === key && styles.chipActive]}
                  onPress={() => setWeightMode(key)}
                >
                  <Text style={[styles.chipText, weightMode === key && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {weightMode !== 'sum' && (
              <View style={styles.inputGroup}>
                <View style={styles.weightRow}>
                  <View style={styles.weightLabelCol}>
                    <Text style={styles.weightLabel}>Bike weight</Text>
                    <Text style={styles.weightSub}>
                      {weightMode === 'mixed'
                        ? 'Your scale reading'
                        : 'Optional — leave blank to skip'}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.weightInput}
                    placeholder="e.g. 8.25"
                    placeholderTextColor={C.textTertiary}
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                    textAlign="right"
                  />
                  <Text style={styles.weightUnit}>kg</Text>
                </View>
              </View>
            )}
            {weightMode === 'sum' && (
              <Text style={styles.hint}>
                {componentsSum > 0
                  ? 'Bike weight = sum of installed components with a weight set. Currently ' +
                    formatWeight(componentsSum) +
                    '. Updates as parts change.'
                  : 'No installed components have a weight yet — add weights to parts to see the sum.'}
              </Text>
            )}
            {weightMode === 'mixed' && componentsSum > 0 && (
              <Text style={styles.hint}>
                Components total: {formatWeight(componentsSum)} — the difference is your frame, hardware and anything else not tracked as a part.
              </Text>
            )}
            {weightMode === 'manual' && (
              <Text style={styles.hint}>
                Show only the weight you enter here. Component weights aren't shown on the bike.
              </Text>
            )}
          </View>

          {/* Bike type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TYPE</Text>
            <View style={styles.chipRow}>
              {BIKE_TYPES.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, type === key && styles.chipActive]}
                  onPress={() => handleTypeChange(key)}
                >
                  <Ionicons
                    name={BIKE_TYPE_ICONS[key] as any}
                    size={13}
                    color={type === key ? C.accent : C.textSecondary}
                    style={styles.chipIcon}
                  />
                  <Text style={[styles.chipText, type === key && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {isIndoorBike(type) && (
              <Text style={styles.hint}>
                {type === 'trainer-direct-drive'
                  ? 'Direct-drive trainer: rear-wheel components are hidden on the detail screen.'
                  : 'Roller trainers: expect the rear tyre to wear faster than outdoors.'}
              </Text>
            )}
          </View>

          {/* Default activity */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DEFAULT ACTIVITY</Text>
            <View style={styles.chipRow}>
              {STRAVA_ACTIVITIES.map(([key, label]) => {
                const isActive = defaultActivity === key;
                const isTaken = taken.has(key) && !isActive;
                return (
                  <TouchableOpacity
                    key={key}
                    disabled={isTaken}
                    style={[
                      styles.chip,
                      isActive && styles.chipActive,
                      isTaken && styles.chipDisabled,
                    ]}
                    onPress={() => handleActivityChange(key)}
                  >
                    <Ionicons
                      name={STRAVA_ACTIVITY_ICONS[key] as any}
                      size={13}
                      color={
                        isActive
                          ? C.accent
                          : isTaken
                          ? C.textTertiary
                          : C.textSecondary
                      }
                      style={styles.chipIcon}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        isActive && styles.chipTextActive,
                        isTaken && styles.chipTextDisabled,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Each activity belongs to one bike. Activities owned by another
              bike are disabled.
            </Text>
          </View>

          {/* Brake system */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BRAKE SYSTEM</Text>
            <View style={styles.chipRow}>
              {BRAKE_SYSTEMS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, brakeSystem === key && styles.chipActive]}
                  onPress={() => setBrakeSystem(key as BrakeSystem)}
                >
                  <Text
                    style={[styles.chipText, brakeSystem === key && styles.chipTextActive]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Color */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COLOR</Text>
            <View style={styles.colorRow}>
              {BIKE_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    color === c && styles.colorDotActive,
                  ]}
                  onPress={() => setColor(c)}
                >
                  {color === c && (
                    <Ionicons name="checkmark" size={14} color={C.black} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
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
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 1,
  },
  inputGroup: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipIcon: { marginRight: 6 },
  hint: { fontSize: 12, color: C.textTertiary, lineHeight: 17, marginTop: 4 },
  chipActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  chipDisabled: { opacity: 0.35 },
  chipText: { fontSize: 13, fontWeight: '500', color: C.textSecondary },
  chipTextActive: { color: C.accent },
  chipTextDisabled: { color: C.textTertiary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: { borderWidth: 2, borderColor: C.white },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  weightLabelCol: { flex: 1 },
  weightLabel: { fontSize: 15, fontWeight: '500', color: C.text },
  weightSub: { fontSize: 12, color: C.textSecondary, marginTop: 1 },
  weightInput: {
    fontSize: 15,
    fontWeight: '500',
    color: C.accent,
    minWidth: 60,
    textAlign: 'right',
  },
  weightUnit: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
});
