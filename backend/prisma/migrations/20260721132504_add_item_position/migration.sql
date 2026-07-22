-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `position` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `pre_booking_items` ADD COLUMN `position` INTEGER NOT NULL DEFAULT 0;
