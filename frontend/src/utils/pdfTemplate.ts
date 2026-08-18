// Single shared design system for every PDF the app generates (order
// invoices, dashboard reports, stock receipts, ...). The Order Invoice was
// the original, most polished document in the app, so its layout/branding/
// typography became the template here — every other PDF is built from these
// same pieces so nothing can visually drift from it again.

// Company name/GSTIN/phone/email are editable at Settings > Business
// Details (see AdminSettings.tsx, backed by CompanyProfile in the DB) rather
// than hardcoded - but the many PDF/Excel builder functions across this app
// (order invoices, dashboard reports, GRNs, ...) call into this shared
// template without any of them carrying a `companyProfile` parameter through
// their own signatures, so plumbing it in as an explicit argument everywhere
// would mean touching every one of those call sites. Simpler and lower-risk:
// module-level state seeded once via configureBrandProfile(), which
// storage.ts's loadAllData() calls on every initial load AND every
// refreshData() (every path funnels through that one function) - so this is
// always in sync with the backend's single source of truth by the time any
// PDF/Excel export actually runs. Falls back to the same placeholder values
// that used to be hardcoded here until that first load completes.
let brandProfile = {
  name: 'Mayben traders',
  gstin: '27AAAAA1111A1Z1',
  phone: '+91 73736 74757',
  email: 'support@maybentraders.in',
};

export function configureBrandProfile(profile: { name: string; gstin: string; phone: string; email: string }) {
  brandProfile = { ...profile };
}

// Exported as functions (not the raw mutable object) so every call site -
// this file and other document builders like excelExport.ts - always reads
// whatever configureBrandProfile() most recently set, instead of a value
// snapshotted at import time.
export function getBrandName(): string { return brandProfile.name; }
export function getBrandGstin(): string { return brandProfile.gstin; }
export function getBrandPhone(): string { return brandProfile.phone; }
export function getBrandEmail(): string { return brandProfile.email; }

const BRAND_TAGLINE = 'Premium Distribution & Logistics Network ERP';

