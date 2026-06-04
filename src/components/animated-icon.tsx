import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
    </View>
  );
}

export function AnimatedSplashOverlay() {
  return null;
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
  },
  image: {
    width: 76,
    height: 71,
  },
});