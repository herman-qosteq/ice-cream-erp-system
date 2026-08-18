import { Request, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/ApiError';
import * as pdfService from './pdf.service';

const renderSchema = z.object({
  html: z.string().min(1),
  fileName: z.string().min(1).optional(),
});

// Strips anything that isn't safe inside a Content-Disposition filename
// (quotes, path separators, control characters) - the caller-supplied name
// is only ever used for display, so a stray character here should just be
// dropped, not treated as a validation error worth rejecting the request over.
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
  const withExt = cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
  return withExt || 'document.pdf';
}

export async function render(req: Request, res: Response) {
  const parsed = renderSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message ?? 'Invalid request');

  const pdf = await pdfService.renderHtmlToPdf(parsed.data.html);
  const fileName = sanitizeFileName(parsed.data.fileName ?? 'document.pdf');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(pdf);
}