// Premium GST-tax-invoice palette - shared by every PDF this app generates
// (order invoices, pre-booking bills, GRNs, dashboard reports) so nothing
// visually drifts from the invoice, the most polished document in the app.
// 'Inter'/'Poppins' are listed first per the brand spec but are never
// fetched from a network font CDN (bills must render identically offline) -
// they simply apply on any device that already has one installed and fall
// back to the platform system font everywhere else.
export const PDF_STYLE = `
  /* Bottom margin is deliberately larger than the other three sides
     (18mm vs 10mm) - roughly 2 product-table rows' worth of extra buffer
     (2 * 14px row height ≈ 7.4mm, rounded up). A table that runs flush to
     the exact printable-area edge before continuing onto the next page
     never gets to show a bottom border there (browsers only draw a
     table's border at its TRUE top/bottom, not at an internal page break -
     see the .invoice-doc comment below) - reserving this extra bottom
     margin gives the browser's automatic pagination a bit of headroom to
     land the break a little earlier, with blank space after the last row
     shown on a given page instead of that row being flush against the
     very edge. reportExport.ts's saveWebPdf keeps an equivalent extra
     bottom margin (EXTRA_BOTTOM_MARGIN_PT) for the same reason on the web
     "Save as PDF" path, which doesn't go through @page at all. */
  @page { size: A4; margin: 10mm 10mm 18mm 10mm; }
  * { box-sizing: border-box; }
  /* Every rule/border in this stylesheet uses 0.3px, not 1px, on purpose -
     do not "round it up" to 1px. On screen a 1px CSS border is exactly 1
     device pixel and looks fine, but this same HTML also gets rendered at
     a HIGHER effective pixel density by both real print engines (native
     mobile Print.printToFileAsync/printAsync, browser print-to-PDF) and
     the web "Save as PDF" button's html2canvas capture (scale:2 in
     reportExport.ts) - at those densities a 1px CSS border resolves to 2+
     physical dots, which is what was making every ruled line in the
     printed/saved output look noticeably heavier than the crisp thin
     lines shown in the on-screen preview. 0.5px (exactly 1 physical dot at
     html2canvas's 2x scale) was tried first and was still too heavy in
     practice, so this is down to 0.3px - both browsers and print engines
     support sub-pixel border widths, but going much thinner than this
     risks the line anti-aliasing down to invisible in some renderers
     instead of just thin, so treat 0.3px as close to the practical floor
     rather than continuing to shave it down further. */
  /* html is deliberately left full-width (not pinned like body below) -
     forcing a fixed width on <html> itself leaves nothing wider for body's
     auto margins to center within, which is what was pinning the whole
     document to the left edge of the on-screen preview window instead of
     centering it. */
  /* Body is sized to the PRINTABLE area (A4's 210mm minus the @page's two
     10mm margins = 190mm), not the full A4 page width - a real print
     engine (native mobile print, Windows/macOS/browser print) lays this
     same HTML out inside that same margin-shrunk area, so sizing body any
     wider than it leaves the print engine to auto-shrink the entire page
     (fonts, column widths, everything) to make it fit, which is what made
     printed copies come out smaller/narrower than the web "Save as PDF"
     button's output (which screenshots the DOM directly and never goes
     through @page at all, so it was never affected).
     Deliberately expressed in mm, not an assumed-96dpi px equivalent -
     @page's margin is also in mm, so this is an exact, unit-for-unit match
     of the print engine's own printable-area math with no px/mm rounding
     or DPI-assumption gap for it to silently resolve by scaling. The
     html2canvas screenshot iframe (reportExport.ts) still uses a plain px
     width, because that path is a real browser viewport (96dpi is exact
     there), not a print engine. */
  /* The Puppeteer-rendered "Save as PDF" path (backend/src/modules/pdf -
     see pdf.service.ts) prints this HTML with headless Chromium on
     whatever server it runs on. Chromium has no bundled fonts of its own -
     it always renders text using fonts registered with the HOST OS's
     fontconfig. 'Inter'/'Poppins'/"Segoe UI"/Roboto/Arial are commonly
     preinstalled on a dev machine (Windows/macOS) but a bare Linux VPS
     (e.g. an aapanel box) often has NONE of them, so Chromium silently
     substitutes an unrelated fallback font with different character
     widths - since the invoice table uses table-layout:fixed with exact
     column-width percentages tuned for these fonts' metrics, that
     substitution is what throws off text wrapping/column alignment only
     on the server, never locally. 'DejaVu Sans'/'Liberation Sans'/'Noto
     Sans' are added ahead of the generic sans-serif fallback because
     they're the fonts most Linux distros' font packages (dejavu-fonts,
     liberation-fonts, fonts-noto on Debian/Ubuntu; the yum/dnf
     equivalents on CentOS/AlmaLinux, which aapanel commonly runs on)
     actually install - Liberation Sans in particular is metrically
     compatible with Arial (same glyph widths), so once ANY of these
     packages is installed on the server this stack lands on a visually
     equivalent font instead of an arbitrary one. This alone doesn't fix
     the bug (the server still needs one of these font packages actually
     installed - see the deployment notes wherever this app is deployed),
     it only makes the fallback land closer to the intended layout once it
     is. */
  body { font-family: 'Inter', 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Liberation Sans", "DejaVu Sans", "Noto Sans", sans-serif; width: 190mm; max-width: 100%; margin: 8px auto; color: #1F2937; font-size: 10px; line-height: 1.4; background: #ffffff; }
  .muted { color: #777777; font-size: 7px; font-weight: 400; }
  hr { margin: 6px 0; border: none; border-top: 0.3px solid #D9D9D9; }

  /* Header: centered brand lockup, then a bold centered title bar below it -
     the standard printed-GST-invoice layout. border-bottom kept at the
     same 1px weight as every table/box border elsewhere in the document
     (was 2px) - the dark #111827 color still sets it apart from the
     light-gray #D9D9D9 rules used everywhere else, without the line
     itself being a different thickness. */
  .invoice-header { display: flex; flex-direction: column; align-items: center; text-align: center; border-bottom: 0.3px solid #111827; padding-bottom: 10px; }
  .brand-name { font-weight: 700; font-size: 14px; color: #111827; letter-spacing: 1px; text-transform: uppercase; }
  .brand-tagline { font-size: 9px; color: #666666; font-weight: 400; margin-top: 1px; }
  .brand-meta { font-size: 9px; color: #374151; font-weight: 500; line-height: 1.5; margin-top: 3px; }
  .doc-title-bar { text-align: center; padding: 8px 0 9px; border-bottom: 0.3px solid #D9D9D9; margin-bottom: 10px; }
  .doc-title-text { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #111827; }
  .doc-subtitle { font-size: 7px; color: #6B7280; font-weight: 600; margin-top: 2px; }

  .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #374151; margin-top: 14px; margin-bottom: 3px; }
  .summary-line { display: flex; flex-wrap: wrap; column-gap: 26px; row-gap: 3px; margin: 8px 0 2px 0; padding: 6px 0; border-top: 0.3px solid #D9D9D9; border-bottom: 0.3px solid #D9D9D9; font-size: 8px; }
  .summary-line .s-label { color: #6B7280; font-weight: 700; margin-right: 4px; }
  .summary-line .s-value { font-weight: 800; color: #111827; }
  .summary-line .s-value.accent { color: #F97316; }

  /* Vertical column dividers + an outer box only - no ruled line between
     each item row, so a long line-item list doesn't turn into a grid of
     horizontal bars. The per-page "closing" line under whichever row a
     print engine actually ends a page on comes from the invoice table's
     <tfoot> instead (see renderInvoiceDocument) - table-footer-group is a
     genuine CSS paged-media mechanism (same family as thead's
     table-header-group repeating at the top of every page) that the
     browser/print engine itself repeats at the bottom of the table's
     content on EVERY page it paginates onto, including the true last one -
     so this is exact, not a JS guess. An earlier attempt estimated
     which row indices were likely last-on-page from fixed height
     constants and tagged just those rows - abandoned because no fixed
     estimate can know the real rendered row heights a print engine uses,
     so it kept landing the line on the wrong row. */
  /* Font-size and padding both cut down from the original 9px/7px + 10px
     padding - with 11 columns now (the Pcs/Box column added alongside the
     original 10), the Product column's share shrank and long product names
     were getting ellipsis-truncated too eagerly. Smaller text plus tighter
     horizontal padding on every cell (not just Product's) reclaims room for
     the actual product-name characters without needing to steal any more
     percentage points from the numeric columns. */
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 7px; border: 0.3px solid #D9D9D9; }
  /* Header text is kept in its natural mixed case (no text-transform, no
     letter-spacing) rather than forced uppercase - uppercase letters are
     noticeably wider per character, and that extra width was what pushed
     multi-word headers ("Loose Pieces", "Rate / Piece", "Total Pieces")
     onto a second line even after their columns were widened as far as
     the rest of the 13-column table could spare. This keeps every header
     on one line WITHOUT shortening or abbreviating any of the actual
     wording - same words, just not artificially widened by all-caps
     styling. white-space:nowrap enforces the single line explicitly
     rather than leaving it to wrap only if it happens not to fit. */
  th { background: #F3F4F6; text-align: center; padding: 4px 1px; border-top: 0.3px solid #D9D9D9; border-left: 0.3px solid #D9D9D9; border-right: 0.3px solid #D9D9D9; border-bottom: 0.3px solid #D9D9D9; font-size: 7px; line-height: 1.15; font-weight: 700; color: #1F2937; white-space: nowrap; }
  td { padding: 0 2px; height: 14px; border-left: 0.3px solid #D9D9D9; border-right: 0.3px solid #D9D9D9; vertical-align: middle; font-weight: 500; line-height: 1.2; color: #1F2937; }
  /* Zero-height footer row purely for its border-top - see the 'table {'
     comment above and renderInvoiceDocument for why this (not a JS
     estimate) is what actually closes the table on every printed page. */
  .invoice-doc tfoot td { height: 0; padding: 0; border: none; border-top: 0.3px solid #D9D9D9; }
  /* The product-name cell is the only column with unbounded-length content
     (every other column is a short number/label) - wraps onto additional
     lines instead of ellipsis-truncating, so a long name is always fully
     readable rather than cut off with "...". This was previously clamped
     to one line specifically to keep every row at the exact fixed height
     PRODUCT_ROW_HEIGHT_PX assumes for the page-1 row-capacity math -
     wrapping means a row with a long name can now render taller than that
     estimate. PRODUCT_ROW_HEIGHT_PX was bumped up to a 2-line-typical
     estimate to absorb the common case; a name long enough to wrap to 3+
     lines is rarer and just relies on the existing safety nets (row-level
     break-inside:avoid, the atomic-range protection and hardened
     breakpoint collection in saveWebPdf) to degrade gracefully - worst
     case one extra page, never corrupted/overlapping content. word-break
     lets a single very long unbroken word (rare) still wrap rather than
     overflow the column outright. */
  td.prod-name { padding: 0 4px; white-space: normal; overflow-wrap: break-word; word-break: break-word; }
  .box { background: #F9FAFB; border: 0.3px solid #D9D9D9; border-radius: 8px; padding: 8px 12px; margin-top: 8px; font-size: 9px; }

  /* GST invoice shell (renderPaginatedInvoiceBody) - ONE continuous
     <table class="invoice-doc"> for the whole product list, same as every
     other report this app generates. Real print engines (window.print(),
     native mobile Print.printToFileAsync/printAsync) paginate this
     natively: thead repeats on every page it breaks the table onto (see
     the @media print rule below), break-inside:avoid keeps a row from
     being cut in half, and the footer content that follows the table just
     flows onto whichever page has room, protected block-by-block by the
     .party-row/.bottom-row/etc rule further down. None of this needs any
     JS-computed row split or page-1-capacity estimate - the print engine
     measures real rendered heights, which is strictly more accurate than
     any estimate this file could compute ahead of time. An earlier
     version of this file DID pre-split rows into separate per-page tables
     with forced page-break-before markers, specifically to get the web
     "Save as PDF" screenshot path (saveWebPdf in reportExport.ts, which
     has no native pagination to lean on) to repeat the column header too -
     but the JS height estimate that split relied on was never accurate
     enough across different product-name lengths/column widths, and kept
     under- or over-filling page 1 no matter how many times it was
     retuned. Reverted in favor of exact correctness on the print/native
     path (this comment) at the cost of saveWebPdf's continuation pages no
     longer repeating the column header - see saveWebPdf's own comments. */
  /* The table's own border draws its top/left/right edges (inherited from
     the generic 'table' rule above) but border-bottom is explicitly
     suppressed here - relying on the table's own border-bottom, or on
     'tbody tr:last-child', to close the box proved unreliable once real
     rendering was checked (:last-child only ever matches the true final
     row, not "whatever row happened to be last on a given printed page",
     and a table's own border-bottom isn't guaranteed to redraw at an
     internal page break either). The closing line under the real final
     row of EVERY page - including the true last one - comes entirely from
     the <tfoot> in renderInvoiceDocument instead (see its border-top rule
     above); suppressing it here too would just double that same line at
     the true end. */
  .invoice-doc { border-bottom: none; table-layout: fixed; }
  .invoice-doc tbody tr, .invoice-doc tbody td, .invoice-doc thead tr th { break-inside: avoid; page-break-inside: avoid; }
  /* table-footer-group is already every browser's default UA display value
     for a bare <tfoot>, but declared explicitly (not left implicit) since
     this also has to render correctly inside native mobile print engines
     (expo-print's Print.printToFileAsync/printAsync, which hand this same
     HTML to the OS's own PDF/print renderer, not a desktop browser) whose
     default stylesheets aren't guaranteed to match Chrome/Safari/Firefox's. */
  .invoice-doc tfoot { display: table-footer-group; }
  @media print {
    .invoice-doc thead { display: table-header-group; }
  }
  /* Each footer piece stays intact rather than splitting across a page
     boundary if it doesn't fully fit alongside the last page's rows -
     ordinary overflow (not a forced break) pushes the whole piece onto one
     further page instead of cutting through the middle of it. Protected as
     the outer flex WRAPPER (.party-row, .bottom-row), not the individual
     boxes inside it (.party-box/.totals-box/.qr-box are flex siblings
     side by side, at roughly the same vertical position - protecting only
     one of them still leaves its neighbor free to split at the same
     height) - reportExport.ts's saveWebPdf keys off this exact selector
     list too, so keep the two in sync. */
  .party-row, .bottom-row, .payment-bar, .signature-block, .amount-words {
    break-inside: avoid; page-break-inside: avoid;
  }

  /* Bordered bill-to / invoice-meta information boxes - sharp corners, like
     the rest of this GST invoice's ruled boxes. */
  .party-row { display: flex; gap: 12px; margin-top: 10px; }
  .party-box { flex: 1; min-width: 0; border: 0.3px solid #D9D9D9; }
  .party-title { background: #F3F4F6; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #374151; padding: 5px 10px; border-bottom: 0.3px solid #D9D9D9; }
  .party-body { padding: 4px 10px 3px; }
  .kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 1px 0; font-size: 9px; line-height: 1.2; }
  .kv .k { color: #555555; font-weight: 500; }
  .kv .v { color: #111111; font-weight: 600; text-align: right; }
  .kv .v.strong { font-weight: 800; color: #111111; }
  /* Paid Amount / Balance Due inside the payment bar get their own slightly
     larger emphasis than a regular bold value (e.g. Store Name, Invoice
     Number) elsewhere in the same .kv/.v.strong markup. */
  .payment-bar .kv .v.strong { font-size: 10px; font-weight: 600; }

  /* GST tax-invoice look: a rate-wise GST/SGST/CGST breakdown table, a QR
     card, and a totals card - modeled on a standard printed GST invoice so
     the Order/Pre-Booking bill reads like one. */
  .gst-table { font-size: 7px; line-height: 1.2; }
  /* th gets its own rule, separate from td - same fix as the main product
     table's th (see PDF_STYLE above): equal top/bottom padding so the
     header text sits centered in its row instead of pushed toward the
     top. */
  .gst-table th { padding: 3px 7px; }
  .gst-table td { padding: 2px 7px; height: auto; }
  .bottom-row { display: flex; gap: 12px; margin-top: 6px; align-items: flex-start; }
  .bottom-row > div { flex: 1; min-width: 0; }
  /* No border/background card around the QR - just the code itself,
     centered in its column. */
  .bottom-row > div.qr-box { flex: 0 0 118px; padding: 4px 10px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
  .qr-box .qr-label { font-size: 7px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: #374151; margin-bottom: 6px; }
  .qr-box img, .qr-box svg { display: block; margin: 0 auto; }
  .qr-box .qr-caption { font-size: 7px; color: #6B7280; margin-top: 6px; font-weight: 700; line-height: 1.3; }
  .qr-box .qr-caption.qr-warning { color: #b91c1c; }
  .totals-box { border: 0.3px solid #D9D9D9; padding: 4px 10px; font-size: 8.5px; line-height: 1.2; }
  .totals-box .t-row { display: flex; justify-content: space-between; padding: 0.5px 0; }
  .totals-box .t-row .t-label { color: #6B7280; font-weight: 500; }
  .totals-box .t-row .t-value { color: #1F2937; font-weight: 600; }
  .totals-box .t-row.grand { margin-top: 3px; padding: 3px 10px; background: #F9FAFB; border: 0.3px solid #D9D9D9; color: #111827; }
  .totals-box .t-row.grand .grand-label { font-size: 10px; font-weight: 700; }
  .totals-box .t-row.grand .grand-value { font-size: 12px; font-weight: 800; }
  .amount-words { margin-top: 6px; font-size: 9px; font-style: italic; font-weight: 500; color: #374151; border-top: 0.3px solid #D9D9D9; padding-top: 4px; }

  .payment-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 8px; border: 0.3px solid #D9D9D9; padding: 8px 12px; background: #F9FAFB; font-size: 8.5px; }
  /* Paid Amount / Balance Amount / Payment Method side by side in one line
     instead of stacked rows - each .kv keeps its own label:value pairing,
     just laid out as a row of items instead of a column. */
  .payment-details-row { display: flex; flex-wrap: wrap; align-items: center; gap: 18px; }
  .payment-details-row .kv { padding: 0; }
  .status-pill { display: inline-block; border-radius: 5px; padding: 4px 12px; font-weight: 800; font-size: 8.5px; letter-spacing: 0.3px; white-space: nowrap; }

  .signature-block { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; font-size: 8.5px; }
  .signature-block .sig-box { text-align: center; font-weight: 700; color: #1F2937; }
  .signature-block .sig-line { margin-top: 18px; border-top: 0.3px solid #1F2937; padding-top: 3px; width: 170px; font-size: 9px; font-weight: 500; color: #6B7280; }
`;

