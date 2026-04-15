import React, { useState } from 'react';
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
import { Colors } from '../constants/colors';
import {
  COMPONENT_TYPES,
  COMPONENT_GROUP_LABELS,
  getGroupedComponents,
} from '../constants/componentTypes';
import { ELECTRIC_CATEGORIES } from '../types';
import { useAppStore } from '../store/useAppStore';
import { unitLabel } from '../constants/units';
import type { ComponentCategory, BrakeSystem } from '../types';

interface Props {
  visible: boolean;
  bikeDistance: number;
  brakeSystem?: BrakeSystem;
  inStockMode?: boolean;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    category: ComponentCategory;
    brand: string;
    installDistance: number;
    maxLifespan: number;
    attentionFrequency?: number;
    notes: string;
    isElectric: boolean;
    lastCharged?: number;
    chargeIntervalDays?: number;
  }) => Promise<void>;
}

export default function AddComponentModal({
  visible,
  bikeDistance,
  brakeSystem,
  inStockMode = false,
  onClose,
  onAdd,
}: Props) {
  const { useMetric } = useAppStore();
  const unit = unitLabel(useMetric);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ComponentCategory>('chain');
  const [brand, setBrand] = useState('');
  const [installDistance, setInstallDistance] = useState('');
  const [maxLifespan, setMaxLifespan] = useState('');
  const [attentionFreq, setAttentionFreq] = useState('');
  const [notes, setNotes] = useState('');
  const [isElectric, setIsElectric] = useState(false);
  const [chargeInterval, setChargeInterval] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'category' | 'details'>('category');

  const grouped = getGroupedComponents(brakeSystem);
  const typeInfo = COMPONENT_TYPES[category];
  const canBeElectric = ELECTRIC_CATEGORIES.includes(category);

  const handleSelectCategory = (cat: ComponentCategory) => {
    const info = COMPONENT_TYPES[cat];
    setCategory(cat);
    setMaxLifespan('');
    setAttentionFreq(info.defaultAttentionFrequency ? String(info.defaultAttentionFrequency) : '');
    setIsElectric(false);
    setName(info.label);
    setStep('details');
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        name: name.trim(),
        category,
        brand: brand.trim(),
        installDistance: inStockMode ? 0 : (Number(installDistance) || bikeDistance || 0),
        maxLifespan: Number(maxLifespan) || typeInfo.defaultLifespan,
        attentionFrequency: attentionFreq ? Number(attentionFreq) : undefined,
        notes: notes.trim(),
        isElectric: canBeElectric && isElectric,
        lastCharged: isElectric ? Date.now() : undefined,
        chargeIntervalDays: isElectric && chargeInterval ? Number(chargeInterval) : undefined,
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
    setInstallDistance('');
    setMaxLifespan('');
    setAttentionFreq('');
    setNotes('');
    setIsElectric(false);
    setChargeInterval('');
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={step === 'category' ? handleClose : () => setStep('category')}>
            <Text style={styles.cancelBtn}>{step === 'category' ? 'Cancel' : '← Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {step === 'category' ? 'Choose Type' : 'Component Details'}
          </Text>
          {step === 'details' ? (
            <TouchableOpacity onPress={handleAdd} disabled={!name.trim() || saving}>
              {saving ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <Text style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}>Save</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 50 }} />
          )}
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
              <Ionicons name={typeInfo.icon as any} size={16} color={Colors.accent} />
              <Text style={styles.selectedBadgeText}>{typeInfo.label}</Text>
              <Ionicons name="swap-horizontal-outline" size={13} color={Colors.accent} />
            </TouchableOpacity>

            {/* Basic info */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DETAILS</Text>
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.input}
                  placeholder="Component name *"
                  placeholderTextColor={Colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                />
                <View style={styles.inputDivider} />
                <TextInput
                  style={styles.input}
                  placeholder="Brand (optional)"
                  placeholderTextColor={Colors.textTertiary}
                  value={brand}
                  onChangeText={setBrand}
                />
              </View>
            </View>

            {/* Lifespan & distance */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>WEAR TRACKING</Text>
              <View style={styles.inputGroup}>
                {!inStockMode && (
                  <>
                    <View style={styles.inputWithUnit}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder={
                          bikeDistance > 0
                            ? 'Odometer when installed — e.g. ' + bikeDistance.toLocaleString()
                            : 'Odometer when installed — e.g. 12,500'
                        }
                        placeholderTextColor={Colors.textTertiary}
                        value={installDistance}
                        onChangeText={setInstallDistance}
                        keyboardType="numeric"
                      />
                      <Text style={styles.unitLabel}>{unit}</Text>
                    </View>
                    <View style={styles.inputDivider} />
                  </>
                )}
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder={'Max lifespan — default: ' + typeInfo.defaultLifespan.toLocaleString()}
                    placeholderTextColor={Colors.textTertiary}
                    value={maxLifespan}
                    onChangeText={setMaxLifespan}
                    keyboardType="numeric"
                  />
                  <Text style={styles.unitLabel}>{unit}</Text>
                </View>
                <View style={styles.inputDivider} />
                <View style={styles.inputWithUnit}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Service reminder every — e.g. 300"
                    placeholderTextColor={Colors.textTertiary}
                    value={attentionFreq}
                    onChangeText={setAttentionFreq}
                    keyboardType="numeric"
                  />
                  <Text style={styles.unitLabel}>{unit}</Text>
                </View>
              </View>
              {attentionFreq ? (
                <Text style={styles.hint}>
                  You'll be reminded every {Number(attentionFreq).toLocaleString()} {unit}.
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
                    trackColor={{ true: Colors.accent, false: Colors.border }}
                    thumbColor={Colors.white}
                  />
                </View>
                {isElectric && (
                  <View style={[styles.inputGroup, { marginTop: 10 }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="Typical days from full charge to empty"
                      placeholderTextColor={Colors.textTertiary}
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
                placeholderTextColor={Colors.textTertiary}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.text },
  cancelBtn: { fontSize: 16, color: Colors.textSecondary },
  saveBtn: { fontSize: 16, fontWeight: '600', color: Colors.accent },
  saveBtnDisabled: { opacity: 0.4 },
  content: { padding: 20, gap: 24, paddingBottom: 48 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Bubble/pill styles ────────────────────────────────────────────────────
  bubblesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  bubbleText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  bubbleTextActive: { color: Colors.accent, fontWeight: '600' },

  // ── Details step ──────────────────────────────────────────────────────────
  hint: { fontSize: 12, color: Colors.textTertiary, lineHeight: 17 },
  inputGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden' },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: Colors.text },
  unitLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
    paddingRight: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: Colors.card,
    borderRadius: 14,
  },
  inputDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentDim,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  selectedBadgeText: { fontSize: 14, fontWeight: '600', color: Colors.accent },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '500', color: Colors.text, flex: 1 },
  switchSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
