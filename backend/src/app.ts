import express from 'express';
import cors from 'cors';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { categoriesRouter } from './modules/categories/categories.routes';
import { productsRouter } from './modules/products/products.routes';
import { suppliersRouter } from './modules/suppliers/suppliers.routes';
import { purchasesRouter } from './modules/purchases/purchases.routes';
import { warehouseRouter } from './modules/warehouse/warehouse.routes';
import { trucksRouter } from './modules/trucks/trucks.routes';
import { dispatchRouter } from './modules/dispatch/dispatch.routes';
import { storesRouter } from './modules/stores/stores.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { preBookingsRouter } from './modules/prebookings/prebookings.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { systemRouter } from './modules/system/system.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { broadcastExcept } from './realtime';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' })); // generous limit: product photos/QR codes are stored as base64 data URIs

// Real-time sync: after any successful write, tell every other connected
// client (except the one that made the request, via its X-Socket-Id header)
// that a resource changed, so open dashboards refresh instantly instead of
// requiring a manual reload or re-login. `notifications` is excluded here
// because that controller broadcasts a richer `notification:new` event itself.
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resource = req.baseUrl.replace(/^\/api\//, '');
        if (resource && resource !== 'auth' && resource !== 'notifications') {
          broadcastExcept(req.header('x-socket-id') || undefined, 'data:changed', { resource, method: req.method });
        }
      }
      return originalJson(body);
    }) as typeof res.json;
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/warehouse', warehouseRouter);
app.use('/api/trucks', trucksRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/stores', storesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/prebookings', preBookingsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/system', systemRouter);

app.use(notFoundHandler);
app.use(errorHandler);
