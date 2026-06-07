import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Colors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SignInScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const theme = useTheme();

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (isSignUp && !confirmPassword.trim()) {
      setError('Please confirm your password');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (isSignUp && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const result = isSignUp
        ? await signUpWithEmail(email.trim(), password, displayName.trim() || undefined)
        : await signInWithEmail(email.trim(), password);
      if (result.error) setError(result.error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.error) setError(result.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding' })}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="leaf" size={40} color={theme.primary} />
              </View>
              <ThemedText type="title">RecycleBuddy</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
                Scan. Sort. Sustain.
              </ThemedText>
            </View>

            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="heading" style={styles.cardTitle}>
                {isSignUp ? 'Create account' : 'Welcome back'}
              </ThemedText>

              {error && (
                <View style={[styles.errorBox, { backgroundColor: theme.notRecyclable + '18' }]}>
                  <ThemedText type="small" style={{ color: theme.error }}>{error}</ThemedText>
                </View>
              )}

              {isSignUp && (
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Display name"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.textSecondary + '40' }]}
                  autoCapitalize="words"
                />
              )}

              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.textSecondary + '40' }]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.textSecondary + '40' }]}
                secureTextEntry
                autoCapitalize="none"
              />

              {isSignUp && (
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.textSecondary + '40' }]}
                  secureTextEntry
                  autoCapitalize="none"
                />
              )}

              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: loading ? 0.6 : 1 }]}
                onPress={handleEmailAuth}
                disabled={loading}
              >
                <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                  {loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
                </ThemedText>
              </Pressable>

              <Pressable onPress={() => { setIsSignUp(!isSignUp); setError(null); setConfirmPassword(''); }} style={styles.toggleRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                </ThemedText>
                <ThemedText type="smallBold" themeColor="primary">
                  {isSignUp ? 'Sign in' : 'Sign up'}
                </ThemedText>
              </Pressable>
            </ThemedView>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.textSecondary + '30' }]} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.dividerText}>or</ThemedText>
              <View style={[styles.dividerLine, { backgroundColor: theme.textSecondary + '30' }]} />
            </View>

            <View style={styles.socialButtons}>
              <Pressable
                style={[styles.socialButton, { backgroundColor: theme.backgroundElement, borderColor: theme.textSecondary + '30' }]}
                onPress={handleGoogle}
                disabled={loading}
              >
                <Ionicons name="logo-google" size={20} color={theme.text} />
                <ThemedText type="smallBold" style={{ marginLeft: Spacing.two }}>Continue with Google</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.five,
    alignItems: 'center',
    gap: Spacing.three,
  },
  header: { alignItems: 'center', gap: Spacing.one, marginBottom: Spacing.three },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.light.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  tagline: { marginTop: Spacing.one },
  card: {
    width: '100%',
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.three,
  },
  cardTitle: { textAlign: 'center' },
  errorBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    width: '100%',
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    fontSize: 16,
    width: '100%',
  },
  primaryButton: {
    width: '100%',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: Spacing.one,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: Spacing.three },
  socialButtons: {
    width: '100%',
    gap: Spacing.three,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
});
