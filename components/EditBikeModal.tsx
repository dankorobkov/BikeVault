import React, { useState, useEffect } from 'react';
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
  STRAVA_ACTIVITY_LABELS,
  STRAVA_ACTIVITY_ICONS,
} from '../constants/componentTypes';
import {
  isIndoorBike,
  defaultActivityForBikeType,
  type Bike,
  type BikeType,
  type BrakeSystem,
  type StravaActivityType,
} from '../types';

interface Props {
  visible: boolean;
  bike: Bike | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    brand: string;
    type: BikeType;
    brakeSystem: BrakeSystem;
    color: string;
    defaultActivity: StravaActivityType;
  }) => Promise<void>;
}

const BIKE_TYPES = Object.entries(BIKE_TYPE_LABELS) as [BikeType, string][];
const BRAKE_SYSTEMS = Object.entries(BRAKE_SYSTEM_LABELS) as [BrakeSystem, string][];
const STRAVA_ACTIVITIES = Object.entries(STRAVA_ACTIVITY_LABELS) as [
  StravaActivityType,
  string,
][];

export default function EditBikeModal({ visible, bike, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState<BikeType>('road');
  const [brakeSystem, setBrakeSystem] = useState<BrakeSystem>('disc-hydraulic');
  const [color, setColor] = useState<string>(Colors.accent);
  const [defaultActivity, setDefaultActivity] = useState<StravaActivityType>('Ride');
  // Tracks whether the user has explicitly picked an activity this
  // session. If they haven't, changing the bike type updates the
  // activity to the matching default — matches the Add flow UX.
  const [activityTouched, setActivityTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync fields whenever the bike changes or modal opens
  useEffect(() => {
    if (bike && visible) {
      setName(bike.name);
      setBrand(bike.brand ?? '');
      setType(bike.type);
      setBrakeSystem(bike.brakeSystem ?? 'disc-hydraulic');
      setColor(bike.color ?? Colors.accent);
      setDefaultActivity(
        bike.defaultActivity ?? defaultActivityForBikeType(bike.type)
      );
      setActivityTouched(false);
    }
  }, [bike, visible]);

  const handleTypeChange = (next: BikeType) => {
    setType(next);
    if (!activityTouched) {
      setDefaultActivity(defaultActivityForBikeType(next));
    }
  };

  const handleActivityChange = (next: StravaActivityType) => {
    setDefaultActivity(next);
    setActivityTouched(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        brand: brand.trim(),
        type,
        brakeSystem,
        color,
        defaultActivity,
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
              <ActivityIndicator color={Colors.accent} />
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
                placeholderTextColor={Colors.textTertiary}
                value={name}
                onChangeText={setName}
              />
              <View style={styles.divider} />
              <TextInput
                style={styles.input}
                placeholder="Brand (optional)"
                placeholderTextColor={Colors.textTertiary}
                value={brand}
                onChangeText={setBrand}
              />
            </View>
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
                  ? 'Direct-drive trainer: rear-wheel components are hidden on the detail screen.'
                  : 'Roller trainers: expect the rear tyre to wear faster than outdoors.'}
              </Text>
            )}
          </View>

          {/* Default activity */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DEFAULT ACTIVITY</Text>
            <View style={styles.chipRow}>
              {STRAVA_ACTIVITIES.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, defaultActivity === key && styles.chipActive]}
                  onPress={() => handleActivityChange(key)}
                >
                  <Ionicons
                    name={STRAVA_ACTIVITY_ICONS[key] as any}
                    size={13}
                    color={
                      defaultActivity === key ? Colors.accent : Colors.textSecondary
                    }
                    style={styles.chipIcon}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      defaultActivity === key && styles.chipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
  content: { padding: 20, gap: 20, paddingBottom: 48 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  inputGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden' },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipIcon: { marginRight: 6 },
  hint: { fontSize: 12, color: Colors.textTertiary, lineHeight: 17, marginTop: 4 },
  chipActive: { backgroundColor: Colors.accentDim, borderColor: Colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  chipTextActive: { color: Colors.accent },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: { borderWidth: 2, borderColor: Colors.white },
});
