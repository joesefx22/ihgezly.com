// routes.js - تجميع المسارات (Controllers Layer) ونقطة الربط الرئيسية للـ API

const express = require('express');
const router = express.Router();
const passport = require('passport'); // مطلوب لمسارات Google Auth
const { body, param, validationResult } = require('express-validator');

// استيراد المكونات الأساسية من ملفاتنا المُنظَّمة
const models = require('./models');
// استيراد حماية CSRF من server.js
const { csrfProtection } = require('./server'); 
// نحتاج إلى multer لرفع الصور (نفترض وجود ملف uploadConfig.js)
const uploadConfig = require('./uploadConfig'); 


/* =======================================================
 * 🛡️ Middlewares الأمنية والتحقق من الصلاحيات (Auth & Validation)
 * ======================================================= */

/**
 * 🛠️ دالة مساعدة لمعالجة أخطاء التحقق (Validation Errors)
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // إرجاع أخطاء التحقق بتنسيق موحد
        return res.status(400).json({ 
            success: false, 
            message: 'خطأ في بيانات الإدخال',
            errors: errors.array() 
        });
    }
    next();
};

/**
 * 🔐 التحقق من المصادقة (Authentication)
 * تفترض هذه الدالة أن Passport قد قام بتعيين req.user عبر الجلسة
 */
const verifyToken = (req, res, next) => {
    // مسار جلب الـ CSRF Token يجب أن يكون متاحاً للجميع
    if (req.path === '/api/csrf-token') return next(); 

    if (req.isAuthenticated() && req.user) { 
        return next();
    }
    // يجب تسجيل الخروج من الجلسة في حال عدم المصادقة
    req.logout((err) => {
        if (err) console.error('Error logging out:', err);
        res.status(401).json({ success: false, message: 'Authorization required. Please log in.' });
    });
};

/**
 * 🔑 التحقق من الصلاحيات (Authorization)
 */
const checkPermissions = (roles) => (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions.' });
};


/* =======================================================
 * 👥 المتحكمات (Controllers) - منطق API
 * ======================================================= */

// --- 1. المصادقة (Auth) ---

const registerController = async (req, res) => {
    try {
        const user = await models.registerNewUser(req.body);
        // لا يتم تسجيل الدخول تلقائيًا، يجب على المستخدم تسجيل الدخول بعد التسجيل
        res.status(201).json({ success: true, message: 'تم إنشاء المستخدم بنجاح. يرجى تسجيل الدخول.', user: user });
    } catch (error) {
        res.status(409).json({ success: false, message: error.message });
    }
};

const loginController = (req, res, next) => {
    // استخدام Passport للمصادقة المحلية (Local Strategy)
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        if (!user) {
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }
        
        req.logIn(user, (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Login failed' });
            
            // تحقق إضافي لحالة الموافقة للمالكين
            if (user.role === 'manager' && user.is_approved === false) {
                 req.logout(() => {
                    res.status(403).json({ success: false, message: 'حساب المالك/المدير قيد المراجعة ولم تتم الموافقة عليه بعد.' });
                 });
                 return;
            }

            delete user.password; // ضمان عدم إرسال كلمة المرور
            res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', user: user });
        });
    })(req, res, next);
};

const logoutController = (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'فشل في تسجيل الخروج' });
        }
        // مسح الكوكي والجلسة
        req.session.destroy(() => {
            res.clearCookie('connect.sid'); // اسم الكوكي الافتراضي للجلسة
            res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
        });
    });
};

const getCurrentUserController = (req, res) => {
    // req.user يأتي من Passport بعد verifyToken
    if (req.user) {
        // لا نحتاج لكلمة المرور هنا
        const user = { ...req.user };
        delete user.password; 
        res.json(user);
    } else {
        res.status(401).json({ success: false, message: 'غير مصادق' });
    }
};

// --- 2. الملاعب العامة والحجوزات (Public & Player) ---

