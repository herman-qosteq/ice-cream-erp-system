import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function exportHtmlReport(html: string, fileName: string, showAlert: (opts: any) => void) {
  try {
    if (Platform.OS === 'windows' || Platform.OS === 'macos') {
      // Expo has no official Windows support and only experimental macOS support —
      // expo-print/expo-sharing aren't available on these platforms.
      showAlert('PDF export is currently available on mobile and web only. Support for this platform is planned.');
      return;
    }

    if (Platform.OS === 'web') {
      // expo-print's web implementation ignores the `html` option entirely and just
      // calls window.print() on whatever's currently on screen (the live app UI) —
      // not the report we built. So on web we bypass expo-print completely: open
      // the report HTML in its own window and print that window instead.
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        showAlert('Your browser blocked the report window. Please allow pop-ups for this site and try again.');
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
      showAlert('Your browser\'s print dialog has opened for the report. Choose "Save as PDF" as the destination to download it.');
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
