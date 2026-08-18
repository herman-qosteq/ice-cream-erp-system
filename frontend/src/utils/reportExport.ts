import { Platform } from 'react-native';
import { API_BASE_URL, getToken } from '../api/client';
// expo-print/expo-sharing/expo-file-system/jspdf/html2canvas are required
// lazily inside exportHtmlReport, after their respective platform guards -
// a static top-level import here would crash the whole bundle on Windows
// (see imagePicker.ts). api/client is safe to import statically - it's
// already used across every platform this app runs on, unlike those
// platform-specific PDF/share libraries.

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

// Extra spacing for three trouble spots in the invoice footer/table, scoped
// to ONLY this rasterized export path via !important overrides injected
// into the offscreen iframe below - never into pdfTemplate.ts's shared
// PDF_STYLE, which the real Print button (window.print()) and mobile
// Print/Save-as-PDF (expo-print's native WebView renderer) also use and
// already render correctly at PDF_STYLE's tighter values. html2canvas
// rasterizes margins/borders less crisply than those real engines, so the
// same CSS that reads fine on paper can look like the payment-status
// separator line is touching its own text, or like the product table runs
// straight into the GST/totals row beneath it, once flattened to a bitmap.
const PDF_EXPORT_SPACING_OVERRIDES = `<style>
  .bottom-row { margin-top: 16px !important; }
  .amount-words { margin-top: 10px !important; padding-top: 6px !important; }
  .payment-bar { margin-top: 16px !important; }
  .totals-box .t-row.grand { margin-top: 8px !important; }
</style>`;

// Web "Save as PDF", primary path: hands the exact same HTML the Print
// button uses (unmodified - no PDF_EXPORT_SPACING_OVERRIDES needed here,
// see below) to the backend's /pdf/render endpoint, which renders it with
// real headless Chromium and returns an actual PDF (see
// backend/src/modules/pdf/pdf.service.ts) - the same print engine
// window.print() uses, so this output matches Print pixel-for-pixel instead
// of approximating it via a client-side screenshot. Falls back to the older
// html2canvas rasterization (saveWebPdfViaCanvas below) only if the backend
// call fails (offline backend, blocked request, etc.), so Save as PDF still
// produces a file rather than nothing.
async function saveWebPdf(html: string, fileName: string): Promise<void> {
  try {
    await saveWebPdfViaServer(html, fileName);
  } catch {
    await saveWebPdfViaCanvas(html, fileName);
  }
}

