import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Pressable, StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Colors, estimateWeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScanRow {
  label: string;
  recyclable: boolean | null;
  special: boolean | null;
  confidence: number | null;
  weight_estimate: number | null;
  created_at: string;
}

interface Stats {
  totalScans: number;
  recycledCount: number;
  specialCount: number;
  totalWeight: number;
  recentScans: ScanRow[];
  breakdown: Record<string, number>;
}

const recyclingTips = [
  { icon: 'water', title: 'Rinse containers', desc: 'Food residue can contaminate entire batches of recyclables.' },
  { icon: 'close-circle', title: 'No plastic bags', desc: 'Plastic bags jam sorting machines. Return them to store drop-offs.' },
  { icon: 'checkmark-circle', title: 'Check local rules', desc: 'Recycling programs vary by area. Confirm what your county accepts.' },
  { icon: 'trash', title: 'When in doubt, throw it out', desc: 'Wishcycling — tossing non-recyclables in the bin — does more harm than good.' },
];

export default function HomeTab() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [zipCode, setZipCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('zip_code')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.zip_code) setZipCode(data.zip_code);
  }, [user]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scan_history')
        .select('label, recyclable, special, confidence, weight_estimate, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error || !data) return;

      const rows = data as ScanRow[];
      const breakdown: Record<string, number> = {};
      let totalWeight = 0;
      let recycledCount = 0;
      let specialCount = 0;

      for (const row of rows) {
        const key = row.label.toLowerCase();
        breakdown[key] = (breakdown[key] || 0) + 1;
        const w = row.weight_estimate ?? estimateWeight(row.label);
        totalWeight += w;
        if (row.recyclable) recycledCount++;
        if (row.special) specialCount++;
      }

      setStats({
        totalScans: rows.length,
        recycledCount,
        specialCount,
        totalWeight: Math.round(totalWeight * 100) / 100,
        recentScans: rows.slice(0, 5),
        breakdown,
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
    loadStats();
  }, [loadProfile, loadStats]);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.user_metadata?.name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'Recycler';

  const milestone = (() => {
    if (!stats) return { label: '0 / 5 items', pct: 0 };
    const thresholds = [5, 10, 25, 50, 100];
    const next = thresholds.find(t => stats.recycledCount < t) ?? 100;
    const prev = thresholds.filter(t => t <= stats.recycledCount).pop() ?? 0;
    return {
      label: `${stats.recycledCount - prev} / ${next - prev} items`,
      pct: (stats.recycledCount - prev) / (next - prev),
    };
  })();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <ThemedText type="heading">Hello, {firstName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {zipCode ? `Zip: ${zipCode}` : 'Set your zip code in Profile'}
            </ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" style={{ marginBottom: Spacing.two }}>Your impact</ThemedText>
            {loading ? (
              <ActivityIndicator color={theme.primary} />
            ) : stats ? (
              <>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <ThemedText type="title" themeColor="primary" style={styles.statNumber}>{stats.totalScans}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Items scanned</ThemedText>
                  </View>
                  <View style={styles.statItem}>
                    <ThemedText type="title" themeColor="recyclable" style={styles.statNumber}>{stats.recycledCount}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Recycled</ThemedText>
                  </View>
                  <View style={styles.statItem}>
                    <ThemedText type="title" themeColor="primary" style={styles.statNumber}>{stats.totalWeight.toFixed(1)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">kg saved</ThemedText>
                  </View>
                </View>

                <View style={styles.milestoneRow}>
                  <ThemedText type="small" themeColor="textSecondary">Next milestone</ThemedText>
                  <View style={[styles.progressBarBg, { backgroundColor: theme.backgroundSelected }]}>
                    <View style={[styles.progressBarFill, { backgroundColor: theme.primary, flex: milestone.pct }]} />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">{milestone.label}</ThemedText>
                </View>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">No scans yet. Start scanning!</ThemedText>
            )}
          </ThemedView>

          {stats && stats.recentScans.length > 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold" style={{ marginBottom: Spacing.two }}>Recent scans</ThemedText>
              {stats.recentScans.map((scan, i) => (
                <View key={i} style={styles.scanRow}>
                  <Ionicons
                    name={scan.recyclable ? 'checkmark-circle' : scan.special ? 'alert-circle' : 'close-circle'}
                    size={18}
                    color={scan.recyclable ? theme.recyclable : scan.special ? theme.special : theme.notRecyclable}
                  />
                  <ThemedText type="small" style={{ flex: 1, marginLeft: Spacing.two }}>{scan.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {(scan.weight_estimate ?? estimateWeight(scan.label)).toFixed(2)} kg
                  </ThemedText>
                </View>
              ))}
            </ThemedView>
          )}

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" style={{ marginBottom: Spacing.three }}>Recycling tips</ThemedText>
            {recyclingTips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <Ionicons name={tip.icon as any} size={20} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: Spacing.three }}>
                  <ThemedText type="smallBold">{tip.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{tip.desc}</ThemedText>
                </View>
              </View>
            ))}
          </ThemedView>

          <Pressable
            style={[styles.scanCTA, { backgroundColor: theme.primary }]}
            onPress={() => router.navigate({ pathname: '/(tabs)/scan' })}
          >
            <Ionicons name="camera" size={22} color="#fff" />
            <ThemedText type="smallBold" style={{ color: '#fff', marginLeft: Spacing.two }}>Scan an item</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: { gap: Spacing.one },
  card: {
    width: '100%',
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.two,
  },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 28, lineHeight: 32 },
  milestoneRow: {
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressBarFill: {
    borderRadius: 4,
    minHeight: 8,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc3',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.three,
  },
  scanCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    marginTop: Spacing.two,
  },
});
