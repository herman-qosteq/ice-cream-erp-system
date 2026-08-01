-- DropForeignKey
ALTER TABLE `trucks` DROP FOREIGN KEY `trucks_driver_user_id_fkey`;

-- AlterTable
ALTER TABLE `trucks` MODIFY `driver_user_id` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `trucks` ADD CONSTRAINT `trucks_driver_user_id_fkey` FOREIGN KEY (`driver_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