// title/subtitle are optional - omitting them (the Order Invoice does) skips
// the doc-title-bar entirely rather than rendering an empty one.
function renderHeader(title?: string, subtitle?: string): string {
  return `
    <div class="invoice-header">
      <div class="brand-name">${getBrandName()}</div>
      <div class="brand-tagline">${BRAND_TAGLINE}</div>
      <div class="brand-meta">GSTIN: ${getBrandGstin()} &nbsp;|&nbsp; Ph: ${getBrandPhone()} &nbsp;|&nbsp; ${getBrandEmail()}</div>
    </div>
    ${title ? `<div class="doc-title-bar">
      <div class="doc-title-text">${title}</div>
      ${subtitle ? `<div class="doc-subtitle">${subtitle}</div>` : ''}
    </div>` : ''}`;
}

// Single compact line (bullet-separated) instead of a 2-3 line block - a
// printed GST invoice's footer note is a courtesy line, not content anyone
// needs room to read carefully, so it shouldn't cost more vertical space
// than the rest of the document.
function renderFooter(note: string, generatedAt: string): string {
  return `<p class="muted" style="text-align:center;margin-top:6px">${note} &bull; Generated on ${generatedAt}</p>`;
}

/** A labelled field row inside a party box, e.g. "Store Name: Mayben traders". */
export function renderKv(label: string, value: string, strong = false): string {
  return `<div class="kv"><span class="k">${label}</span><span class="v${strong ? ' strong' : ''}">${value}</span></div>`;
}

