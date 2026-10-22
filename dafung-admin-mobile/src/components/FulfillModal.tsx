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
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography, formatIDR } from '../theme/typography';
import { OrderItem, api } from '../api/client';

interface FulfillModalProps {
  visible: boolean;
  order: OrderItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const FulfillModal: React.FC<FulfillModalProps> = ({
  visible,
  order,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'text' | 'image' | 'file'>('text');
  const [credentials, setCredentials] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<{
    name: string;
    content: string;
    isPhoto?: boolean;
    uri?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!order) return null;

  const handlePickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const name = asset.fileName || `voucher_${Date.now()}.jpg`;
        setSelectedMedia({
          name,
          content: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : '',
          isPhoto: true,
          uri: asset.uri,
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch (err) {
      Alert.alert('Gagal Memilih Gambar', (err as Error).message);
    }
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        const base64Content = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        setSelectedMedia({
          name: file.name,
          content: `data:application/octet-stream;base64,${base64Content}`,
          isPhoto: false,
          uri: file.uri,
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    } catch (err) {
      Alert.alert('Gagal Membaca File', (err as Error).message);
    }
  };

  const handleSend = async () => {
    if (!credentials.trim() && !selectedMedia) {
      Alert.alert('Perhatian', 'Kredensial teks atau lampiran media wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.fulfillOrder(
        order.orderCode,
        credentials.trim(),
        selectedMedia ? selectedMedia : undefined
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Berhasil', `Pesanan ${order.orderCode} berhasil dipenuhi dan dikirim.`);
      setCredentials('');
      setSelectedMedia(null);
      onSuccess();
      onClose();
    } catch (err) {
      Alert.alert('Pengiriman Gagal', (err as Error).message);
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
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Kirim Kredensial & Media</Text>
              <Text style={styles.subtitle}>{order.orderCode} · {order.productName}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Customer info card */}
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Penerima: <Text style={styles.infoBold}>{order.customer.username ? `@${order.customer.username}` : order.customer.telegramId}</Text>
            </Text>
            <Text style={styles.infoText}>
              Nilai Transaksi: <Text style={styles.infoBold}>{formatIDR(order.price)}</Text>
            </Text>
          </View>

          {/* Mode Switcher */}
          <View style={styles.modeTabs}>
            <Pressable
              style={[styles.modeTab, mode === 'text' && styles.modeTabActive]}
              onPress={() => setMode('text')}
            >
              <Text style={[styles.modeTabText, mode === 'text' && styles.modeTabTextActive]}>
                Teks Saja
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, mode === 'image' && styles.modeTabActive]}
              onPress={() => setMode('image')}
            >
              <Text style={[styles.modeTabText, mode === 'image' && styles.modeTabTextActive]}>
                Foto / Gambar
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, mode === 'file' && styles.modeTabActive]}
              onPress={() => setMode('file')}
            >
              <Text style={[styles.modeTabText, mode === 'file' && styles.modeTabTextActive]}>
                Berkas (.txt dll)
              </Text>
            </Pressable>
          </View>

          {/* Media Attach Preview if any */}
          {mode !== 'text' && (
            <View style={{ marginBottom: 12 }}>
              {selectedMedia ? (
                <View style={styles.fileSelectedRow}>
                  {selectedMedia.isPhoto && selectedMedia.uri ? (
                    <Image source={{ uri: selectedMedia.uri }} style={{ width: 42, height: 42, borderRadius: 6 }} />
                  ) : (
                    <Ionicons name="document-text" size={32} color={colors.blue} />
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.fileName} numberOfLines={1}>{selectedMedia.name}</Text>
                    <Text style={styles.fileSize}>Siap dikirim ke Telegram</Text>
                  </View>
                  <Pressable onPress={() => setSelectedMedia(null)}>
                    <Ionicons name="trash-outline" size={20} color={colors.chargeRed} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.pickFileBtn}
                  onPress={mode === 'image' ? handlePickImage : handlePickDocument}
                >
                  <Ionicons
                    name={mode === 'image' ? 'image-outline' : 'cloud-upload-outline'}
                    size={28}
                    color={colors.blue}
                  />
                  <Text style={styles.pickFileText}>
                    {mode === 'image' ? 'Sentuh untuk Pilih Foto / Screenshot' : 'Sentuh untuk Pilih Berkas / Dokumen'}
                  </Text>
                  <Text style={styles.pickFileSub}>Akan dikirim langsung ke chat pembeli</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Text Input for Credentials / Note */}
          <View style={styles.inputBox}>
            <TextInput
              value={credentials}
              onChangeText={setCredentials}
              placeholder={mode === 'text' ? 'Format: email@domain.com | password123' : 'Catatan / petunjuk akun (opsional)'}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              style={styles.textArea}
            />
          </View>

          {/* Action Button */}
          <Pressable
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSend}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={17} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={typography.button}>Kirim ke Pelanggan</Text>
              </>
            )}
          </Pressable>
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
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
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
  infoCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  infoBold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeTabActive: {
    backgroundColor: colors.canvas,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: colors.blue,
    fontWeight: '700',
  },
  inputBox: {
    marginBottom: 18,
  },
  textArea: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  fileBox: {
    marginBottom: 18,
  },
  pickFileBtn: {
    backgroundColor: colors.blueTint,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 140, 255, 0.3)',
    borderStyle: 'dashed',
  },
  pickFileText: {
    color: colors.blue,
    fontWeight: '700',
    marginTop: 8,
    fontSize: 14,
  },
  pickFileSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  fileSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  fileName: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: 14,
  },
  fileSize: {
    fontSize: 12,
    color: colors.receivedGreen,
    marginTop: 1,
  },
  captionInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: 10,
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
