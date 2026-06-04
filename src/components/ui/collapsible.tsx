import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={{ paddingVertical: Spacing.two }}>
        <ThemedText type="smallBold">{open ? '▼ ' : '▶ '}{title}</ThemedText>
      </Pressable>
      {open && <View style={{ paddingLeft: Spacing.three }}>{children}</View>}
    </View>
  );
}