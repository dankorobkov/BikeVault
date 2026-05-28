import React, { useMemo, useState } from 'react';
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
import { formatNumber } from '../constants/units';
import PrimaryActionButton, {
  PRIMARY_ACTION_BAR_HEIGHT,
} from './PrimaryActionButton';
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
  type BikeType,
  type BikeWeightMode,
  type BrakeSystem,
  type StravaActivityType,
} from '../types';

interface Props {
  visible: boolean;
  stravaBikes?: Array<{ id: string; name: string; distanceKm: number }>;
  /**
   * Set of `defaultActivity` values that are already owned by other
   * bikes. The app enforces uniqueness because activity-based Strava
   * sync attributes rides via `defaultActivity` — two bikes on the
   * same activity would be ambiguous. These activities are disabled
   * in the picker.
   */
  takenActivities?: ReadonlySet<StravaActivityType>;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    brand: string;
    type: BikeType;
    brakeSystem: BrakeSystem;
    color: string;
    stravaId?: string;
    totalDistance: number;
    defaultActivity: StravaActivityType;
    /** Bike weight in kilograms (decimals OK). Optional. Ignored when mode === 'sum'. */
    weight?: number;
    /** How the bike's displayed weight is computed. Default 'manual'. */
    weightMode: BikeWeightMode;
  }) => Promise<void>;
}

const BIKE_TYPES = Object.entries(BIKE_TYPE_LABELS) as [BikeType, string][];
const BRAKE_SYSTEMS = Object.entries(BRAKE_SYSTEM_LABELS) as [BrakeSystem, string][];
const STRAVA_ACTIVITIES = Object.entries(STRAVA_ACTIVITY_LABELS) as [
  StravaActivityType,
  string,
][];

