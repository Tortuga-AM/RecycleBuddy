import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ZipCodeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const theme = useTheme();
  const [zipCode, setZipCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const loadZipCode = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('zip_code')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.zip_code) setZipCode(data.zip_code);
  }, [user]);

  useEffect(() => {
    loadZipCode();
  }, [loadZipCode]);

  const handleAutofill = useCallback(async () => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Please enable it in Settings.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const results = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const postal = results?.[0]?.postalCode;
      if (postal) {
        setZipCode(postal);
      } else {
        setLocationError('Could not determine zip code from your location.');
      }
    } catch {
      setLocationError('Unable to get your location. Please enter your zip code manually.');
    } finally {
      setIsLocating(false);
    }
  }, []);

  const saveZipCode = useCallback(async () => {
    const trimmed = zipCode.trim();
    if (!trimmed || trimmed.length < 5) {
      Alert.alert('Enter a valid zip code');
      return;
    }

    setIsSaving(true);
    try {
      if (user) {
        await supabase
          .from('profiles')
          .update({ zip_code: trimmed })
          .eq('id', user.id);
      }
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/scan');
      }
    } catch {
      Alert.alert('Unable to save zip code. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [router, zipCode, user]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/scan');
            }} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={theme.text} />
            </Pressable>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Ionicons name="location-outline" size={40} color={theme.primary} style={{ alignSelf: 'center' }} />
            <ThemedText type="heading" style={{ textAlign: 'center', marginTop: Spacing.three }}>Set your location</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Your zip code helps find nearby recycling centers and local disposal rules.
            </ThemedText>

            <TextInput
              value={zipCode}
              onChangeText={setZipCode}
              placeholder="Enter zip code"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              maxLength={10}
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.textSecondary + '40' }]}
            />

            <Pressable
              style={[styles.autofillButton, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
              onPress={handleAutofill}
              disabled={isLocating}
            >
              {isLocating ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <Ionicons name="locate" size={18} color={theme.primary} />
              )}
              <ThemedText type="smallBold" themeColor="primary" style={{ marginLeft: Spacing.two }}>
                {isLocating ? 'Finding location...' : 'Autofill from location'}
              </ThemedText>
            </Pressable>

            {locationError && (
              <View style={[styles.errorBox, { backgroundColor: theme.error + '15' }]}>
                <ThemedText type="small" style={{ color: theme.error }}>{locationError}</ThemedText>
              </View>
            )}

            <Pressable
              style={[styles.saveButton, { backgroundColor: theme.primary, opacity: isSaving ? 0.6 : 1 }]}
              onPress={saveZipCode}
              disabled={isSaving}
            >
              <ThemedText type="smallBold" style={{ color: '#fff' }}>
                {isSaving ? 'Saving...' : 'Save zip code'}
              </ThemedText>
            </Pressable>
          </ThemedView>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Spacing.two,
  },
  closeButton: {
    padding: Spacing.two,
  },
  card: {
    marginTop: Spacing.three,
    padding: Spacing.five,
    borderRadius: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    fontSize: 16,
    width: '100%',
    textAlign: 'center',
  },
  autofillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  errorBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    width: '100%',
  },
  saveButton: {
    width: '100%',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});
