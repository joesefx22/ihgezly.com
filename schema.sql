-- schema.sql
-- قاعدة بيانات: ehgzly_db
-- تشغيل: mysql -u root -p ehgzly_db < schema.sql
-- ملاحظة: يستخدم utf8mb4 لدعم العربية والرموز

SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `ehgzly_db` CHARACTER SET = 'utf8mb4' COLLATE = 'utf8mb4_unicode_ci';
USE `ehgzly_db`;

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `phone` VARCHAR(20) DEFAULT NULL,
  `password` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('user','manager','admin') NOT NULL DEFAULT 'user',
  `approved` TINYINT(1) NOT NULL DEFAULT 0,
  `provider` VARCHAR(50) DEFAULT 'local',
  `emailVerified` TINYINT(1) NOT NULL DEFAULT 0,
  `verificationToken` VARCHAR(255) DEFAULT NULL,
  `googleId` VARCHAR(255) DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME DEFAULT NULL,
  `lastLogin` DATETIME DEFAULT NULL,
  `stats` JSON DEFAULT (JSON_OBJECT('totalBookings',0,'successfulBookings',0,'cancelledBookings',0,'totalSpent',0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ملف التعريف الشخصي
CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `nickname` VARCHAR(100) DEFAULT NULL,
  `age` INT DEFAULT NULL,
  `bio` TEXT DEFAULT '',
  `avatar` VARCHAR(255) DEFAULT NULL,
  `joinDate` DATETIME NOT NULL,
  `lastUpdated` DATETIME NOT NULL,
  INDEX (`userId`),
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جدول الملاعب (يمكن ملؤه من JSON أو يدار من خلال admin)
CREATE TABLE IF NOT EXISTS `pitches` (
  `id` INT NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255),
  `area` VARCHAR(100),
  `type` VARCHAR(50),
  `image` VARCHAR(255),
  `price` INT NOT NULL DEFAULT 0,
  `deposit` INT NOT NULL DEFAULT 0,
  `depositRequired` TINYINT(1) DEFAULT 1,
  `features` JSON DEFAULT '[]',
  `rating` DECIMAL(3,1) DEFAULT 0,
  `totalRatings` INT DEFAULT 0,
  `coordinates` JSON DEFAULT NULL,
  `workingHours` JSON DEFAULT NULL,
  `googleMaps` VARCHAR(512) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جدول الحجوزات
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `pitchId` INT NOT NULL,
  `pitchName` VARCHAR(255) NOT NULL,
  `pitchLocation` VARCHAR(255),
  `pitchPrice` INT NOT NULL,
  `depositAmount` INT DEFAULT 0,
  `date` DATE NOT NULL,
  `time` VARCHAR(10) NOT NULL,
  `customerName` VARCHAR(255) NOT NULL,
  `customerPhone` VARCHAR(50),
  `customerEmail` VARCHAR(255),
  `userId` VARCHAR(36),
  `userType` VARCHAR(50) DEFAULT 'customer',
  `status` VARCHAR(20) DEFAULT 'pending',
  `amount` INT NOT NULL DEFAULT 0,
  `paidAmount` INT DEFAULT 0,
  `remainingAmount` INT DEFAULT 0,
  `finalAmount` INT DEFAULT 0,
  `appliedDiscount` JSON DEFAULT NULL,
  `discountCode` VARCHAR(50) DEFAULT NULL,
  `paymentType` VARCHAR(50) DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME DEFAULT NULL,
  `paymentDeadline` DATETIME DEFAULT NULL,
  `cancellationTime` DATETIME DEFAULT NULL,
  `cancellationReason` TEXT DEFAULT NULL,
  `refundAmount` INT DEFAULT 0,
  `compensationCode` VARCHAR(50) DEFAULT NULL,
  `cancelledBy` VARCHAR(36) DEFAULT NULL,
  INDEX (`userId`),
  INDEX (`pitchId`),
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جدول الدفعات
CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `bookingId` VARCHAR(36),
  `payerName` VARCHAR(255),
  `email` VARCHAR(255),
  `phone` VARCHAR(50),
  `field` VARCHAR(255),
  `hours` INT DEFAULT 1,
  `transactionId` VARCHAR(255),
  `amount` INT NOT NULL DEFAULT 0,
  `paymentType` VARCHAR(50),
  `originalAmount` INT DEFAULT 0,
  `remainingAmount` INT DEFAULT 0,
  `discountApplied` INT DEFAULT 0,
  `provider` VARCHAR(100),
  `providerName` VARCHAR(255),
  `receiptPath` VARCHAR(255),
  `date` DATETIME NOT NULL,
  `status` VARCHAR(50) DEFAULT 'pending',
  INDEX (`bookingId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جدول الأكواد
CREATE TABLE IF NOT EXISTS `discount_codes` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `code` VARCHAR(100) NOT NULL UNIQUE,
  `value` INT NOT NULL DEFAULT 0,
  `type` VARCHAR(50),
  `pitchId` INT DEFAULT NULL,
  `pitchName` VARCHAR(255) DEFAULT NULL,
  `source` VARCHAR(100) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'active',
  `createdAt` DATETIME NOT NULL,
  `expiresAt` DATETIME DEFAULT NULL,
  `usedBy` VARCHAR(36) DEFAULT NULL,
  `usedAt` DATETIME DEFAULT NULL,
  `usedForBooking` VARCHAR(36) DEFAULT NULL,
  `originalBookingId` VARCHAR(36) DEFAULT NULL,
  `originalAmount` INT DEFAULT 0,
  `cancellationType` VARCHAR(50) DEFAULT NULL,
  `message` TEXT DEFAULT NULL,
  `userId` VARCHAR(36) DEFAULT NULL,
  INDEX (`code`),
  INDEX (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جدول التقييمات
CREATE TABLE IF NOT EXISTS `ratings` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `pitchId` INT NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `username` VARCHAR(255),
  `rating` INT NOT NULL,
  `comment` TEXT DEFAULT NULL,
  `bookingId` VARCHAR(36) DEFAULT NULL,
  `createdAt` DATETIME NOT NULL,
  `status` VARCHAR(20) DEFAULT 'active',
  INDEX (`pitchId`),
  INDEX (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- جدول المديرين
CREATE TABLE IF NOT EXISTS `managers` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(36) NOT NULL,
  `pitchIds` TEXT DEFAULT '[]',
  `approved` TINYINT(1) DEFAULT 0,
  `createdAt` DATETIME NOT NULL,
  `approvedAt` DATETIME DEFAULT NULL,
  `approvedBy` VARCHAR(36) DEFAULT NULL,
  INDEX (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- table for express-mysql-session (if you want custom name; library can create automatically)
CREATE TABLE IF NOT EXISTS `sessions` (
  `session_id` varchar(128) NOT NULL,
  `expires` int(11) unsigned DEFAULT NULL,
  `data` text,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