/** A titled group of {@link renderKv} rows - the content of one bordered party box. */
export function renderPartyBox(title: string, rowsHtml: string): string {
  return `<div class="party-title">${title}</div><div class="party-body">${rowsHtml}</div>`;
}

/** Two bordered information boxes side by side, styled exactly like a
 * standard GST invoice's BILL TO / invoice-meta boxes. Pass pre-built
 * content (typically {@link renderPartyBox}) for each side. */
export function renderInfoTable(leftHtml: string, rightHtml: string): string {
  return `<div class="party-row"><div class="party-box">${leftHtml}</div><div class="party-box">${rightHtml}</div></div>`;
}

export interface SummaryItem {
  label: string;
  value: string;
  accent?: boolean;
}

/** Compact, borderless label:value summary line — replaces the old bordered
 * KPI-card grid. Matches the plain, text-based tone of the Order Invoice
 * rather than looking like a dashboard widget. */
export function renderSummaryLine(items: SummaryItem[]): string {
  return `<div class="summary-line">${items
    .map(i => `<span><span class="s-label">${i.label}:</span><span class="s-value${i.accent ? ' accent' : ''}">${i.value}</span></span>`)
    .join('')}</div>`;
}

/** Wraps body content in the full brand header + footer shell every PDF shares. */
export function renderPdfDocument(opts: { title: string; subtitle: string; bodyHtml: string; footerNote: string }): string {
  const generatedAt = new Date().toLocaleString('en-IN');
  // Pins the rendering width to body's own printable-area width (718px, see
  // the comment on body's width in PDF_STYLE) instead of letting each
  // renderer guess its own layout viewport - without this, native
  // WebView-based PDF engines (Android/iOS Print.printToFileAsync) are free
  // to assume a much wider "desktop" viewport and then scale the whole page
  // up to fill the physical A4 sheet, which is what makes every
  // printed/downloaded copy look oversized and spill onto extra pages
  // compared to the on-screen preview.
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=718, initial-scale=1.0"><style>${PDF_STYLE}</style></head><body>
    ${renderHeader(opts.title, opts.subtitle)}
    ${opts.bodyHtml}
    ${renderFooter(opts.footerNote, generatedAt)}
  </body></html>`;
}

// Column widths for the invoice's 13-column product table (S.No / Product
// Name / Pieces per Box / Boxes / Loose Pieces / Total Pieces / MRP Per
// Piece / MRP Per Box / Rate Per Piece / Rate Per Box / Discount % / GST % /
// Amount) - fixed percentages via <colgroup> rather than per-row sizing,
// since table-layout:fixed only reads column widths off <col> elements or
// the first row. Product Name still gets the most room (24%) since real
// product names commonly run 28-37 characters and it's the only column
// with unpredictable-length content; td.prod-name's word-wrap (see
// PDF_STYLE) catches whatever doesn't fit on one line. Amount widened
// again (5% → 7%) - td's horizontal padding was also cut (6px → 4px per
// side, see PDF_STYLE) freeing a little real room in every column, enough
// slack that Boxes and GST % (both always just 1-2 short characters of
// actual data) could each give up 1% without losing any breathing room,
// funding Amount's increase without touching Product Name or the
// harder-to-shrink Loose Pieces/Total Pieces columns. Pieces per Box
// widened again (6% → 9%) after the "Pack Size" header was renamed to the
// longer "Pieces per Box" - th uses white-space:nowrap with no overflow
// clipping (see PDF_STYLE), so the extra characters were bleeding into the
// Boxes header instead of wrapping. The +3% was first funded by shrinking
// Discount % (6% → 4%) and Rate Per Box (8% → 7%), but Discount %'s own
// header text ("Discount %") then didn't fit at 4% and started bleeding
// into GST % - it's a label, not a value, so it can't be trimmed like the
// numeric columns can. Gave it back 1% (4% → 5%) funded by Rate Per Piece
// (8% → 7%, matching Rate Per Box - still comfortably wider than the
// digit counts it holds).
const INVOICE_TABLE_COLGROUP = `<colgroup>
  <col style="width:3%"><col style="width:24%"><col style="width:9%">
  <col style="width:4%"><col style="width:7%"><col style="width:7%">
  <col style="width:8%"><col style="width:8%"><col style="width:7%">
  <col style="width:7%"><col style="width:5%"><col style="width:4%">
  <col style="width:7%">
</colgroup>`;

interface InvoiceDocOpts {
  title?: string;
  subtitle?: string;
  partyBoxesHtml: string;
  columnsHtml: string;
  rows: string[];
  footerHtml: string;
  footerNote: string;
}

/** Full GST-invoice document - unlike {@link renderPdfDocument} (a flat
 * header/body/footer stack used by every other report), this wraps the
 * product rows in ONE continuous `<table class="invoice-doc">` with a real
 * `<thead>` column-header row and lets the print engine paginate it
 * NATIVELY: `display: table-header-group` repeats the header on every
 * page a real print engine (window.print(), native mobile
 * Print.printToFileAsync/printAsync) breaks the table onto, using the
 * engine's own REAL measured row heights - never a JS estimate. This is
 * also exactly what a person just reviewing the bill on screen sees (a
 * plain table, thead once at the top - print pagination is a print-only
 * concept, so there's nothing to hide on screen), so there's no longer a
 * separate screen/print version of this document to toggle between the
 * way there briefly was.
 *
 * An earlier version of this function pre-split rows into separate
 * per-page `<table>`s at generation time, using a JS-computed estimate of
 * how many rows fit on "page 1" (accounting for the header/party boxes
 * above it) vs. later pages - specifically so the web "Save as PDF"
 * screenshot path (saveWebPdf in reportExport.ts, which has no native
 * print pagination to lean on) could also repeat the column header on its
 * own continuation pages. That estimate never converged on being accurate
 * across different product-name lengths and column widths - each retuning
 * pass shifted where it was wrong rather than eliminating the error, and
 * it was actively WRONG for the print/native path too, since that path
 * never needed an estimate in the first place (the print engine already
 * paginates a plain table perfectly on its own). Reverted to this simpler,
 * exactly-correct structure; saveWebPdf's continuation pages (if the
 * content spans more than one screenshot-sliced page) no longer repeat the
 * column header as a result - see saveWebPdf's own comments for why that
 * trade was made deliberately, not accidentally. */
export function renderInvoiceDocument(opts: InvoiceDocOpts): string {
  const generatedAt = new Date().toLocaleString('en-IN');
  // <tfoot> is a zero-height row that exists purely for its border-top (see
  // PDF_STYLE's '.invoice-doc tfoot td' rule) - table-footer-group is a real
  // CSS paged-media mechanism the print engine itself repeats at the end of
  // the table's content on EVERY page it paginates onto (same family as
  // thead's table-header-group repeating at the top), so this closing line
  // always lands under whichever row actually ends up last on a given page,
  // including the true final row - no JS row-count estimate involved.
  const colCount = (opts.columnsHtml.match(/<th/g) || []).length || 1;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=718, initial-scale=1.0"><style>${PDF_STYLE}</style></head><body>
    ${renderHeader(opts.title, opts.subtitle)}
    ${opts.partyBoxesHtml}
    <table class="invoice-doc">
      ${INVOICE_TABLE_COLGROUP}
      <thead><tr>${opts.columnsHtml}</tr></thead>
      <tbody>${opts.rows.join('')}</tbody>
      <tfoot><tr><td colspan="${colCount}"></td></tr></tfoot>
    </table>
    ${opts.footerHtml}
    ${renderFooter(opts.footerNote, generatedAt)}
  </body></html>`;
}

