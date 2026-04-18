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
    // Muted burgundy red - professional error states
    red: [
      '#FDF2F2',
      '#F8E0E0',
      '#F0C4C4',
      '#E5A3A3',
      '#D68080',
      '#C45F5F', // Primary red
      '#A64D4D',
      '#8B3D3D',
      '#702F2F',
      '#542323',
    ],
    // Sage green - professional success states
    green: [
      '#F0F5F2',
      '#DCE8E0',
      '#C2D6C9',
      '#A5C2AF',
      '#85AC93',
      '#669678', // Primary green
      '#507A5F',
      '#3F6149',
      '#304A37',
      '#223527',
    ],
    // Warm amber - professional warning states
    yellow: [
      '#FBF7EE',
      '#F5EBD5',
      '#EDDBB4',
      '#E3C78F',
      '#D8B166',
      '#C99A3D', // Primary amber
      '#A67F32',
      '#856628',
      '#664E1F',
      '#4A3816',
    ],
    // Slate gray - neutral text and backgrounds
    gray: [
      '#F8F9FA',
      '#F1F3F5',
      '#E9ECEF',
      '#DEE2E6',
      '#CED4DA',
      '#ADB5BD',
      '#868E96',
      '#495057',
      '#343A40',
      '#212529',
    ],
    // Keep violet for accents
    violet: [
      '#F5F3FF',
      '#EDE9FE',
      '#DDD6FE',
      '#C4B5FD',
      '#A78BFA',
      '#8B5CF6',
      '#7C3AED',
      '#6D28D9',
      '#5B21B6',
      '#4C1D95',
    ],
  },

  // True black for dark mode
  black: '#000000',
  white: '#FFFFFF',

  other: {
    // High contrast values
    highContrastText: '#FFFFFF',
    trueBlack: '#000000',
    // Professional brand colors
    primaryBlue: '#4A7DA5',
    successGreen: '#669678',
    warningAmber: '#C99A3D',
    errorRed: '#C45F5F',
  },
});
