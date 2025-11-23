// routes.js - تجميع المسارات (API Endpoints) وتطبيق الـ Middlewares

const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const passport = require('passport');

// استيراد المكونات الأساسية
const { csrfProtection } = require('./server'); // CSRF يُستورد من server.js (حيث تم تهيئته)
const { verifyToken, checkPermissions } = require('./middlewares/auth'); // مصادقة وتصريح (Auth/Permissions)
const { uploadSingle } = require('./uploadConfig'); // لرفع الصور (Multer)
const controllers = require('./controllers'); // المتحكمات الموحدة

// دالة مساعدة لمعالجة أخطاء التحقق من الصحة
const { handleValidationErrors } = controllers;


// ===================================
// 👥 مسارات المصادقة (Auth Routes)
// ===================================

// مسار جلب توكن CSRF
router.get('/api/csrf-token', csrfProtection, (req, res) => {
    // يجب أن يكون CSRF مُهيئاً ليعمل، ويضع التوكن في req.csrfToken()
    res.json({ csrfToken: req.csrfToken() }); 
});

// مسار التسجيل (Public)
router.post('/api/signup',
    csrfProtection,
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
    csrfProtection,
    controllers.loginController // يستخدم passport.authenticate محلياً
);

// مسار تسجيل الخروج (Authenticated)
router.post('/api/logout', 
    verifyToken,
    controllers.logoutController
);

// جلب بيانات المستخدم الحالي (Authenticated)
router.get('/api/me', verifyToken, controllers.getCurrentUserController);


// ===================================
// 🏟️ مسارات الملاعب العامة (Public/Player)
// ===================================

// جلب قائمة الملاعب (Public)
router.get('/api/stadiums', controllers.getStadiumsController);

// جلب تفاصيل ملعب محدد (Public)
router.get('/api/stadiums/:stadiumId', controllers.getStadiumDetailsController);

// جلب الساعات المتاحة (Public)
router.get('/api/stadiums/:stadiumId/slots', [
    query('date').isDate().withMessage('التاريخ غير صحيح')
], handleValidationErrors, controllers.getAvailableSlotsController);


// ===================================
// 💰 مسارات الدفع والأكواد (Player & Public)
// ===================================

/**
 * 💡 المسار الحساس: إشعار الدفع الفوري (Webhook)
 * يجب أن لا يتطلب مصادقة (verifyToken) ولا حماية CSRF
 * يجب أن يتم التحقق من التوقيع السري داخل المتحكم (controllers)
 */
router.post('/api/payment/webhook', 
    controllers.handlePaymentNotificationController
);

// التحقق من صلاحية كود خصم/تعويض قبل الحجز (Authenticated)
router.post('/api/codes/validate',
    verifyToken,
    csrfProtection,
    [
        body('code').trim().notEmpty().withMessage('الكود مطلوب'),
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح')
    ],
    handleValidationErrors,
    controllers.validateCodeController
);


// ===================================
// 📅 مسارات الحجز (Booking Routes - Player)
// ===================================

// إنشاء حجز جديد (Authenticated - Player)
router.post('/api/bookings', 
    verifyToken,
    csrfProtection,
    checkPermissions(['player']),
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة الوقت غير صحيحة'),
        body('end_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة الوقت غير صحيحة'),
        body('code').optional().trim().isLength({ max: 50 }).withMessage('الكود طويل جداً')
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
    csrfProtection,
    checkPermissions(['player']),
    controllers.cancelBookingPlayerController
);


// ===================================
// 👥 مسارات طلبات اللاعبين (Player Requests)
// ===================================

// إنشاء طلب لاعبين جديد لحجز معين (Authenticated - Player)
router.post('/api/requests',
    verifyToken,
    csrfProtection,
    checkPermissions(['player']),
    [
        body('booking_id').isUUID().withMessage('معرف الحجز غير صحيح'),
        body('players_needed').isInt({ min: 1, max: 10 }).withMessage('عدد اللاعبين المطلوب غير صحيح')
    ],
    handleValidationErrors,
    controllers.createPlayerRequestController
);

// جلب طلبات اللاعبين لحجز معين (Authenticated - Requester/Owner/Manager)
router.get('/api/bookings/:bookingId/requests',
    verifyToken,
    checkPermissions(['player', 'owner', 'manager']),
    controllers.getRequestsForBookingController
);

// الانضمام لطلب لاعبين (Authenticated - Player)
router.post('/api/requests/:requestId/join',
    verifyToken,
    csrfProtection,
    checkPermissions(['player']),
    controllers.joinPlayerRequestController
);


// ===================================
// ⭐ مسارات التقييمات (Ratings)
// ===================================