// ---------------------------------------------------------------------------
// GST tax-invoice pieces — rate-wise SGST/CGST breakdown, the totals box,
// amount-in-words, and the signature/payment stamp. Only the Order Invoice
// and Pre-Booking Bill use these (unlike the shell above, which every PDF
// shares) since they're the only documents with taxable line items.
// ---------------------------------------------------------------------------

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? ' ' + ONES[ones] : ''}`;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds && rest) return `${ONES[hundreds]} Hundred and ${twoDigitsToWords(rest)}`;
  if (hundreds) return `${ONES[hundreds]} Hundred`;
  return twoDigitsToWords(rest);
}

/** Whole-rupee amount -> Indian-numbering words, e.g. 5136 -> "Five Thousand
 * One Hundred and Thirty Six" (Crore/Lakh/Thousand grouping, not the
 * Western thousands grouping) - matches how printed GST invoices always
 * spell out the payable amount. */
export function numberToIndianWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const hundred = n % 1e3;
  const segments: string[] = [];
  if (crore) segments.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) segments.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) segments.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) segments.push(threeDigitsToWords(hundred));
  return segments.join(' ');
}

/** "Rs. Five Thousand ... Only" footer line under the totals box. */
export function renderAmountInWords(grandTotal: number): string {
  return `<div class="amount-words">Amount in Words: Rupees ${numberToIndianWords(grandTotal)} Only</div>`;
}

export interface GstBreakdownLine {
  taxPct: number;
  taxable: number;
}

/** Rate-wise GST/SGST/CGST breakdown table (bottom-left of a standard GST
 * invoice) - groups line items by their tax slab and splits each slab's GST
 * evenly into SGST + CGST, the standard split for an intra-state sale. */
export function renderGstBreakdownTable(lines: GstBreakdownLine[], totals: { itemCount: number; qtyLabel: string }): string {
  const byRate = new Map<number, number>();
  lines.forEach(l => byRate.set(l.taxPct, (byRate.get(l.taxPct) || 0) + l.taxable));
  const rates = Array.from(byRate.keys()).sort((a, b) => a - b);

  let taxableTotal = 0, gstTotal = 0, sgstTotal = 0, cgstTotal = 0;
  const rows = rates.map(pct => {
    const taxable = byRate.get(pct) || 0;
    const gst = taxable * (pct / 100);
    const sgst = gst / 2;
    const cgst = gst / 2;
    taxableTotal += taxable; gstTotal += gst; sgstTotal += sgst; cgstTotal += cgst;
    return `<tr><td>${pct}%</td><td style="text-align:right">${taxable.toFixed(2)}</td><td style="text-align:right">${sgst.toFixed(2)}</td><td style="text-align:right">${cgst.toFixed(2)}</td><td style="text-align:right">${gst.toFixed(2)}</td></tr>`;
  }).join('');

  return `
    <div class="section-title" style="margin-top:0">GST Summary</div>
    <table class="gst-table">
      <thead><tr><th>GST%</th><th style="text-align:right">Taxable</th><th style="text-align:right">SGST</th><th style="text-align:right">CGST</th><th style="text-align:right">GST Value</th></tr></thead>
      <tbody>
        ${rows}
        <tr style="font-weight:800"><td>Total</td><td style="text-align:right">${taxableTotal.toFixed(2)}</td><td style="text-align:right">${sgstTotal.toFixed(2)}</td><td style="text-align:right">${cgstTotal.toFixed(2)}</td><td style="text-align:right">${gstTotal.toFixed(2)}</td></tr>
      </tbody>
    </table>
    <div class="muted" style="margin-top:4px">Total Item(s): ${totals.itemCount} &nbsp;|&nbsp; Total Qty: ${totals.qtyLabel}</div>`;
}

export interface InvoiceTotalsBoxOpts {
  totalBoxes: number;
  totalLoosePieces: number;
  totalQuantity: number;
  grossAmount: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  grandTotal: number;
}

/** Right-hand totals box (Total Boxes / Total Loose Pieces / Total Quantity
 * / Gross Amount / Discount / Taxable Value / CGST / SGST-IGST / Round Off
 * / bold Grand Total) matching a standard wholesale GST invoice's summary
 * panel. "SGST/IGST" is a single row/label - this app only ever computes an
 * even SGST+CGST split (no interstate IGST branching exists anywhere in the
 * codebase), so the value shown there is always the SGST half; the combined
 * label just avoids implying an intra-state-only invoice to a reader used
 * to seeing IGST on interstate ones. */
export function renderInvoiceTotalsBox(o: InvoiceTotalsBoxOpts): string {
  const row = (label: string, value: number, decimals = 2) =>
    `<div class="t-row"><span class="t-label">${label}</span><span class="t-value">${value.toFixed(decimals)}</span></div>`;
  return `<div class="totals-box">
    <div class="section-title" style="margin-top:0">Amount Summary</div>
    ${row('Total Boxes', o.totalBoxes, 0)}
    ${row('Total Loose Pieces', o.totalLoosePieces, 0)}
    ${row('Total Quantity', o.totalQuantity, 0)}
    ${row('Gross Amount', o.grossAmount)}
    ${row('Discount', o.discount)}
    ${row('Taxable Value', o.taxable)}
    ${row('CGST', o.cgst)}
    ${row('SGST/IGST', o.sgst)}
    ${row('Round Off', o.roundOff)}
    <div class="t-row grand"><span class="grand-label">Grand Total</span><span class="grand-value">Rs. ${o.grandTotal.toFixed(2)}</span></div>
  </div>`;
}

/** Deterministic decorative QR-pattern placeholder (three finder-pattern
 * corner squares + a pseudo-random fill, seeded so it looks the same on
 * every export rather than flickering) - never scannable, used only when no
 * real UPI QR image has been uploaded in Payments Settings. Pure inline SVG
 * so it never depends on network access, unlike a live QR-generation API,
 * which matters here since bills are exported/printed offline too. */
function buildDummyQrSvg(): string {
  const cells = 9;
  const cellSize = 9;
  const size = cells * cellSize;
  const finders: Array<[number, number]> = [[0, 0], [cells - 3, 0], [0, cells - 3]];
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 1000) / 1000;
  };
  let rects = '';
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const finder = finders.find(([fx, fy]) => x >= fx && x < fx + 3 && y >= fy && y < fy + 3);
      const on = finder ? !(x === finder[0] + 1 && y === finder[1] + 1) : rand() > 0.52;
      if (on) rects += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#0f172a"/>`;
    }
  }
  return `<svg width="82" height="82" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff;border:0.3px solid #D9D9D9">${rects}</svg>`;
}

