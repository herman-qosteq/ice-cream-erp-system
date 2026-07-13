import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import * as notificationsController from './notifications.controller';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', asyncHandler(notificationsController.list));
notificationsRouter.post('/', asyncHandler(notificationsController.create));
notificationsRouter.patch('/:id/read', asyncHandler(notificationsController.markRead));
notificationsRouter.delete('/', asyncHandler(notificationsController.clearAll));