const getStadiumsController = async (req, res) => {
    try {
        const filters = req.query;
        const stadiums = await models.getStadiums(filters);
        res.json(stadiums);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب الملاعب' });
    }
};

const getStadiumDetailsController = async (req, res) => {
    try {
        const stadium = await models.getStadiumById(req.params.stadiumId);
        if (!stadium) {
            return res.status(404).json({ success: false, message: 'الملعب غير موجود' });
        }
        const ratings = await models.getStadiumRatings(req.params.stadiumId);
        res.json({ ...stadium, ratings });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب تفاصيل الملعب' });
    }
};

const getAvailableSlotsController = async (req, res) => {
    try {
        const { date } = req.query;
        const { stadiumId } = req.params;
        if (!date) {
            return res.status(400).json({ success: false, message: 'التاريخ مطلوب' });
        }
        
        const slots = await models.getAvailableSlots(stadiumId, date);
        // يمكن إضافة منطق معالجة الساعات هنا لتبسيطها للـ Frontend
        res.json(slots);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب الساعات المتاحة' });
    }
};

const createBookingController = async (req, res) => {
    try {
        const bookingData = { ...req.body, user_id: req.user.id };
        const newBooking = await models.createBooking(bookingData);
        res.status(201).json({ success: true, message: 'تم إنشاء الحجز بنجاح', booking: newBooking });
    } catch (error) {
        // خطأ تضارب الحجز أو كود التعويض غير صحيح
        if (error.message.includes('conflict') || error.message.includes('code is invalid')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في عملية الحجز' });
    }
};

const getUserBookingsController = async (req, res) => {
    try {
        const bookings = await models.getUserBookings(req.user.id, req.query.status);
        res.json(bookings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب حجوزات المستخدم' });
    }
};

const cancelBookingPlayerController = async (req, res) => {
    try {
        const booking = await models.cancelBooking(req.params.bookingId, req.user.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'الحجز غير موجود' });
        }
        res.json({ success: true, message: 'تم إلغاء الحجز بنجاح وإصدار كود تعويض بقيمة العربون.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في إلغاء الحجز' });
    }
};


// --- 3. إدارة الملاعب (Owner / Manager) ---

const getOwnerStadiumsController = async (req, res) => {
    try {
        const stadiums = await models.getOwnerStadiums(req.user.id);
        res.json(stadiums);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب ملاعب المالك' });
    }
};

const createStadiumController = async (req, res) => {
    try {
        // Multer يضيف req.file (صورة الملعب)
        const image_url = req.file ? `/uploads/images/${req.file.filename}` : null;
        const newStadium = await models.createStadium({ ...req.body, image_url }, req.user.id);
        res.status(201).json({ success: true, message: 'تم إنشاء الملعب بنجاح', stadium: newStadium });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في إنشاء الملعب' });
    }
};

const updateStadiumController = async (req, res) => {
    try {
        const stadium_id = req.params.stadiumId;
        const updateData = req.body;
        
        if (req.file) {
            updateData.image_url = `/uploads/images/${req.file.filename}`;
        }
        
        const updatedStadium = await models.updateStadium(stadium_id, updateData, req.user.id);
        if (!updatedStadium) {
            return res.status(404).json({ success: false, message: 'الملعب غير موجود' });
        }
        res.json({ success: true, message: 'تم تحديث الملعب بنجاح', stadium: updatedStadium });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في تحديث الملعب' });
    }
};

