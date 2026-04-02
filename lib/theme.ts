import { createTheme } from '@mantine/core';

export const theme = createTheme({
  /** Theme configuration */
  primaryColor: 'blue',
  fontFamily: 'Inter, sans-serif',
  defaultRadius: 'md',

  colors: {
    // Steel blue palette - matched to logo (#33618B)
    blue: [
      '#EDF3F7',
      '#D4E2ED',
      '#B0C9DB',
      '#8BAFC9',
      '#6696B7',
      '#4A7DA5', // Primary - logo blue
      '#33618B', // Logo exact color
      '#2A5275',
      '#21435F',
      '#183349',
    ],
    // Sophisticated purple accent for highlights
    violet: [
      '#F5F3FF',
      '#EDE9FE',
      '#DDD6FE',
      '#C4B5FD',
      '#A78BFA',
      '#8B5CF6', // Accent purple
      '#7C3AED',
      '#6D28D9',
      '#5B21B6',
      '#4C1D95',
    ],
    // Keep cyan for specific highlights if needed
    cyan: [
      '#E6FCFF',
      '#B8F5FF',
      '#8AEDFF',
      '#5CE4FF',
      '#2EDBFF',
      '#00D1FF',
      '#00B8E6',
      '#009FCC',
      '#0085B3',
      '#006B99',
    ],
  },

  // True black for dark mode
  black: '#000000',
  white: '#FFFFFF',

  other: {
    // High contrast values
    highContrastText: '#FFFFFF',
    trueBlack: '#000000',
    // New professional accent colors
    primaryBlue: '#4A7DA5',
    accentPurple: '#8B5CF6',
  },
});
