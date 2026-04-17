import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fieldops.app',
  appName: 'FieldOps',
  webDir: 'dist',
  server: {
    // For development/testing: point directly at your Railway API so the app
    // doesn't need a local server. Remove or comment out for production builds.
    // androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#4f46e5',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#4f46e5',
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