const getStadiumBookingsOwnerController = async (req, res) => {
    try {
        const { stadiumId } = req.params;
        // يجب إضافة تحقق من أن الملعب يخص req.user.id هنا قبل الجلب
        const bookings = await models.getStadiumBookings(stadiumId, req.query.date, req.query.status);
        res.json(bookings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب حجوزات الملعب' });
    }
};

const confirmBookingOwnerController = async (req, res) => {
    try {
        const booking = await models.confirmBooking(req.params.bookingId, req.user.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'الحجز غير موجود أو مؤكد بالفعل' });
        }
        res.json({ success: true, message: 'تم تأكيد الحجز' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في تأكيد الحجز' });
    }
};

const cancelBookingOwnerController = async (req, res) => {
    try {
        const booking = await models.cancelBooking(req.params.bookingId, req.user.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'الحجز غير موجود أو ملغى بالفعل' });
        }
        res.json({ success: true, message: 'تم إلغاء الحجز' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في إلغاء الحجز' });
    }
};

const blockSlotController = async (req, res) => {
    try {
        const { stadium_id, date, start_time, end_time, reason } = req.body;
        // يجب إضافة تحقق من أن الملعب يخص req.user.id هنا
        const newBlock = await models.blockTimeSlot(stadium_id, date, start_time, end_time, reason, req.user.id);
        res.status(201).json({ success: true, message: 'تم حظر الفترة الزمنية بنجاح', block: newBlock });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في حظر الفترة الزمنية' });
    }
};

// --- 4. لوحة الأدمن (Admin) ---

const getAdminDashboardStatsController = async (req, res) => {
    try {
        const stats = await models.getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب إحصائيات لوحة التحكم' });
    }
};

const getSystemLogsController = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 15;
        const logs = await models.getSystemActivityLogs(limit);
        res.json(logs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب سجل النشاط' });
    }
};

