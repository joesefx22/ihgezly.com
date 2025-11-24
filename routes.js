// routes.js - تجميع المسارات (API Endpoints) وتطبيق الـ Middlewares

const express = require('express');
const router = express.Router();
const { body, query, param } = require('express-validator'); // إضافة param للتحقق من المسارات
const passport = require('passport');

// استيراد المكونات الأساسية
// تم إزالة csrfProtection لأنه لم يعد ضرورياً مع استخدام JWT للـ APIs
const { verifyToken, checkPermissions } = require('./middlewares/auth'); // مصادقة وتصريح (Auth/Permissions) - الآن يعتمد على JWT
const { uploadSingle } = require('./uploadConfig'); // لرفع الصور (Multer)
const controllers = require('./controllers'); // المتحكمات الموحدة

// دالة مساعدة لمعالجة أخطاء التحقق من الصحة
const { handleValidationErrors } = controllers;


// ===================================
// 👥 مسارات المصادقة (Auth Routes)
// *تم إزالة csrfProtection من جميع هذه المسارات
// ===================================

// مسار التسجيل (Public)
router.post('/api/signup',
    // تمت إزالة csrfProtection
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
    // تمت إزالة csrfProtection
    controllers.loginController // يفترض أن يستخدم passport.authenticate ثم يصدر JWT
);


// 🌐 مسارات Google OAuth2 (Public)
// *هذه المسارات تستخدم Passport (Session) مؤقتاً قبل إصدار JWT وإعادة التوجيه
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// مسار إعادة التوجيه بعد المصادقة
router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
        // إعادة توجيه بعد نجاح تسجيل الدخول - يجب أن يُصدر الـ controller JWT هنا في السيناريو الأفضل
        res.redirect('/'); 
    }
);

// مسار تسجيل الخروج (Authenticated - Player/Owner/Admin)
router.post('/api/logout', verifyToken, controllers.logoutController);


// ===================================
// 🏟️ مسارات الملاعب (Stadiums Routes)
// ===================================

// إضافة ملعب جديد (Authenticated - Admin/Owner)
router.post('/api/stadiums', 
    verifyToken, 
    // تمت إزالة csrfProtection
    checkPermissions(['admin', 'owner']), 
    uploadSingle('stadium_image'), // Middleware لرفع صورة واحدة
    [
        body('name').trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('location').trim().notEmpty().withMessage('الموقع مطلوب'),
        body('default_price').isFloat({ gt: 0 }).withMessage('السعر الافتراضي غير صحيح'),
        body('default_deposit').isFloat({ min: 0 }).withMessage('العربون غير صحيح'),
    ],
    handleValidationErrors,
    controllers.createStadiumController
);

// تحديث معلومات ملعب (Authenticated - Admin/Owner/Manager)
router.patch('/api/stadiums/:stadiumId', 
    verifyToken, 
    // تمت إزالة csrfProtection
    checkPermissions(['admin', 'owner', 'manager']),
    uploadSingle('stadium_image'), // للتعامل مع تحديث الصورة
    [
        param('stadiumId').isInt().withMessage('معرف الملعب غير صحيح'),
        body('name').optional().trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('default_price').optional().isFloat({ gt: 0 }).withMessage('السعر الافتراضي غير صحيح'),
    ],
    handleValidationErrors,
    controllers.updateStadiumController
);

// جلب تفاصيل ملعب واحد (Public)
router.get('/api/stadiums/:stadiumId', 
    [
        param('stadiumId').isInt().withMessage('معرف الملعب غير صحيح'),
    ],
    handleValidationErrors,
    controllers.getStadiumDetailsController
);

// جلب قائمة الملاعب (Public)
router.get('/api/stadiums', 
    controllers.getAllStadiumsController
);

// ===================================
// 📅 مسارات الحجز (Booking Routes)
// ===================================

// إنشاء طلب حجز جديد (Authenticated - Player)
router.post('/api/bookings', 
    verifyToken, 
    // تمت إزالة csrfProtection
    checkPermissions(['player']),
    [
        body('stadium_id').isInt().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة وقت البدء غير صحيحة'),
        body('end_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة وقت الانتهاء غير صحيحة'),
        body('code').optional().trim().isLength({ max: 50 }).withMessage('طول الكود غير صحيح'),
    ],
    handleValidationErrors,
    controllers.createBookingController
);

// جلب حجوزات المستخدم (Authenticated)
router.get('/api/users/bookings', 
    verifyToken, 
    // تمت إزالة csrfProtection
    controllers.getUserBookingsController
);

// إلغاء حجز (Authenticated - Player/Owner)
router.post('/api/bookings/:bookingId/cancel', 
    verifyToken, 
    // تمت إزالة csrfProtection
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح'),
        body('reason').optional().trim().isLength({ max: 500 }).withMessage('السبب طويل جداً')
    ],
    handleValidationErrors,
    controllers.cancelBookingController
);

