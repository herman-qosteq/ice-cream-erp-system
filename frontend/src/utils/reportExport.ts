import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

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
      // The browser's "Save as PDF" dialog suggests the printed document's
      // <title> as the filename - with none set, browsers fall back to a
      // generic "download"/"untitled" name instead of the invoice/bill/GRN
      // id already baked into `fileName`. Injecting a <title> here is what
      // actually makes the suggested Save-As name match `fileName`.
      const titleOnly = fileName.replace(/\.[^./]+$/, '');
      const htmlWithTitle = html.replace('<head>', `<head><title>${titleOnly.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>`);
      printWindow.document.write(htmlWithTitle);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
      showAlert('Your browser\'s print dialog has opened for the report. Choose "Save as PDF" as the destination - the suggested file name already matches this document\'s invoice/bill ID.');
      return;
    }

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    // Print.printToFileAsync always names its output something random (e.g.
    // Print/12ab34cd.pdf) - `dialogTitle` only labels the share sheet, it
    // does not rename the actual file being shared, so "Save to Files"/
    // WhatsApp/etc would keep that random name. Copying it to our own
    // Cache file with the real invoice/bill/GRN-id name first means the
    // shared file itself is correctly named, not just the share sheet title.
    const namedFile = new File(Paths.cache, fileName);
    // Re-downloading the same deterministic-named receipt (e.g. the same
    // purchase's GRN) would otherwise hit this cache path twice - copy()
    // throws if the destination already exists, so clear it first.
    if (namedFile.exists) namedFile.delete();
    new File(uri).copy(namedFile);
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(namedFile.uri, {
        mimeType: 'application/pdf',
        dialogTitle: fileName,
        UTI: 'com.adobe.pdf',
      });
      showAlert('Report generated and ready to save/share as PDF.');
    } else {
      showAlert(`Report generated, but this device has no way to share or save it automatically. File is at: ${namedFile.uri}`);
    }
  } catch (e) {
    showAlert({ type: 'error', message: 'Failed to generate the PDF report. Please try again.' });
  }
}
