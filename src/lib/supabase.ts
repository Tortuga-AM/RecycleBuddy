import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

let storageAdapter: any;

if (Platform.OS === 'web') {
  storageAdapter = {
    getItem: (key: string) => {
      if (typeof window === 'undefined') return null;
      return Promise.resolve(localStorage.getItem(key));
    },
    setItem: (key: string, value: string) => {
      if (typeof window === 'undefined') return Promise.resolve();
      localStorage.setItem(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      if (typeof window === 'undefined') return Promise.resolve();
      localStorage.removeItem(key);
      return Promise.resolve();
    },
  };
} else {
  const SecureStore = require('expo-secure-store');
  storageAdapter = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
