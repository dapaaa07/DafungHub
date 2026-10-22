import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ShopeePayTransaction } from '../api/client';

interface ShopeePayRowProps {
  transaction: ShopeePayTransaction;
}

export const ShopeePayRow: React.FC<ShopeePayRowProps> = ({ transaction }) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <Ionicons name="qr-code-outline" size={20} color={colors.blue} />
      </View>

      <View style={styles.contentCol}>
        <View style={styles.headerRow}>
          <Text style={styles.issuerText}>{transaction.issuer} · QRIS</Text>
          <Text style={[typography.amount, styles.incomeText]}>
            +{transaction.formattedAmount}
          </Text>
        </View>

        <Text style={typography.timestamp}>{transaction.time}</Text>

        {transaction.isMatched && transaction.order ? (
          <View style={styles.matchedBadge}>
            <Ionicons name="checkmark-circle" size={13} color={colors.blue} style={{ marginRight: 4 }} />
            <Text style={styles.matchedText}>
              {transaction.order.orderCode} · {transaction.order.customer}
            </Text>
          </View>
        ) : (
          <View style={styles.unmatchedBadge}>
            <Text style={styles.unmatchedText}>ID: {transaction.transactionId.slice(-8)}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.canvas,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    alignItems: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.blueTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contentCol: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  issuerText: {
    ...typography.feedName,
  },
  incomeText: {
    color: colors.receivedGreen,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  matchedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.blueTint,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 5,
  },
  matchedText: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: '600',
  },
  unmatchedBadge: {
    backgroundColor: colors.surfaceMuted,
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  unmatchedText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
});
