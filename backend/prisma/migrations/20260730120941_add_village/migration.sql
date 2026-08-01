-- AlterTable
ALTER TABLE `stores` ADD COLUMN `village` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `villages` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `villages_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
