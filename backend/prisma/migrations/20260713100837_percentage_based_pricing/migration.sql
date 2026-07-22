-- AlterTable: introduce percentage-based pricing (MRP + discount %) in place
-- of independently-set fixed purchase/wholesale/selling prices. New columns
-- are added nullable first so the backfill below can populate them from the
-- existing fixed prices before they're made required.
ALTER TABLE `products`
    ADD COLUMN `mrp` DECIMAL(10, 2) NULL,
    ADD COLUMN `purchase_discount_pct` DECIMAL(5, 2) NULL,
    ADD COLUMN `wholesale_discount_pct` DECIMAL(5, 2) NULL,
    ADD COLUMN `retail_discount_pct` DECIMAL(5, 2) NULL;

-- Backfill: treat the existing selling_price as the MRP (retail_discount_pct
-- = 0), then derive purchase/wholesale discount % as how far below that MRP
-- those fixed prices sat. Clamped to [0, 100] in case any legacy row had a
-- purchase/wholesale price above its selling price.
UPDATE `products`
SET
    `mrp` = `selling_price`,
    `retail_discount_pct` = 0,
    `wholesale_discount_pct` = CASE
        WHEN `selling_price` <= 0 THEN 0
        ELSE LEAST(100, GREATEST(0, ROUND((1 - (`wholesale_price` / `selling_price`)) * 100, 2)))
    END,
    `purchase_discount_pct` = CASE
        WHEN `selling_price` <= 0 THEN 0
        ELSE LEAST(100, GREATEST(0, ROUND((1 - (`purchase_price` / `selling_price`)) * 100, 2)))
    END;

-- Now that every row has been backfilled, make the new columns required.
ALTER TABLE `products`
    MODIFY `mrp` DECIMAL(10, 2) NOT NULL,
    MODIFY `purchase_discount_pct` DECIMAL(5, 2) NOT NULL,
    MODIFY `wholesale_discount_pct` DECIMAL(5, 2) NOT NULL,
    MODIFY `retail_discount_pct` DECIMAL(5, 2) NOT NULL;

-- Drop the old fixed-price columns now that MRP + discount % are the single
-- source of truth; purchase/wholesale/selling prices are computed on read.
ALTER TABLE `products`
    DROP COLUMN `purchase_price`,
    DROP COLUMN `wholesale_price`,
    DROP COLUMN `selling_price`;
