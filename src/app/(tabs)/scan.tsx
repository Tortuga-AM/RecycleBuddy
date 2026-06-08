import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { estimateWeight, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

// Robust conditional import to prevent 'codegenNativeComponent' errors on Web/SSR.
let MapView: any = View;
let Marker: any = View;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default || View;
    Marker = Maps.Marker || View;
  } catch (e) {
    console.warn('Maps failed to load on native:', e);
  }
}

interface ClassificationResult {
  label: string;
  recyclable: boolean;
  special: boolean;
  confidence: number;
  weight_estimate?: number;
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
  category?: string;
}

type RecycleStatus = 'recyclable' | 'special' | 'notRecyclable' | '';

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
  const { width: windowWidth } = useWindowDimensions();
  const scanAnimValue = useRef(new Animated.Value(0)).current;

  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [recycleStatus, setRecycleStatus] = useState<RecycleStatus>('');
  const [explanation, setExplanation] = useState('');
  const [showExplanation, setShowExplanation] = useState(false);
  const [disposalSites, setDisposalSites] = useState<DisposalSite[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [zipCode, setZipCode] = useState<string | null>(null);

  const triggerLayoutAnimation = useCallback(() => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getLastKnownPositionAsync();
      if (!loc) {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  const loadZipCode = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('zip_code')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.zip_code) {
      setZipCode(data.zip_code);
    } else {
      setZipCode(null);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadZipCode();
    }, [loadZipCode])
  );

  // Smooth looping animation for AI fluid background track
  useEffect(() => {
    if (isLoading) {
      scanAnimValue.setValue(0);
      Animated.loop(
        Animated.timing(scanAnimValue, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      scanAnimValue.stopAnimation();
      scanAnimValue.setValue(0);
    }
  }, [isLoading, scanAnimValue]);

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
      body: { imageBase64: base64, zipCode },
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data as ClassificationResult;
  }, [zipCode]);

  const fetchDisposalSites = useCallback(async (label: string) => {
    if (!userLocation) return;
    setLoadingSites(true);
    try {
      let category: string | undefined;
      const lower = label.toLowerCase();
      if (lower.includes('battery') || lower.includes('electronic') || lower.includes('e-waste')) {
        category = 'electronics';
      } else if (lower.includes('paint') || lower.includes('oil') || lower.includes('chemical') || lower.includes('hazardous')) {
        category = 'household_hazardous';
      }
      const { data, error } = await supabase.functions.invoke('find-sites', {
        body: {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          radiusKm: 25,
          category,
        },
      });
      if (!error && data?.sites) {
        setDisposalSites(data.sites);
      }
    } finally {
      setLoadingSites(false);
    }
  }, [userLocation]);

  const saveScan = useCallback(async (cls: ClassificationResult, status: string) => {
    if (!user) return;
    const weight = cls.weight_estimate ?? estimateWeight(cls.label);
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
      if (!photo) throw new Error("Capture failed");

      triggerLayoutAnimation();
      setCapturedPhoto(photo.uri);

      const cls = await classifyImage(photo.uri);

      if (!cls || cls.confidence < 0.35) {
        triggerLayoutAnimation();
        setResult({ label: 'Unknown item', recyclable: false, special: false, confidence: cls?.confidence ?? 0, reason: 'Could not identify the item clearly.' });
        setRecycleStatus('notRecyclable');
        setIsExpanded(false);
        return;
      }

      triggerLayoutAnimation();
      setResult(cls);
      const status = cls.special ? 'special' : cls.recyclable ? 'recyclable' : 'notRecyclable';
      setRecycleStatus(status);
      setIsExpanded(false);

      await saveScan(cls, status);

      if ((status === 'special' || status === 'notRecyclable') && userLocation) {
        fetchDisposalSites(cls.label);
      }
    } catch (error) {
      Alert.alert('Scan failed', 'Unable to classify the item. Please try again.');
      setCapturedPhoto(null);
      setIsExpanded(true);
    } finally {
      setIsLoading(false);
    }
  }, [classifyImage, saveScan, fetchDisposalSites, userLocation]);

  const handleScanAnother = useCallback(() => {
    triggerLayoutAnimation();
    setResult(null);
    setRecycleStatus('');
    setCapturedPhoto(null);
    setIsExpanded(true);
    setShowExplanation(false);
    setShowMap(false);
    setDisposalSites([]);
  }, []);

  const handleWebSimulate = useCallback(async () => {
    setIsLoading(true);
    triggerLayoutAnimation();
    setCapturedPhoto('https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&q=80&w=600');

    setTimeout(async () => {
      triggerLayoutAnimation();
      const cls = { label: 'Glass Bottle', recyclable: true, special: false, confidence: 0.95, reason: 'Standard clear glass bottle.' };
      setResult(cls);
      setRecycleStatus('recyclable');
      setIsExpanded(false);
      setIsLoading(false);
      await saveScan(cls, 'recyclable');
    }, 1200);
  }, [saveScan]);

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
    triggerLayoutAnimation();
    setShowMap(!showMap);
  }, [showMap]);

  const openInExternalMaps = useCallback((site: DisposalSite) => {
    const query = encodeURIComponent(`${site.name} ${site.address || ''} ${site.city || ''}`);
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) Linking.openURL(url);
  }, []);

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

  // Safe Explicit Type Casting for Ionicons Layout Assets
  const statusIcon = useMemo<keyof typeof Ionicons.glyphMap>(() => {
    if (recycleStatus === 'recyclable') return 'checkmark-circle';
    if (recycleStatus === 'special') return 'alert-circle';
    return 'close-circle';
  }, [recycleStatus]);

  // Responsive dimensions: Constrain width on Web/Desktop to avoid massive vertical overflows
  const isWeb = Platform.OS === 'web';
  const contentWidth = isWeb ? Math.min(windowWidth, 500) : windowWidth;
  
  const cameraHeight = isExpanded 
    ? contentWidth * (isWeb ? 0.8 : 1.3) 
    : contentWidth * (isWeb ? 0.45 : 0.65);
  
  // Slide dynamic track bounds horizontally
  const gradientTranslateX = scanAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-contentWidth, 0],
  });

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.cameraSection, { height: cameraHeight, width: '100%', alignSelf: 'center' }]}>
        {cameraPermission?.granted ? (
          <>
            {capturedPhoto ? (
              <View style={{ width: contentWidth, height: cameraHeight }}>
                <Image source={{ uri: capturedPhoto }} style={[styles.camera, { height: cameraHeight, width: contentWidth }]} resizeMode="cover" fadeDuration={0} />
                {isLoading && (
                  <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
                    <Animated.View style={[styles.gradientTrack, { transform: [{ translateX: gradientTranslateX }], height: cameraHeight, width: contentWidth * 2 }]}>
                      <LinearGradient
                        colors={['#4285F4', '#9B51E0', '#E91E63', '#FFA000', '#4285F4', '#9B51E0', '#E91E63']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>
                    <View style={[styles.gradientOverlay, { height: cameraHeight }]} />
                  </View>
                )}
              </View>
            ) : (
              <CameraView ref={cameraRef} style={[styles.camera, { height: cameraHeight, width: contentWidth }]} facing="back" />
            )}

            <Pressable
              style={[styles.scanButton, { backgroundColor: theme.primary, opacity: isLoading ? 0.6 : 1 }]}
              onPress={result ? handleScanAnother : handleScan}
              disabled={isLoading || (!result && !cameraPermission?.granted)}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name={result ? "refresh" : "camera"} size={24} color="#fff" />
              )}
              <ThemedText type="smallBold" style={{ color: '#fff', marginLeft: Spacing.two }}>
                {isLoading ? 'Scanning...' : result ? 'Scan another' : 'Scan item'}
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <View style={[styles.camera, styles.permissionView, { height: cameraHeight }]}>
            <Ionicons name="camera-outline" size={48} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.two }}>
              Camera access needed to scan items
            </ThemedText>
            <Pressable style={[styles.grantButton, { backgroundColor: theme.primary }]} onPress={requestCameraPermission}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Grant access</ThemedText>
            </Pressable>
          </View>
        )}

        {Platform.OS === 'web' && !capturedPhoto && !isLoading && (
          <Pressable
            style={[styles.webSimulateButton, { borderColor: theme.primary }]}
            onPress={handleWebSimulate}
          >
            <ThemedText type="smallBold" themeColor="primary">Try Simulation</ThemedText>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.resultsScroll} contentContainerStyle={styles.resultsContent}>
        {result && recycleStatus && (
          <ThemedView type="backgroundElement" style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name={statusIcon} size={28} color={statusColor} />
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
              <View style={{ gap: Spacing.two }}>
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
                  <Pressable key={i} style={styles.siteRow} onPress={() => openInExternalMaps(site)}>
                    <Ionicons name="location" size={18} color={theme.primary} />
                    <View style={{ flex: 1, marginLeft: Spacing.two }}>
                      <ThemedText type="smallBold">{site.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[site.address, site.city, site.state, site.postal_code].filter(Boolean).join(', ')}
                      </ThemedText>
                      {site.category && (
                        <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic' }}>
                          Accepts: {site.category}
                        </ThemedText>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {userLocation ? 'No disposal sites found nearby. Try a wider search or check local resources.' : 'Enable location access to find nearby disposal sites.'}
              </ThemedText>
            )}

            {!userLocation && (
              <Pressable
                style={[styles.zipButton, { backgroundColor: theme.primary }]}
                onPress={async () => {
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  if (status === 'granted') {
                    let loc = await Location.getLastKnownPositionAsync();
                    if (!loc) {
                      loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    }
                    const newLoc = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
                    setUserLocation(newLoc);
                    if (result) fetchDisposalSites(result.label);
                  }
                }}
              >
                <ThemedText type="smallBold" style={{ color: '#fff' }}>Enable location</ThemedText>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraSection: {
    alignItems: 'center',
    backgroundColor: '#000',
  },
  camera: {
    overflow: 'hidden',
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
    zIndex: 20,
  },
  webSimulateButton: {
    position: 'absolute',
    bottom: Spacing.three,
    right: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
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
    flexWrap: 'wrap',
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
  gradientTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    opacity: 0.7,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
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
    display: Platform.OS === 'web' ? 'none' : 'flex',
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