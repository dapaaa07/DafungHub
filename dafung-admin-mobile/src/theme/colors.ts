// Venmo Design Tokens from DESIGN-expo.md & DESIGN-android.md

export const colors = {
  // Canvas & Surfaces
  canvas: '#FFFFFF',
  surfaceMuted: '#F7F7F7',
  divider: '#F2F2F2',
  dividerStrong: '#E0E0E0',

  // Text Hierarchy
  textPrimary: '#2F3033', // Warm charcoal, never pure black
  textSecondary: '#6B6E76',
  textTertiary: '#9AA0A8',

  // Venmo Brand Blues
  blue: '#008CFF', // Saturated, friendly
  blueDeep: '#0078DE', // Pressed state
  blueLight: '#3D95CE',
  blueTint: '#E6F4FF', // Soft wash for badges & callouts

  // Semantics
  receivedGreen: '#4BB543', // Paid / Received income
  chargeRed: '#D32E2E', // Cancelled / Error
  pendingOrange: '#F5A623', // Pending queue / Waiting

  // Dark Mode
  darkCanvas: '#1A1A1A',
  darkSurface1: '#242424',
  darkSurface2: '#2E2E2E',
  darkDivider: '#2A2A2A',
  darkTextPrim: '#FFFFFF',
  darkTextSec: '#A0A0A0',
} as const;

export const brandGradient = [colors.blue, colors.blueDeep] as const;
