import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface VenmoPayRequestPillProps {
  onFulfill: () => void;
  onAddProduct: () => void;
  leftTitle?: string;
  rightTitle?: string;
}

export const VenmoPayRequestPill: React.FC<VenmoPayRequestPillProps> = ({
  onFulfill,
  onAddProduct,
  leftTitle = 'Antrean',
  rightTitle = 'Tambah Produk',
}) => {
  return (
    <View style={styles.pillContainer}>
      <Pressable
        style={({ pressed }) => [styles.half, pressed && styles.halfPressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onFulfill();
        }}
      >
        <Ionicons name="flash-outline" size={17} color="#FFFFFF" style={styles.icon} />
        <Text style={typography.button}>{leftTitle}</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable
        style={({ pressed }) => [styles.half, pressed && styles.halfPressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onAddProduct();
        }}
      >
        <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={styles.icon} />
        <Text style={typography.button}>{rightTitle}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  pillContainer: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 25,
    marginHorizontal: 16,
    backgroundColor: colors.blue,
    overflow: 'hidden',
    shadowColor: colors.blue,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  half: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  halfPressed: {
    backgroundColor: colors.blueDeep,
  },
  icon: {
    marginRight: 6,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    alignSelf: 'center',
  },
});