export default function AddBikeModal({
  visible,
  stravaBikes,
  takenActivities,
  onClose,
  onAdd,
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const taken = takenActivities ?? new Set<StravaActivityType>();
  // Pick a non-colliding activity to start from. If the default-for-type
  // is already taken, walk the list and land on the first free one.
  const firstFreeActivity = (preferred: StravaActivityType): StravaActivityType => {
    if (!taken.has(preferred)) return preferred;
    for (const [key] of STRAVA_ACTIVITIES) {
      if (!taken.has(key)) return key;
    }
    return preferred; // Defensive: every activity taken (shouldn't happen — we have 6, cap is Ride/VirtualRide/etc.)
  };
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState<BikeType>('road');
  const [brakeSystem, setBrakeSystem] = useState<BrakeSystem>('disc-hydraulic');
  const [color, setColor] = useState<string>(C.accent);
  const [stravaId, setStravaId] = useState<string | undefined>();
  const [manualDistance, setManualDistance] = useState('0');
  // Default Strava activity for rides on this bike. Tracked separately
  // from the auto-derived-from-type default so we know whether the user
  // has made an explicit choice — if they haven't, changing the bike
  // type updates the activity to match.
  const [defaultActivity, setDefaultActivity] = useState<StravaActivityType>(
    firstFreeActivity(defaultActivityForBikeType('road'))
  );
  const [activityTouched, setActivityTouched] = useState(false);
  // Bike weight in kilograms (string in the input — empty = "no
  // manual weight set"). Decimals are accepted via decimal-pad. The
  // picker decides whether this number is used, ignored, or shown
  // alongside the components-sum.
  const [weight, setWeight] = useState('');
  const [weightMode, setWeightMode] = useState<BikeWeightMode>('manual');
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (next: BikeType) => {
    setType(next);
    // Follow bike-type unless the user has explicitly picked an
    // activity already. If the default-for-type is taken, fall back
    // to the first free option so we never auto-select a disabled chip.
    if (!activityTouched) {
      setDefaultActivity(firstFreeActivity(defaultActivityForBikeType(next)));
    }
  };

  const handleActivityChange = (next: StravaActivityType) => {
    if (taken.has(next)) return; // Disabled: already used by another bike.
    setDefaultActivity(next);
    setActivityTouched(true);
  };

  const handleSelectStrava = (id: string, bikeName: string, distanceKm: number) => {
    if (stravaId === id) {
      setStravaId(undefined);
    } else {
      setStravaId(id);
      if (!name) setName(bikeName);
      setManualDistance(formatNumber(distanceKm));
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const parsedWeight = Number(weight.replace(/[,\s]/g, ''));
      await onAdd({
        name: name.trim(),
        brand: brand.trim(),
        type,
        brakeSystem,
        color,
        stravaId,
        totalDistance: Number(manualDistance.replace(/[,\s]/g, '')) || 0,
        defaultActivity,
        // Only forward `weight` when it's a positive number — Firestore
        // rejects `undefined` and we don't want to write a 0 sentinel.
        weight: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : undefined,
        weightMode,
      });
      resetForm();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName('');
    setBrand('');
    setType('road');
    setBrakeSystem('disc-hydraulic');
    setColor(C.accent);
    setStravaId(undefined);
    setManualDistance('0');
    setDefaultActivity(firstFreeActivity(defaultActivityForBikeType('road')));
    setActivityTouched(false);
    setWeight('');
    setWeightMode('manual');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header. The primary action moved to the floating button at
            the bottom; the right slot now hosts an invisible "Cancel"
            of the same width so the title stays optically centred. */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { resetForm(); onClose(); }}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Bike</Text>
          <View
            style={styles.headerRightSpacer}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.cancelBtn}>Cancel</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Strava bikes picker */}
          {stravaBikes && stravaBikes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LINK STRAVA BIKE</Text>
              {stravaBikes.map((sb) => (
                <TouchableOpacity
                  key={sb.id}
                  style={[styles.stravaRow, stravaId === sb.id && styles.stravaRowActive]}
                  onPress={() => handleSelectStrava(sb.id, sb.name, sb.distanceKm)}
                >
                  <Ionicons
                    name="bicycle-outline"
                    size={18}
                    color={stravaId === sb.id ? C.accent : C.textSecondary}
                  />
                  <View style={styles.stravaInfo}>
                    <Text style={styles.stravaName}>{sb.name}</Text>
                    <Text style={styles.stravaDist}>{formatNumber(sb.distanceKm)} km</Text>
                  </View>
                  {stravaId === sb.id && (
                    <Ionicons name="checkmark-circle" size={20} color={C.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Name & Brand & Distance */}
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
              <View style={styles.inputDivider} />
              <TextInput
                style={styles.input}
                placeholder="Brand (e.g. Trek, Specialized)"
                placeholderTextColor={C.textTertiary}
                value={brand}
                onChangeText={setBrand}
              />
              <View style={styles.inputDivider} />
              <View style={styles.labeledRow}>
                <View style={styles.labelCol}>
                  <Text style={styles.fieldLabel}>Current distance</Text>
                  <Text style={styles.fieldSub}>Total km on this bike so far</Text>
                </View>
                <TextInput
                  style={styles.inlineInput}
                  placeholder="0"
                  placeholderTextColor={C.textTertiary}
                  value={manualDistance}
                  onChangeText={setManualDistance}
                  keyboardType="numeric"
                  textAlign="right"
                />
                <Text style={styles.unitTag}>km</Text>
              </View>
            </View>
          </View>

          {/* Weight — optional, mode-aware. Manual is the default for
              users who just want to record one number. Sum hides the
              manual field and computes from components. Mixed shows
              both — useful for reconciling scale-measured vs. summed
              part weights. */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>WEIGHT</Text>
            <View style={styles.chipGrid}>
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
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Bike weight</Text>
                    <Text style={styles.fieldSub}>
                      {weightMode === 'mixed'
                        ? 'Your scale reading — we\'ll compare to parts total'
                        : 'Optional — leave blank to skip'}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.inlineInput}
                    placeholder="e.g. 8.25"
                    placeholderTextColor={C.textTertiary}
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                    textAlign="right"
                  />
                  <Text style={styles.unitTag}>kg</Text>
                </View>
              </View>
            )}
            <Text style={styles.hint}>
              {weightMode === 'manual'
                ? 'Show only the weight you enter here.'
                : weightMode === 'sum'
                ? 'Bike weight = total of installed components that have a weight set. Updates automatically as parts change.'
                : 'Show your entered weight, plus the components total alongside as a reference.'}
            </Text>
          </View>

          {/* Bike Type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BIKE TYPE</Text>
            <View style={styles.chipGrid}>
              {BIKE_TYPES.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, type === key && styles.chipActive]}
                  onPress={() => handleTypeChange(key)}
                >
                  <Ionicons
                    name={BIKE_TYPE_ICONS[key] as any}
                    size={14}
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
                  ? 'Direct-drive trainer: we\'ll track chain, cassette and chainring wear. Wheel, tyre and brake components are hidden because the rear wheel is off the bike.'
                  : 'Roller trainers: everything wears like outdoors. Expect the rear tyre to wear significantly faster against the drums — set a shorter lifespan when you add it.'}
              </Text>
            )}
          </View>

          {/* Default activity */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DEFAULT ACTIVITY</Text>
            <View style={styles.chipGrid}>
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
                      size={14}
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
              We pre-select this from the bike type. Each activity can belong to
              only one bike — activities already used by another bike are
              disabled.
            </Text>
          </View>

          {/* Brake System */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BRAKE SYSTEM</Text>
            <View style={styles.chipGrid}>
              {BRAKE_SYSTEMS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, brakeSystem === key && styles.chipActive]}
                  onPress={() => setBrakeSystem(key)}
                >
                  <Text style={[styles.chipText, brakeSystem === key && styles.chipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>
              This controls which brake components appear when adding parts to this bike.
            </Text>
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
        {/* No `disabled` prop — the button always renders vibrant for
            visual consistency with the Add Component flow. `handleAdd`
            already early-returns on empty names, so a premature tap is
            a safe no-op rather than a crash. */}
        <PrimaryActionButton
          label="Save"
          onPress={handleAdd}
          loading={saving}
        />
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
  scroll: { flex: 1 },
  // paddingBottom clears the floating PrimaryActionButton so the last
  // form field is fully reachable above it. Width comes from the
  // component's exported constant — keep them in lockstep.
  content: { padding: 20, gap: 24, paddingBottom: 40 + PRIMARY_ACTION_BAR_HEIGHT },
  // Invisible placeholder that mirrors the Cancel button's width so
  // the title stays optically centred after the right link was removed.
  headerRightSpacer: { opacity: 0 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 1,
  },
  hint: { fontSize: 12, color: C.textTertiary, lineHeight: 17 },
  inputGroup: {
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.text,
  },
  inputDivider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
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
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: C.card,
  },
  chipIcon: { marginRight: 6 },
  chipActive: { backgroundColor: C.accentDim },
  chipDisabled: { opacity: 0.35 },
  chipText: { fontSize: 14, color: C.textSecondary },
  chipTextActive: { color: C.accent, fontWeight: '600' },
  chipTextDisabled: { color: C.textTertiary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: { borderWidth: 3, borderColor: C.white },
  stravaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.transparent,
  },
  stravaRowActive: { borderColor: C.accent },
  stravaInfo: { flex: 1 },
  stravaName: { fontSize: 15, fontWeight: '500', color: C.text },
  stravaDist: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
});