async function saveWebPdfViaServer(html: string, fileName: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}/pdf/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ html, fileName }),
  });
  if (!res.ok) throw new Error(`PDF render failed with status ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Fallback "Save as PDF": renders the document in a hidden
// same-page iframe (the visible preview is a separate popup window our
// bundle has no module access into, so rendering has to happen here, not
// there), rasterizes it with html2canvas, then paginates the result across
// as many A4 pages as the content needs and triggers a direct file download
// via jsPDF's own save() - a real Blob-backed download, not window.print().
async function saveWebPdfViaCanvas(html: string, fileName: string): Promise<void> {
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
  // Matches PDF_STYLE's body width (pdfTemplate.ts): A4's printable width
  // after the @page's 10mm margins, not the full 794px page width - keeping
  // this in sync with body's own width means this screenshot and a real
  // print of the same HTML end up the same size, not two different ones.
  iframe.style.width = '718px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Unable to render the document for PDF export.');
    await new Promise<void>(resolve => {
      iframe.onload = () => resolve();
      doc.open();
      doc.write(html.replace('</head>', `${PDF_EXPORT_SPACING_OVERRIDES}</head>`));
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
    // this has to be read off the live DOM. Table rows (the common case -
    // every bill/report's line items) and each direct child of <body>
    // (header block, the table, summary line, footer) count as valid
    // breakpoints. Deliberately NOT .t-row/.kv (Amount Summary/party-box
    // field rows) - those are handled as protected atomic ranges below
    // instead (see ATOMIC_CONTAINER_SELECTOR): once a row like that is a
    // registered "safe" breakpoint, the greedy search below is free to
    // pick one that sits INSIDE the Amount Summary box, visually slicing
    // it in half even though CSS's break-inside:avoid marks it as atomic -
    // break-inside:avoid is a print-media-only property and has zero
    // effect on this screenshot pipeline, so nothing was actually stopping
    // that without protectedRangesPt.
    const bodyTop = body.getBoundingClientRect().top;
    const breakPointsPx = new Set<number>();
    const addBottom = (el: Element) => breakPointsPx.add(Math.round(el.getBoundingClientRect().bottom - bodyTop));
    Array.from(body.children).forEach(addBottom);
    doc.querySelectorAll('tr').forEach(addBottom);
    breakPointsPx.add(bodyHeightPx);
    const sortedBreakPointsPx = Array.from(breakPointsPx).sort((a, b) => a - b);

    // Bottoms of the invoice product table's own rows specifically (a
    // subset of breakPointsPx above) - this screenshot pipeline captures the
    // whole document as ONE continuous image, so unlike the print/native PDF
    // path (pdfTemplate.ts's <tfoot>, which the print engine itself repeats
    // at the end of the table on every real page it paginates onto) there's
    // no browser pagination happening here to repeat a closing line at each
    // page cut. Recording exactly which Y positions are real product-row
    // bottoms lets the pagination loop below draw that same closing line
    // itself, but ONLY when a page happens to cut inside the table -
    // whenever a cut lands elsewhere (inside the footer, or past the
    // table's true end), the real one already baked into the single
    // captured image (from the table's own <tfoot> border) is enough.
    // Excludes the true LAST row on purpose: unlike an internal cut, that
    // position already has a real border baked into the single captured
    // image (from the table's own <tfoot>, which sits immediately after it
    // at zero height) regardless of where any page happens to end - drawing
    // our own line there too landed a fraction of a point off from that
    // real one (DOM-measurement-vs-rasterized-pixel rounding), which is what
    // showed up as a thin double line with a sliver gap between them rather
    // than one clean line.
    const invoiceRows = Array.from(doc.querySelectorAll('.invoice-doc tbody tr'));
    const invoiceRowBottomsPx = new Set<number>();
    invoiceRows.slice(0, -1).forEach(el => invoiceRowBottomsPx.add(Math.round(el.getBoundingClientRect().bottom - bodyTop)));

    // Footer pieces that must never be visually split across a page, even
    // though this pipeline can't rely on CSS break-inside:avoid to enforce
    // that (see above) - matches pdfTemplate.ts's PDF_STYLE break-inside
    // rule exactly, including using the outer flex WRAPPER (.party-row,
    // .bottom-row) rather than the individual boxes inside it, since
    // .party-box/.totals-box/.qr-box are flex siblings side by side at
    // roughly the same vertical position - protecting only one of a pair
    // still leaves its neighbor free to be sliced at that same height.
    const ATOMIC_CONTAINER_SELECTOR = '.party-row, .bottom-row, .payment-bar, .signature-block, .amount-words';
    const protectedRangesPx = Array.from(doc.querySelectorAll(ATOMIC_CONTAINER_SELECTOR)).map(el => {
      const rect = el.getBoundingClientRect();
      return { top: rect.top - bodyTop, bottom: rect.bottom - bodyTop };
    });

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
    // Bottom margin gets extra buffer beyond the plain marginY every other
    // side uses - roughly 2 product-table rows' worth (matches @page's
    // equivalent extra bottom margin in pdfTemplate.ts). A page whose
    // content runs flush to the exact bottom edge before continuing onto
    // the next never visually shows a "closing" border there (same
    // underlying reason as .invoice-doc's comment in PDF_STYLE) - this
    // extra buffer means the greedy pagination loop below always leaves a
    // bit of blank space after the last row/block it places on a page,
    // rather than cutting exactly at the page's true edge.
    const EXTRA_BOTTOM_MARGIN_PT = 23; // ~8mm
    const marginBottomY = marginY + EXTRA_BOTTOM_MARGIN_PT;
    const contentWidth = pageWidth - marginX * 2;
    const contentHeightPerPage = pageHeight - marginY - marginBottomY;
    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    // Same ratio however it's derived (DOM px -> canvas px via html2canvas's
    // scale, canvas px -> pdf pt via the imgWidth/canvas.width scale above) -
    // computing it as a single DOM-px -> pdf-pt ratio avoids needing to know
    // html2canvas's actual internal scale at all.
    const domPxToPdfPt = imgHeight / bodyHeightPx;
    const breakPointsPt = sortedBreakPointsPx.map(y => y * domPxToPdfPt);
    const protectedRangesPt = protectedRangesPx.map(r => ({ top: r.top * domPxToPdfPt, bottom: r.bottom * domPxToPdfPt }));

    const maskMargins = () => {
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageWidth, marginY, 'F'); // top
      pdf.rect(0, pageHeight - marginBottomY, pageWidth, marginBottomY, 'F'); // bottom
      pdf.rect(0, 0, marginX, pageHeight, 'F'); // left
      pdf.rect(pageWidth - marginX, 0, marginX, pageHeight, 'F'); // right
    };

    // Single pass over the whole document - there's no artificial forced
    // break to segment around anymore (renderInvoiceDocument now emits one
    // continuous <table>, same as every other report this app generates),
    // so this is just "greedily fill each page with as much real,
    // measured content as fits" using the live breakpoints collected
    // above. Real product/GST rows in a real live DOM govern where pages
    // land - no JS-estimated row-height guess involved anywhere in this
    // function, which is what makes it accurate regardless of how long or
    // short any given row's content is.
    let pageIndex = 0;
    let pageStartPt = 0;
    while (pageStartPt < imgHeight - 0.5) {
      if (pageIndex > 0) pdf.addPage();
      const maxPageEndPt = Math.min(pageStartPt + contentHeightPerPage, imgHeight);
      // The latest breakpoint that still fits within this page - i.e. the
      // bottom of the last row/block that can appear here without being
      // cut in half. Falls back to a hard cut at maxPageEndPt only if a
      // single row/block is itself taller than one whole page (rare -
      // would need an unusually tall single line item).
      let pageEndPt = maxPageEndPt;
      for (let i = breakPointsPt.length - 1; i >= 0; i--) {
        const bp = breakPointsPt[i];
        if (bp > pageStartPt + 1 && bp <= maxPageEndPt) { pageEndPt = bp; break; }
      }

      // If this cut would land INSIDE one of the atomic footer ranges
      // (protectedRangesPt) - i.e. it split a box CSS calls
      // break-inside:avoid but this rasterized pipeline can't actually
      // enforce - pull the cut back to that range's own top instead, so
      // the WHOLE box moves onto the next page as one piece rather than
      // being sliced through the middle (this is what let e.g. the Amount
      // Summary box's "Round Off" row show on one page and "Grand Total"
      // show disconnected on the next). Re-checked in a bounded loop (not
      // a single pass) in case pulling back out of one range lands inside
      // an earlier one - shouldn't happen given these ranges appear
      // sequentially down the page, but cheap to guard against rather
      // than assume. Only pulls back if doing so still makes forward
      // progress (the range didn't already start at/before this page's
      // own start) - a box taller than a full page is a pathological case
      // real invoice content won't hit, so it's left to the fallback hard
      // cut rather than looping forever.
      for (let guard = 0; guard < protectedRangesPt.length + 1; guard++) {
        const hit = protectedRangesPt.find(range =>
          pageEndPt > range.top + 0.5 && pageEndPt < range.bottom - 0.5 && range.top > pageStartPt + 0.5);
        if (!hit) break;
        pageEndPt = hit.top;
      }

      const yOffset = marginY - pageStartPt;
      pdf.addImage(imgData, 'JPEG', marginX, yOffset, imgWidth, imgHeight);
      maskMargins();
      // Breaking at an earlier boundary than the page could technically fit
      // leaves a sliver of the next row peeking through between pageEndPt
      // and the bottom margin - mask that leftover gap too so the page ends
      // cleanly exactly at the chosen boundary.
      const leftoverGapPt = maxPageEndPt - pageEndPt;
      if (leftoverGapPt > 0.5) {
        // Padded a few pt beyond the exact computed gap - pageEndPt is
        // derived from a DOM-px measurement taken BEFORE rasterizing, then
        // scaled through html2canvas's 2x capture and converted to PDF pt;
        // each of those steps rounds independently, so the mask's computed
        // top edge can end up a couple points short of where the next
        // row's content actually starts in the final image, letting a thin
        // sliver of it peek through. Extending the mask upward by this
        // buffer only ever widens an already-blank gap - it can't clip real
        // content, since real content already ends at/before pageEndPt by
        // construction.
        const MASK_ROUNDING_BUFFER_PT = 4;
        const paddedGapPt = Math.min(leftoverGapPt + MASK_ROUNDING_BUFFER_PT, contentHeightPerPage);
        pdf.rect(marginX, pageHeight - marginBottomY - paddedGapPt, contentWidth, paddedGapPt, 'F');
      }

      // This page's cut landed exactly on a real product-row bottom (i.e.
      // this page ends mid-table, not past it) - draw the same closing line
      // the print/native PDF path gets for free from <tfoot>, since nothing
      // else marks a page boundary inside this single continuous screenshot.
      // Drawn AFTER the leftover-gap mask above (whose padded top edge can
      // reach a few pt into the content area) so it isn't painted over.
      if (invoiceRowBottomsPx.has(Math.round(pageEndPt / domPxToPdfPt))) {
        const lineY = yOffset + pageEndPt;
        pdf.setDrawColor(217, 217, 217);
        pdf.setLineWidth(0.3);
        pdf.line(marginX, lineY, marginX + contentWidth, lineY);
      }

      pageStartPt = pageEndPt;
      pageIndex++;
    }

    // Total page count is only known once the loop above finishes, so page
    // numbers are stamped in a second pass - jsPDF lets an already-drawn
    // page be revisited with setPage() to add more content to it.
    const totalPages = pageIndex;
    if (totalPages > 1) {
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        pdf.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 10, { align: 'right' });
      }
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