export interface QrSectionInput {
  image_url?: string;
  is_enabled?: boolean;
}

/** UPI QR card for the bottom-center of the bill - shows the admin-uploaded
 * QR (Payments Settings) when one exists, a warning-labelled dummy pattern
 * when it doesn't, or nothing at all when the admin has switched the feature
 * off. There's no stored UPI ID anywhere in the app (QRCodeSettings only
 * holds the image), so the card doesn't print one - it only labels what the
 * QR is for. */
export function renderQrSection(qr: QrSectionInput | undefined): string {
  if (qr && qr.is_enabled === false) return '';
  const hasImage = !!qr?.image_url;
  const graphic = hasImage
    ? `<img src="${qr!.image_url}" width="82" height="82" style="width:82px;height:82px;object-fit:contain;border:0.3px solid #D9D9D9"/>`
    : buildDummyQrSvg();
  const caption = hasImage
    ? '<div class="qr-caption">Scan to Pay via UPI</div>'
    : '<div class="qr-caption qr-warning">QR CODE NOT UPLOADED<br/>Set one in Payments Settings</div>';
  return `<div class="qr-box"><div class="qr-label">Payment QR</div>${graphic}${caption}</div>`;
}

/** "Authorised Signatory" line anchoring the bottom-right of the bill, same
 * as a printed invoice's signature line - no "For <Brand>" caption above it,
 * just the signature rule and its label, kept minimal. */
