// routes.js - تجميع المسارات (API Endpoints) - الإصدار النهائي المُصلح

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator');
const passport = require('passport');

// استيراد المكونات الأساسية
const { verifyToken, checkPermissions } = require('./middlewares/auth');
const { uploadSingle } = require('./uploadConfig');
const controllers = require('./controllers');

// دالة مساعدة لمعالجة أخطاء التحقق من الصحة
const { handleValidationErrors } = controllers;

// ===================================
// 👥 مسارات المصادقة (Auth Routes)
// ===================================

// مسار التسجيل (Public)
router.post('/api/signup',
    [
        body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
        body('email').isEmail().withMessage('بريد إلكتروني غير صحيح'),
        body('password').isLength({ min: 6 }).withMessage('يجب أن تكون كلمة المرور 6 أحرف على الأقل'),
        body('role').isIn(['player', 'owner', 'manager']).withMessage('دور المستخدم غير صالح')
    ],
    handleValidationErrors,
    controllers.registerController
);

// مسار تسجيل الدخول (Public)
router.post('/api/login', 
    controllers.loginController
);

// مسار تسجيل الخروج (Authenticated)
router.post('/api/logout', 
    verifyToken,
    controllers.logoutController
);

// جلب بيانات المستخدم الحالي (Authenticated)
router.get('/api/me', 
    verifyToken, 
    controllers.getCurrentUserController
);

// ===================================
// 🏟️ مسارات الملاعب العامة (Public/Player)
// ===================================

// جلب قائمة الملاعب (Public)
router.get('/api/stadiums', 
    controllers.getStadiumsController
);

// جلب تفاصيل ملعب محدد (Public)
router.get('/api/stadiums/:stadiumId', 
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')
    ],
    handleValidationErrors,
    controllers.getStadiumDetailsController
);

// جلب الساعات المتاحة (Public)
router.get('/api/stadiums/:stadiumId/slots', 
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        query('date').isDate().withMessage('التاريخ غير صحيح')
    ],
    handleValidationErrors,
    controllers.getAvailableSlotsController
);

// ===================================
// 📅 مسارات الحجز (Player)
// ===================================

// إنشاء حجز جديد (Authenticated - Player)
router.post('/api/bookings', 
    verifyToken,
    checkPermissions(['player']),
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('صيغة وقت البدء غير صحيحة'),
        body('end_time').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('صيغة وقت الانتهاء غير صحيحة'),
        body('total_price').isFloat({ min: 0 }).withMessage('السعر الإجمالي غير صحيح'),
        body('players_needed').optional().isInt({ min: 0 }).withMessage('عدد اللاعبين المطلوب غير صحيح')
    ],
    handleValidationErrors,
    controllers.createBookingController
);

// جلب حجوزات اللاعب (Authenticated - Player)
router.get('/api/bookings/me', 
    verifyToken,
    checkPermissions(['player']),
    controllers.getUserBookingsController
);

// إلغاء الحجز من قبل اللاعب (Authenticated - Player)
router.delete('/api/bookings/:bookingId/cancel', 
    verifyToken,
    checkPermissions(['player']),
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    handleValidationErrors,
    controllers.cancelBookingPlayerController
);

// ===================================
// 👥 مسارات طلبات اللاعبين (Player Requests)
// ===================================

// إنشاء طلب لاعبين جديد (Authenticated - Player)
router.post('/api/requests',
    verifyToken,
    checkPermissions(['player']),
    [
        body('booking_id').isUUID().withMessage('معرف الحجز غير صحيح'),
        body('players_needed').isInt({ min: 1, max: 10 }).withMessage('عدد اللاعبين المطلوب غير صحيح')
    ],
    handleValidationErrors,
    controllers.createPlayerRequestController
);

// جلب طلبات اللاعبين لحجز معين (Authenticated)
router.get('/api/bookings/:bookingId/requests',
    verifyToken,
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    handleValidationErrors,
    controllers.getRequestsForBookingController
);

// الانضمام لطلب لاعبين (Authenticated - Player)
router.post('/api/requests/:requestId/join',
    verifyToken,
    checkPermissions(['player']),
    [
        param('requestId').isUUID().withMessage('معرف الطلب غير صحيح')
    ],
    handleValidationErrors,
    controllers.joinPlayerRequestController
);

// ===================================
// ⭐ مسارات التقييمات (Ratings)
// ===================================

// إرسال تقييم جديد (Authenticated - Player)
router.post('/api/stadiums/:stadiumId/rate', 
    verifyToken, 
    checkPermissions(['player']),
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('rating').isInt({ min: 1, max: 5 }).withMessage('التقييم يجب أن يكون بين 1 و 5'),
        body('comment').optional().trim().isLength({ max: 500 }).withMessage('التعليق طويل جداً')
    ],
    handleValidationErrors,
    controllers.submitRatingController
);

// ===================================
// 💰 مسارات الدفع والأكواد
// ===================================

