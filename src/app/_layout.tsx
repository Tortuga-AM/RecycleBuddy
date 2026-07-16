import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait until auth state is confirmed
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/signin');
    } else if (user && inAuthGroup) {
      if (Platform.OS === 'web') {
        Alert.alert(
          'Limited Web Experience',
          'The web version is for demonstration purposes and some features may not work as expected. For the best experience, please use the mobile app.'
        );
      }
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  // ONLY show the loading screen while fetching initial auth state.
  // Never unmount the children during a routing redirect!
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="zipcode" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthGuard>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
  },
});