-- AlterTable
ALTER TABLE `stores` ADD COLUMN `partner_type` VARCHAR(191) NOT NULL DEFAULT 'Retail Shop';

-- CreateTable
CREATE TABLE `partner_types` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `partner_types_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_types` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `asset_types_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `asset_type` VARCHAR(191) NOT NULL,
    `serial_number` VARCHAR(191) NULL,
    `capacity` VARCHAR(191) NULL,
    `status` ENUM('Warehouse', 'Assigned', 'Maintenance', 'Returned', 'Lost', 'Inactive') NOT NULL DEFAULT 'Warehouse',
    `location_type` ENUM('Warehouse', 'Truck', 'Partner', 'Asset') NOT NULL DEFAULT 'Warehouse',
    `location_id` VARCHAR(191) NULL,
    `assigned_partner_id` VARCHAR(191) NULL,
    `assigned_date` DATE NULL,
    `last_service_date` DATE NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_code_key`(`code`),
    INDEX `assets_status_idx`(`status`),
    INDEX `assets_asset_type_idx`(`asset_type`),
    INDEX `assets_assigned_partner_id_idx`(`assigned_partner_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_assignment_history` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `event_type` ENUM('Assigned', 'Returned', 'MaintenanceStart', 'MaintenanceEnd', 'MarkedLost', 'Reactivated', 'Deactivated') NOT NULL,
    `partner_id` VARCHAR(191) NULL,
    `from_status` ENUM('Warehouse', 'Assigned', 'Maintenance', 'Returned', 'Lost', 'Inactive') NULL,
    `to_status` ENUM('Warehouse', 'Assigned', 'Maintenance', 'Returned', 'Lost', 'Inactive') NOT NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actor_id` VARCHAR(191) NOT NULL,
    `actor_name` VARCHAR(191) NULL,
    `actor_role` VARCHAR(191) NULL,
    `notes` TEXT NULL,

    INDEX `asset_assignment_history_asset_id_date_idx`(`asset_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_inventory` (
    `partner_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`partner_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_inventory` (
    `asset_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`asset_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` VARCHAR(191) NOT NULL,
    `from_location_type` ENUM('Warehouse', 'Truck', 'Partner', 'Asset') NOT NULL,
    `from_location_id` VARCHAR(191) NULL,
    `to_location_type` ENUM('Warehouse', 'Truck', 'Partner', 'Asset') NOT NULL,
    `to_location_id` VARCHAR(191) NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` TEXT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `actor_name` VARCHAR(191) NULL,
    `actor_role` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_movements_created_at_idx`(`created_at`),
    INDEX `inventory_movements_from_location_type_from_location_id_idx`(`from_location_type`, `from_location_id`),
    INDEX `inventory_movements_to_location_type_to_location_id_idx`(`to_location_type`, `to_location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_settlements` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `settlement_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `collected_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `payment_method` VARCHAR(191) NULL,
    `settled_by` VARCHAR(191) NOT NULL,
    `payment_id` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `asset_settlements_payment_id_key`(`payment_id`),
    INDEX `asset_settlements_asset_id_settlement_date_idx`(`asset_id`, `settlement_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_settlement_items` (
    `id` VARCHAR(191) NOT NULL,
    `settlement_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `opening_qty` INTEGER NOT NULL,
    `loaded_qty` INTEGER NOT NULL,
    `sold_qty` INTEGER NOT NULL,
    `returned_qty` INTEGER NOT NULL,
    `damaged_qty` INTEGER NOT NULL,
    `expired_qty` INTEGER NOT NULL,
    `closing_qty` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_assigned_partner_id_fkey` FOREIGN KEY (`assigned_partner_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_assignment_history` ADD CONSTRAINT `asset_assignment_history_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_assignment_history` ADD CONSTRAINT `asset_assignment_history_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_inventory` ADD CONSTRAINT `partner_inventory_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `partner_inventory` ADD CONSTRAINT `partner_inventory_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_inventory` ADD CONSTRAINT `asset_inventory_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_inventory` ADD CONSTRAINT `asset_inventory_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_settlements` ADD CONSTRAINT `asset_settlements_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_settlements` ADD CONSTRAINT `asset_settlements_settled_by_fkey` FOREIGN KEY (`settled_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_settlements` ADD CONSTRAINT `asset_settlements_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_settlement_items` ADD CONSTRAINT `asset_settlement_items_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `asset_settlements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_settlement_items` ADD CONSTRAINT `asset_settlement_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