export function renderSignatureBlock(): string {
  return `<div class="signature-block">
    <div></div>
    <div class="sig-box"><div class="sig-line">Authorised Signatory</div></div>
  </div>`;
}

/** Compact colored payment-status pill (green/amber/red) for the payment
 * details bar - green for Paid, amber for Partial, red for Unpaid/Credit. */
export function renderPaymentBadge(status: 'Paid' | 'Partial' | 'Unpaid' | 'Credit' | undefined, label: string): string {
  const color = status === 'Paid' ? '#16A34A' : status === 'Partial' ? '#B45309' : '#B91C1C';
  const bg = status === 'Paid' ? 'rgba(22,163,74,0.12)' : status === 'Partial' ? 'rgba(180,83,9,0.12)' : 'rgba(185,28,28,0.12)';
  return `<span class="status-pill" style="background:${bg};color:${color}">${label}</span>`;
}

// ---------------------------------------------------------------------------
// Filenames — every PDF is named "<Document_Type>_<PREFIX-ID>.pdf" so files
// are self-describing and never collide in a Downloads folder.
// ---------------------------------------------------------------------------

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-]+/g, '_');
}

/** Deterministic 6-digit code derived from a record's real ID — the same
 * record (e.g. the same purchase) always produces the same filename, so
 * re-downloading it doesn't clutter the Downloads folder with near-duplicates. */
