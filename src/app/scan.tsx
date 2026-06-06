import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';

const STORAGE_KEY = '@recyclebuddy/stats';
const ZIP_CODE_STORAGE_KEY = '@recyclebuddy/zipCode';
const EARTH911_API_KEY = '';
const EARTH911_BASE_URL = 'https://api.earth911.com/earth911';
const GEMINI_API_KEY = 'AQ.Ab8RN6LUtkszEnpC0tVB2NISpGEabrsFeT6K3ZnYRLQOhnGCnQ';

const defaultWeights: Record<string, number> = {
  bottle: 0.25,
  can: 0.03,
  paper: 0.12,
  cardboard: 0.5,
  glass: 0.35,
  plastic: 0.18,
  mattress: 18,
  battery: 0.2,
  electronics: 2,
};

function estimateWeight(label: string) {
  const lower = label.toLowerCase();
  for (const key of Object.keys(defaultWeights)) {
    if (lower.includes(key)) {
      return defaultWeights[key];
    }
  }
  return 0.5;
}

async function fetchNearestSites(zipCode: string) {
  if (!EARTH911_API_KEY) return [];
  const url = `${EARTH911_BASE_URL}.searchLocations?api_key=${EARTH911_API_KEY}&postal_code=${zipCode}&country=US&max_distance=50`;
  const response = await fetch(url);
  const json = await response.json();
  const rawLocations = json?.result?.locations ?? [];
  return Array.isArray(rawLocations) ? rawLocations.slice(0, 5) : [];
}

function explainWhyText(label: string, kind: 'recyclable' | 'special' | 'notRecyclable') {
  if (kind === 'recyclable') {
    return `A ${label} is usually recyclable because it is made from materials like paper, glass, plastic, or metal that recycling programs can process. Keeping it out of the trash helps reduce pollution and save energy.`;
  }
  if (kind === 'special') {
    return `A ${label} often needs special recycling or disposal because it may contain hazardous materials or parts that normal curbside recycling cannot handle. Use a dedicated facility to keep dangerous waste out of landfills.`;
  }
  return `A ${label} is typically not accepted in standard recycling streams. It may be contaminated, made from mixed materials, or too fragile for recycling equipment, so it should be reused or disposed of properly.`;
}

