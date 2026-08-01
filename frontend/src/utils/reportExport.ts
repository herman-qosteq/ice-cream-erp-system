import { Platform } from 'react-native';
// expo-print/expo-sharing/expo-file-system/jspdf/html2canvas are required
// lazily inside exportHtmlReport, after their respective platform guards -
// a static top-level import here would crash the whole bundle on Windows
// (see imagePicker.ts).

// btoa/unescape aren't polyfilled under Hermes (only real browsers have
// them) - a self-contained UTF-8-safe base64 encoder instead of relying on
// browser globals that don't exist on Windows/native.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function utf8ToBase64(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    out += BASE64_CHARS[b1 >> 2];
    out += BASE64_CHARS[((b1 & 0x03) << 4) | (b2 === undefined ? 0 : b2 >> 4)];
    out += b2 === undefined ? '=' : BASE64_CHARS[((b2 & 0x0f) << 2) | (b3 === undefined ? 0 : b3 >> 6)];
    out += b3 === undefined ? '=' : BASE64_CHARS[b3 & 0x3f];
  }
  return out;
}

// Injects the Print/Save as PDF button bar plus a matching <title> into a
// full PDF-template HTML document. Two variants:
//  - `standalone: true` (Windows/macOS, opened in the OS's default browser -
//    a completely separate process our JS bundle has no handle back into):
//    both buttons can only run inline JS baked into the HTML itself, so both
//    fall back to window.print() - "Save as PDF" here really is "open the
//    print dialog and pick Save as PDF as the destination", the honest
//    browser-only way to do this without a bundled rendering library.
//  - `standalone: false` (web): the Save button is left handler-less here
//    (just an id) - exportHtmlReport wires it up to a REAL bundled
//    html2canvas+jsPDF export after writing this HTML into a same-origin
//    popup window it still holds a live reference to, so Save downloads an
//    actual .pdf with zero dialog while Print still opens window.print().
// Either way, nothing calls window.print() automatically on open - only an
// explicit tap does - and the whole bar is hidden from the print/PDF output
// itself via the @media print rule, so it never appears on paper or in the
// saved PDF.
function withPrintBar(html: string, fileName: string, opts: { standalone: boolean }): string {
  const titleOnly = fileName.replace(/\.[^./]+$/, '');
  const escapedTitle = titleOnly.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const saveButtonAttrs = opts.standalone ? 'onclick="window.print()"' : 'id="ff-save-pdf-btn"';
  const caption = opts.standalone
    ? 'Both open your browser\'s print dialog - choose "Save as PDF" as the destination for a PDF file, or your printer to print.'
    : 'Save as PDF downloads a PDF file directly - no dialog. Print opens your printer dialog.';
  const printBar = `<div class="print-trigger-bar" style="position:sticky;top:0;z-index:10;display:flex;flex-direction:column;gap:4px;padding:10px 0;margin-bottom:8px;background:#ffffff;border-bottom:1px solid #e2e8f0;">
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button ${saveButtonAttrs} style="background:#ffffff;color:#4f46e5;border:1.5px solid #4f46e5;padding:8px 18px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Save as PDF</button>
      <button onclick="window.print()" style="background:#4f46e5;color:#ffffff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">Print</button>
    </div>
    <div style="text-align:right;font-size:10px;color:#94a3b8;">${caption}</div>
  </div>`;
  return html
    .replace('<head>', `<head><title>${escapedTitle}</title><style>@media print { .print-trigger-bar { display: none !important; } }</style>`)
    .replace('<body>', `<body>${printBar}`);
}

