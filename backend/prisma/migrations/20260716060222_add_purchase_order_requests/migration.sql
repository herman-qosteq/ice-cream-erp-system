-- AlterTable
ALTER TABLE `purchases` ADD COLUMN `bill_file_name` VARCHAR(191) NULL,
    ADD COLUMN `bill_file_type` VARCHAR(191) NULL,
    ADD COLUMN `bill_file_url` LONGTEXT NULL;

-- CreateTable
CREATE TABLE `purchase_order_requests` (
    `id` VARCHAR(191) NOT NULL,
    `order_ref` VARCHAR(191) NOT NULL,
    `supplier_id` VARCHAR(191) NOT NULL,
    `status` ENUM('Pending', 'Fulfilled', 'Cancelled') NOT NULL DEFAULT 'Pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `fulfilled_purchase_id` VARCHAR(191) NULL,

    UNIQUE INDEX `purchase_order_requests_order_ref_key`(`order_ref`),
    UNIQUE INDEX `purchase_order_requests_fulfilled_purchase_id_key`(`fulfilled_purchase_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_order_request_items` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `order_case` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchase_order_requests` ADD CONSTRAINT `purchase_order_requests_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order_requests` ADD CONSTRAINT `purchase_order_requests_fulfilled_purchase_id_fkey` FOREIGN KEY (`fulfilled_purchase_id`) REFERENCES `purchases`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order_request_items` ADD CONSTRAINT `purchase_order_request_items_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `purchase_order_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order_request_items` ADD CONSTRAINT `purchase_order_request_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
