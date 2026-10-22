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
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = async () => {
    const clean = message.trim();
    if (!clean) {
      Alert.alert('Perhatian', 'Isi pesan siaran tidak boleh kosong.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.sendBroadcast(clean);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Siaran Berhasil', res.message || `Pesan telah disiarkan ke ${targetChannel}`);
      setMessage('');
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
              Pesan ini akan disiarkan ke seluruh pengikut channel {targetChannel} dengan tombol order via bot.
            </Text>
          </View>

          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Tulis pesan pengumuman, promo, atau update stok di sini..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={5}
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
});
