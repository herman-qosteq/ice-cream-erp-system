import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// Picks an image from the device gallery and returns it as a data URI so it
// can be stored directly in local ERPData (no backend to upload to).
// Returns null if the user cancelled, denied permission, or is on a platform
// expo-image-picker doesn't support (Windows/macOS - Android/iOS/Web only).
export async function pickImageAsDataUri(showAlert: (opts: any) => void): Promise<string | null> {
  if (Platform.OS === 'windows' || Platform.OS === 'macos') {
    showAlert('Choosing a photo from the gallery is currently available on mobile and web only. Support for this platform is planned.');
    return null;
  }

  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission to access your photo gallery was denied. Enable it in your device settings to choose a photo.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return null;

    const asset = result.assets[0];
    if (!asset.base64) {
      showAlert('Could not read the selected image. Please try a different photo.');
      return null;
    }

    const mime = asset.mimeType || 'image/jpeg';
    return `data:${mime};base64,${asset.base64}`;
  } catch (e) {
    showAlert({ type: 'error', message: 'Failed to open the photo gallery. Please try again.' });
    return null;
  }
}
