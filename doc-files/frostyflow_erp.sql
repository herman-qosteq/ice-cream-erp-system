-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: frostyflow_erp
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `_prisma_migrations`
--

DROP TABLE IF EXISTS `_prisma_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `checksum` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logs` text COLLATE utf8mb4_unicode_ci,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `_prisma_migrations`
--

LOCK TABLES `_prisma_migrations` WRITE;
/*!40000 ALTER TABLE `_prisma_migrations` DISABLE KEYS */;
INSERT INTO `_prisma_migrations` VALUES ('fa3a039c-27be-4b6b-9d63-91f4b5fd402c','3986fe87d6aec72b33956efdc5758410d6064145f447c7ba416e5dee088a0a64','2026-07-07 12:34:53.955','20260707050422_init',NULL,NULL,'2026-07-07 12:34:51.155',1);
/*!40000 ALTER TABLE `_prisma_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_name` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_role` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `details` text COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES ('263b0aab-003f-429c-872b-3071f99b702a','USER_EDIT','User','u4','u1','Mayben','Admin','2026-07-09 05:11:12.806','Modified details of operator: Vikram Singh (Driver-2)'),('2df600fc-14f1-44ba-a95b-71e06d686b22','FACTORY_RESET','System','all','u1','Mayben','Admin','2026-07-09 05:08:56.719','Performed factory reset. All databases cleared for a completely new, empty setup.'),('3fc8e4a5-2e52-4aa0-8889-4634ee919134','USER_EDIT','User','u4','u1','Mayben','Admin','2026-07-09 05:10:02.956','Modified details of operator: Vikram Singh'),('4a100858-0ce3-401e-8fe9-fdc2d75a8833','USER_EDIT','User','u1','u1','Mayben','Admin','2026-07-09 05:10:15.476','Modified details of operator: Mayben'),('56880d8a-1824-47bb-bdba-cfc93b052c8b','USER_EDIT','User','u1','u1','Mayben','Admin','2026-07-09 05:10:44.988','Modified details of operator: Mayben (Admin)'),('71a9d8a8-a675-4cd9-9540-b965f042e6f3','USER_EDIT','User','u2','u1','Mayben','Admin','2026-07-09 05:09:32.775','Modified details of operator: Herman (Driver)'),('7c38a50c-3d4a-402b-893b-a639437ddac5','USER_EDIT','User','u4','u1','Mayben','Admin','2026-07-09 05:11:19.074','Modified details of operator: Vikram Singh (Driver-2)'),('cff3c2ae-32b0-4364-b014-cdcb8a2ea724','USER_EDIT','User','u3','u1','Mayben','Admin','2026-07-09 05:09:51.101','Modified details of operator: Darwin (Warehouse)');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `categories_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES ('cat4','Bars'),('cat1','Cups'),('cat5','Popsicles'),('cat2','Sticks'),('cat3','Tubs');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `credit_ledger`
--

DROP TABLE IF EXISTS `credit_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `credit_ledger` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `type` enum('credit','debit') COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reference` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `credit_ledger_store_id_fkey` (`store_id`),
  CONSTRAINT `credit_ledger_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `credit_ledger`
--

LOCK TABLES `credit_ledger` WRITE;
/*!40000 ALTER TABLE `credit_ledger` DISABLE KEYS */;
/*!40000 ALTER TABLE `credit_ledger` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoice_number` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `tax` decimal(10,2) NOT NULL,
  `grand_total` decimal(10,2) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `paid_amount` decimal(10,2) DEFAULT NULL,
  `payment_status` enum('Paid','Partial','Unpaid','Credit') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_method` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoices_order_id_key` (`order_id`),
  UNIQUE KEY `invoices_invoice_number_key` (`invoice_number`),
  CONSTRAINT `invoices_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('low_stock','out_of_stock','expiry','refill','payment_due','payment_received','credit_exceeded','new_order','order_update','delivery','partner_update','product_update','user_update','stock_update','system') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES ('0c72037c-2280-4e6e-9673-3e3c5aa2c707','user_update','Operator account details updated for Vikram Singh (Driver-2).',0,'2026-07-09 05:11:12.844'),('7a3a7991-8127-417a-a424-cbc80886f2b9','user_update','Operator account details updated for Mayben.',0,'2026-07-09 05:10:15.511'),('91d94c47-128b-4332-9ecc-6420315711d4','user_update','Operator account details updated for Herman (Driver).',0,'2026-07-09 05:09:32.813'),('a01f50b8-982d-4063-a4a0-bff3bffbfb40','user_update','Operator account details updated for Darwin (Warehouse).',0,'2026-07-09 05:09:51.142'),('a57badc5-cee0-4a08-b684-beb4eab579d6','user_update','Operator account details updated for Mayben (Admin).',0,'2026-07-09 05:10:45.022'),('df16e1cf-69fc-446b-ac66-80ef56861bdd','user_update','Operator account details updated for Vikram Singh.',0,'2026-07-09 05:10:02.992'),('df1d2814-aa81-4b94-942f-bcfed07ce95b','user_update','Operator account details updated for Vikram Singh (Driver-2).',0,'2026-07-09 05:11:19.108'),('f994a178-c1d4-4d19-b524-2a73ffb00dda','system','Factory reset performed: all orders, invoices, payments, stores, and suppliers were permanently wiped. This cannot be undone.',0,'2026-07-09 05:08:56.759');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `tax_pct` decimal(5,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_items_order_id_fkey` (`order_id`),
  KEY `order_items_product_id_fkey` (`product_id`),
  CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

LOCK TABLES `order_items` WRITE;
/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `salesperson_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `truck_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('Draft','Confirmed','Delivered','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Draft',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `orders_store_id_fkey` (`store_id`),
  KEY `orders_salesperson_id_fkey` (`salesperson_id`),
  KEY `orders_truck_id_fkey` (`truck_id`),
  CONSTRAINT `orders_salesperson_id_fkey` FOREIGN KEY (`salesperson_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `orders_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `orders_truck_id_fkey` FOREIGN KEY (`truck_id`) REFERENCES `trucks` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `method` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `collected_by` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `payments_store_id_fkey` (`store_id`),
  KEY `payments_order_id_fkey` (`order_id`),
  KEY `payments_collected_by_fkey` (`collected_by`),
  CONSTRAINT `payments_collected_by_fkey` FOREIGN KEY (`collected_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pre_booking_dispatched_items`
--

DROP TABLE IF EXISTS `pre_booking_dispatched_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pre_booking_dispatched_items` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pre_booking_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `pre_booking_dispatched_items_pre_booking_id_fkey` (`pre_booking_id`),
  KEY `pre_booking_dispatched_items_product_id_fkey` (`product_id`),
  CONSTRAINT `pre_booking_dispatched_items_pre_booking_id_fkey` FOREIGN KEY (`pre_booking_id`) REFERENCES `pre_booking_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pre_booking_dispatched_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pre_booking_dispatched_items`
--

LOCK TABLES `pre_booking_dispatched_items` WRITE;
/*!40000 ALTER TABLE `pre_booking_dispatched_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `pre_booking_dispatched_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pre_booking_items`
--

DROP TABLE IF EXISTS `pre_booking_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pre_booking_items` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pre_booking_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `tax_pct` decimal(5,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `pre_booking_items_pre_booking_id_fkey` (`pre_booking_id`),
  KEY `pre_booking_items_product_id_fkey` (`product_id`),
  CONSTRAINT `pre_booking_items_pre_booking_id_fkey` FOREIGN KEY (`pre_booking_id`) REFERENCES `pre_booking_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pre_booking_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pre_booking_items`
--

LOCK TABLES `pre_booking_items` WRITE;
/*!40000 ALTER TABLE `pre_booking_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `pre_booking_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pre_booking_orders`
--

DROP TABLE IF EXISTS `pre_booking_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pre_booking_orders` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `salesperson_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `scheduled_delivery_date` date NOT NULL,
  `status` enum('Booked','Delivered','Cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Booked',
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `pre_booking_orders_store_id_fkey` (`store_id`),
  KEY `pre_booking_orders_salesperson_id_fkey` (`salesperson_id`),
  CONSTRAINT `pre_booking_orders_salesperson_id_fkey` FOREIGN KEY (`salesperson_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `pre_booking_orders_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pre_booking_orders`
--

LOCK TABLES `pre_booking_orders` WRITE;
/*!40000 ALTER TABLE `pre_booking_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `pre_booking_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `brand` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` longtext COLLATE utf8mb4_unicode_ci,
  `purchase_price` decimal(10,2) NOT NULL,
  `wholesale_price` decimal(10,2) NOT NULL,
  `selling_price` decimal(10,2) NOT NULL,
  `tax_pct` decimal(5,2) NOT NULL,
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `unit_value` decimal(10,2) NOT NULL,
  `unit_type` enum('ml','L','g','kg','pcs') COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_code_key` (`code`),
  KEY `products_category_id_fkey` (`category_id`),
  CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES ('p1','Classic Vanilla Cup (100ml)','IC-VAN-100','cat1','FrostyFlow Creamery','Smooth, rich vanilla bean ice cream cup.','https://images.unsplash.com/photo-1570145820259-b5b80c5c8bd6?w=200&auto=format&fit=crop',14.00,20.00,28.00,18.00,'Active',100.00,'ml',NULL,'2026-07-07 12:34:55.224','2026-07-07 12:34:55.224'),('p2','Kesar Pista Cup (100ml)','IC-KSR-100','cat1','FrostyFlow Creamery','Saffron and pistachio ice cream cup, a classic Indian favourite.','https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=200&auto=format&fit=crop',18.00,26.00,35.00,18.00,'Active',100.00,'ml',NULL,'2026-07-07 12:34:55.231','2026-07-07 12:34:55.231'),('p3','Chocolate Crunch Stick','IC-CHO-STK','cat2','FrostyFlow Creamery','Chocolate ice cream stick coated in a crunchy chocolate shell.','https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=200&auto=format&fit=crop',10.00,15.00,20.00,18.00,'Active',1.00,'pcs',NULL,'2026-07-07 12:34:55.237','2026-07-07 12:34:55.237'),('p4','Mango Kulfi Stick','IC-KUL-STK','cat2','Rajwada Kulfi','Traditional mawa-mango kulfi on a stick.','https://images.unsplash.com/photo-1580915411954-282cb1bc3978?w=200&auto=format&fit=crop',12.00,18.00,25.00,18.00,'Active',1.00,'pcs',NULL,'2026-07-07 12:34:55.242','2026-07-07 12:34:55.242'),('p5','Butterscotch Tub (1L)','IC-BUT-TUB','cat3','Creamy Royale','Buttery caramel ice cream loaded with praline crunch, family tub.','https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=200&auto=format&fit=crop',110.00,150.00,199.00,18.00,'Active',1.00,'L',NULL,'2026-07-07 12:34:55.247','2026-07-07 12:34:55.247'),('p6','Belgian Chocolate Tub (1L)','IC-CHO-TUB','cat3','Creamy Royale','Premium dark Belgian chocolate tub for family sharing.','https://images.unsplash.com/photo-1580915411954-282cb1bc3978?w=200&auto=format&fit=crop',130.00,175.00,230.00,18.00,'Active',1.00,'L',NULL,'2026-07-07 12:34:55.253','2026-07-07 12:34:55.253'),('p7','Alphonso Mango Bar','IC-MNG-BAR','cat4','Ratnagiri Fresh','100% real Ratnagiri Alphonso mango pulp bar.','https://images.unsplash.com/photo-1505394033343-40a290cf7a0c?w=200&auto=format&fit=crop',15.00,22.00,30.00,18.00,'Active',1.00,'pcs',NULL,'2026-07-07 12:34:55.258','2026-07-07 12:34:55.258'),('p8','Rose Falooda Popsicle','IC-ROS-POP','cat5','Fruity Splash','Rose and falooda flavoured frozen popsicle.','https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=200&auto=format&fit=crop',8.00,12.00,18.00,18.00,'Active',1.00,'pcs',NULL,'2026-07-07 12:34:55.263','2026-07-07 12:34:55.263');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_items`
--

DROP TABLE IF EXISTS `purchase_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_items` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purchase_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL,
  `purchase_price` decimal(10,2) NOT NULL,
  `mfg_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_items_purchase_id_fkey` (`purchase_id`),
  KEY `purchase_items_product_id_fkey` (`product_id`),
  CONSTRAINT `purchase_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `purchase_items_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_items`
--

LOCK TABLES `purchase_items` WRITE;
/*!40000 ALTER TABLE `purchase_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchases`
--

DROP TABLE IF EXISTS `purchases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchases` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoice_number` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `purchases_supplier_id_fkey` (`supplier_id`),
  CONSTRAINT `purchases_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchases`
--

LOCK TABLES `purchases` WRITE;
/*!40000 ALTER TABLE `purchases` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `qr_code_settings`
--

DROP TABLE IF EXISTS `qr_code_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qr_code_settings` (
  `id` int NOT NULL DEFAULT '1',
  `image_url` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qr_code_settings`
--

LOCK TABLES `qr_code_settings` WRITE;
/*!40000 ALTER TABLE `qr_code_settings` DISABLE KEYS */;
INSERT INTO `qr_code_settings` VALUES (1,'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=upi://pay?pa=frostyflow@upi&pn=FrostyFlow%20Ice%20Cream%20Distributors&am=0&cu=INR',1);
/*!40000 ALTER TABLE `qr_code_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `scheduled_prices`
--

DROP TABLE IF EXISTS `scheduled_prices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `scheduled_prices` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purchase_price` decimal(10,2) NOT NULL,
  `selling_price` decimal(10,2) NOT NULL,
  `effective_date` date NOT NULL,
  `applied` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `scheduled_prices_product_id_fkey` (`product_id`),
  CONSTRAINT `scheduled_prices_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `scheduled_prices`
--

LOCK TABLES `scheduled_prices` WRITE;
/*!40000 ALTER TABLE `scheduled_prices` DISABLE KEYS */;
/*!40000 ALTER TABLE `scheduled_prices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `store_visits`
--

DROP TABLE IF EXISTS `store_visits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `store_visits` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `store_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `salesperson_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `notes` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `follow_up_date` date DEFAULT NULL,
  `completed` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `store_visits_store_id_fkey` (`store_id`),
  KEY `store_visits_salesperson_id_fkey` (`salesperson_id`),
  CONSTRAINT `store_visits_salesperson_id_fkey` FOREIGN KEY (`salesperson_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `store_visits_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `store_visits`
--

LOCK TABLES `store_visits` WRITE;
/*!40000 ALTER TABLE `store_visits` DISABLE KEYS */;
/*!40000 ALTER TABLE `store_visits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stores`
--

DROP TABLE IF EXISTS `stores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stores` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alt_phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `area` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pincode` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gst_number` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `credit_limit` decimal(10,2) NOT NULL,
  `outstanding_balance` decimal(10,2) NOT NULL DEFAULT '0.00',
  `refill_frequency` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `custom_days` int DEFAULT NULL,
  `last_purchase_date` date DEFAULT NULL,
  `next_refill_date` date DEFAULT NULL,
  `ranking` enum('Platinum','Gold','Silver','Bronze') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Bronze',
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stores`
--

LOCK TABLES `stores` WRITE;
/*!40000 ALTER TABLE `stores` DISABLE KEYS */;
/*!40000 ALTER TABLE `stores` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_queue`
--

DROP TABLE IF EXISTS `sync_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sync_queue` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` json NOT NULL,
  `timestamp` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_queue`
--

LOCK TABLES `sync_queue` WRITE;
/*!40000 ALTER TABLE `sync_queue` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `truck_inventory`
--

DROP TABLE IF EXISTS `truck_inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `truck_inventory` (
  `truck_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`truck_id`,`product_id`),
  KEY `truck_inventory_product_id_fkey` (`product_id`),
  CONSTRAINT `truck_inventory_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `truck_inventory_truck_id_fkey` FOREIGN KEY (`truck_id`) REFERENCES `trucks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `truck_inventory`
--

LOCK TABLES `truck_inventory` WRITE;
/*!40000 ALTER TABLE `truck_inventory` DISABLE KEYS */;
/*!40000 ALTER TABLE `truck_inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `trucks`
--

DROP TABLE IF EXISTS `trucks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `trucks` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_number` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `driver_user_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `route` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `area` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trucks_vehicle_number_key` (`vehicle_number`),
  KEY `trucks_driver_user_id_fkey` (`driver_user_id`),
  CONSTRAINT `trucks_driver_user_id_fkey` FOREIGN KEY (`driver_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `trucks`
--

LOCK TABLES `trucks` WRITE;
/*!40000 ALTER TABLE `trucks` DISABLE KEYS */;
INSERT INTO `trucks` VALUES ('t1','MH12 AB 4521','u2','Route A - Deccan & Kothrud','Deccan Gymkhana / Kothrud','Active','2026-07-07 12:34:55.333','2026-07-07 12:34:55.333'),('t2','MH14 CD 7789','u4','Route B - Hinjewadi & Viman Nagar','Hinjewadi Phase 1 / Viman Nagar','Active','2026-07-07 12:34:55.340','2026-07-07 12:34:55.340');
/*!40000 ALTER TABLE `trucks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('Admin','Salesperson','Warehouse') COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_phone_key` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('u1','Mayben (Admin)','+91 98765 43210','Admin','$2a$10$0Bz1fSyy24lY/kb7hVsG8OCk.re8PrD0kEJwTGHUWNXa6FGMF3Ahi','Active','2026-07-07 12:34:55.201','2026-07-09 05:10:44.980'),('u2','Herman (Driver)','+91 91234 56789','Salesperson','$2a$10$D2yKqbog8dBj7iORk52kruFXdcjX.VbvS2/jHytCVCuKWJLw/29l.','Active','2026-07-07 12:34:55.208','2026-07-09 05:09:32.765'),('u3','Darwin (Warehouse)','+91 99887 76655','Warehouse','$2a$10$un75Ls0e1BOhY.MOskFiB.ZWyiiGw/SVrLw2dhT/OonI5wiFHPLj6','Active','2026-07-07 12:34:55.213','2026-07-09 05:09:51.092'),('u4','Vikram Singh (Driver-2)','+91 90909 12345','Salesperson','$2a$10$8Cv3xWkJulNKVNFS/mVvLuXOql9l4p8Cs/28aE8fJEkLpoMRUNzzi','Active','2026-07-07 12:34:55.219','2026-07-09 05:11:19.066');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `warehouse_inventory`
--

DROP TABLE IF EXISTS `warehouse_inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `warehouse_inventory` (
  `product_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `available_qty` int NOT NULL DEFAULT '0',
  `reserved_qty` int NOT NULL DEFAULT '0',
  `damaged_qty` int NOT NULL DEFAULT '0',
  `expired_qty` int NOT NULL DEFAULT '0',
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`product_id`),
  CONSTRAINT `warehouse_inventory_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `warehouse_inventory`
--

LOCK TABLES `warehouse_inventory` WRITE;
/*!40000 ALTER TABLE `warehouse_inventory` DISABLE KEYS */;
INSERT INTO `warehouse_inventory` VALUES ('p1',0,0,0,0,'2026-07-09 05:08:56.717'),('p2',0,0,0,0,'2026-07-09 05:08:56.717'),('p3',0,0,0,0,'2026-07-09 05:08:56.717'),('p4',0,0,0,0,'2026-07-09 05:08:56.717'),('p5',0,0,0,0,'2026-07-09 05:08:56.717'),('p6',0,0,0,0,'2026-07-09 05:08:56.717'),('p7',0,0,0,0,'2026-07-09 05:08:56.717'),('p8',0,0,0,0,'2026-07-09 05:08:56.717');
/*!40000 ALTER TABLE `warehouse_inventory` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-09 11:18:11
