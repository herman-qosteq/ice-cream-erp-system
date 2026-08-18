// Styled .xlsx generation - separate from pdfTemplate.ts/reportExport.ts
// (which only ever produce HTML-printed PDFs) because a Purchase Order sent
// to a supplier needs to open as a real, editable spreadsheet, not a PDF.
// Uses xlsx-js-style (a SheetJS fork) since the plain "xlsx" package's free
// tier can't write cell styles (bold, borders) at all.
import { Platform } from 'react-native';
import * as XLSX from 'xlsx-js-style';
// expo-file-system/expo-sharing are required lazily inside exportExcelWorkbook,
// after its Windows/macOS guard - a static top-level import here would crash
// the whole bundle on Windows (see imagePicker.ts).
import { getBrandName, getBrandPhone } from './pdfTemplate';

export interface PurchaseOrderItem {
  category: string;
  code: string;
  description: string;
  orderCase: number;
  orderCasePieces?: number;
}

const THIN_BORDER = { style: 'thin' as const, color: { rgb: '000000' } };
const BOLD = { font: { bold: true } };
const HEADER_CELL_STYLE = {
  font: { bold: true },
  border: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
  fill: { fgColor: { rgb: 'F1F5F9' } },
};

function setCell(ws: XLSX.WorkSheet, row: number, col: number, value: string | number, style?: any) {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  ws[ref] = { t: typeof value === 'number' ? 'n' : 's', v: value, ...(style ? { s: style } : {}) };
}

/** Builds the Purchase Order workbook: company header block, then a
 * Mat. Group / Material / Material Desc. / Order Case table - one row per
 * selected product - matching the layout a supplier expects to receive. */
export function buildPurchaseOrderWorkbook(items: PurchaseOrderItem[], orderRef: string): XLSX.WorkBook {
  const orderDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const ws: XLSX.WorkSheet = {};

  const brandName = getBrandName();
  setCell(ws, 0, 0, brandName, { font: { bold: true, sz: 18 } });

  const infoRows: [string, string][] = [
    ['Order Ref:', orderRef],
    ['Order Date:', orderDate],
    ['Ordered By:', brandName.replace(/\b\w/g, c => c.toUpperCase())],
    ['Contact:', getBrandPhone()],
    ['Delivery Location:', `${brandName.replace(/\b\w/g, c => c.toUpperCase())} Warehouse`],
  ];
  infoRows.forEach(([label, value], i) => {
    const row = 2 + i;
    setCell(ws, row, 0, label, BOLD);
    setCell(ws, row, 1, value, BOLD);
  });

  const headerRow = 2 + infoRows.length + 1;
  ['Mat. Group', 'Material', 'Material Desc.', 'Order Case'].forEach((label, c) => {
    setCell(ws, headerRow, c, label, { ...HEADER_CELL_STYLE, alignment: { horizontal: c === 3 ? 'center' : 'left' } });
  });

  items.forEach((item, i) => {
    const row = headerRow + 1 + i;
    setCell(ws, row, 0, item.category);
    setCell(ws, row, 1, item.code);
    setCell(ws, row, 2, item.description);
    const orderCaseValue = item.orderCasePieces ? `${item.orderCase} box, ${item.orderCasePieces} pcs` : item.orderCase;
    setCell(ws, row, 3, orderCaseValue, { alignment: { horizontal: 'center' } });
  });

  const lastRow = headerRow + items.length;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 3 } });
  ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 48 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Purchase Order');
  return wb;
}

// `existingRefs` should be every previously-saved PurchaseOrderRequest.order_ref
// (order_ref is unique in the DB) - without checking these, every order
// generated on the same calendar day would collide on "-01" and fail to save.
export function buildPurchaseOrderRef(existingRefs: string[] = []): string {
  const d = new Date();
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const prefix = `PO-${yyyymmdd}-`;
  const usedSeqNumbers = existingRefs
    .filter(ref => ref.startsWith(prefix))
    .map(ref => parseInt(ref.slice(prefix.length), 10))
    .filter(n => !isNaN(n));
  const nextSeq = usedSeqNumbers.length > 0 ? Math.max(...usedSeqNumbers) + 1 : 1;
  return `${prefix}${String(nextSeq).padStart(2, '0')}`;
}

export async function exportExcelWorkbook(workbook: XLSX.WorkBook, fileName: string, showAlert: (opts: any) => void) {
  try {
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }) as string;

    if (Platform.OS === 'windows') {
      const { saveFileOnWindows } = require('./windowsFileSave') as typeof import('./windowsFileSave');
      const path = await saveFileOnWindows(base64, fileName);
      showAlert(`Excel file saved to ${path}`);
      return;
    }

    if (Platform.OS === 'macos') {
      // Same platform gap as PDF export (reportExport.ts) - expo-file-system's
      // sharing story isn't officially supported on this target yet.
      showAlert('Excel export is currently available on mobile and web only. Support for this platform is planned.');
      return;
    }

    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');

    if (Platform.OS === 'web') {
      const byteChars = atob(base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showAlert('Excel file downloaded.');
      return;
    }

    const file = new File(Paths.cache, fileName);
    file.write(base64, { encoding: 'base64' });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: fileName,
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
      showAlert('Excel file generated and ready to save/share.');
    } else {
      showAlert(`Excel file generated, but this device has no way to share or save it automatically. File is at: ${file.uri}`);
    }
  } catch (e) {
    showAlert({ type: 'error', message: 'Failed to generate the Excel file. Please try again.' });
  }
}
