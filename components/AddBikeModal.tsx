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
import { BIKE_TYPE_LABELS, BIKE_COLORS } from '../constants/componentTypes';
import type { BikeType } from '../types';

interface Props {
  visible: boolean;
  stravaBikes?: Array<{ id: string; name: string; distanceKm: number }>;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    brand: string;
    type: BikeType;
    color: string;
    stravaId?: string;
    totalDistance: number;
  }) => Promise<void>;
}

const BIKE_TYPES = Object.entries(BIKE_TYPE_LABELS) as [BikeType, string][];

export default function AddBikeModal({ visible, stravaBikes, onClose, onAdd }: Props) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState<BikeType>('road');
  const [color, setColor] = useState(Colors.accent);
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
              <View style={styles.inputDivider} />
              <TextInput
                style={styles.input}
                placeholder="Brand (e.g. Trek, Specialized)"
                placeholderTextColor={Colors.textTertiary}
                value={brand}
                onChangeText={setBrand}
              />
              <View style={styles.inputDivider} />
              <TextInput
                style={styles.input}
                placeholder="Starting distance (km)"
                placeholderTextColor={Colors.textTertiary}
                value={manualDistance}
                onChangeText={setManualDistance}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TYPE</Text>
            <View style={styles.typeGrid}>
              {BIKE_TYPES.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.typeChip, type === key && styles.typeChipActive]}
                  onPress={() => setType(key)}
                >
                  <Text style={[styles.typeChipText, type === key && styles.typeChipTextActive]}>
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
  scroll: { flex: 1 },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
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
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.card,
  },
  typeChipActive: { backgroundColor: Colors.accentDim },
  typeChipText: { fontSize: 14, color: Colors.textSecondary },
  typeChipTextActive: { color: Colors.accent, fontWeight: '600' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: {
    borderWidth: 3,
    borderColor: Colors.white,
  },
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
