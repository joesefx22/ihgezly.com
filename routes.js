// routes.js - تجميع المسارات (API Endpoints) - الإصدار النهائي المُصلح

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');

// استيراد المكونات الأساسية
const { verifyToken, checkPermissions, checkStadiumOwnership, checkBookingOwnership } = require('./middleware');
const controllers = require('./controllers');

// ===================================
// 👥 مسارات المصادقة (Auth Routes)
// ===================================

router.post('/api/signup',
    [
        body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
        body('email').isEmail().withMessage('بريد إلكتروني غير صحيح'),
        body('password').isLength({ min: 6 }).withMessage('يجب أن تكون كلمة المرور 6 أحرف على الأقل'),
        body('role').isIn(['player', 'owner', 'manager']).withMessage('دور المستخدم غير صالح')
    ],
    controllers.handleValidationErrors,
    controllers.registerController
);

router.post('/api/login', 
    [
        body('email').isEmail().withMessage('بريد إلكتروني غير صحيح'),
        body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
    ],
    controllers.handleValidationErrors,
    controllers.loginController
);

router.post('/api/logout', 
    verifyToken,
    controllers.logoutController
);

router.get('/api/me', 
    verifyToken, 
    controllers.getCurrentUserController
);

// ===================================
// 🏟️ مسارات الملاعب العامة (Public/Player)
// ===================================

router.get('/api/stadiums', 
    controllers.getStadiumsController
);

router.get('/api/stadiums/:stadiumId', 
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.getStadiumDetailsController
);

