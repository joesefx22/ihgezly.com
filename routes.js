// routes.js - النسخة النظيفة (فقط تعريف المسارات وتطبيق الأمان)

const express = require('express');
const router = express.Router();
const passport = require('passport'); // مطلوب لمسارات Google Auth
const { body, param } = require('express-validator');

// 💡 استيراد المكونات الأساسية بعد فصلها 
const { csrfProtection } = require('./server'); 
const { verifyToken, checkPermissions } = require('./middlewares/auth'); // نفترض وجود ملف middlewares/auth.js
const { uploadSingle } = require('./uploadConfig'); 
const controllers = require('./controllers'); // الآن نستورد كل الدوال من هنا


// ===================================
// 1. مسارات المصادقة العامة (Auth)
// ===================================

// جلب الـ CSRF Token
router.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() }); 
});

// التسجيل (Signup)
router.post('/api/signup',
    csrfProtection,
    [
        body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
        body('email').isEmail().withMessage('بريد إلكتروني غير صحيح'),
        body('password').isLength({ min: 6 }).withMessage('يجب أن تكون كلمة المرور 6 أحرف على الأقل'),
        body('role').isIn(['player', 'owner', 'manager']).withMessage('دور المستخدم غير صالح')
    ],
    controllers.handleValidationErrors,
    controllers.registerController
);

// تسجيل الدخول (Login)
router.post('/api/login', 
    csrfProtection,
    [
        body('email').isEmail().withMessage('بريد إلكتروني غير صحيح'),
        body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
    ],
    controllers.handleValidationErrors,
    controllers.loginController
);

// جلب معلومات المستخدم الحالي
router.get('/api/me', verifyToken, controllers.getCurrentUserController);

// تسجيل الخروج (Logout)
router.post('/api/logout', verifyToken, csrfProtection, controllers.logoutController);

// مسارات تسجيل الدخول عبر Google (تستخدم Passport.js)
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
        // إعادة التوجيه إلى الصفحة الرئيسية أو لوحة التحكم المناسبة
        res.redirect('/owner.html'); 
    }
);

// ===================================
// 2. مسارات الملاعب والحجز (Public & Player)
// ===================================

router.get('/api/stadiums', controllers.getStadiumsController);
router.get('/api/stadiums/:stadiumId', controllers.getStadiumDetailsController);

router.get('/api/stadiums/:stadiumId/slots', 
    [param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')],
    controllers.handleValidationErrors,
    controllers.getAvailableSlotsController
);

router.post('/api/bookings', 
    verifyToken, 
    csrfProtection,
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('total_price').isFloat({ min: 0 }).withMessage('السعر الكلي غير صحيح'),
    ],
    controllers.handleValidationErrors,
    controllers.createBookingController
);

router.get('/api/me/bookings', verifyToken, controllers.getUserBookingsController);

router.post('/api/me/bookings/:bookingId/cancel', 
    verifyToken, 
    csrfProtection, 
    [param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')],
    controllers.handleValidationErrors,
    controllers.cancelBookingPlayerController
);

// ===================================
// 3. مسارات المالك/المدير (Owner / Manager)
// ===================================

router.get('/api/owner/stadiums', 
    verifyToken, 
    checkPermissions(['owner', 'manager']), 
    controllers.getOwnerStadiumsController
);

router.post('/api/owner/stadiums', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner']), 
    // استخدام Multer لتحميل صورة واحدة (يجب أن يتم تعريفها في uploadConfig.js)
    uploadSingle('image'), 
    [
        body('name').trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('price_per_hour').isFloat({ min: 10 }).withMessage('سعر الساعة غير صحيح'),
        body('location').notEmpty().withMessage('الموقع مطلوب')
    ],
    controllers.handleValidationErrors,
    controllers.createStadiumController
);

router.put('/api/owner/stadiums/:stadiumId', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner']),
    uploadSingle('image'), 
    [param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')],
    controllers.handleValidationErrors,
    controllers.updateStadiumController
);

router.get('/api/owner/stadiums/:stadiumId/bookings', 
    verifyToken, 
    checkPermissions(['owner', 'manager']), 
    [param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')],
    controllers.handleValidationErrors,
    controllers.getStadiumBookingsOwnerController
);

router.post('/api/owner/bookings/:bookingId/confirm', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner', 'manager']), 
    [param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')],
    controllers.handleValidationErrors,
    controllers.confirmBookingOwnerController
);

router.post('/api/owner/bookings/:bookingId/cancel', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner', 'manager']), 
    [param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')],
    controllers.handleValidationErrors,
    controllers.cancelBookingOwnerController
);

router.post('/api/owner/slots/block', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner', 'manager']),
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('start_time').matches(/^(\d{2}):(\d{2})$/).withMessage('صيغة وقت البدء غير صحيحة'),
        body('end_time').matches(/^(\d{2}):(\d{2})$/).withMessage('صيغة وقت الانتهاء غير صحيحة'),
    ],
    controllers.handleValidationErrors,
    controllers.blockSlotController
);

// ===================================
// 4. مسارات لوحة الأدمن (Admin)
// ===================================

router.get('/api/admin/dashboard', 
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
    csrfProtection, 
    checkPermissions(['admin']), 
    [param('userId').isUUID().withMessage('معرف المستخدم غير صحيح')],
    controllers.handleValidationErrors,
    controllers.approveManagerController
);

module.exports = router;
