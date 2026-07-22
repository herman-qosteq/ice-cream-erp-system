-- CreateTable
CREATE TABLE `store_pricing` (
    `id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `product_id` VARCHAR(191) NOT NULL,
    `wholesale_discount_pct` DECIMAL(5, 2) NULL,
    `retail_discount_pct` DECIMAL(5, 2) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `store_pricing_store_id_product_id_key`(`store_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_pricing` ADD CONSTRAINT `store_pricing_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_pricing` ADD CONSTRAINT `store_pricing_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
