-- DropForeignKey
ALTER TABLE `asset_settlement_items` DROP FOREIGN KEY `asset_settlement_items_product_id_fkey`;

-- DropForeignKey
ALTER TABLE `asset_settlement_items` DROP FOREIGN KEY `asset_settlement_items_settlement_id_fkey`;

-- DropForeignKey
ALTER TABLE `asset_settlements` DROP FOREIGN KEY `asset_settlements_asset_id_fkey`;

-- DropForeignKey
ALTER TABLE `asset_settlements` DROP FOREIGN KEY `asset_settlements_payment_id_fkey`;

-- DropForeignKey
ALTER TABLE `asset_settlements` DROP FOREIGN KEY `asset_settlements_settled_by_fkey`;

-- DropTable
DROP TABLE `asset_settlement_items`;

-- DropTable
DROP TABLE `asset_settlements`;

