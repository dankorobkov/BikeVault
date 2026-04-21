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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import {
  BIKE_TYPE_LABELS,
  BIKE_TYPE_ICONS,
  BIKE_COLORS,
  BRAKE_SYSTEM_LABELS,
} from '../constants/componentTypes';
import { isIndoorBike, type BikeType, type BrakeSystem } from '../types';

interface Props {
  visible: boolean;
  stravaBikes?: Array<{ id: string; name: string; distanceKm: number }>;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    brand: string;
    type: BikeType;
    brakeSystem: BrakeSystem;
    color: string;
    stravaId?: string;
    totalDistance: number;
  }) => Promise<void>;
}

const BIKE_TYPES = Object.entries(BIKE_TYPE_LABELS) as [BikeType, string][];
const BRAKE_SYSTEMS = Object.entries(BRAKE_SYSTEM_LABELS) as [BrakeSystem, string][];

export default function AddBikeModal({ visible, stravaBikes, onClose, onAdd }: Props) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState<BikeType>('road');
  const [brakeSystem, setBrakeSystem] = useState<BrakeSystem>('disc-hydraulic');
  const [color, setColor] = useState<string>(Colors.accent);
  const [stravaId, setStravaId] = useState<string | undefined>();
  const [manualDistance, setManualDistance] = useState('0');
  const [saving, setSaving] = useState(false);

  const handleSelectStrava = (id: string, bikeName: string, distanceKm: number) => {
    if (stravaId === id) {
      setStravaId(undefined);
    } else {
      setStravaId(id);
      if (!name) setName(bikeName);
      setManualDistance(String(distanceKm));
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        name: name.trim(),
        brand: brand.trim(),
        type,
        brakeSystem,
        color,
        stravaId,
        totalDistance: Number(manualDistance) || 0,
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
    setColor(Colors.accent);
    setStravaId(undefined);
    setManualDistance('0');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { resetForm(); onClose(); }}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Bike</Text>
          <TouchableOpacity onPress={handleAdd} disabled={!name.trim() || saving}>
            {saving ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <Text style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
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
                    color={stravaId === sb.id ? Colors.accent : Colors.textSecondary}
                  />
                  <View style={styles.stravaInfo}>
                    <Text style={styles.stravaName}>{sb.name}</Text>
                    <Text style={styles.stravaDist}>{sb.distanceKm.toLocaleString()} km</Text>
                  </View>
                  {stravaId === sb.id && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
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
                placeholderTextColor={Colors.textTertiary}
                value={name}
                onChangeText={setName}
              />
              <View style={styles.inputDivider} />
              <TextInput
                style={styles.input}
                placeholder="Brand (e.g. Trek, Specialized)"
                placeholderTextColor={Colors.textTertiary}
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
                  placeholderTextColor={Colors.textTertiary}
                  value={manualDistance}
                  onChangeText={setManualDistance}
                  keyboardType="numeric"
                  textAlign="right"
                />
                <Text style={styles.unitTag}>km</Text>
              </View>
            </View>
          </View>

          {/* Bike Type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BIKE TYPE</Text>
            <View style={styles.chipGrid}>
              {BIKE_TYPES.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, type === key && styles.chipActive]}
                  onPress={() => setType(key)}
                >
                  <Ionicons
                    name={BIKE_TYPE_ICONS[key] as any}
                    size={14}
                    color={type === key ? Colors.accent : Colors.textSecondary}
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
                    <Ionicons name="checkmark" size={14} color={Colors.black} />
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
  scroll: { flex: 1 },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  hint: { fontSize: 12, color: Colors.textTertiary, lineHeight: 17 },
  inputGroup: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  inputDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  labeledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  labelCol: { flex: 1 },
  fieldLabel: { fontSize: 15, fontWeight: '500', color: Colors.text },
  fieldSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  inlineInput: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.accent,
    minWidth: 60,
    textAlign: 'right',
  },
  unitTag: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.card,
  },
  chipIcon: { marginRight: 6 },
  chipActive: { backgroundColor: Colors.accentDim },
  chipText: { fontSize: 14, color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent, fontWeight: '600' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: { borderWidth: 3, borderColor: Colors.white },
  stravaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  stravaRowActive: { borderColor: Colors.accent },
  stravaInfo: { flex: 1 },
  stravaName: { fontSize: 15, fontWeight: '500', color: Colors.text },
  stravaDist: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