// إرسال تقييم جديد (Authenticated - Player)
router.post('/api/stadiums/:stadiumId/rate', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['player']),
    [
        body('ratingValue').isInt({ min: 1, max: 5 }).withMessage('التقييم يجب أن يكون بين 1 و 5'),
        body('comment').optional().trim().isLength({ max: 500 }).withMessage('التعليق طويل جداً')
    ],
    handleValidationErrors,
    controllers.submitRatingController
);


// ===================================
// ⚽ مسارات إدارة الملاعب (Owner / Manager)
// ===================================

// جلب ملاعب المالك (Authenticated - Owner/Manager)
router.get('/api/owner/stadiums', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    controllers.getOwnerStadiumsController
);

// إنشاء ملعب جديد (Authenticated - Owner/Manager/Admin)
router.post('/api/owner/stadiums', 
    verifyToken,
    csrfProtection,
    checkPermissions(['owner', 'manager', 'admin']),
    uploadSingle, // 🖼️ Multer Middleware لرفع صورة واحدة
    [
        body('name').trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('price_per_hour').isFloat({ gt: 0 }).withMessage('السعر بالساعة يجب أن يكون رقماً موجباً'),
        body('deposit_amount').isFloat({ min: 0 }).withMessage('مبلغ العربون يجب أن يكون رقماً'),
    ],
    handleValidationErrors,
    controllers.createStadiumController
);

// تحديث ملعب موجود (Authenticated - Owner/Manager/Admin)
router.put('/api/owner/stadiums/:stadiumId',
    verifyToken,
    csrfProtection,
    checkPermissions(['owner', 'manager', 'admin']),
    uploadSingle, // 🖼️ Multer Middleware لرفع صورة واحدة (اختياري في التحديث)
    [
        body('name').optional().trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('price_per_hour').optional().isFloat({ gt: 0 }).withMessage('السعر بالساعة يجب أن يكون رقماً موجباً'),
        body('deposit_amount').optional().isFloat({ min: 0 }).withMessage('مبلغ العربون يجب أن يكون رقماً'),
    ],
    handleValidationErrors,
    controllers.updateStadiumController
);

// جلب حجوزات ملعب معين (Authenticated - Owner/Manager)
router.get('/api/owner/stadiums/:stadiumId/bookings', 
    verifyToken,
    checkPermissions(['owner', 'manager']),
    controllers.getStadiumBookingsOwnerController
);

// تأكيد حجز يدوي (بعد دفع كامل في الملعب) (Authenticated - Owner/Manager)
router.post('/api/owner/bookings/:bookingId/confirm', 
    verifyToken,
    csrfProtection,
    checkPermissions(['owner', 'manager']),
    controllers.confirmBookingOwnerController
);

// إلغاء حجز من قبل المالك/المدير (Authenticated - Owner/Manager)
router.delete('/api/owner/bookings/:bookingId/cancel', 
    verifyToken,
    csrfProtection,
    checkPermissions(['owner', 'manager']),
    controllers.cancelBookingOwnerController
);

// حظر ساعة ملعب معينة (Authenticated - Owner/Manager)
router.post('/api/owner/slots/block', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner', 'manager']), 
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة وقت البدء غير صحيحة'),
        body('end_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة وقت الانتهاء غير صحيحة'),
        body('reason').optional().trim().isLength({ max: 255 }).withMessage('السبب طويل جداً')
    ],
    handleValidationErrors,
    controllers.blockSlotController
);


// ===================================
// 👑 مسارات لوحة الأدمن (Admin Routes)
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
    csrfProtection,
    checkPermissions(['admin']),
    controllers.approveManagerController
);

// تحديث حالة كود (تفعيل/تعطيل) (Authenticated - Admin)
router.patch('/api/admin/codes/:codeId/status', 
    verifyToken,
    csrfProtection,
    checkPermissions(['admin']),
    [
        body('isActive').isBoolean().withMessage('يجب أن تكون الحالة منطقية (صحيح/خطأ)'),
        body('type').isIn(['compensation', 'discount']).withMessage('نوع الكود غير صالح'),
    ],
    handleValidationErrors,
    controllers.updateCodeStatusController
);

// جلب جميع المستخدمين (Authenticated - Admin)
router.get('/api/admin/users',
    verifyToken,
    checkPermissions(['admin']),
    controllers.getAllUsersController
);

// ===================================
// 🌐 مسارات Google OAuth2 (Public)
// ===================================

// مسار تسجيل الدخول عبر Google
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// مسار إعادة التوجيه بعد المصادقة
router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
        // إعادة توجيه بعد نجاح تسجيل الدخول
        res.redirect('/'); 
    }
);


// -------------------------------------
// 📝 التصدير (Export)
// -------------------------------------
module.exports = router;
