import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { api } from '../api/client';

interface AddProductModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [stockStr, setStockStr] = useState('50');
  const [description, setDescription] = useState('');
  const [requiresEmail, setRequiresEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanPrice = parseInt(priceStr.replace(/[^0-9]/g, ''), 10);
    const cleanStock = parseInt(stockStr.replace(/[^0-9]/g, ''), 10);

    if (!cleanName) {
      Alert.alert('Perhatian', 'Nama produk wajib diisi.');
      return;
    }
    if (!cleanPrice || cleanPrice <= 0) {
      Alert.alert('Perhatian', 'Harga jual harus lebih besar dari Rp 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createProduct({
        name: cleanName,
        price: cleanPrice,
        stock: isNaN(cleanStock) ? 50 : cleanStock,
        description: description.trim(),
        requiresEmail,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Berhasil', `Produk manual "${cleanName}" berhasil ditambahkan ke katalog.`);
      setName('');
      setPriceStr('');
      setStockStr('50');
      setDescription('');
      setRequiresEmail(false);
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert('Gagal Menambah Produk', (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Tambah Produk Manual</Text>
              <Text style={styles.subtitle}>Produk lokal Dafung Hub di luar API supplier</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Nama Produk *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Contoh: Netflix Private 1 Bulan 4K"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Harga Jual (Rp) *</Text>
                <TextInput
                  value={priceStr}
                  onChangeText={setPriceStr}
                  placeholder="35000"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>

              <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Stok Produk</Text>
                <TextInput
                  value={stockStr}
                  onChangeText={setStockStr}
                  placeholder="50"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Deskripsi & Garansi</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Deskripsi fitur, durasi, dan ketentuan garansi"
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
                style={[styles.input, styles.textArea]}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Minta Email Pembeli</Text>
                <Text style={styles.switchSub}>Wajibkan pembeli memasukkan email saat checkout</Text>
              </View>
              <Switch
                value={requiresEmail}
                onValueChange={setRequiresEmail}
                trackColor={{ false: colors.dividerStrong, true: colors.blue }}
                thumbColor="#FFFFFF"
              />
            </View>

            <Pressable
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
              onPress={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={typography.button}>Simpan Produk Manual</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    ...typography.screenTitle,
    fontSize: 20,
  },
  subtitle: {
    ...typography.timestamp,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  form: {
    paddingBottom: 24,
  },
  field: {
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  switchSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  submitBtn: {
    backgroundColor: colors.blue,
    borderRadius: 25,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
});
