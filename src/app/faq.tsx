import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const questions = [
  {
    question: 'Why does recycling matter?',
    answer:
      'Recycling keeps useful materials in circulation, reduces landfill waste, and can save the energy and raw materials needed to make new products. Small, consistent choices add up when a whole community participates.',
  },
  {
    question: 'What does RecycleBuddy do?',
    answer:
      'RecycleBuddy uses your camera to identify an item, explains whether it is likely recyclable or needs special handling, and helps you find nearby disposal sites. Your scan history also shows the impact of your choices over time.',
  },
  {
    question: 'Can I recycle everything in my curbside bin?',
    answer:
      'No. Rules vary by local program. Rinse containers, keep plastic bags out of curbside bins, and check your local guidance before placing an item in recycling. When an item is uncertain, RecycleBuddy can help you investigate.',
  },
  {
    question: 'How accurate is the item scanner?',
    answer:
      'The scanner is an aid, not a guarantee. Image quality, local rules, and material combinations can affect the result. Treat the recommendation as a starting point and follow your local waste authority for final guidance.',
  },
  {
    question: 'What happens to my photos and scan history?',
    answer:
      'A photo is sent to the app service for classification when you scan. RecycleBuddy stores the classification and impact details in your account so you can review them later. Do not scan sensitive or personal documents.',
  },
];

export default function FaqScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/signin'))} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={theme.text} />
            <ThemedText type="smallBold" style={{ marginLeft: Spacing.two }}>Back</ThemedText>
          </Pressable>

          <View style={styles.hero}>
            <View style={[styles.icon, { backgroundColor: theme.primary + '20' }]}>
              <Ionicons name="leaf" size={34} color={theme.primary} />
            </View>
            <ThemedText type="title" style={styles.title}>Recycling, made clearer.</ThemedText>
            <ThemedText type="default" themeColor="textSecondary" style={styles.subtitle}>
              Practical answers about recycling and how RecycleBuddy helps you make better disposal decisions.
            </ThemedText>
          </View>

          <GlassCard style={styles.card}>
            <View style={styles.cardContent}>
              {questions.map((item, index) => (
                <View key={item.question} style={[styles.item, index < questions.length - 1 && styles.itemBorder]}>
                  <ThemedText type="heading" style={styles.question}>{item.question}</ThemedText>
                  <ThemedText type="default" themeColor="textSecondary">{item.answer}</ThemedText>
                </View>
              ))}
            </View>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  backButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two },
  hero: { alignItems: 'center', paddingVertical: Spacing.five, gap: Spacing.two },
  icon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', fontSize: 32, lineHeight: 38 },
  subtitle: { textAlign: 'center', maxWidth: 560 },
  card: { width: '100%' },
  cardContent: { padding: Spacing.four },
  item: { gap: Spacing.two, paddingVertical: Spacing.four },
  itemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#AAB8AA66' },
  question: { fontSize: 19, lineHeight: 25 },
});
