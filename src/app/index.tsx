import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.emoji}>♻️</Text>
        <Text style={styles.title}>RecycleBuddy</Text>
        <Text style={styles.subtitle}>
          Scan items to find out if they're recyclable and locate nearby recycling centers.
        </Text>
      </View>

      <View style={styles.cards}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🌍 Why recycle?</Text>
          <Text style={styles.cardText}>
            Recycling reduces waste in landfills, saves energy, and helps protect the environment for future generations.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📍 Location</Text>
          <Text style={styles.cardText}>
            We'll use your location to find the nearest recycling centers for items that need special disposal and to find out your counties regulations around recycling.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎮 Track your impact</Text>
          <Text style={styles.cardText}>
            Every item you scan is tracked. See how much waste you've kept out of landfills!
          </Text>
        </View>
      </View>

      <Link href="/scan" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Start Scanning</Text>
        </Pressable>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emoji: {
    fontSize: 64,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 24,
  },
  cards: {
    gap: 12,
    flex: 1,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cardText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#2e7d32',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginVertical: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});