const getPendingManagersController = async (req, res) => {
    try {
        const managers = await models.getPendingManagers();
        res.json(managers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في جلب طلبات المديرين المعلقة' });
    }
};

const approveManagerController = async (req, res) => {
    try {
        const user = await models.approveManager(req.params.userId, req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }
        res.json({ success: true, message: `تم الموافقة على ${user.name} كمالك ملعب.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'فشل في الموافقة على المدير' });
    }
};


/* =======================================================
 * 🗺️ تعريف المسارات (Route Definitions)
 * ======================================================= */

// ===================================
// 1. مسارات المصادقة العامة (Auth)
// ===================================

// مسار جلب الـ CSRF Token (مطلوب لـ Frontend)
router.get('/api/csrf-token', csrfProtection, (req, res) => {
    // تم تعريف هذه الدالة في server.js وتصديرها
    res.json({ csrfToken: req.csrfToken() }); 
});

// مسار التسجيل (Signup)
router.post('/api/signup',
    csrfProtection,
    [
        body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
        body('email').isEmail().withMessage('بريد إلكتروني غير صحيح'),
        body('password').isLength({ min: 6 }).withMessage('يجب أن تكون كلمة المرور 6 أحرف على الأقل'),
        body('role').isIn(['player', 'owner', 'manager']).withMessage('دور المستخدم غير صالح')
    ],
    handleValidationErrors,
    registerController
);

// مسار تسجيل الدخول (Login)
router.post('/api/login', 
    csrfProtection,
    [
        body('email').isEmail().withMessage('بريد إلكتروني غير صحيح'),
        body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
    ],
    handleValidationErrors,
    loginController
);

// مسار جلب معلومات المستخدم الحالي (مطلوب لكل لوحات التحكم)
router.get('/api/me', verifyToken, getCurrentUserController);

// مسار تسجيل الخروج (Logout)
router.post('/api/logout', verifyToken, csrfProtection, logoutController);

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

// جلب جميع الملاعب (يمكن استخدام الاستعلامات لتصفيتها)
router.get('/api/stadiums', getStadiumsController);

// جلب تفاصيل ملعب واحد + تقييماته
router.get('/api/stadiums/:stadiumId', getStadiumDetailsController);

// جلب الساعات المتاحة والمحجوزة لملعب في تاريخ معين
router.get('/api/stadiums/:stadiumId/slots', 
    [param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')],
    handleValidationErrors,
    getAvailableSlotsController
);

// إنشاء حجز جديد
router.post('/api/bookings', 
    verifyToken, 
    csrfProtection,
    [
        body('stadium_id').isUUID().withMessage('معرف الملعب غير صحيح'),
        body('date').isDate().withMessage('التاريخ غير صحيح'),
        body('total_price').isFloat({ min: 0 }).withMessage('السعر الكلي غير صحيح'),
        // يمكن إضافة المزيد من التحقق...
    ],
    handleValidationErrors,
    createBookingController
);

// جلب حجوزات المستخدم الحالي
router.get('/api/me/bookings', verifyToken, getUserBookingsController);

// إلغاء حجز (للاعب)
router.post('/api/me/bookings/:bookingId/cancel', 
    verifyToken, 
    csrfProtection, 
    [param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')],
    handleValidationErrors,
    cancelBookingPlayerController
);

// ===================================
// 3. مسارات المالك/المدير (Owner / Manager)
// ===================================

// جلب ملاعب المالك
router.get('/api/owner/stadiums', 
    verifyToken, 
    checkPermissions(['owner', 'manager']), 
    getOwnerStadiumsController
);

// إضافة ملعب جديد
router.post('/api/owner/stadiums', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner']), 
    // استخدام Multer لتحميل صورة واحدة
    uploadConfig.uploadSingle('image'), 
    [
        body('name').trim().notEmpty().withMessage('اسم الملعب مطلوب'),
        body('price_per_hour').isFloat({ min: 10 }).withMessage('سعر الساعة غير صحيح'),
        body('location').notEmpty().withMessage('الموقع مطلوب')
    ],
    handleValidationErrors,
    createStadiumController
);

// تعديل ملعب موجود
router.put('/api/owner/stadiums/:stadiumId', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner']),
    uploadConfig.uploadSingle('image'), 
    [param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')],
    handleValidationErrors,
    updateStadiumController
);

// جلب حجوزات ملعب معين (للمالك)
router.get('/api/owner/stadiums/:stadiumId/bookings', 
    verifyToken, 
    checkPermissions(['owner', 'manager']), 
    [param('stadiumId').isUUID().withMessage('معرف الملعب غير صحيح')],
    handleValidationErrors,
    getStadiumBookingsOwnerController
);

// تأكيد حجز
router.post('/api/owner/bookings/:bookingId/confirm', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner', 'manager']), 
    [param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')],
    handleValidationErrors,
    confirmBookingOwnerController
);

// إلغاء حجز (للمالك)
router.post('/api/owner/bookings/:bookingId/cancel', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['owner', 'manager']), 
    [param('bookingId').isUUID().withMessage('معرف الحجز غير صحيح')],
    handleValidationErrors,
    cancelBookingOwnerController
);

// حظر ساعة ملعب معينة
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
    handleValidationErrors,
    blockSlotController
);

// ===================================
// 4. مسارات لوحة الأدمن (Admin)
// ===================================

// جلب إحصائيات لوحة الأدمن
router.get('/api/admin/dashboard', 
    verifyToken, 
    checkPermissions(['admin']), 
    getAdminDashboardStatsController
);

// جلب سجل النشاط
router.get('/api/admin/activity-logs', 
    verifyToken, 
    checkPermissions(['admin']), 
    getSystemLogsController
);

// جلب طلبات المديرين المعلقة
router.get('/api/admin/managers/pending', 
    verifyToken, 
    checkPermissions(['admin']), 
    getPendingManagersController
);

// الموافقة على طلب مدير (تصبح owner)
router.post('/api/admin/managers/:userId/approve', 
    verifyToken, 
    csrfProtection, 
    checkPermissions(['admin']), 
    [param('userId').isUUID().withMessage('معرف المستخدم غير صحيح')],
    handleValidationErrors,
    approveManagerController
);

// -----------------------------------
// مسارات طلبات اللاعبين والتقييمات مفقودة في المتحكمات أعلاه
// يجب إضافتها لضمان اكتمال النظام
// -----------------------------------

// تصدير الراوتر
module.exports = router;