// مسار إشعار الدفع (Webhook - Public)
router.post('/api/payment/webhook', 
    controllers.handlePaymentNotificationController
);

// التحقق من صلاحية كود (Authenticated)
router.post('/api/codes/validate',
    verifyToken,
    [
        body('code').trim().notEmpty().withMessage('الكود مطلوب'),
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح')
    ],
    handleValidationErrors,
    controllers.validateCodeController
);

// ===================================
// ⚽ مسارات إدارة الملاعب (Owner/Manager)
// ===================================

// جلب ملاعب المالك (Authenticated - Owner/Manager)
router.get('/api/owner/stadiums', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    controllers.getOwnerStadiumsController
);

// إنشاء ملعب جديد (Authenticated - Owner/Manager)
router.post('/api/owner/stadiums', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    uploadSingle,
    [
        body('name').trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('location').trim().notEmpty().withMessage('الموقع مطلوب'),
        body('type').isIn(['football', 'basketball', 'tennis', 'other']).withMessage('نوع الملعب غير صحيح'),
        body('price_per_hour').isFloat({ gt: 0 }).withMessage('السعر بالساعة يجب أن يكون رقماً موجباً'),
        body('deposit_amount').isFloat({ min: 0 }).withMessage('مبلغ العربون يجب أن يكون رقماً')
    ],
    handleValidationErrors,
    controllers.createStadiumController
);

// تحديث ملعب موجود (Authenticated - Owner/Manager)
router.put('/api/owner/stadiums/:stadiumId',
    verifyToken,
    checkPermissions(['owner', 'manager']),
    uploadSingle,
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('name').optional().trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('price_per_hour').optional().isFloat({ gt: 0 }).withMessage('السعر بالساعة يجب أن يكون رقماً موجباً')
    ],
    handleValidationErrors,
    controllers.updateStadiumController
);

// جلب حجوزات ملعب معين (Authenticated - Owner/Manager)
router.get('/api/owner/stadiums/:stadiumId/bookings', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')
    ],
    handleValidationErrors,
    controllers.getStadiumBookingsOwnerController
);

// تأكيد حجز (Authenticated - Owner/Manager)
router.post('/api/owner/bookings/:bookingId/confirm', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    handleValidationErrors,
    controllers.confirmBookingOwnerController
);

// إلغاء حجز من قبل المالك (Authenticated - Owner/Manager)
router.delete('/api/owner/bookings/:bookingId/cancel', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')
    ],
    handleValidationErrors,
    controllers.cancelBookingOwnerController
);

// حظر ساعة ملعب (Authenticated - Owner/Manager)
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
    handleValidationErrors,
    controllers.blockSlotController
);

// ===================================
// 👑 مسارات لوحة الأدمن (Admin)
// ===================================

// جلب إحصائيات لوحة الأدمن (Authenticated - Admin)
router.get('/api/admin/dashboard/stats', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getAdminDashboardStatsController
);

// جلب سجل النشاط (Authenticated - Admin)
router.get('/api/admin/activity-logs', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getSystemLogsController
);

// جلب المديرين/الملاك المعلقة طلباتهم (Authenticated - Admin)
router.get('/api/admin/managers/pending', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getPendingManagersController
);

// الموافقة على مدير/مالك جديد (Authenticated - Admin)
router.post('/api/admin/managers/:userId/approve', 
    verifyToken,
    checkPermissions(['admin']),
    [
        param('userId').isUUID().withMessage('معرف المستخدم غير صحيح')
    ],
    handleValidationErrors,
    controllers.approveManagerController
);

// جلب جميع المستخدمين (Authenticated - Admin)
router.get('/api/admin/users',
    verifyToken,
    checkPermissions(['admin']),
    controllers.getAllUsersController
);

// تحديث حالة كود (Authenticated - Admin)
router.patch('/api/admin/codes/:codeId/status', 
    verifyToken,
    checkPermissions(['admin']),
    [
        param('codeId').isUUID().withMessage('معرف الكود غير صحيح'),
        body('isActive').isBoolean().withMessage('يجب أن تكون الحالة منطقية (صحيح/خطأ)'),
        body('type').isIn(['compensation', 'discount']).withMessage('نوع الكود غير صالح'),
    ],
    handleValidationErrors,
    controllers.updateCodeStatusController
);

// ===================================
// 🌐 مسارات Google OAuth2 (Public)
// ===================================

// مسار تسجيل الدخول عبر Google
router.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// مسار إعادة التوجيه بعد المصادقة
router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // بعد نجاح المصادقة، إنشاء JWT وإعادة التوجيه
        const token = jwt.sign(
            { id: req.user.id, role: req.user.role, email: req.user.email },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        
        // إعادة التوجيه مع التوكن
        res.redirect(`/auth/success?token=${token}`);
    }
);

// ===================================
// 🩺 مسارات الصحة والمراقبة
// ===================================

// فحص صحة الخدمة (Health Check)
router.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'الخدمة تعمل بشكل طبيعي',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// فحص صحة قاعدة البيانات
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

module.exports = router;
