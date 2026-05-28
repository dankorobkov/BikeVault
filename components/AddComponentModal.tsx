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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';
import PrimaryActionButton, {
  PRIMARY_ACTION_BAR_HEIGHT,
} from './PrimaryActionButton';
import {
  COMPONENT_TYPES,
  COMPONENT_GROUP_LABELS,
  getGroupedComponents,
} from '../constants/componentTypes';
import { ELECTRIC_CATEGORIES, hiddenComponentCategoriesForBike } from '../types';
import { useAppStore } from '../store/useAppStore';
import { unitLabel, formatNumber } from '../constants/units';
import DateField from './DateField';
import { CHAIN_LUBE_TYPES, CHAIN_LUBE_ORDER } from '../constants/chainLube';
import type { ComponentCategory, BrakeSystem, BikeType, ChainLubeType } from '../types';

interface Props {
  visible: boolean;
  bikeDistance: number;
  brakeSystem?: BrakeSystem;
  bikeType?: BikeType;
  inStockMode?: boolean;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    category: ComponentCategory;
    brand: string;
    installDate: number;
    installDistance: number;
    /**
     * Prior km from before BikeVault tracked this part. Stored on the
     * component as its own field; the caller forwards it untouched.
     * 0 / undefined / missing all mean "no prior wear".
     */
    priorWear?: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
    lubeType?: ChainLubeType;
    lastLubedAt?: number;
    lubeIntervalKm?: number;
    /** Component weight in kilograms (decimals OK). Optional. */
    weight?: number;
  }) => Promise<void>;
}

