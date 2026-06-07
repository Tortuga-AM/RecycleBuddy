import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileTab() {
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<{ display_name: string | null; email: string | null; zip_code: string | null } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('display_name, email, zip_code')
      .eq('id', user.id)
      .maybeSingle();
    if (data) setProfile(data);

    const { count } = await supabase
      .from('scan_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if (count != null) setScanCount(count);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleSignOut = async () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleClearHistory = async () => {
    if (!user) return;
    Alert.alert('Clear history', 'Delete all your scan history? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('scan_history').delete().eq('user_id', user.id);
          setScanCount(0);
        },
      },
    ]);
  };

  const displayName = profile?.display_name
    ?? user?.user_metadata?.full_name
    ?? user?.user_metadata?.name
    ?? 'Recycler';
  const email = profile?.email ?? user?.email ?? '';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: theme.primary + '30' }]}>
              <ThemedText type="title" themeColor="primary" style={{ fontSize: 32 }}>{initial}</ThemedText>
            </View>
            <ThemedText type="heading">{displayName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{email}</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" style={{ marginBottom: Spacing.three }}>Account</ThemedText>

            <View style={styles.row}>
              <Ionicons name="mail-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1, marginLeft: Spacing.three }}>
                <ThemedText type="small" themeColor="textSecondary">Email</ThemedText>
                <ThemedText type="small">{email}</ThemedText>
              </View>
            </View>

            <View style={styles.row}>
              <Ionicons name="location-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1, marginLeft: Spacing.three }}>
                <ThemedText type="small" themeColor="textSecondary">Zip code</ThemedText>
                <ThemedText type="small">{profile?.zip_code ?? 'Not set'}</ThemedText>
              </View>
              <Pressable onPress={() => router.push('/zipcode')}>
                <ThemedText type="smallBold" themeColor="primary">Edit</ThemedText>
              </Pressable>
            </View>

            <View style={styles.row}>
              <Ionicons name="scan-outline" size={20} color={theme.textSecondary} />
              <View style={{ flex: 1, marginLeft: Spacing.three }}>
                <ThemedText type="small" themeColor="textSecondary">Total scans</ThemedText>
                <ThemedText type="small">{scanCount}</ThemedText>
              </View>
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" style={{ marginBottom: Spacing.three }}>Settings</ThemedText>

            <Pressable style={styles.row} onPress={handleClearHistory}>
              <Ionicons name="trash-outline" size={20} color={theme.error} />
              <View style={{ flex: 1, marginLeft: Spacing.three }}>
                <ThemedText type="small" style={{ color: theme.error }}>Clear scan history</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </Pressable>
          </ThemedView>

          <Pressable
            style={[styles.signOutButton, { backgroundColor: theme.error + '15', borderColor: theme.error + '40' }]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color={theme.error} />
            <ThemedText type="smallBold" style={{ color: theme.error, marginLeft: Spacing.two }}>Sign out</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.five }}>
            RecycleBuddy v1.0.0
          </ThemedText>
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
  profileHeader: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  card: {
    width: '100%',
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc3',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1,
    marginTop: Spacing.two,
  },
});
