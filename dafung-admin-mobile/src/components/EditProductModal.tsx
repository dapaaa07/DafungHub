import React, { useState, useEffect } from 'react';
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
import { typography, formatIDR } from '../theme/typography';
import { EnrichedProductItem, api } from '../api/client';

interface EditProductModalProps {
  visible: boolean;
  product: EnrichedProductItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  visible,
  product,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [stockStr, setStockStr] = useState('50');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setPriceStr(String(product.sellingPrice || product.price_idr || ''));
      setStockStr(String(product.stock ?? 50));
      setDescription(product.description || '');
      setIsActive(product.availability === 'in_stock');
    }
  }, [product]);

  if (!product) return null;

  const isManual = Boolean(product.is_manual);

  const handleUpdate = async () => {
    const cleanName = name.trim();
    const cleanPrice = parseInt(priceStr.replace(/[^0-9]/g, ''), 10);
    const cleanStock = parseInt(stockStr.replace(/[^0-9]/g, ''), 10);

    if (isManual && !cleanName) {
      Alert.alert('Perhatian', 'Nama produk tidak boleh kosong.');
      return;
    }

    if (!cleanPrice || cleanPrice <= 0) {
      Alert.alert('Perhatian', 'Harga jual harus lebih besar dari Rp 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.updateProduct(product.id, {
        name: isManual ? cleanName : undefined,
        price: cleanPrice,
        stock: isManual ? (isNaN(cleanStock) ? 50 : cleanStock) : undefined,
        description: isManual ? description.trim() : undefined,
        isActive,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Sukses', `Produk "${cleanName || product.name}" berhasil diperbarui.`);
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert('Gagal Memperbarui', (err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Hapus Produk',
      isManual
        ? `Apakah Anda yakin ingin menghapus produk "${product.name}" secara permanen dari katalog?`
        : `Nonaktifkan produk "${product.name}" dari katalog?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: isManual ? 'Hapus Permanen' : 'Nonaktifkan',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              if (isManual) {
                await api.deleteProduct(product.id, true);
              } else {
                await api.toggleProduct(product.id);
              }
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              Alert.alert('Berhasil', isManual ? 'Produk telah dihapus dari katalog.' : 'Status produk telah dinonaktifkan.');
              onSuccess();
              onClose();
            } catch (err) {
              Alert.alert('Gagal Menghapus', (err as Error).message);
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
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
              <Text style={styles.title}>Kelola Produk</Text>
              <Text style={styles.subtitle}>
                {isManual ? 'Produk Manual (Dafung Hub)' : 'Produk Supplier API'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.form}>
            {/* Status Badge */}
            <View style={styles.badgeRow}>
              <View style={[styles.typeBadge, isManual ? styles.badgeManual : styles.badgeApi]}>
                <Text style={styles.badgeText}>{isManual ? 'MANUAL' : 'SUPPLIER API'}</Text>
              </View>
              <Text style={styles.currentPriceText}>
                Harga Saat Ini: {formatIDR(product.sellingPrice || product.price_idr)}
              </Text>
            </View>

            {/* Nama Produk (Editable for manual) */}
            <View style={styles.field}>
              <Text style={styles.label}>Nama Produk</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                editable={isManual}
                placeholder="Contoh: Canva Pro 1 Bulan Garansi"
                placeholderTextColor={colors.textTertiary}
                style={[styles.input, !isManual && styles.inputDisabled]}
              />
              {!isManual && (
                <Text style={styles.fieldHint}>Nama produk API supplier tidak dapat diubah.</Text>
              )}
            </View>

            {/* Harga Jual */}
            <View style={styles.field}>
              <Text style={styles.label}>Harga Jual Pelanggan (Rp) *</Text>
              <TextInput
                value={priceStr}
                onChangeText={setPriceStr}
                keyboardType="numeric"
                placeholder="Contoh: 15000"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
              {!isManual && (
                <Text style={styles.fieldHint}>
                  Mengubah harga di sini akan menyimpan custom selling price untuk bot & website.
                </Text>
              )}
            </View>

            {/* Stok (Khusus Manual) */}
            {isManual && (
              <View style={styles.field}>
                <Text style={styles.label}>Jumlah Stok</Text>
                <TextInput
                  value={stockStr}
                  onChangeText={setStockStr}
                  keyboardType="numeric"
                  placeholder="50"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>
            )}

            {/* Deskripsi (Khusus Manual) */}
            {isManual && (
              <View style={styles.field}>
                <Text style={styles.label}>Deskripsi & Garansi</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Detail fitur, durasi, ketentuan garansi..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  style={[styles.input, styles.textArea]}
                />
              </View>
            )}

            {/* Status Aktif */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Status Katalog</Text>
                <Text style={styles.switchSub}>
                  {isActive ? 'Aktif - Produk tampil di bot & website' : 'Nonaktif - Disembunyikan'}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: colors.dividerStrong, true: colors.blue }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Action Buttons */}
            <Pressable
              style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
              onPress={handleUpdate}
              disabled={isSubmitting || isDeleting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={typography.button}>Simpan Perubahan</Text>
                </>
              )}
            </Pressable>

            {/* Delete / Deactivate Button */}
            <Pressable
              style={[styles.deleteBtn, isDeleting && styles.btnDisabled]}
              onPress={handleDelete}
              disabled={isSubmitting || isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator color={colors.chargeRed} />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={17} color={colors.chargeRed} style={{ marginRight: 6 }} />
                  <Text style={styles.deleteBtnText}>
                    {isManual ? 'Hapus Produk Manual' : 'Toggle Status Aktif'}
                  </Text>
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
    maxHeight: '90%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: {
    fontWeight: '700',
    fontSize: 18,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.timestamp,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  form: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    borderRadius: 12,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeManual: {
    backgroundColor: 'rgba(0, 140, 255, 0.15)',
  },
  badgeApi: {
    backgroundColor: 'rgba(0, 209, 137, 0.15)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  currentPriceText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  field: {
    marginBottom: 14,
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
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputDisabled: {
    opacity: 0.65,
  },
  fieldHint: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 4,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    borderRadius: 14,
    marginVertical: 10,
  },
  switchLabel: {
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
    borderRadius: 24,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  deleteBtn: {
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    borderRadius: 24,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.25)',
  },
  deleteBtnText: {
    color: colors.chargeRed,
    fontWeight: '600',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
