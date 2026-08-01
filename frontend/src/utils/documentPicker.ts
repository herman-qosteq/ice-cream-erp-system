import { Platform } from 'react-native';
// expo-document-picker/expo-file-system/expo-sharing are required lazily inside
// each function below, after its Windows/macOS guard - a static top-level
// import here would crash the whole bundle on Windows (see imagePicker.ts).

export interface PickedFile {
  dataUri: string;
  name: string;
  mimeType: string;
}

const BILL_FILE_TYPES = [
  'image/*',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Picks a single file - photo, PDF, or Excel sheet - for attaching a
// supplier's bill/price-list to a stock receipt, returned as a base64 data
// URI so it can be stored the same way Product.image_url already is (no
// object storage backend). `base64: true` only actually applies on web per
// expo-document-picker's own docs; on native we read the cached file
// ourselves via expo-file-system's File.base64().
export async function pickBillFileAsDataUri(showAlert: (opts: any) => void): Promise<PickedFile | null> {
  if (Platform.OS === 'windows' || Platform.OS === 'macos') {
    showAlert('Attaching a bill file is currently available on mobile and web only. Support for this platform is planned.');
    return null;
  }

  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  const { File } = require('expo-file-system') as typeof import('expo-file-system');

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: BILL_FILE_TYPES,
      multiple: false,
      copyToCacheDirectory: true,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return null;
    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'application/octet-stream';

    if (Platform.OS === 'web' && asset.base64) {
      // On web, expo-document-picker reads the file via FileReader.readAsDataURL(),
      // which already returns a complete "data:<mime>;base64,<data>" string here -
      // not the raw base64 payload - so it must be used as-is. Re-wrapping it in
      // another data:...;base64, prefix (as this used to do) produces a doubled
      // prefix that fails to decode wherever the file is later read back.
      return { dataUri: asset.base64, name: asset.name, mimeType };
    }

    const file = new File(asset.uri);
    const base64 = await file.base64();
    return { dataUri: `data:${mimeType};base64,${base64}`, name: asset.name, mimeType };
  } catch (e) {
    showAlert({ type: 'error', message: 'Failed to attach the file. Please try again.' });
    return null;
  }
}

// Opens/downloads a previously-attached bill file (stored as a base64 data
// URI on the Purchase record) for viewing outside the app - only needed for
// non-image types, since images are already previewed inline. Mirrors the
// platform branching in excelExport.ts's exportExcelWorkbook.
export async function viewOrDownloadDataUriFile(dataUri: string, fileName: string, mimeType: string, showAlert: (opts: any) => void) {
  try {
    const base64 = dataUri.slice(dataUri.indexOf('base64,') + 'base64,'.length);

    if (Platform.OS === 'windows') {
      const { saveFileOnWindows } = require('./windowsFileSave') as typeof import('./windowsFileSave');
      const path = await saveFileOnWindows(base64, fileName);
      showAlert(`File saved to ${path}`);
      return;
    }

    if (Platform.OS === 'macos') {
      showAlert('Viewing this file is currently available on mobile and web only. Support for this platform is planned.');
      return;
    }

    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');

    if (Platform.OS === 'web') {
      // Assigning the raw data: URI straight to <a href> hits a real Chromium
      // download-manager bug: data URIs above a couple MB (any decent photo
      // or scanned PDF) fail with a misleading "Check Internet connection"
      // retry prompt, even fully offline. Converting to a Blob + object URL
      // first (same trick exportExcelWorkbook already uses) avoids it entirely.
      const byteChars = atob(base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const file = new File(Paths.cache, fileName);
    file.write(base64, { encoding: 'base64' });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
    } else {
      showAlert(`File is at: ${file.uri}`);
    }
  } catch (e) {
    showAlert({ type: 'error', message: 'Failed to open the file. Please try again.' });
  }
}