// ===================================
// 💰 مسار إشعار الدفع (Webhook)
// *هذا المسار يجب أن يكون عاماً (Public) ولا يحتاج لمصادقة JWT أو CSRF
// *التحقق الأمني يتم عبر HMAC Signature داخل الـ Controller
// ===================================
router.post('/api/payment/webhook', 
    controllers.handlePaymentNotificationController
);

// ===================================
// 👥 مسارات طلبات اللاعبين (Player Requests)
// ===================================

// إنشاء طلب انضمام لاعبين لحجز (Authenticated - Player)
router.post('/api/bookings/:bookingId/join-request',
    verifyToken,
    // تمت إزالة csrfProtection
    checkPermissions(['player']),
    [
        param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح'),
        body('players_needed').isInt({ min: 1 }).withMessage('عدد اللاعبين المطلوب غير صحيح'),
    ],
    handleValidationErrors,
    controllers.createPlayerRequestController
);

// قبول طلب انضمام لاعب لحجز (Authenticated - Player)
router.post('/api/requests/:requestId/join',
    verifyToken,
    // تمت إزالة csrfProtection
    checkPermissions(['player']),
    [
        param('requestId').isUUID().withMessage('معرف الطلب غير صحيح'),
    ],
    handleValidationErrors,
    controllers.joinPlayerRequestController
);

// ===================================
// 🎟️ مسارات الأكواد (Codes)
// ===================================

// جلب قائمة الأكواد النشطة (Authenticated - Admin)
router.get('/api/codes', 
    verifyToken, 
    // تمت إزالة csrfProtection
    checkPermissions(['admin']), 
    controllers.getAllCodesController
);

// تطبيق كود خصم/تعويض على حجز (Authenticated)
router.post('/api/codes/validate',
    verifyToken,
    // تمت إزالة csrfProtection
    [
        body('code').trim().notEmpty().withMessage('الكود مطلوب'),
        body('stadium_id').isInt().withMessage('معرف الملعب غير صحيح'),
        // لا نحتاج userId هنا لأنه سيُستخرج من الـ token
    ],
    handleValidationErrors,
    controllers.validateCodeController
);

// ===================================
// 🛠️ مسارات الأدمن (Admin Routes)
// ===================================

// جلب المديرين/الملاك بانتظار الموافقة (Authenticated - Admin)
router.get('/api/admin/pending-managers',
    verifyToken,
    // تمت إزالة csrfProtection
    checkPermissions(['admin']),
    controllers.getPendingManagersController
);

// الموافقة على مدير/مالك جديد (Authenticated - Admin)
router.post('/api/admin/managers/:userId/approve', 
    verifyToken,
    // تمت إزالة csrfProtection
    checkPermissions(['admin']),
    [
        param('userId').isUUID().withMessage('معرف المستخدم غير صحيح'),
    ],
    handleValidationErrors,
    controllers.approveManagerController
);

// تحديث حالة كود (تفعيل/تعطيل) (Authenticated - Admin)
router.patch('/api/admin/codes/:codeId/status', 
    verifyToken,
    // تمت إزالة csrfProtection
    checkPermissions(['admin']),
    [
        param('codeId').isUUID().withMessage('معرف الكود غير صحيح'),
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

// جلب إحصائيات لوحة الأدمن (Authenticated - Admin)
router.get('/api/admin/stats', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getAdminDashboardStatsController
);

// جلب سجل النشاط
router.get('/api/admin/activity-logs', 
    verifyToken, 
    checkPermissions(['admin']), 
    controllers.getSystemLogsController
);

// ===================================
// ⏰ مسارات إدارة الساعات (للمالك/المدير)
// ===================================

// حظر ساعة ملعب معينة
router.post('/api/owner/slots/block', 
    verifyToken, 
    // تمت إزالة csrfProtection
    checkPermissions(['owner', 'manager']), // التأكد من صلاحية المالك أو المدير
    [
        body('stadium_id').isInt().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة الوقت غير صحيحة'),
        body('end_time').matches(/^\d{2}:\d{2}$/).withMessage('صيغة الوقت غير صحيحة'),
        body('reason').optional().trim().isLength({ max: 255 }).withMessage('السبب طويل جداً')
    ],
    handleValidationErrors,
    controllers.blockSlotController
);

// ===================================
// ⭐ مسارات التقييمات
// ===================================

// إرسال تقييم جديد
router.post('/api/stadiums/:stadiumId/rate', 
    verifyToken, 
    // تمت إزالة csrfProtection
    [
        param('stadiumId').isInt().withMessage('معرف الملعب غير صحيح'),
        body('rating').isInt({ min: 1, max: 5 }).withMessage('التقييم يجب أن يكون بين 1 و 5'),
        body('comment').optional().trim().isLength({ max: 500 }).withMessage('التعليق طويل جداً')
    ],
    handleValidationErrors,
    controllers.submitRatingController
);


// جلب تقييمات ملعب محدد
router.get('/api/stadiums/:stadiumId/ratings', 
    [
        param('stadiumId').isInt().withMessage('معرف الملعب غير صحيح'),
    ],
    handleValidationErrors,
    controllers.getStadiumRatingsController
);


module.exports = router;
