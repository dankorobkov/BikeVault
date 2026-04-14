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
  COMPONENT_TYPES,
  COMPONENT_GROUPS,
} from '../constants/componentTypes';
import type { ComponentCategory } from '../types';

interface Props {
  visible: boolean;
  bikeDistance: number;
  onClose: () => void;
  onAdd: (data: {
    name: string;
    category: ComponentCategory;
    brand: string;
    installDistance: number;
    maxLifespan: number;
    notes: string;
  }) => Promise<void>;
}

const GROUP_ORDER = ['drivetrain', 'brakes', 'wheels', 'cockpit', 'other'] as const;

export default function AddComponentModal({
  visible,
  bikeDistance,
  onClose,
  onAdd,
}: Props) {
  const [category, setCategory] = useState<ComponentCategory>('chain');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [lifespan, setLifespan] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const typeInfo = COMPONENT_TYPES[category];

  const handleSelectCategory = (cat: ComponentCategory) => {
    setCategory(cat);
    const info = COMPONENT_TYPES[cat];
    setName(info.label);
    setLifespan(String(info.defaultLifespan));
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      await onAdd({
        name: name.trim() || typeInfo.label,
        category,
        brand: brand.trim(),
        installDistance: bikeDistance,
        maxLifespan: Number(lifespan) || typeInfo.defaultLifespan,
        notes: notes.trim(),
      });
      resetForm();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setCategory('chain');
    setName('');
    setBrand('');
    setLifespan('');
    setNotes('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { resetForm(); onClose(); }}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Add Component</Text>
          <TouchableOpacity onPress={handleAdd} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <Text style={styles.saveBtn}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Category picker */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COMPONENT TYPE</Text>
            {GROUP_ORDER.map((group) => {
              const entries = (Object.entries(COMPONENT_TYPES) as [ComponentCategory, typeof COMPONENT_TYPES[ComponentCategory]][])
                .filter(([, v]) => v.group === group);
              if (!entries.length) return null;
              return (
                <View key={group} style={styles.groupBlock}>
                  <Text style={styles.groupLabel}>{COMPONENT_GROUPS[group]}</Text>
                  <View style={styles.categoryGrid}>
                    {entries.map(([key, info]) => (
                      <TouchableOpacity
                        key={key}
                        style={[styles.catChip, category === key && styles.catChipActive]}
                        onPress={() => handleSelectCategory(key)}
                      >
                        <Ionicons
                          name={info.icon as React.ComponentProps<typeof Ionicons>['name']}
                          size={14}
                          color={category === key ? Colors.accent : Colors.textSecondary}
                        />
                        <Text style={[styles.catChipText, category === key && styles.catChipTextActive]}>
                          {info.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Details */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Component name"
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
              <View style={styles.inputDivider} />
              <TextInput
                style={styles.input}
                placeholder={`Max lifespan (km) — default ${typeInfo.defaultLifespan}`}
                placeholderTextColor={Colors.textTertiary}
                value={lifespan}
                onChangeText={setLifespan}
                keyboardType="numeric"
              />
              <View style={styles.inputDivider} />
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Notes (optional)"
                placeholderTextColor={Colors.textTertiary}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
              />
            </View>
          </View>

          {/* Info box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.infoText}>
              Installed at {bikeDistance.toLocaleString()} km. Wear will be tracked from this
              distance.
            </Text>
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
  scroll: { flex: 1 },
  content: { padding: 20, gap: 24, paddingBottom: 40 },
  section: { gap: 10 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  groupBlock: { gap: 6 },
  groupLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: Colors.card,
  },
  catChipActive: { backgroundColor: Colors.accentDim },
  catChipText: { fontSize: 13, color: Colors.textSecondary },
  catChipTextActive: { color: Colors.accent, fontWeight: '600' },
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
  notesInput: { minHeight: 60, textAlignVertical: 'top' },
  inputDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