// Web-only, dialog-free "Save as PDF": renders the document in a hidden
// same-page iframe (the visible preview is a separate popup window our
// bundle has no module access into, so rendering has to happen here, not
// there), rasterizes it with html2canvas, then paginates the result across
// as many A4 pages as the content needs and triggers a direct file download
// via jsPDF's own save() - a real Blob-backed download, not window.print().
async function saveWebPdf(html: string, fileName: string): Promise<void> {
  const { default: jsPDF } = require('jspdf') as typeof import('jspdf');
  // Unlike jspdf, html2canvas's CommonJS export is the function itself
  // (module.exports = html2canvas), not a { default } wrapper - destructuring
  // .default here would silently be undefined and crash at call time despite
  // type-checking cleanly (its .d.ts declares an ESM-style default export
  // that doesn't match the actual runtime shape).
  const html2canvas = require('html2canvas') as typeof import('html2canvas').default;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px'; // ~A4 width at 96dpi
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Unable to render the document for PDF export.');
    await new Promise<void>(resolve => {
      iframe.onload = () => resolve();
      doc.open();
      doc.write(html);
      doc.close();
      if (doc.readyState === 'complete') resolve();
    });
    // Lets fonts/layout settle after the synchronous write above before
    // measuring/rasterizing - a fixed short delay rather than a real signal,
    // since there's nothing else (no images) this document waits on.
    await new Promise(resolve => setTimeout(resolve, 60));

    const body = doc.body;
    iframe.style.height = `${body.scrollHeight}px`;
    const bodyHeightPx = body.scrollHeight;

    // Collects every "safe to cut here" Y position (a row/block boundary)
    // BEFORE rasterizing - once html2canvas flattens the page into one
    // bitmap there's no way to know where a <tr> or block element ends, so
    // this has to be read off the live DOM. Both table rows (the common
    // case - every bill/report's line items) and each direct child of
    // <body> (header block, each table, summary line, footer) count as
    // valid breakpoints, so a page can also break cleanly between sections,
    // not just between rows within one table.
    const bodyTop = body.getBoundingClientRect().top;
    const breakPointsPx = new Set<number>();
    const addBottom = (el: Element) => breakPointsPx.add(Math.round(el.getBoundingClientRect().bottom - bodyTop));
    Array.from(body.children).forEach(addBottom);
    doc.querySelectorAll('tr').forEach(addBottom);
    breakPointsPx.add(bodyHeightPx);
    const sortedBreakPointsPx = Array.from(breakPointsPx).sort((a, b) => a - b);

    const canvas = await html2canvas(body, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    // A modest, even margin on every side, including top/bottom on EVERY
    // page a multi-page document spills onto, not just the first - jsPDF's
    // addImage doesn't support cropping to a sub-rectangle (it always draws
    // the whole image, letting the true page boundary clip whatever falls
    // outside 0..pageHeight), so masking any bleed into the margin zones
    // with opaque white rectangles after each page's image is what actually
    // enforces the margin identically on every page.
    const marginX = 28; // ~10mm
    const marginY = 32; // ~11mm
    const contentWidth = pageWidth - marginX * 2;
    const contentHeightPerPage = pageHeight - marginY * 2;
    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    // Same ratio however it's derived (DOM px -> canvas px via html2canvas's
    // scale, canvas px -> pdf pt via the imgWidth/canvas.width scale above) -
    // computing it as a single DOM-px -> pdf-pt ratio avoids needing to know
    // html2canvas's actual internal scale at all.
    const domPxToPdfPt = imgHeight / bodyHeightPx;
    const breakPointsPt = sortedBreakPointsPx.map(y => y * domPxToPdfPt);

    const maskMargins = () => {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, marginY, 'F'); // top
      pdf.rect(0, pageHeight - marginY, pageWidth, marginY, 'F'); // bottom
      pdf.rect(0, 0, marginX, pageHeight, 'F'); // left
      pdf.rect(pageWidth - marginX, 0, marginX, pageHeight, 'F'); // right
    };

    let pageStartPt = 0;
    let pageIndex = 0;
    while (pageStartPt < imgHeight - 0.5) {
      if (pageIndex > 0) pdf.addPage();
      const maxPageEndPt = pageStartPt + contentHeightPerPage;
      // The latest breakpoint that still fits within this page - i.e. the
      // bottom of the last row/block that can appear here without being cut
      // in half. Falls back to a hard cut at maxPageEndPt only if a single
      // row/block is itself taller than one whole page (rare - would need
      // an unusually tall single line item).
      let pageEndPt = maxPageEndPt;
      for (let i = breakPointsPt.length - 1; i >= 0; i--) {
        const bp = breakPointsPt[i];
        if (bp > pageStartPt + 1 && bp <= maxPageEndPt) { pageEndPt = bp; break; }
      }
      pageEndPt = Math.min(pageEndPt, imgHeight);

      const yOffset = marginY - pageStartPt;
      pdf.addImage(imgData, 'JPEG', marginX, yOffset, imgWidth, imgHeight);
      maskMargins();
      // Breaking at an earlier boundary than the page could technically fit
      // leaves a sliver of the next row peeking through between pageEndPt
      // and the bottom margin - mask that leftover gap too so the page ends
      // cleanly exactly at the chosen row boundary.
      const leftoverGapPt = maxPageEndPt - pageEndPt;
      if (leftoverGapPt > 0.5) {
        pdf.rect(marginX, pageHeight - marginY - leftoverGapPt, contentWidth, leftoverGapPt, 'F');
      }

      pageStartPt = pageEndPt;
      pageIndex++;
    }

    pdf.save(fileName);
  } finally {
    document.body.removeChild(iframe);
  }
}

