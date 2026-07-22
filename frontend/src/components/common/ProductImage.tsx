import React from 'react';
import { View, Image } from 'react-native';
import { IceCreamCone } from 'lucide-react-native';

interface ProductImageProps {
  uri?: string;
  className?: string;
  iconSize?: number;
}

// Falls back to a bundled ice-cream icon (instead of a blank box or a
// network stock photo) whenever a product has no uploaded photo yet.
export default function ProductImage({ uri, className, iconSize = 24 }: ProductImageProps) {
  if (!uri) {
    return (
      <View className={`${className ?? ''} items-center justify-center bg-rose-50 border border-rose-100`}>
        <IceCreamCone size={iconSize} color="#fb7185" />
      </View>
    );
  }
  return <Image source={{ uri }} className={className} />;
}
