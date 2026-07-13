import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole } from '../../middleware/auth';
import * as storesController from './stores.controller';

export const storesRouter = Router();

storesRouter.get('/', requireAuth, asyncHandler(storesController.list));
storesRouter.post('/', requireAuth, requireRole('Admin', 'Salesperson'), asyncHandler(storesController.create));
storesRouter.patch('/:id', requireAuth, requireRole('Admin'), asyncHandler(storesController.update));
storesRouter.patch('/:id/status', requireAuth, requireRole('Admin'), asyncHandler(storesController.setStatus));

storesRouter.get('/visits', requireAuth, asyncHandler(storesController.listVisits));
storesRouter.post('/visits', requireAuth, requireRole('Salesperson'), asyncHandler(storesController.recordVisit));