// Mobile (Android/iOS) Save as PDF: silently renders the HTML to an actual
// PDF file and hands it to the OS share sheet (Save to Files, WhatsApp,
// etc.) - no print dialog involved.
async function saveMobilePdf(html: string, fileName: string, showAlert: (opts: any) => void) {
  try {
    const Print = require('expo-print') as typeof import('expo-print');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');

    const { uri } = await Print.printToFileAsync({ html, base64: false });
    // Print.printToFileAsync always names its output something random (e.g.
    // Print/12ab34cd.pdf) - `dialogTitle` only labels the share sheet, it
    // does not rename the actual file being shared, so "Save to Files"/
    // WhatsApp/etc would keep that random name. Copying it to our own Cache
    // file with the real invoice/bill/GRN-id name first means the shared
    // file itself is correctly named, not just the share sheet title.
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
    } else {
      showAlert(`PDF generated, but this device has no way to share or save it automatically. File is at: ${namedFile.uri}`);
    }
  } catch {
    showAlert({ type: 'error', message: 'Failed to save the PDF. Please try again.' });
  }
}

// Mobile (Android/iOS) Print: opens the OS's native print preview (pinch/
// zoom, swipe through pages) with its own explicit Print action - closing/
// cancelling that screen prints nothing.
async function printMobile(html: string, showAlert: (opts: any) => void) {
  try {
    const Print = require('expo-print') as typeof import('expo-print');
    await Print.printAsync({ html });
  } catch {
    showAlert({ type: 'error', message: 'Failed to open the print dialog. Please try again.' });
  }
}

// Web-only: opens a placeholder preview window SYNCHRONOUSLY, before any
// async work a caller needs to do to build the actual `html` it'll later
// hand to exportHtmlReport (e.g. an API fetch for a report). Browsers only
// let window.open() succeed unblocked when it's a direct, synchronous
// consequence of a user gesture (a click) - any `await` in between the click
// and the eventual window.open() call risks it being silently blocked, which
// looks exactly like "the Print/Save as PDF buttons just don't work" (no
// popup ever appears, so neither button exists to click) - this is what was
// actually happening on every report that fetches data before exporting
// (e.g. the Assets reports in AdminReports.tsx). Callers with any async work
// before their html is ready must call this FIRST, synchronously inside
// their onPress handler, then pass the result into exportHtmlReport once
// html is finally built - see its 4th parameter below. Callers that build
// their html entirely synchronously don't strictly need this (the internal
// window.open() in exportHtmlReport already runs in the same synchronous
// click-to-export chain for them), but calling it anyway is harmless and
// guards against a later edit innocently adding an await before the export.
export function openWebPreviewWindow(): Window | null | undefined {
  if (Platform.OS !== 'web') return undefined;
  const w = window.open('', '_blank');
  if (w) {
    w.document.write('<!DOCTYPE html><html><head><title>Preparing document...</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;color:#64748b;padding:60px 24px;text-align:center;font-size:14px;">Preparing your document&hellip;</body></html>');
    w.document.close();
  }
  return w;
}

