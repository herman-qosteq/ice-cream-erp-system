import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as storePricingController from './storePricing.controller';

export const storePricingRouter = Router();

storePricingRouter.get('/', requireAuth, asyncHandler(storePricingController.list));
storePricingRouter.put('/', requireAuth, requireRole('Admin'), asyncHandler(storePricingController.upsert));
storePricingRouter.post('/clone', requireAuth, requireRole('Admin'), asyncHandler(storePricingController.clone));
storePricingRouter.delete('/:id', requireAuth, requireRole('Admin'), asyncHandler(storePricingController.remove));
