-- AlterTable
ALTER TABLE `asset_inventory` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `inventory_movements` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `partner_inventory` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `pre_booking_dispatched_items` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `pre_booking_items` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `purchase_items` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `purchase_order_request_items` ADD COLUMN `order_case_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `truck_inventory` ADD COLUMN `quantity_pieces` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `warehouse_inventory` ADD COLUMN `available_pieces` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `damaged_pieces` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `expired_pieces` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `reserved_pieces` INTEGER NOT NULL DEFAULT 0;