export default function AddComponentModal({
  visible,
  bikeDistance,
  brakeSystem,
  bikeType,
  inStockMode = false,
  onClose,
  onAdd,
}: Props) {
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { useMetric } = useAppStore();
  const unit = unitLabel(useMetric);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ComponentCategory>('chain');
  const [brand, setBrand] = useState('');
  // "Prior distance" — km this component has already been ridden before
  // it was tracked in BikeVault. We convert to installDistance (=
  // bikeDistance − priorDistance) on save, so the stored schema is
  // unchanged. This reframes the input to match how riders think about
  // used parts: "I've already put ~3,000 km on this cassette."
  const [priorDistance, setPriorDistance] = useState('');
  const [maxLifespan, setMaxLifespan] = useState('');
  const [attentionFreq, setAttentionFreq] = useState('');
  const [notes, setNotes] = useState('');
  // Component weight in kilograms (string in the input so an empty
  // value means "not weighed" rather than "0 kg"). Decimals accepted
  // via decimal-pad keyboard — e.g. "0.25" for a 250 g chain.
  const [weight, setWeight] = useState('');
  const [isElectric, setIsElectric] = useState(false);
  const [chargeInterval, setChargeInterval] = useState('');
  // Chain-lube tracking (only surfaced when category === 'chain').
  // `lubeType === null` means the user hasn't opted into lube tracking.
  const [lubeType, setLubeType] = useState<ChainLubeType | null>(null);
  const [lubeIntervalOverride, setLubeIntervalOverride] = useState('');
  const [lastLubedAt, setLastLubedAt] = useState<number>(Date.now());
  // Install date — defaults to today, but users adding a part they
  // fitted weeks/months ago can back-date it. Flows into time-based
  // features (attention reminders, battery charge intervals) and is
  // shown on the component card.
  const [installDate, setInstallDate] = useState<number>(Date.now());
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'category' | 'details'>('category');

  // Numeric inputs: strip commas, spaces, and anything that isn't a digit
  // or minus sign so "1,000" parses as 1000 instead of NaN (which would
  // silently fall back to bikeDistance = no wear).
  const parseNum = (s: string): number => {
    const cleaned = s.replace(/[,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  // Hide component categories that don't apply to this bike's setup
  // (e.g. rear-wheel components on a direct-drive trainer). When adding
  // to stock we don't know the destination bike, so nothing is hidden.
  const hiddenCategories = inStockMode || !bikeType
    ? []
    : hiddenComponentCategoriesForBike(bikeType);
  const groupedAll = getGroupedComponents(brakeSystem);
  const grouped = Object.fromEntries(
    Object.entries(groupedAll)
      .map(([g, cats]) => [g, (cats ?? []).filter((c) => !hiddenCategories.includes(c))])
      .filter(([, cats]) => (cats as ComponentCategory[]).length > 0)
  ) as typeof groupedAll;
  const typeInfo = COMPONENT_TYPES[category];
  const canBeElectric = ELECTRIC_CATEGORIES.includes(category);

  const handleSelectCategory = (cat: ComponentCategory) => {
    const info = COMPONENT_TYPES[cat];
    setCategory(cat);
    setMaxLifespan('');
    setAttentionFreq(info.defaultAttentionFrequency ? String(info.defaultAttentionFrequency) : '');
    setIsElectric(false);
    setLubeType(null);
    setLubeIntervalOverride('');
    setLastLubedAt(Date.now());
    setName(info.label);
    setStep('details');
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // installDistance is the bike's odometer reading at install time
      // (the anchor we measure "km on this bike since install" from).
      // priorWear is the pre-BikeVault history; it's its own field now,
      // so the two are independent rather than encoded as a single
      // installDistance = bike − prior delta (which previous migrations
      // could silently destroy).
      const prior = Math.max(0, parseNum(priorDistance));
      const installDistance = inStockMode ? 0 : bikeDistance;
      await onAdd({
        name: name.trim(),
        category,
        brand: brand.trim(),
        installDate,
        installDistance,
        priorWear: prior > 0 ? prior : undefined,
        maxLifespan: parseNum(maxLifespan) || typeInfo.defaultLifespan,
        attentionFrequency: attentionFreq ? parseNum(attentionFreq) : undefined,
        notes: notes.trim(),
        isElectric: canBeElectric && isElectric,
        // For back-dated parts, assume the battery was fresh on
        // install — lets the charge-interval alert fire on schedule
        // rather than instantly.
        lastCharged: isElectric ? installDate : undefined,
        chargeIntervalDays:
          isElectric && chargeInterval ? parseNum(chargeInterval) : undefined,
        lubeType:
          category === 'chain' && lubeType ? lubeType : undefined,
        lastLubedAt:
          category === 'chain' && lubeType ? lastLubedAt : undefined,
        lubeIntervalKm:
          category === 'chain' && lubeType && lubeIntervalOverride
            ? parseNum(lubeIntervalOverride)
            : undefined,
        weight: weight ? parseNum(weight) : undefined,
      });
      resetForm();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName('');
    setCategory('chain');
    setBrand('');
    setPriorDistance('');
    setMaxLifespan('');
    setAttentionFreq('');
    setNotes('');
    setWeight('');
    setIsElectric(false);
    setChargeInterval('');
    setLubeType(null);
    setLubeIntervalOverride('');
    setLastLubedAt(Date.now());
    setInstallDate(Date.now());
    setStep('category');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header. Primary action (Save / Next) moved to the floating
            button at the bottom; right slot now hosts an invisible
            copy of the longest possible left label so the title stays
            optically centred across both steps. */}
        <View style={styles.header}>
          <TouchableOpacity onPress={step === 'category' ? handleClose : () => setStep('category')}>
            <Text style={styles.cancelBtn}>{step === 'category' ? 'Cancel' : '← Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {step === 'category' ? 'Choose Type' : 'Component Details'}
          </Text>
          <View
            style={styles.headerRightSpacer}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.cancelBtn}>
              {step === 'category' ? 'Cancel' : '← Back'}
            </Text>
          </View>
        </View>

        {step === 'category' ? (
          /* ── Step 1: pick category as bubbles ─────────────────── */
          <ScrollView contentContainerStyle={styles.content}>
            {(Object.entries(grouped) as [string, ComponentCategory[]][]).map(([group, cats]) => (
              <View key={group} style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {COMPONENT_GROUP_LABELS[group as keyof typeof COMPONENT_GROUP_LABELS] ?? group}
                </Text>
                <View style={styles.bubblesRow}>
                  {cats.map((cat) => {
                    const info = COMPONENT_TYPES[cat];
                    const isSelected = category === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.bubble, isSelected && styles.bubbleActive]}
                        onPress={() => handleSelectCategory(cat)}
                      >
                        <Text style={[styles.bubbleText, isSelected && styles.bubbleTextActive]}>
                          {info.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          /* ── Step 2: details ────────────────────────────────── */
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {/* Selected category badge */}
            <TouchableOpacity style={styles.selectedBadge} onPress={() => setStep('category')}>
              <Ionicons name={typeInfo.icon as any} size={16} color={C.accent} />
              <Text style={styles.selectedBadgeText}>{typeInfo.label}</Text>
              <Ionicons name="swap-horizontal-outline" size={13} color={C.accent} />
            </TouchableOpacity>

            {/* Basic info */}
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
                <View style={styles.inputDivider} />
                <TextInput
                  style={styles.input}
                  placeholder="Brand (optional)"
                  placeholderTextColor={C.textTertiary}
                  value={brand}
                  onChangeText={setBrand}
                />
                <View style={styles.inputDivider} />
                {/* Weight in kilograms (decimals allowed — e.g. 0.25
                    for a chain, 8.25 for a frame). Optional. Feeds
                    into the parent bike's "sum-of-components" weight
                    when set. */}
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Weight (optional) — e.g. 0.25"
                    placeholderTextColor={C.textTertiary}
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.unitLabel}>kg</Text>
                </View>
              </View>
            </View>

            {/* Lifespan & distance */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>WEAR TRACKING</Text>
              <View style={styles.inputGroup}>
                {/* Install date — back-datable for parts fitted earlier */}
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Date added</Text>
                    <Text style={styles.fieldSub}>
                      When this part was installed on the bike
                    </Text>
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
                <View style={styles.inputDivider} />
                {!inStockMode && (
                  <>
                    {/* Switched from full-width placeholder-as-description
                        to a labelled row: typing into a numeric field used
                        to swallow the description (placeholder hides as
                        soon as input is non-empty), leaving users without
                        context for what they're entering. The label stays
                        visible on the left, number right-aligns. */}
                    <View style={styles.labeledRow}>
                      <View style={styles.labelCol}>
                        <Text style={styles.fieldLabel}>Already ridden</Text>
                        <Text style={styles.fieldSub}>
                          Leave blank if brand new
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
                      <Text style={styles.unitTag}>{unit}</Text>
                    </View>
                    <View style={styles.inputDivider} />
                  </>
                )}
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Max lifespan</Text>
                    <Text style={styles.fieldSub}>
                      Default {formatNumber(typeInfo.defaultLifespan)} {unit}
                    </Text>
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
                  <Text style={styles.unitTag}>{unit}</Text>
                </View>
                <View style={styles.inputDivider} />
                <View style={styles.labeledRow}>
                  <View style={styles.labelCol}>
                    <Text style={styles.fieldLabel}>Service every</Text>
                    <Text style={styles.fieldSub}>
                      Maintenance reminder interval
                    </Text>
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
                  <Text style={styles.unitTag}>{unit}</Text>
                </View>
              </View>
              {attentionFreq ? (
                <Text style={styles.hint}>
                  You'll be reminded every {formatNumber(Number(attentionFreq.replace(/[,\s]/g, '')))} {unit}.
                </Text>
              ) : null}
            </View>

            {/* Electric toggle */}
            {canBeElectric && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ELECTRONIC COMPONENT</Text>
                <View style={styles.switchRow}>
                  <View>
                    <Text style={styles.switchLabel}>Di2 / eTap electronic component</Text>
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
                  <View style={[styles.inputGroup, { marginTop: 10 }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="Typical days from full charge to empty"
                      placeholderTextColor={C.textTertiary}
                      value={chargeInterval}
                      onChangeText={setChargeInterval}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>
            )}

            {/* Chain lube — only for chains */}
            {category === 'chain' && (
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
                      <View style={styles.inputDivider} />
                      <View style={styles.inputWithUnit}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          placeholder={
                            'Re-lube every — default: ' +
                            formatNumber(CHAIN_LUBE_TYPES[lubeType].defaultIntervalKm)
                          }
                          placeholderTextColor={C.textTertiary}
                          value={lubeIntervalOverride}
                          onChangeText={setLubeIntervalOverride}
                          keyboardType="numeric"
                        />
                        <Text style={styles.unitLabel}>{unit}</Text>
                      </View>
                    </View>
                  </>
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
          </ScrollView>
        )}
        {/* Floating primary action — label/handler switch per step.
            Step 'category': "Next" advances to details (matches the
            legacy top-right link; the more common path is tapping a
            category bubble, which auto-advances).
            Step 'details': "Save" commits via handleAdd, gated on a
            non-empty name. */}
        <PrimaryActionButton
          label={step === 'category' ? 'Next' : 'Save'}
          onPress={step === 'category' ? () => setStep('details') : handleAdd}
          loading={step === 'details' && saving}
          disabled={step === 'details' && !name.trim()}
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
  // paddingBottom clears the floating PrimaryActionButton on both
  // steps (category picker + details form share this style). Keep in
  // step with PRIMARY_ACTION_BAR_HEIGHT.
  content: { padding: 20, gap: 24, paddingBottom: 48 + PRIMARY_ACTION_BAR_HEIGHT },
  // Invisible placeholder mirroring the left button width per step so
  // the title stays optically centred. Width comes from rendering the
  // same Text content with opacity: 0.
  headerRightSpacer: { opacity: 0 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Bubble/pill styles ────────────────────────────────────────────────────
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

  // ── Details step ──────────────────────────────────────────────────────────
  hint: { fontSize: 12, color: C.textTertiary, lineHeight: 17 },
  inputGroup: { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden' },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
  },
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
  // Right-aligned numeric input used inside `labeledRow`. The label stays
  // visible on the left while the user types — fixes the bug where typing
  // into a numeric field swallowed the placeholder-encoded description.
  inlineInput: {
    fontSize: 15,
    fontWeight: '500',
    color: C.accent,
    minWidth: 60,
    textAlign: 'right',
  },
  unitTag: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: C.text },
  unitLabel: {
    fontSize: 14,
    color: C.textSecondary,
    fontWeight: '500',
    paddingRight: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: C.card,
    borderRadius: 14,
  },
  inputDivider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.accentDim,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  selectedBadgeText: { fontSize: 14, fontWeight: '600', color: C.accent },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '500', color: C.text, flex: 1 },
  switchSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
});
