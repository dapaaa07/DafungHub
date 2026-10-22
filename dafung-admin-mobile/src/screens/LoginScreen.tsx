import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useAuth } from '../context/AuthContext';
import { getBaseApiUrl, setBaseApiUrl } from '../api/client';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [pinOrKey, setPinOrKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [apiUrl, setApiUrl] = useState('');

  React.useEffect(() => {
    getBaseApiUrl().then(setApiUrl);
  }, []);

  const handleLogin = async () => {
    const clean = pinOrKey.trim();
    if (!clean) {
      Alert.alert('Perhatian', 'Masukkan PIN atau Kunci Rahasia Admin.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (apiUrl.trim()) {
        await setBaseApiUrl(apiUrl.trim());
      }
      const success = await login(clean);
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert('Gagal Masuk', 'Kunci otentikasi admin atau PIN salah.');
      }
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Gagal Masuk', (err as Error).message || 'Terjadi kesalahan saat menghubungi server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <StatusBar style="light" />

      <View style={styles.centerBox}>
        <View style={styles.logoBadge}>
          <Ionicons name="shield-checkmark" size={44} color={colors.blue} />
        </View>

        <Text style={styles.title}>Dafung Hub</Text>
        <Text style={styles.subtitle}>Owner & Admin Control Center</Text>

        <View style={styles.card}>
          <Text style={styles.label}>PIN atau Kunci Rahasia</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="key-outline" size={19} color={colors.textSecondary} style={{ marginRight: 10 }} />
            <TextInput
              value={pinOrKey}
              onChangeText={setPinOrKey}
              placeholder="Masukkan PIN / API Key"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {showServerConfig && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Backend Server URL</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="globe-outline" size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                <TextInput
                  value={apiUrl}
                  onChangeText={setApiUrl}
                  placeholder="https://dafung-hub.vercel.app"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          <Pressable
            style={styles.toggleServerBtn}
            onPress={() => setShowServerConfig((prev) => !prev)}
          >
            <Text style={styles.toggleServerText}>
              {showServerConfig ? 'Sembunyikan Pengaturan Server' : 'Ubah Endpoint Server'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={typography.button}>Masuk ke Panel</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.blue,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centerBox: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    ...typography.confirmDisplay,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.canvas,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  toggleServerBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
  },
  toggleServerText: {
    fontSize: 12,
    color: colors.blue,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: colors.blue,
    borderRadius: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
});
