import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useAuth } from '../context/AuthContext';
import { api, getBaseApiUrl, setBaseApiUrl } from '../api/client';

export const SettingsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { logout } = useAuth();
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [channel, setChannel] = useState('@DafungHub');
  const [apiUrl, setApiUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, url] = await Promise.all([
          api.getSettings().catch(() => null),
          getBaseApiUrl(),
        ]);
        if (settingsRes?.settings) {
          setIsMaintenance(settingsRes.settings.isMaintenance);
          setChannel(settingsRes.settings.broadcastChannel);
        }
        setApiUrl(url);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleToggleMaintenance = async (value: boolean) => {
    setIsMaintenance(value);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await api.updateSettings({ isMaintenance: value });
      Alert.alert(
        'Status Bot Diperbarui',
        value
          ? 'Mode pemeliharaan bot diaktifkan. Pembeli akan menerima pesan pemeliharaan saat mengakses bot.'
          : 'Mode pemeliharaan dinonaktifkan. Bot beroperasi normal.'
      );
    } catch (err) {
      setIsMaintenance(!value);
      Alert.alert('Gagal Mengubah Pengaturan', (err as Error).message);
    }
  };

  const handleSaveChannel = async () => {
    if (!channel.trim()) return;
    setSaving(true);
    try {
      await api.updateSettings({ broadcastChannel: channel.trim() });
      if (apiUrl.trim()) {
        await setBaseApiUrl(apiUrl.trim());
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Tersimpan', 'Pengaturan berhasil diperbarui.');
    } catch (err) {
      Alert.alert('Gagal Menyimpan', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Konfirmasi Keluar', 'Apakah Anda yakin ingin keluar dari panel admin?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={typography.screenTitle}>Pengaturan Panel</Text>
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator color={colors.blue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Section: Bot Maintenance */}
          <Text style={styles.sectionHeader}>Operasional Bot</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.itemTitle}>Mode Pemeliharaan (Maintenance)</Text>
                <Text style={styles.itemSub}>
                  Aktifkan untuk menolak transaksi sementara saat restock atau update sistem.
                </Text>
              </View>
              <Switch
                value={isMaintenance}
                onValueChange={handleToggleMaintenance}
                trackColor={{ false: colors.dividerStrong, true: colors.pendingOrange }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* Section: Broadcast Channel */}
          <Text style={styles.sectionHeader}>Saluran Publikasi</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Target Channel Broadcast</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="megaphone-outline" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                value={channel}
                onChangeText={setChannel}
                placeholder="@DafungHub"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
              />
            </View>
          </View>

          {/* Section: Server API Endpoint */}
          <Text style={styles.sectionHeader}>Koneksi Backend</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Endpoint REST API</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="globe-outline" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                value={apiUrl}
                onChangeText={setApiUrl}
                placeholder="https://dafung-hub.vercel.app"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSaveChannel}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={typography.button}>Simpan Pengaturan</Text>
            )}
          </Pressable>

          {/* Section: Session */}
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={colors.chargeRed} style={{ marginRight: 6 }} />
            <Text style={styles.logoutText}>Keluar dari Akun Admin</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  itemSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: colors.blue,
    borderRadius: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(211, 46, 46, 0.3)',
  },
  logoutText: {
    color: colors.chargeRed,
    fontWeight: '700',
    fontSize: 14,
  },
});
