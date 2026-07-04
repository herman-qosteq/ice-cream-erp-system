import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function exportHtmlReport(html: string, fileName: string, showAlert: (opts: any) => void) {
  try {
    if (Platform.OS === 'web') {
      // expo-print can't silently write a file to disk in a browser, and expo-sharing
      // can't share a local file URI on web — the browser's own print dialog is the
      // only reliable cross-browser way to turn this HTML into a saved PDF.
      await Print.printAsync({ html });
      showAlert('Your browser\'s print dialog has opened. Choose "Save as PDF" as the destination to download this report.');
      return;
    }

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: fileName,
        UTI: 'com.adobe.pdf',
      });
      showAlert('Report generated and ready to save/share as PDF.');
    } else {
      showAlert(`Report generated, but this device has no way to share or save it automatically. File is at: ${uri}`);
    }
  } catch (e) {
    showAlert({ type: 'error', message: 'Failed to generate the PDF report. Please try again.' });
  }
}
