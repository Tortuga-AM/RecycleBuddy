import AsyncStorage from '@react-native-async-storage/async-storage';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as tf from '@tensorflow/tfjs';
//import '@tensorflow/tfjs-react-native';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';


const STORAGE_KEY = '@recyclebuddy/stats';
const EARTH911_API_KEY = ''; // set your Earth911 API key here for location-based recycling lookup
const EARTH911_BASE_URL = 'https://api.earth911.com/earth911';

const recyclableKeywords = [
  'paper',
  'cardboard',
  'plastic',
  'glass',
  'metal',
  'can',
  'bottle',
  'jar',
  'box',
  'carton',
  'aluminum',
  'steel',
  'tin',
  'paperboard',
  'magazine',
  'carton',
];

const specialDisposalKeywords = ['battery', 'mattress', 'electronics', 'paint', 'hazardous', 'chemical', 'oil', 'phone', 'tv', 'computer'];

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

function normalizeLabel(label: string) {
  return label.split(',')[0].trim().toLowerCase();
}

function buildMaterialQuery(label: string) {
  return encodeURIComponent(normalizeLabel(label));
}

async function fetchNearestSites(zipCode: string) {
  if (!EARTH911_API_KEY) {
    return [];
  }
  const url = `${EARTH911_BASE_URL}.searchLocations?api_key=${EARTH911_API_KEY}&postal_code=${zipCode}&country=US&max_distance=50`;
  const response = await fetch(url);
  const json = await response.json();
  const rawLocations = json?.result?.locations ?? [];
  return Array.isArray(rawLocations) ? rawLocations.slice(0, 5) : [];
}

