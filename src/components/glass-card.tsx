import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export function GlassCard({ style, children, ...props }: ViewProps) {
  const theme = useTheme();
  const tint = theme.background === '#121212' ? 'dark' : 'light';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundElement + (Platform.OS === 'web' ? 'F2' : 'B8'),
          borderColor: theme.backgroundSelected + 'CC',
        },
        style,
      ]}
      {...props}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 55 : 35}
        tint={tint}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 24,
    shadowColor: '#102A1B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  content: {
    flex: 1,
  },
});
