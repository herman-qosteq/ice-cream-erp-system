import puppeteer, { Browser } from 'puppeteer';

// One headless Chromium instance shared across every render call rather than
// launching fresh per-request - a cold launch takes 1-2s, which every "Save
// as PDF" tap would otherwise pay. Lazily started on first use (not at
// server boot) so a dev machine without Chromium's OS-level deps installed
// only fails when a PDF is actually requested, not on every server start.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    // A browser that crashes/closes must not poison every subsequent
    // request with a promise resolved to a dead instance - clearing the
    // cache on disconnect means the next call launches a fresh one.
    browserPromise.then(b => b.on('disconnected', () => { browserPromise = null; }));
  }
  return browserPromise;
}

// Renders an already-fully-formed invoice/report HTML document (see
// pdfTemplate.ts on the frontend, which builds and owns the actual markup/
// CSS) to a real PDF via Chromium's own print pipeline - the exact same
// engine the Print button's window.print() uses in a real browser, so this
// output matches Print pixel-for-pixel instead of the visual drift the old
// html2canvas-rasterized "Save as PDF" path had. preferCSSPageSize honors
// the @page rule already baked into PDF_STYLE (A4, 10mm/18mm margins),
// exactly like a real browser print dialog would.
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // The invoice document has no interactive/dynamic behavior of its own
    // (the Print/Save-as-PDF buttons are injected separately, client-side,
    // via withPrintBar - never present in the html this endpoint receives) -
    // disabling JS is pure attack-surface reduction for arbitrary HTML this
    // endpoint accepts from an authenticated caller.
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
