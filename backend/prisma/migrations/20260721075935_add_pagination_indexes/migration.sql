-- CreateIndex
CREATE INDEX `audit_logs_timestamp_id_idx` ON `audit_logs`(`timestamp`, `id`);

-- CreateIndex
CREATE INDEX `audit_logs_entity_type_entity_id_idx` ON `audit_logs`(`entity_type`, `entity_id`);

-- CreateIndex
CREATE INDEX `invoices_created_at_idx` ON `invoices`(`created_at`);

-- CreateIndex
CREATE INDEX `invoices_payment_status_idx` ON `invoices`(`payment_status`);

-- CreateIndex
CREATE INDEX `notifications_created_at_idx` ON `notifications`(`created_at`);

-- CreateIndex
CREATE INDEX `notifications_is_read_idx` ON `notifications`(`is_read`);

-- CreateIndex
CREATE INDEX `notifications_entity_type_entity_id_idx` ON `notifications`(`entity_type`, `entity_id`);

-- CreateIndex
CREATE INDEX `orders_created_at_idx` ON `orders`(`created_at`);

-- CreateIndex
CREATE INDEX `orders_status_idx` ON `orders`(`status`);

-- CreateIndex
CREATE INDEX `orders_status_created_at_idx` ON `orders`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `payments_date_idx` ON `payments`(`date`);

-- CreateIndex
CREATE INDEX `pre_booking_orders_created_at_idx` ON `pre_booking_orders`(`created_at`);

-- CreateIndex
CREATE INDEX `pre_booking_orders_status_idx` ON `pre_booking_orders`(`status`);

-- CreateIndex
CREATE INDEX `pre_booking_orders_scheduled_delivery_date_idx` ON `pre_booking_orders`(`scheduled_delivery_date`);

-- CreateIndex
CREATE INDEX `pre_booking_orders_status_scheduled_delivery_date_idx` ON `pre_booking_orders`(`status`, `scheduled_delivery_date`);

-- CreateIndex
CREATE INDEX `purchases_date_idx` ON `purchases`(`date`);

-- CreateIndex
CREATE INDEX `purchases_invoice_number_idx` ON `purchases`(`invoice_number`);
