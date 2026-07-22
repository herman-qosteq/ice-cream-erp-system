-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `entity_id` VARCHAR(191) NULL,
    ADD COLUMN `entity_type` VARCHAR(191) NULL;
