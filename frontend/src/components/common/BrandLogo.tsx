import React from 'react';
import { Platform, Text, Image } from 'react-native';

// react-native-windows doesn't composite color-emoji glyphs (COLR/CPAL) -
// the 🍦 emoji renders as a solid black glyph box there instead of the
// actual ice cream. Every other platform renders the plain emoji exactly as
// before; only Windows swaps in the real app icon image.
export default function BrandLogo({ className, size }: { className: string; size: number }) {
  if (Platform.OS === 'windows') {
    return (
      <Image
        source={require('../../../assets/icon.png')}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  return <Text className={className}>🍦</Text>;
}
