-- AlterTable
ALTER TABLE `pre_booking_orders` ADD COLUMN `fulfilled_order_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `pre_booking_orders_fulfilled_order_id_key` ON `pre_booking_orders`(`fulfilled_order_id`);

-- AddForeignKey
ALTER TABLE `pre_booking_orders` ADD CONSTRAINT `pre_booking_orders_fulfilled_order_id_fkey` FOREIGN KEY (`fulfilled_order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