router.get('/api/stadiums/:stadiumId/slots', 
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        query('date').isDate().withMessage('التاريخ غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.getAvailableSlotsController
);

// ===================================
// 📅 مسارات الحجز (Player)
// ===================================

router.post('/api/bookings', 
    verifyToken,
    checkPermissions(['player']),
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('slot_id').optional().isUUID().withMessage('معرف الساعة غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('صيغة وقت البدء غير صحيحة'),
        body('end_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('صيغة وقت الانتهاء غير صحيحة'),
        body('payment_method').isIn(['online', 'code']).withMessage('طريقة الدفع غير صحيحة'),
        body('code').optional().trim().isLength({ min: 1 }).withMessage('الكود مطلوب'),
        body('players_needed').optional().isInt({ min: 0 }).withMessage('عدد اللاعبين المطلوب غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.createBookingController
);

router.get('/api/bookings/me', 
    verifyToken,
    checkPermissions(['player']),
    controllers.getUserBookingsController
);

router.delete('/api/bookings/:bookingId/cancel', 
    verifyToken,
    checkPermissions(['player']),
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    controllers.handleValidationErrors,
    checkBookingOwnership, // 🚨 إضافة ownership check
    controllers.cancelBookingPlayerController
);

// ===================================
// 👥 مسارات طلبات اللاعبين (Player Requests)
// ===================================

router.post('/api/requests',
    verifyToken,
    checkPermissions(['player']),
    [
        body('booking_id').isUUID().withMessage('معرف الحجز غير صحيح'),
        body('players_needed').isInt({ min: 1, max: 10 }).withMessage('عدد اللاعبين المطلوب غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.createPlayerRequestController
);

router.get('/api/bookings/:bookingId/requests',
    verifyToken,
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.getRequestsForBookingController
);

router.post('/api/requests/:requestId/join',
    verifyToken,
    checkPermissions(['player']),
    [
        param('requestId').isUUID().withMessage('معرف الطلب غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.joinPlayerRequestController
);

// ===================================
// ⭐ مسارات التقييمات (Ratings)
// ===================================

router.post('/api/stadiums/:stadiumId/rate', 
    verifyToken, 
    checkPermissions(['player']),
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('rating').isInt({ min: 1, max: 5 }).withMessage('التقييم يجب أن يكون بين 1 و 5'),
        body('comment').optional().trim().isLength({ max: 500 }).withMessage('التعليق طويل جداً')
    ],
    controllers.handleValidationErrors,
    controllers.submitRatingController
);

// ===================================
// 💰 مسارات الدفع والأكواد
// ===================================

router.post('/api/payment/webhook', 
    controllers.handlePaymentNotificationController
);

router.post('/api/codes/validate',
    verifyToken,
    [
        body('code').trim().notEmpty().withMessage('الكود مطلوب'),
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.validateCodeController
);

// ===================================
// ⚽ مسارات إدارة الملاعب (Owner/Manager)
// ===================================

router.get('/api/owner/stadiums', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    controllers.getOwnerStadiumsController
);

router.post('/api/owner/stadiums', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        body('name').trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('location').trim().notEmpty().withMessage('الموقع مطلوب'),
        body('type').isIn(['football', 'basketball', 'tennis', 'other']).withMessage('نوع الملعب غير صحيح'),
        body('price_per_hour').isFloat({ gt: 0 }).withMessage('السعر بالساعة يجب أن يكون رقماً موجباً'),
        body('deposit_amount').isFloat({ min: 0 }).withMessage('مبلغ العربون يجب أن يكون رقماً')
    ],
    controllers.handleValidationErrors,
    controllers.createStadiumController
);

router.put('/api/owner/stadiums/:stadiumId',
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('name').optional().trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('price_per_hour').optional().isFloat({ gt: 0 }).withMessage('السعر بالساعة يجب أن يكون رقماً موجباً')
    ],
    controllers.handleValidationErrors,
    checkStadiumOwnership, // 🚨 إضافة ownership check
    controllers.updateStadiumController
);

router.get('/api/owner/stadiums/:stadiumId/bookings', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')
    ],
    controllers.handleValidationErrors,
    checkStadiumOwnership, // 🚨 إضافة ownership check
    controllers.getStadiumBookingsOwnerController
);

router.post('/api/owner/bookings/:bookingId/confirm', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    controllers.handleValidationErrors,
    checkBookingOwnership, // 🚨 إضافة ownership check
    controllers.confirmBookingOwnerController
);

router.delete('/api/owner/bookings/:bookingId/cancel', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    controllers.handleValidationErrors,
    checkBookingOwnership, // 🚨 إضافة ownership check
    controllers.cancelBookingOwnerController
);

router.post('/api/owner/slots/block', 
    verifyToken, 
    checkPermissions(['owner', 'manager']), 
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('صيغة وقت البدء غير صحيحة'),
        body('end_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('صيغة وقت الانتهاء غير صحيحة'),
        body('reason').optional().trim().isLength({ max: 255 }).withMessage('السبب طويل جداً')
    ],
    controllers.handleValidationErrors,
    checkStadiumOwnership, // 🚨 إضافة ownership check
    controllers.blockSlotController
);

// ===================================
// 🆕 المسارات الجديدة للموظفين
// ===================================

router.get('/api/employee/stadiums', 
    verifyToken,
    checkPermissions(['manager']),
    controllers.getEmployeeStadiumsController
);

router.post('/api/owner/stadiums/:stadiumId/generate-slots',
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('startDate').isDate().withMessage('تاريخ البدء غير صحيح'),
        body('endDate').isDate().withMessage('تاريخ الانتهاء غير صحيح')
    ],
    controllers.handleValidationErrors,
    checkStadiumOwnership, // 🚨 إضافة ownership check
    controllers.generateSlotsController
);

// ===================================
// 👑 مسارات لوحة الأدمن (Admin)
// ===================================

router.get('/api/admin/dashboard/stats', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getAdminDashboardStatsController
);

router.get('/api/admin/activity-logs', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getSystemLogsController
);

router.get('/api/admin/managers/pending', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getPendingManagersController
);

router.post('/api/admin/managers/:userId/approve', 
    verifyToken,
    checkPermissions(['admin']),
    [
        param('userId').isUUID().withMessage('معرف المستخدم غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.approveManagerController
);

router.get('/api/admin/users',
    verifyToken,
    checkPermissions(['admin']),
    controllers.getAllUsersController
);

router.patch('/api/admin/codes/:codeId/status', 
    verifyToken,
    checkPermissions(['admin']),
    [
        param('codeId').isUUID().withMessage('معرف الكود غير صحيح'),
        body('isActive').isBoolean().withMessage('يجب أن تكون الحالة منطقية (صحيح/خطأ)')
    ],
    controllers.handleValidationErrors,
    controllers.updateCodeStatusController
);

router.post('/api/admin/employees/assign',
    verifyToken,
    checkPermissions(['admin']),
    [
        body('userId').isUUID().withMessage('معرف المستخدم غير صحيح'),
        body('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('role').isIn(['manager', 'employee']).withMessage('الدور غير صحيح')
    ],
    controllers.handleValidationErrors,
    controllers.assignEmployeeController
);

router.post('/api/admin/codes/generate',
    verifyToken,
    checkPermissions(['admin']),
    [
        body('fieldId').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('type').isIn(['payment', 'discount']).withMessage('نوع الكود غير صحيح'),
        body('count').isInt({ min: 1, max: 100 }).withMessage('العدد يجب أن يكون بين 1 و 100'),
        body('amount').optional().isFloat({ min: 0 }).withMessage('المبلغ يجب أن يكون رقماً موجباً'),
        body('percent').optional().isInt({ min: 1, max: 100 }).withMessage('النسبة يجب أن تكون بين 1 و 100')
    ],
    controllers.handleValidationErrors,
    controllers.generateCodesController
);

// ===================================
// 🩺 مسارات الصحة والمراقبة
// ===================================

router.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'الخدمة تعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

router.get('/health/db', async (req, res) => {
    try {
        const { healthCheck } = require('./db');
        const dbStatus = await healthCheck();
        res.json({ 
            success: true, 
            database: dbStatus 
        });
    } catch (error) {
        res.status(503).json({ 
            success: false, 
            message: 'فشل في الاتصال بقاعدة البيانات',
            error: error.message 
        });
    }
});

// ===================================
// 🎯 مسارات التوجيه للداشبوردات
// ===================================

const path = require('path');

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

router.get('/employee/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/employee-dashboard.html'));
});

router.get('/owner/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/owner-dashboard.html'));
});

router.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin-dashboard.html'));
});

router.get('/pending-approval', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pending-approval.html'));
});

module.exports = router;
