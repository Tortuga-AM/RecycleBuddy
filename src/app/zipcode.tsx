import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const ZIP_CODE_STORAGE_KEY = '@recyclebuddy/zipCode';

export default function ZipCodeScreen() {
  const router = useRouter();
  const [zipCode, setZipCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadZipCode = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(ZIP_CODE_STORAGE_KEY);
      if (stored) {
        setZipCode(stored);
      }
    } catch (error) {
      console.warn('Failed to load zip code', error);
    }
  }, []);

  useEffect(() => {
    loadZipCode();
  }, [loadZipCode]);

  const saveZipCode = useCallback(async () => {
    const trimmed = zipCode.trim();
    if (!trimmed || trimmed.length < 5) {
      Alert.alert('Enter a valid zip code');
      return;
    }

    setIsSaving(true);
    try {
      await AsyncStorage.setItem(ZIP_CODE_STORAGE_KEY, trimmed);
      router.push('/scan');
    } catch (error) {
      console.warn('Failed to save zip code', error);
      Alert.alert('Unable to save zip code. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [router, zipCode]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="title" style={styles.heading}>Enter your zip code</ThemedText>
          <ThemedText type="small" style={styles.description}>
            Your postal code helps the app find local recycling centers and area-specific disposal guidance.
          </ThemedText>

          <TextInput
            value={zipCode}
            onChangeText={setZipCode}
            placeholder="Zip code"
            keyboardType="number-pad"
            maxLength={10}
            style={styles.input}
          />

          <Pressable style={styles.saveButton} onPress={saveZipCode} disabled={isSaving}>
            <ThemedText type="linkPrimary">{isSaving ? 'Saving…' : 'Save zip code'}</ThemedText>
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={() => router.push('/scan')}>
            <ThemedText type="small">Back to scan</ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  card: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  heading: {
    textAlign: 'center',
  },
  description: {
    marginTop: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    backgroundColor: '#fff',
    color: '#000',
  },
  saveButton: {
    marginTop: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    backgroundColor: '#cce4ff',
    alignItems: 'center',
  },
  cancelButton: {
    marginTop: Spacing.two,
    alignItems: 'center',
  },
});
