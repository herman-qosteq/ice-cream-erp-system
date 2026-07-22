-- AlterTable
ALTER TABLE `categories` ADD COLUMN `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active';