async function fetchRecyclingGuidance(label: string, zipCode: string) {
  if (!EARTH911_API_KEY) {
    return null;
  }
  const query = buildMaterialQuery(label);
  const url = `${EARTH911_BASE_URL}.searchMaterials?api_key=${EARTH911_API_KEY}&query=${query}`;
  const response = await fetch(url);
  const json = await response.json();
  return json?.result || null;
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [zipCode, setZipCode] = useState('');
  const [locationText, setLocationText] = useState('unknown');
  const [isLoading, setIsLoading] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [predictLabel, setPredictLabel] = useState('');
  const [predictConfidence, setPredictConfidence] = useState(0);
  const [recycleStatus, setRecycleStatus] = useState<'recyclable' | 'special' | 'notRecyclable' | ''>('');
  const [hint, setHint] = useState('Tap Scan to capture the item and analyze it.');
  const [nearestSites, setNearestSites] = useState<any[]>([]);
  const [stats, setStats] = useState({ count: 0, weight: 0 });
  const [explanation, setExplanation] = useState('');
  const [model, setModel] = useState<mobilenet.MobileNet | null>(null);

  useEffect(() => {
    async function requestPermissions() {
      const locationPermissionResponse = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(locationPermissionResponse.status === 'granted');
      if (locationPermissionResponse.status !== 'granted') {
        setHint('Location permission is required to find nearby recycling centers.');
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const postalCode = currentLocation?.coords ? zipCode || 'unknown' : 'unknown';
      setLocationText(`Latitude ${currentLocation.coords.latitude.toFixed(3)}, Longitude ${currentLocation.coords.longitude.toFixed(3)}`);
      if (!zipCode) {
        const reverse = await Location.reverseGeocodeAsync(currentLocation.coords);
        const postal = reverse?.[0]?.postalCode;
        if (postal) { setZipCode(postal); }
      }
    }

    requestPermissions();
    loadStats();
    loadModel();
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setStats(JSON.parse(stored));
      }
    } catch (error) {
      console.warn('Failed to load stats', error);
    }
  }, []);

  const saveStats = useCallback(async (nextStats: typeof stats) => {
    setStats(nextStats);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
    } catch (error) {
      console.warn('Failed to save stats', error);
    }
  }, []);

  const loadModel = useCallback(async () => {
    try {
      setIsLoading(true);
      await tf.ready();
      const loadedModel = await mobilenet.load();
      setModel(loadedModel);
      setModelReady(true);
      setHint('Model loaded. Point the camera at the item and press Scan.');
    } catch (error) {
      console.warn('Model loading failed', error);
      setHint('Object recognition is not available yet. Use a clear label or angle.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const classifyImage = useCallback(async (uri: string) => {
    if (!model) {
      return [];
    }
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    const imageTensor = decodeJpeg(new Uint8Array(buffer));
    const predictions = await model.classify(imageTensor);
    imageTensor.dispose();
    return predictions;
  }, [model]);

  const handleScan = useCallback(async () => {
    if (!cameraRef.current) {
      return;
    }

    setIsLoading(true);
    setExplanation('');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      const predictions = await classifyImage(photo.uri);
      const best = predictions?.[0];
      if (!best || best.probability < 0.35) {
        setHint('Try a different angle, make sure the item label is visible, or try again with better lighting.');
        setPredictLabel('Unknown item');
        setPredictConfidence(best?.probability ?? 0);
        setRecycleStatus('notRecyclable');
        return;
      }

      const normalized = normalizeLabel(best.className);
      setPredictLabel(normalized);
      setPredictConfidence(best.probability);

      const special = specialDisposalKeywords.some((keyword) => normalized.includes(keyword));
      const recyclable = recyclableKeywords.some((keyword) => normalized.includes(keyword));
      const status = special ? 'special' : recyclable ? 'recyclable' : 'notRecyclable';
      setRecycleStatus(status);
      setHint(status === 'recyclable' ? 'This looks recyclable. Tap Explain why for more details.' : special ? 'This item may need special disposal. Find a nearby center.' : 'This item may not be accepted for curbside recycling.');

      if (status !== 'notRecyclable') {
        const nextStats = {
          count: stats.count + 1,
          weight: Math.round((stats.weight + estimateWeight(normalized)) * 100) / 100,
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
    if (!predictLabel || !recycleStatus) {
      return;
    }
    setExplanation(explainWhyText(predictLabel, recycleStatus));
  }, [predictLabel, recycleStatus]);

  const nearestSiteText = useMemo(() => {
    if (!nearestSites.length) {
      return 'No nearby recycling sites found yet. Enter your zip code and scan an item.';
    }
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

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">Step 1: Enable location</ThemedText>
            <ThemedText type="small">Location helps find nearby recycling centers and special disposal sites.</ThemedText>
            <ThemedText type="smallBold">Status:</ThemedText>
            <ThemedText type="small">{locationPermission ? 'Enabled' : 'Not enabled'}</ThemedText>
            <ThemedText type="smallBold">Current position:</ThemedText>
            <ThemedText type="small">{locationText}</ThemedText>
            <View style={styles.fieldRow}>
              <TextInput
                value={zipCode}
                onChangeText={setZipCode}
                placeholder="Zip code"
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              The app can use your zip code to look up the nearest Earth911 recycling centers.
            </ThemedText>
          </ThemedView>

          {Platform.OS !== 'web' ? (
            <ThemedView style={styles.cameraSection}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
/>
              <Pressable style={styles.scanButton} onPress={handleScan} disabled={isLoading || !cameraPermission?.granted}>
                <ThemedText type="linkPrimary">{isLoading ? 'Scanning…' : 'Scan item'}</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small">Camera scanning is not supported on web in this build. Use the native app experience to scan items.</ThemedText>
            </ThemedView>
          )}

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">Scan result</ThemedText>
            <ThemedText type="small">Label: {predictLabel || 'No item scanned yet.'}</ThemedText>
            {predictLabel ? (
              <>
                <ThemedText type="small">Confidence: {(predictConfidence * 100).toFixed(0)}%</ThemedText>
                <ThemedText type="small">Status: {recycleStatus === 'recyclable' ? 'Recyclable' : recycleStatus === 'special' ? 'Special recycling required' : 'Not recyclable'}</ThemedText>
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
            <ThemedText type="small">
              Keep scanning items to grow your recycling streak.
            </ThemedText>
          </ThemedView>

          <ThemedView style={styles.hintSection}>
            <ThemedText type="smallBold">Hint</ThemedText>
            <ThemedText type="small">{hint}</ThemedText>
            {!EARTH911_API_KEY ? (
              <ThemedText type="small">Set an Earth911 API key in src/app/scan.tsx to enable live site lookup.</ThemedText>
            ) : null}
          </ThemedView>
        </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    alignItems: 'center',
    gap: Spacing.four,
  },
  heading: {
    marginTop: Spacing.four,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  cameraSection: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.three,
  },
  camera: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  scanButton: {
    alignSelf: 'stretch',
    backgroundColor: '#007aff',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  explainButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1c7c54',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  fieldRow: {
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: Spacing.four,
    padding: Spacing.three,
    color: '#000',
    backgroundColor: '#fff',
  },
  hintSection: {
    width: '100%',
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
});