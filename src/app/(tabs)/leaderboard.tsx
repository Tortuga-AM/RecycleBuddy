import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLeaderboard, type LeaderboardRow, type Period } from '@/hooks/use-leaderboard';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';

// Weights are stored in kilograms.
function formatWeight(kg: number) {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(1)} kg`;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week',  label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all',   label: 'All Time' },
];

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardTab() {
  const theme = useTheme();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('week');
  const { rows, myRank, loading, error, refresh } = useLeaderboard(period);

  // Refresh on focus so a scan taken moments ago is reflected.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const renderRow = ({ item }: { item: LeaderboardRow }) => {
    const isMe = item.user_id === user?.id;
    return (
      <View style={[styles.row, isMe && { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold" style={styles.rank}>
          {MEDALS[item.rank] ?? item.rank}
        </ThemedText>

        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.primary + '20' }]}>
            <ThemedText type="smallBold" themeColor="primary">
              {item.display_name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
        )}

        <View style={{ flex: 1, marginLeft: Spacing.three }}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.display_name}{isMe ? ' (you)' : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {item.item_count} item{item.item_count === 1 ? '' : 's'}
          </ThemedText>
        </View>

        <ThemedText type="smallBold" themeColor="primary">
          {formatWeight(item.total_weight)}
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.tabs}>
        {PERIODS.map(p => {
          const active = p.key === period;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              style={[styles.tab, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}
            >
              <ThemedText
                type="smallBold"
                style={active ? { color: '#fff' } : undefined}
                themeColor={active ? undefined : 'textSecondary'}
              >
                {p.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {error && (
        <ThemedText
          type="small"
          style={{ color: theme.error, paddingHorizontal: Spacing.four, textAlign: 'center' }}
        >
          {error}
        </ThemedText>
      )}

      {loading && rows.length === 0 ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.six }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.user_id}
          renderItem={renderRow}
          refreshing={loading}
          onRefresh={refresh}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={
            rows.length > 0 ? (
              <ThemedText
                type="smallBold"
                themeColor="textSecondary"
                style={{ paddingHorizontal: Spacing.four, paddingBottom: Spacing.two }}
              >
                Top 10 Recyclers
              </ThemedText>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={48} color={theme.textSecondary} />
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={{ textAlign: 'center', marginTop: Spacing.three }}
              >
                Nobody has recycled yet this period. Scan an item to claim first place.
              </ThemedText>
            </View>
          }
        />
      )}

      {myRank && (
        <ThemedView type="backgroundElement" style={styles.myBar}>
          <ThemedText type="smallBold" themeColor="primary" style={{ textAlign: 'center' }}>
            You&apos;re #{myRank.rank} of {myRank.total_participants} · {formatWeight(myRank.total_weight)}
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={{ textAlign: 'center', marginTop: Spacing.one }}
          >
            {myRank.rank <= 10
              ? 'You\'re on the public leaderboard'
              : `Top ${Math.max(100 - myRank.percentile, 1)}% of recyclers`}
          </ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.four },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  rank: { width: 32 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  myBar: {
    padding: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc3',
  },
});