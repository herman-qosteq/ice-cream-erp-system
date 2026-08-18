import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import * as pdfController from './pdf.controller';

export const pdfRouter = Router();

// Every role (Admin/Salesperson/Warehouse) exports invoices/bills/reports
// from their own screens - no role restriction beyond being logged in.
pdfRouter.post('/render', requireAuth, asyncHandler(pdfController.render));