export default function ScanScreen() {
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [zipCode, setZipCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [predictLabel, setPredictLabel] = useState('');
  const [predictConfidence, setPredictConfidence] = useState(0);
  const [recycleStatus, setRecycleStatus] = useState<'recyclable' | 'special' | 'notRecyclable' | ''>('');
  const [hint, setHint] = useState('Tap Scan to capture the item and analyze it.');
  const [nearestSites, setNearestSites] = useState<any[]>([]);
  const [stats, setStats] = useState({ count: 0, weight: 0 });
  const [explanation, setExplanation] = useState('');

  const loadZipCode = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(ZIP_CODE_STORAGE_KEY);
      if (stored) setZipCode(stored);
    } catch (error) {
      console.warn('Failed to load zip code', error);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) setStats(JSON.parse(stored));
    } catch (error) {
      console.warn('Failed to load stats', error);
    }
  }, []);

  useEffect(() => {
    async function requestPermissions() {
      const locationPermissionResponse = await Location.requestForegroundPermissionsAsync();
      const granted = locationPermissionResponse.status === 'granted';
      setLocationPermission(granted);
      if (!granted) {
        setHint('Location permission is required to find nearby recycling centers.');
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      if (!zipCode) {
        const reverse = await Location.reverseGeocodeAsync(currentLocation.coords);
        const postal = reverse?.[0]?.postalCode;
        if (postal) setZipCode(postal);
      }
    }
    loadZipCode();
    requestPermissions();
    loadStats();
  }, [loadZipCode, loadStats]);

  const saveStats = useCallback(async (nextStats: typeof stats) => {
    setStats(nextStats);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
    } catch (error) {
      console.warn('Failed to save stats', error);
    }
  }, []);

  const classifyImage = useCallback(async (uri: string) => {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Identify the main object in this image. Respond with JSON only: {"label": "object name", "recyclable": true/false, "special": true/false, "confidence": 0.0-1.0, "reason": "brief reason and proper disposal technique/location"}' },
              { inline_data: { mime_type: 'image/jpeg', data: base64 } }
            ]
          }]
        })
      }
    );

    const json = await result.json();
    
    // If the API returned an error block, log it directly
    if (json.error) {
      console.error('Gemini API Error details:', JSON.stringify(json.error, null, 2));
      throw new Error(`Gemini API Error: ${json.error.message}`);
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      // If there is no text but no explicit error, check if it was blocked by safety filters
      console.warn('Full Gemini Response object:', JSON.stringify(json, null, 2));
      throw new Error('No text returned from Gemini API');
    }

    // Clean markdown blocks if the model accidentally includes them
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      return JSON.parse(cleanedText);
    } catch (parseError) {
      console.warn("Failed to parse cleaned text:", cleanedText);
      throw parseError;
    }
  }, []);


  const handleScan = useCallback(async () => {
    if (!cameraRef.current) return;

    setIsLoading(true);
    setExplanation('');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      const result = await classifyImage(photo.uri);

      if (!result || result.confidence < 0.35) {
        setHint('Try a different angle, make sure the item is clearly visible, or try again with better lighting.');
        setPredictLabel('Unknown item');
        setPredictConfidence(result?.confidence ?? 0);
        setRecycleStatus('notRecyclable');
        return;
      }

      setPredictLabel(result.label);
      setPredictConfidence(result.confidence);

      const status = result.special ? 'special' : result.recyclable ? 'recyclable' : 'notRecyclable';
      setRecycleStatus(status);
      setHint(
        status === 'recyclable' ? 'This looks recyclable. Tap Explain why for more details.' :
        status === 'special' ? 'This item may need special disposal. Find a nearby center.' :
        'This item may not be accepted for curbside recycling.'
      );

      if (status !== 'notRecyclable') {
        const nextStats = {
          count: stats.count + 1,
          weight: Math.round((stats.weight + estimateWeight(result.label)) * 100) / 100,
        };
        saveStats(nextStats);
      }

      if (zipCode) {
        const sites = await fetchNearestSites(zipCode);
        setNearestSites(sites);
      }
    } catch (error) {
      console.warn(error);
      Alert.alert('Scan failed', 'Unable to complete item recognition. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [classifyImage, saveStats, stats, zipCode]);

  const handleExplain = useCallback(() => {
    if (!predictLabel || !recycleStatus) return;
    setExplanation(explainWhyText(predictLabel, recycleStatus));
  }, [predictLabel, recycleStatus]);

  const nearestSiteText = useMemo(() => {
    if (!nearestSites.length) return 'No nearby recycling sites found yet.';
    return nearestSites
      .map((site, index) => {
        const title = site.name ?? site.description ?? `Site ${index + 1}`;
        const location = [site.city, site.state, site.postal_code].filter(Boolean).join(', ');
        return `${title}${location ? ` — ${location}` : ''}`;
      })
      .join('\n');
  }, [nearestSites]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
          <ThemedText type="title" style={styles.heading}>
            Recycle Scanner
          </ThemedText>

          {Platform.OS !== 'web' ? (
            <ThemedView style={styles.cameraSection}>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />
              <Pressable style={styles.scanButton} onPress={handleScan} disabled={isLoading || !cameraPermission?.granted}>
                <ThemedText type="linkPrimary" style={styles.scanButtonText}>
                  {isLoading ? 'Scanning…' : 'Scan item'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small">Camera scanning is not supported on web.</ThemedText>
            </ThemedView>
          )}

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">Scan result</ThemedText>
            <ThemedText type="small">Label: {predictLabel || 'No item scanned yet.'}</ThemedText>
            {predictLabel ? (
              <>
                <ThemedText type="small">Confidence: {(predictConfidence * 100).toFixed(0)}%</ThemedText>
                <ThemedText type="small">
                  Status: {recycleStatus === 'recyclable' ? 'Recyclable' : recycleStatus === 'special' ? 'Special recycling required' : 'Not recyclable'}
                </ThemedText>
                <Pressable style={styles.explainButton} onPress={handleExplain}>
                  <ThemedText type="linkPrimary">Explain why</ThemedText>
                </Pressable>
                {explanation ? <ThemedText type="small">{explanation}</ThemedText> : null}
              </>
            ) : null}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">Nearby recycling support</ThemedText>
            <ThemedText type="small">{nearestSiteText}</ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">Recycling game</ThemedText>
            <ThemedText type="small">Items recycled: {stats.count}</ThemedText>
            <ThemedText type="small">Estimated weight saved: {stats.weight.toFixed(2)} kg</ThemedText>
          </ThemedView>

          <ThemedView style={styles.hintSection}>
            <ThemedText type="smallBold">Hint</ThemedText>
            <ThemedText type="small">{hint}</ThemedText>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollView: { flex: 1 },
  contentContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    alignItems: 'center',
    gap: Spacing.four,
  },
  heading: { marginTop: Spacing.four, textAlign: 'center' },
  card: { width: '100%', padding: Spacing.four, borderRadius: Spacing.four },
  cameraSection: { width: '100%', alignItems: 'center', gap: Spacing.three },
  camera: { width: '100%', aspectRatio: 16 / 9, borderRadius: Spacing.four, overflow: 'hidden' },
  scanButton: {
    alignSelf: 'stretch',
    backgroundColor: '#cce4ff',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  scanButtonText: { color: '#000', fontWeight: '700' },
  explainButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1c7c54',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  hintSection: { width: '100%', padding: Spacing.four, borderRadius: Spacing.four },
  scanHint: { marginTop: Spacing.two },
  fieldRow: { marginTop: Spacing.three, marginBottom: Spacing.two },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    color: '#000',
    backgroundColor: '#fff',
  },
  linkButton: {
    marginTop: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
    backgroundColor: '#cce4ff',
    alignItems: 'center',
  },
});