function stableDigits(seed: string, length = 6): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return String(hash % 10 ** length).padStart(length, '0');
}

/** Time-based 6-digit code for documents with no single backing record (period
 * reports) — each generation is a fresh snapshot, so each download gets its own ID. */
function timeBasedDigits(length = 6): string {
  return String(Date.now() % 10 ** length).padStart(length, '0');
}

/** Builds a reference code like "RS-482913" from a record's own unique ID. */
export function stableRecordRef(prefix: string, recordId: string): string {
  return `${prefix}-${stableDigits(recordId)}`;
}

/** Builds a reference code like "REV-104822" unique to this generation. */
export function freshReportRef(prefix: string): string {
  return `${prefix}-${timeBasedDigits()}`;
}

/** Composes the final "<Document_Type>_<PREFIX-ID>.pdf" filename. */
export function buildPdfFileName(documentLabel: string, refCode: string): string {
  return `${sanitizeFileNamePart(documentLabel)}_${sanitizeFileNamePart(refCode)}.pdf`;
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Same "<Document_Type>_<PREFIX-ID>.<ext>" convention as buildPdfFileName,
 * but for user-uploaded attachments (e.g. a supplier bill photo/PDF/Excel)
 * whose extension isn't fixed - so a downloaded/shared bill is always named
 * after the invoice or bill ID it belongs to instead of the original
 * "IMG_1234.jpg"-style camera/scanner filename, which is meaningless once
 * it's sitting in a Downloads folder next to a dozen other receipts. */
export function buildAttachmentFileName(documentLabel: string, refCode: string, originalName: string, mimeType?: string): string {
  const originalExt = originalName.includes('.') ? originalName.split('.').pop() : undefined;
  const ext = (originalExt && originalExt.length <= 5 ? originalExt.toLowerCase() : undefined)
    || (mimeType && EXTENSION_BY_MIME_TYPE[mimeType])
    || 'dat';
  return `${sanitizeFileNamePart(documentLabel)}_${sanitizeFileNamePart(refCode)}.${ext}`;
}
