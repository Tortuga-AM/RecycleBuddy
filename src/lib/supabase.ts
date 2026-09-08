import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

interface StorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

let storageAdapter: StorageAdapter;

if (Platform.OS === 'web') {
  storageAdapter = {
    getItem: (key: string) => {
      if (typeof window === 'undefined') return Promise.resolve(null);
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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://placeholder.invalid';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'missing-anon-key';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('[RecycleBuddy] Supabase environment variables are missing; network features are disabled.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