export async function exportHtmlReport(
  html: string,
  fileName: string,
  showAlert: (opts: any) => void,
  // Pass the return value of openWebPreviewWindow() here when the caller had
  // to do async work first. Left undefined (the common case, no async work
  // before html is ready), this opens its own window synchronously exactly
  // as before - only web reads this at all, every other platform ignores it.
  preOpenedWindow?: Window | null,
) {
  try {
    if (Platform.OS === 'windows') {
      // No expo-print (no PDF renderer) on Windows, and the bill opens in
      // the OS's default browser - a separate process our bundle (and its
      // html2canvas/jsPDF) has no reach into - so both buttons fall back to
      // the browser's own print dialog (see withPrintBar's standalone mode).
      const htmlForBrowser = withPrintBar(html, fileName, { standalone: true });
      const { saveFileOnWindows } = require('./windowsFileSave') as typeof import('./windowsFileSave');
      const htmlFileName = fileName.replace(/\.[^./]+$/, '') + '.html';
      const path = await saveFileOnWindows(utf8ToBase64(htmlForBrowser), htmlFileName);
      try {
        const { Linking } = require('react-native') as typeof import('react-native');
        await Linking.openURL(`file:///${encodeURI(path.replace(/\\/g, '/'))}`);
        showAlert('Your bill has opened in your browser. Use the Print or Save as PDF button there when you\'re ready.');
      } catch {
        showAlert(`Report saved to ${path}. Open it in your browser and use the Print or Save as PDF button.`);
      }
      return;
    }

    if (Platform.OS === 'macos') {
      // No native file-save module exists for macOS yet (unlike Windows'
      // FileSaveModule.cpp) and expo-print/expo-file-system don't support
      // this platform, so there's no saved file to point a browser at, and
      // the same "separate external process" limitation as Windows applies.
      // Opening the HTML directly as a data: URL is the closest equivalent -
      // best-effort, since this path can't be exercised/verified without a
      // macOS build.
      const htmlForBrowser = withPrintBar(html, fileName, { standalone: true });
      try {
        const { Linking } = require('react-native') as typeof import('react-native');
        await Linking.openURL(`data:text/html;charset=utf-8;base64,${utf8ToBase64(htmlForBrowser)}`);
        showAlert('Your bill has opened in your browser. Use the Print or Save as PDF button there when you\'re ready.');
      } catch {
        showAlert('Could not open a preview automatically. PDF export on macOS is still limited - support is being improved.');
      }
      return;
    }

    if (Platform.OS === 'web') {
      // expo-print's web implementation ignores the `html` option entirely and just
      // calls window.print() on whatever's currently on screen (the live app UI) —
      // not the report we built. So on web we bypass expo-print completely: open
      // the report HTML in its own window and print/save that window instead.
      const printWindow = preOpenedWindow !== undefined ? preOpenedWindow : window.open('', '_blank');
      if (!printWindow) {
        showAlert('Your browser blocked the report window. Please allow pop-ups for this site and try again.');
        return;
      }
      const htmlForBrowser = withPrintBar(html, fileName, { standalone: false });
      printWindow.document.write(htmlForBrowser);
      printWindow.document.close();
      printWindow.focus();
      // The popup is a same-origin window we still hold a live reference to
      // (unlike the Windows/macOS "opened in an external browser" case), so
      // its Save button can be wired up here to our own bundled
      // html2canvas+jsPDF export instead of falling back to window.print().
      const saveBtn = printWindow.document.getElementById('ff-save-pdf-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          saveWebPdf(html, fileName).catch(() => showAlert({ type: 'error', message: 'Failed to save the PDF. Please try again.' }));
        });
      }
      showAlert('Your bill is ready to review in the new tab. Use the Print or Save as PDF button there when you\'re ready.');
      return;
    }

    // Mobile (Android/iOS): there's no in-app HTML preview surface available
    // (no WebView dependency in this app), so Print vs Save as PDF is
    // offered as a native OS choice dialog instead of two on-screen buttons
    // - each option is a genuinely distinct action (see printMobile/
    // saveMobilePdf above).
    const { Alert } = require('react-native') as typeof import('react-native');
    Alert.alert(
      'Print or Save as PDF',
      'Choose how you\'d like to export this bill.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save as PDF', onPress: () => { saveMobilePdf(html, fileName, showAlert); } },
        { text: 'Print', onPress: () => { printMobile(html, showAlert); } },
      ],
    );
  } catch (e) {
    showAlert({ type: 'error', message: 'Failed to generate the PDF report. Please try again.' });
  }
}
