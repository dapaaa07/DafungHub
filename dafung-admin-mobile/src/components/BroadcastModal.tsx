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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { api } from '../api/client';

interface BroadcastModalProps {
  visible: boolean;
  onClose: () => void;
  targetChannel?: string;
}

export const BroadcastModal: React.FC<BroadcastModalProps> = ({
  visible,
  onClose,
  targetChannel = '@DafungHub',
}) => {
  const [message, setMessage] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<{
    name: string;
    content: string;
    isPhoto?: boolean;
    uri?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePickPhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const name = asset.fileName || `promo_${Date.now()}.jpg`;
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
    const clean = message.trim();
    if (!clean && !selectedMedia) {
      Alert.alert('Perhatian', 'Isi pesan siaran atau lampiran media tidak boleh kosong.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.sendBroadcast(clean, selectedMedia || undefined);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Siaran Berhasil', res.message || `Pesan telah disiarkan ke ${targetChannel}`);
      setMessage('');
      setSelectedMedia(null);
      onClose();
    } catch (err) {
      Alert.alert('Gagal Mengirim Siaran', (err as Error).message);
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
              <Text style={styles.title}>Studio Siaran Channel</Text>
              <Text style={styles.subtitle}>Target Publikasi: {targetChannel}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.tipBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.blue} style={{ marginRight: 6 }} />
            <Text style={styles.tipText}>
              Pesan dan media ini akan disiarkan langsung ke channel {targetChannel} dengan tombol order bot otomatis.
            </Text>
          </View>

          {/* Media attachment buttons */}
          <View style={styles.mediaActionsRow}>
            <Pressable style={styles.mediaActionBtn} onPress={handlePickPhoto}>
              <Ionicons name="image-outline" size={17} color={colors.blue} style={{ marginRight: 6 }} />
              <Text style={styles.mediaActionText}>+ Foto / Banner</Text>
            </Pressable>

            <Pressable style={styles.mediaActionBtn} onPress={handlePickDocument}>
              <Ionicons name="document-attach-outline" size={17} color={colors.blue} style={{ marginRight: 6 }} />
              <Text style={styles.mediaActionText}>+ Dokumen</Text>
            </Pressable>
          </View>

          {/* Media Preview if attached */}
          {selectedMedia && (
            <View style={styles.mediaPreviewCard}>
              {selectedMedia.isPhoto && selectedMedia.uri ? (
                <Image source={{ uri: selectedMedia.uri }} style={styles.mediaThumb} />
              ) : (
                <Ionicons name="document-text" size={32} color={colors.blue} />
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.mediaName} numberOfLines={1}>{selectedMedia.name}</Text>
                <Text style={styles.mediaType}>{selectedMedia.isPhoto ? 'Gambar Foto' : 'Dokumen File'}</Text>
              </View>
              <Pressable onPress={() => setSelectedMedia(null)} hitSlop={8}>
                <Ionicons name="close-circle" size={22} color={colors.chargeRed} />
              </Pressable>
            </View>
          )}

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Tulis pesan pengumuman, promo diskon, atau info stok di sini..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            style={styles.textArea}
          />

          <View style={styles.charCountRow}>
            <Text style={styles.charCount}>{message.length} karakter</Text>
          </View>

          <Pressable
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSend}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="megaphone" size={17} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={typography.button}>Publikasikan Siaran</Text>
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
    marginBottom: 12,
  },
  title: {
    ...typography.screenTitle,
    fontSize: 20,
  },
  subtitle: {
    ...typography.timestamp,
    marginTop: 2,
    color: colors.blue,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: colors.blueTint,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  textArea: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCountRow: {
    alignItems: 'flex-end',
    marginTop: 6,
    marginBottom: 16,
  },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
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
  mediaActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  mediaActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blueTint,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 140, 255, 0.2)',
  },
  mediaActionText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '600',
  },
  mediaPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  mediaThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  mediaName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  mediaType: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
