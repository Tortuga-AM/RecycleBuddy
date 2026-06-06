import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Colors, estimateWeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRouter } from 'expo-router';

interface ClassificationResult {
  label: string;
  recyclable: boolean;
  special: boolean;
  confidence: number;
  reason: string;
}

interface DisposalSite {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
  phone?: string;
  url?: string;
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

export default function ScanTab() {
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [recycleStatus, setRecycleStatus] = useState<'recyclable' | 'special' | 'notRecyclable' | ''>('');
  const [explanation, setExplanation] = useState('');
  const [showExplanation, setShowExplanation] = useState(false);
  const [disposalSites, setDisposalSites] = useState<DisposalSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [zipCode, setZipCode] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const rev = await Location.reverseGeocodeAsync(loc.coords);
      const postal = rev?.[0]?.postalCode;
      if (postal) setZipCode(postal);
    })();
  }, []);

  const classifyImage = useCallback(async (uri: string): Promise<ClassificationResult> => {
    const response = await fetch(uri);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const { data, error } = await supabase.functions.invoke('classify-item', {
      body: { imageBase64: base64 },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data as ClassificationResult;
  }, []);

  const fetchDisposalSites = useCallback(async (zc: string) => {
    if (!zc) return;
    setLoadingSites(true);
    try {
      const { data, error } = await supabase.functions.invoke('find-sites', {
        body: { zipCode: zc },
      });
      if (!error && data?.sites) {
        setDisposalSites(data.sites);
      }
    } finally {
      setLoadingSites(false);
    }
  }, []);

  const saveScan = useCallback(async (cls: ClassificationResult, status: string) => {
    if (!user) return;
    const weight = estimateWeight(cls.label);
    await supabase.from('scan_history').insert({
      user_id: user.id,
      label: cls.label,
      recyclable: cls.recyclable,
      special: cls.special,
      confidence: cls.confidence,
      weight_estimate: status !== 'notRecyclable' ? weight : null,
    });
  }, [user]);

  const handleScan = useCallback(async () => {
    if (!cameraRef.current) return;
    setIsLoading(true);
    setResult(null);
    setExplanation('');
    setShowExplanation(false);
    setShowMap(false);
    setDisposalSites([]);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      const cls = await classifyImage(photo.uri);

      if (!cls || cls.confidence < 0.35) {
        setResult({ label: 'Unknown item', recyclable: false, special: false, confidence: cls?.confidence ?? 0, reason: 'Could not identify the item clearly.' });
        setRecycleStatus('notRecyclable');
        return;
      }

      setResult(cls);
      const status = cls.special ? 'special' : cls.recyclable ? 'recyclable' : 'notRecyclable';
      setRecycleStatus(status);

      await saveScan(cls, status);

      if ((status === 'special' || status === 'notRecyclable') && zipCode) {
        fetchDisposalSites(zipCode);
      }
    } catch (error) {
      Alert.alert('Scan failed', 'Unable to classify the item. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [classifyImage, saveScan, fetchDisposalSites, zipCode]);

  const handleExplain = useCallback(() => {
    if (!result || !recycleStatus) return;
    if (showExplanation) {
      setShowExplanation(false);
      return;
    }
    setShowExplanation(true);
    setExplanation(explainWhyText(result.label, recycleStatus));
  }, [result, recycleStatus, showExplanation]);

  const handleShowMap = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowMap(!showMap);
  }, [showMap]);

  const statusColor = useMemo(() => {
    if (recycleStatus === 'recyclable') return theme.recyclable;
    if (recycleStatus === 'special') return theme.special;
    return theme.notRecyclable;
  }, [recycleStatus, theme]);

  const statusLabel = useMemo(() => {
    if (recycleStatus === 'recyclable') return 'Recyclable';
    if (recycleStatus === 'special') return 'Special disposal';
    return 'Not recyclable';
  }, [recycleStatus]);

  const statusIcon = useMemo(() => {
    if (recycleStatus === 'recyclable') return 'checkmark-circle';
    if (recycleStatus === 'special') return 'alert-circle';
    return 'close-circle';
  }, [recycleStatus]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.cameraSection}>
        {Platform.OS !== 'web' ? (
          <>
            {cameraPermission?.granted ? (
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            ) : (
              <View style={[styles.camera, styles.permissionView]}>
                <Ionicons name="camera-outline" size={48} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.two }}>
                  Camera access needed to scan items
                </ThemedText>
                <Pressable style={[styles.grantButton, { backgroundColor: theme.primary }]} onPress={requestCameraPermission}>
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>Grant access</ThemedText>
                </Pressable>
              </View>
            )}

            <Pressable
              style={[styles.scanButton, { backgroundColor: theme.primary, opacity: isLoading ? 0.6 : 1 }]}
              onPress={handleScan}
              disabled={isLoading || !cameraPermission?.granted}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="camera" size={24} color="#fff" />
              )}
              <ThemedText type="smallBold" style={{ color: '#fff', marginLeft: Spacing.two }}>
                {isLoading ? 'Scanning...' : 'Scan item'}
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <View style={[styles.camera, styles.permissionView]}>
            <Ionicons name="camera-outline" size={48} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">Camera scanning is not supported on web.</ThemedText>
            <Pressable style={[styles.grantButton, { backgroundColor: theme.primary }]} onPress={() => {
              setResult({ label: 'Test Bottle', recyclable: true, special: false, confidence: 0.92, reason: 'Glass bottle' });
              setRecycleStatus('recyclable');
              saveScan({ label: 'Test Bottle', recyclable: true, special: false, confidence: 0.92, reason: 'Glass bottle' }, 'recyclable');
            }}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Simulate scan</ThemedText>
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.resultsContent}>
        {result && recycleStatus && (
          <ThemedView type="backgroundElement" style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name={statusIcon as any} size={28} color={statusColor} />
              <View style={{ flex: 1, marginLeft: Spacing.three }}>
                <ThemedText type="heading">{result.label}</ThemedText>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                  <ThemedText type="smallBold" style={{ color: statusColor }}>{statusLabel}</ThemedText>
                </View>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {Math.round(result.confidence * 100)}%
              </ThemedText>
            </View>

            {result.reason && (
              <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
                {result.reason}
              </ThemedText>
            )}

            <View style={styles.resultActions}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: theme.backgroundSelected }]}
                onPress={handleExplain}
              >
                <Ionicons name="help-circle-outline" size={18} color={theme.text} />
                <ThemedText type="smallBold" style={{ marginLeft: Spacing.one }}>
                  {showExplanation ? 'Hide' : 'Explain why'}
                </ThemedText>
              </Pressable>

              {(recycleStatus === 'special' || recycleStatus === 'notRecyclable') && (
                <Pressable
                  style={[styles.actionButton, { backgroundColor: theme.primary + '20' }]}
                  onPress={handleShowMap}
                >
                  <Ionicons name="map-outline" size={18} color={theme.primary} />
                  <ThemedText type="smallBold" themeColor="primary" style={{ marginLeft: Spacing.one }}>
                    {showMap ? 'Hide map' : 'Find disposal sites'}
                  </ThemedText>
                </Pressable>
              )}
            </View>

            {showExplanation && explanation && (
              <View style={[styles.explanationBox, { backgroundColor: theme.background, borderColor: theme.textSecondary + '20' }]}>
                <ThemedText type="small">{explanation}</ThemedText>
              </View>
            )}
          </ThemedView>
        )}

        {showMap && (
          <ThemedView type="backgroundElement" style={styles.mapCard}>
            <ThemedText type="smallBold" style={{ marginBottom: Spacing.two }}>Nearby disposal locations</ThemedText>

            {loadingSites ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.three }} />
            ) : disposalSites.length > 0 ? (
              <>
                <MapView
                  style={styles.map}
                  initialRegion={
                    userLocation
                      ? { latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.1, longitudeDelta: 0.1 }
                      : { latitude: 39.83, longitude: -98.58, latitudeDelta: 20, longitudeDelta: 20 }
                  }
                  showsUserLocation
                >
                  {disposalSites.filter(s => s.latitude && s.longitude).map((site, i) => (
                    <Marker
                      key={i}
                      coordinate={{ latitude: site.latitude!, longitude: site.longitude! }}
                      title={site.name}
                      description={[site.address, site.city, site.state].filter(Boolean).join(', ')}
                    />
                  ))}
                </MapView>

                {disposalSites.map((site, i) => (
                  <View key={i} style={styles.siteRow}>
                    <Ionicons name="location" size={18} color={theme.primary} />
                    <View style={{ flex: 1, marginLeft: Spacing.two }}>
                      <ThemedText type="smallBold">{site.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[site.address, site.city, site.state, site.postal_code].filter(Boolean).join(', ')}
                      </ThemedText>
                    </View>
                    {site.distance != null && (
                      <ThemedText type="small" themeColor="textSecondary">{site.distance.toFixed(1)} mi</ThemedText>
                    )}
                  </View>
                ))}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {zipCode ? `No disposal sites found near ${zipCode}. Try a different zip code.` : 'Set your zip code to find nearby sites.'}
              </ThemedText>
            )}

            {!zipCode && (
              <Pressable
                style={[styles.zipButton, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/zipcode')}
              >
                <ThemedText type="smallBold" style={{ color: '#fff' }}>Set zip code</ThemedText>
              </Pressable>
            )}
          </ThemedView>
        )}

        {!result && (
          <View style={styles.emptyState}>
            <Ionicons name="scan-outline" size={48} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.three }}>
              Point your camera at an item and tap Scan to find out if it's recyclable.
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraSection: {
    width: '100%',
    alignItems: 'center',
  },
  camera: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.65,
  },
  permissionView: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  grantButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    bottom: Spacing.three,
    alignSelf: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.five,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  resultsScroll: { flex: 1 },
  resultsContent: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    paddingBottom: 100,
  },
  resultCard: {
    width: '100%',
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  resultActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  explanationBox: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    marginTop: Spacing.two,
  },
  mapCard: {
    width: '100%',
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  map: {
    width: '100%',
    height: 200,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc3',
  },
  zipButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
  },
});
