// Venmo Typography from DESIGN-expo.md & DESIGN-android.md

import { TextStyle } from 'react-native';

const base: TextStyle = {
  fontFamily: undefined, // Uses native system font (Roboto on Android, SF Pro on iOS)
};

export const typography = {
  balanceDisplay: {
    ...base,
    fontWeight: '700',
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -0.8,
    color: '#FFFFFF',
  },
  confirmDisplay: {
    ...base,
    fontWeight: '700',
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  amountEntry: {
    ...base,
    fontWeight: '700',
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -1.0,
    color: '#2F3033',
  },
  screenTitle: {
    ...base,
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: '#2F3033',
  },
  sectionTitle: {
    ...base,
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.1,
    color: '#2F3033',
  },
  feedName: {
    ...base,
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 20,
    color: '#2F3033',
  },
  feedBody: {
    ...base,
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 19,
    color: '#2F3033',
  },
  feedMemo: {
    ...base,
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 19,
    color: '#6B6E76',
  },
  timestamp: {
    ...base,
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
    color: '#6B6E76',
  },
  amount: {
    ...base,
    fontWeight: '700',
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: -0.1,
    color: '#2F3033',
  },
  button: {
    ...base,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  buttonSmall: {
    ...base,
    fontWeight: '600',
    fontSize: 14,
    color: '#008CFF',
  },
  input: {
    ...base,
    fontWeight: '400',
    fontSize: 15,
    color: '#2F3033',
  },
  tab: {
    ...base,
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.1,
    color: '#6B6E76',
  },
  badge: {
    ...base,
    fontWeight: '600',
    fontSize: 12,
    color: '#008CFF',
  },
} as const;

export function formatIDR(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}
