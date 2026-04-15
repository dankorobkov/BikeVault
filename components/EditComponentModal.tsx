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
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { COMPONENT_TYPES } from '../constants/componentTypes';
import { ELECTRIC_CATEGORIES } from '../types';
import type { BikeComponent, Bike } from '../types';

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
}: Props) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  const [maxLifespan, setMaxLifespan] = useState('');
  const [attentionFreq, setAttentionFreq] = useState('');
  const [installDistance, setInstallDistance] = useState('');
  const [isElectric, setIsElectric] = useState(false);
  const [chargeInterval, setChargeInterval] = useState('');
  const [selectedBikeId, setSelectedBikeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (component && visible) {
      setName(component.name);
      setBrand(component.brand ?? '');
      setNotes(component.notes ?? '');
      setMaxLifespan(String(component.maxLifespan));
      setAttentionFreq(component.attentionFrequency ? String(component.attentionFrequency) : '');
      setInstallDistance(
        component.installDistance ? String(component.installDistance) : ''
      );
      setIsElectric(component.isElectric ?? false);
      setChargeInterval(component.chargeIntervalDays ? String(component.chargeIntervalDays) : '');
      setSelectedBikeId(component.bikeId);
    }
  }, [component, visible]);

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

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const updates: Partial<Omit<BikeComponent, 'id' | 'createdAt'>> = {
        name: name.trim(),
        brand: brand.trim() || undefined,
        notes: notes.trim() || undefined,
        maxLifespan: Number(maxLifespan) || component.maxLifespan,
        attentionFrequency: attentionFreq ? Number(attentionFreq) : undefined,
        installDistance: Number(installDistance) || 0,
        isElectric: canBeElectric && isElectric,
        chargeIntervalDays:
          canBeElectric && isElectric && chargeInterval ? Number(chargeInterval) : undefined,
        updatedAt: Date.now(),
      };
      await onSave(component.id, updates);

      // Handle bike reassignment separately
      if (bikeChanged) {
        if (selectedBikeId === null) {
          await onMoveToStock(component.id);
        } else {
          await onInstallOnBike(component.id, selectedBikeId, Number(installDistance) || 0);
        }
      }

      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRetire = () => {
    Alert.alert('Retire Component', 'Mark "' + component.name + '" as retired?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Retire',
        style: 'destructive',
        onPress: async () => {
          await onRetire(component.id);
          onClose();
        },
      },
    ]);
  };

  const handleMoveToStock = async () => {
    await onMoveToStock(component.id);
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
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <Text style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Category badge (read-only) */}
          <View style={styles.categoryBadge}>
            <Ionicons name={typeInfo.icon as any} size={16} color={Colors.accent} />
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

          {/* Wear tracking */}
          {!isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>WEAR TRACKING</Text>
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.input}
                  placeholder="Odometer when installed (km) — e.g. 12 500"
                  placeholderTextColor={Colors.textTertiary}
                  value={installDistance}
                  onChangeText={setInstallDistance}
                  keyboardType="numeric"
                />
                <View style={styles.divider} />
                <TextInput
                  style={styles.input}
                  placeholder="Max lifespan (km) — e.g. 3 000"
                  placeholderTextColor={Colors.textTertiary}
                  value={maxLifespan}
                  onChangeText={setMaxLifespan}
                  keyboardType="numeric"
                />
                <View style={styles.divider} />
                <TextInput
                  style={styles.input}
                  placeholder="Service reminder every (km) — e.g. 300"
                  placeholderTextColor={Colors.textTertiary}
                  value={attentionFreq}
                  onChangeText={setAttentionFreq}
                  keyboardType="numeric"
                />
              </View>
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
                      color={selectedBikeId === null ? Colors.accent : Colors.textSecondary}
                    />
                  </View>
                  <Text style={[styles.bikeName, selectedBikeId === null && styles.bikeNameActive]}>
                    In Stock (Garage)
                  </Text>
                  {selectedBikeId === null && (
                    <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
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
                          color={selectedBikeId === b.id ? Colors.accent : b.color}
                        />
                      </View>
                      <Text
                        style={[styles.bikeName, selectedBikeId === b.id && styles.bikeNameActive]}
                        numberOfLines={1}
                      >
                        {b.name}
                      </Text>
                      {selectedBikeId === b.id && (
                        <Ionicons name="checkmark-circle" size={18} color={Colors.accent} />
                      )}
                    </TouchableOpacity>
                    <View style={styles.divider} />
                  </React.Fragment>
                ))}
              </View>
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
                  trackColor={{ true: Colors.accent, false: Colors.border }}
                  thumbColor={Colors.white}
                />
              </View>
              {isElectric && (
                <View style={[styles.inputGroup, { marginTop: 8 }]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Days from full charge to empty"
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

          {/* Actions */}
          {!isRetired && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ACTIONS</Text>
              <View style={styles.actionsGroup}>
                {isActive && (
                  <TouchableOpacity style={styles.actionRow} onPress={handleMoveToStock}>
                    <Ionicons name="archive-outline" size={18} color={Colors.accent} />
                    <Text style={styles.actionText}>Move to Stock</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                  </TouchableOpacity>
                )}
                {isActive && <View style={styles.divider} />}
                <TouchableOpacity style={styles.actionRow} onPress={handleRetire}>
                  <Ionicons name="checkmark-done-outline" size={18} color={Colors.warning} />
                  <Text style={[styles.actionText, { color: Colors.warning }]}>
                    Retire Component
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.accentDim,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
  },
  categoryBadgeText: { fontSize: 14, fontWeight: '600', color: Colors.accent },
  retiredBadge: {
    backgroundColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  retiredBadgeText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  inputGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden' },
  input: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: Colors.text },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: Colors.card,
    borderRadius: 14,
  },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 },
  bikeList: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden' },
  bikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  bikeRowActive: { backgroundColor: Colors.accentDim },
  bikeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bikeIconBoxActive: { backgroundColor: Colors.accentDim },
  bikeName: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.text },
  bikeNameActive: { color: Colors.accent },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '500', color: Colors.text },
  switchSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  actionsGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.text },
});
