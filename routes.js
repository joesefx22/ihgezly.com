// routes.js
const express = require('express');
const router = express.Router();
const { login, signup } = require('./controllers');
const { verifyToken, checkRole } = require('./middleware');

// مسارات Authentication (غير محمية)
router.post('/auth/login', login);
router.post('/auth/signup', signup);

// مثال على مسار محمي (سيكون أساس عملك لاحقاً)
router.get('/user/profile', verifyToken, checkRole(['player', 'employee', 'owner', 'admin']), (req, res) => {
    // إذا وصل الطلب إلى هنا، فالمستخدم مسجل دخول وله دور صالح
    res.json({ message: "تم الوصول بنجاح لملفك الشخصي.", user: req.user });
});

module.exports = router;

// routes.js (تأكيد المسارات وحمايتها)
// ... (الـ Imports الحالية) ...
const { login, signup, getProfile, getMyBookings, updateProfile, getPlayerRequests } = require('./controllers');
const { verifyToken, checkRole } = require('./middleware');

// ... (مسارات Authentication الحالية) ...

// مسارات اللاعبين المحمية
router.get('/user/profile', verifyToken, checkRole(['player', 'employee', 'owner', 'admin']), getProfile);
router.put('/user/profile', verifyToken, checkRole(['player']), updateProfile); // تحديث الملف الشخصي للاعب فقط

router.get('/player/bookings', verifyToken, checkRole(['player']), getMyBookings);
router.get('/player/requests', verifyToken, checkRole(['player']), getPlayerRequests); 

// 🚨 يجب إضافة مسار POST /booking/create لاحقاً
// router.post('/booking/create', verifyToken, checkRole(['player']), createBooking); 

module.exports = router;

// routes.js (إضافة المسارات التالية)

// ... (تأكد من استيراد الدوال الجديدة من controllers) ...

// -------------------------------------
// مسارات الحجز (Booking) - محمية بالـ player role
// -------------------------------------

// 1. جلب الملاعب المتاحة
router.get('/api/fields/available', verifyToken, checkRole(['player']), getAvailableFieldsController);

// 2. جلب الساعات المتاحة
router.get('/api/fields/slots', verifyToken, checkRole(['player']), getAvailableSlotsController);

// 3. إنشاء حجز جديد (المعاملة الحاسمة)
router.post('/api/booking/create', verifyToken, checkRole(['player']), createBookingController);

// 4. جلب تفاصيل الحجز للدفع (لصفحة payment.html)
router.get('/api/booking/:bookingId/details', verifyToken, checkRole(['player']), getBookingDetailsController);

// ... (بقية ملف routes.js)

// routes.js (إضافة المسار التالي)
// ... (تأكد من استيراد الدالة الجديدة من controllers) ...
const { confirmPaymentController } = require('./controllers');

// مسار تأكيد الدفع النهائي بعد النجاح من بوابة الدفع
router.post('/api/booking/confirm-payment', verifyToken, checkRole(['player']), confirmPaymentController);

// ... (بقية ملف routes.js)

// routes.js (إضافة مسار الـ Webhook)

// ... (تأكد من استيراد الدالة الجديدة من controllers) ...
const { paymobWebhookController } = require('./controllers');

// ... (مساراتك الحالية) ...

// -------------------------------------
// مسار Paymob Webhook الآمن (لا يحتاج حماية بالتوكن)
// -------------------------------------
// هذا المسار يجب تسجيله في إعدادات Paymob Webhook
router.get('/api/payment/paymob-webhook', paymobWebhookController); 
// ملاحظة: Paymob يفضل استخدام GET للـ Webhook الذي يرسل البيانات في الـ Query String
// يمكنك أيضاً إضافة POST إذا كان Webhook مُعداً لإرسال بيانات JSON في الـ Body
router.post('/api/payment/paymob-webhook', paymobWebhookController); 

module.exports = router;

// routes.js (إضافات لمسارات الموظف)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    getEmployeeFieldsController, 
    getTodayBookingsController,
    checkInController,
    confirmCashController 
} = require('./controllers');

// -------------------------------------
// مسارات الموظف (Employee) - محمية بالـ employee role
// -------------------------------------

// 1. جلب الملاعب المعينة
router.get('/api/employee/fields', verifyToken, checkRole(['employee']), getEmployeeFieldsController);

// 2. جلب الحجوزات اليومية لملعب
router.get('/api/employee/bookings', verifyToken, checkRole(['employee']), getTodayBookingsController);

// 3. تسجيل الحضور (Check-in)
router.post('/api/employee/booking/checkin', verifyToken, checkRole(['employee']), checkInController);

// 4. تأكيد الدفع النقدي للحجوزات قصيرة الأجل (أقل من 24 ساعة)
router.post('/api/employee/booking/confirm-cash', verifyToken, checkRole(['employee']), confirmCashController);

// ... (بقية ملف routes.js)

// routes.js (إضافات لمسارات المالك)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    getOwnerDashboardController,
    getOwnerStadiumsController,
    getOwnerBookingsController,
    confirmOwnerBookingController,
    cancelOwnerBookingController
} = require('./controllers');

// -------------------------------------
// مسارات مالك الملعب (Owner) - محمية بالـ owner role
// -------------------------------------

// 1. جلب إحصائيات لوحة التحكم
router.get('/api/owner/dashboard', verifyToken, checkRole(['owner']), getOwnerDashboardController);

// 2. جلب الملاعب التابعة للمالك
router.get('/api/owner/stadiums', verifyToken, checkRole(['owner']), getOwnerStadiumsController);

// 3. جلب حجوزات المالك (مع فلاتر)
router.get('/api/owner/bookings', verifyToken, checkRole(['owner']), getOwnerBookingsController);

// 4. تأكيد حجز نقدي (للحجوزات المعلقة)
router.post('/api/owner/bookings/:bookingId/confirm', verifyToken, checkRole(['owner']), confirmOwnerBookingController);

// 5. إلغاء حجز (يستخدم أيضاً كـ لم يحضر)
router.post('/api/owner/bookings/:bookingId/cancel', verifyToken, checkRole(['owner']), cancelOwnerBookingController);

// ... (بقية ملف routes.js)

// routes.js (إضافات لمسارات الأدمن)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    getAdminDashboardController,
    getAllUsersController,
    getAllStadiumsController,
    getPendingManagersController,
    approveUserController,
    rejectUserController,
    getActivityLogsController,
    // ...
} = require('./controllers');

// -------------------------------------
// مسارات الأدمن (Admin) - محمية بالـ admin role
// -------------------------------------

// 1. جلب إحصائيات لوحة التحكم
router.get('/api/admin/dashboard', verifyToken, checkRole(['admin']), getAdminDashboardController);

// 2. إدارة المستخدمين: جلب الكل
router.get('/api/admin/users', verifyToken, checkRole(['admin']), getAllUsersController);

// 3. إدارة الملاعب: جلب الكل
router.get('/api/admin/stadiums', verifyToken, checkRole(['admin']), getAllStadiumsController);

// 4. إدارة الموافقات: جلب الطلبات المعلقة
router.get('/api/admin/pending-managers', verifyToken, checkRole(['admin']), getPendingManagersController);

// 5. إدارة الموافقات: الموافقة على مستخدم
router.post('/api/admin/users/:userId/approve', verifyToken, checkRole(['admin']), approveUserController);

// 6. إدارة الموافقات: رفض (أو تعطيل) مستخدم
router.post('/api/admin/users/:userId/reject', verifyToken, checkRole(['admin']), rejectUserController);

// 7. سجل النشاط
router.get('/api/admin/activity-logs', verifyToken, checkRole(['admin']), getActivityLogsController);

// ... (بقية ملف routes.js)

// routes.js (إضافات لمسارات CRUD الملاعب)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    createFieldController,
    updateFieldController,
    deleteFieldController,
    activateFieldController,
    // ...
} = require('./controllers');

// -------------------------------------
// مسارات الملاعب (Fields CRUD)
// -------------------------------------

// 1. إنشاء ملعب جديد (للأدمن أو المالك)
router.post('/api/fields', verifyToken, checkRole(['admin', 'owner']), createFieldController);

// 2. تحديث ملعب (للأدمن أو مالك الملعب المحدد)
router.put('/api/fields/:fieldId', verifyToken, checkRole(['admin', 'owner']), updateFieldController);

// 3. تعطيل/حذف ملعب (للأدمن أو مالك الملعب المحدد)
router.delete('/api/fields/:fieldId', verifyToken, checkRole(['admin', 'owner']), deleteFieldController);

// 4. تفعيل ملعب (للأدمن أو مالك الملعب المحدد)
router.post('/api/fields/:fieldId/activate', verifyToken, checkRole(['admin', 'owner']), activateFieldController);

// ... (بقية ملف routes.js)

// routes.js (إضافات لمسارات الحجز والدفع)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    bookingRequestController,
    getBookingInfoController,
    initiatePaymentController,
    paymentCallbackController,
    // ...
} = require('./controllers');

// -------------------------------------
// مسارات الحجز (Booking) - للاعبين فقط
// -------------------------------------

// 1. طلب حجز ساعة (يقرر ما إذا كان مطلوب دفع عربون أم لا)
router.post('/api/booking/request', verifyToken, checkRole(['player']), bookingRequestController);

// 2. جلب معلومات الحجز للدفع
router.get('/api/booking/:bookingId/info', verifyToken, checkRole(['player']), getBookingInfoController);

// 3. بدء عملية الدفع (الحصول على رابط PayMob)
router.post('/api/booking/:bookingId/pay', verifyToken, checkRole(['player']), initiatePaymentController);

// -------------------------------------
// مسارات إشعارات الدفع (Callback/Webhook) - بدون حماية Token
// -------------------------------------

// 4. معالجة إشعار الدفع من PayMob
router.get('/api/payment/callback', paymentCallbackController); 
// Note: يُفضل استخدام POST في الإنتاج، لكن GET أسهل للمحاكاة عبر التوجيه.

// ... (بقية ملف routes.js)

// routes.js (إضافات لمسارات إدارة الأكواد والتحقق)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    // ... (الدوال السابقة)
    createCodeController,
    getAllCodesController,
    toggleCodeStatusController,
    validateCodeController, // الجديدة
    // ...
} = require('./controllers');

// -------------------------------------
// مسارات إدارة الأكواد (Codes) - للأدمن فقط
// -------------------------------------

// 1. إنشاء كود جديد
router.post('/api/admin/codes', verifyToken, checkRole(['admin']), createCodeController);

// 2. جلب جميع الأكواد
router.get('/api/admin/codes', verifyToken, checkRole(['admin']), getAllCodesController);

// 3. تعطيل/تفعيل كود
router.put('/api/admin/codes/:codeId/status', verifyToken, checkRole(['admin']), toggleCodeStatusController);

// -------------------------------------
// مسارات استخدام الأكواد (Player Flow)
// -------------------------------------

// 4. التحقق من صحة الكود قبل الحجز
router.post('/api/codes/validate', verifyToken, checkRole(['player']), validateCodeController);

// ... (بقية ملف routes.js)

// routes.js (إضافات لمسارات طلبات اللاعبين والتقييمات)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    // ... (الدوال السابقة)
    createPlayerRequestController,
    getAllPlayerRequestsController,
    togglePlayerRequestController,
    submitRatingController,
    // ...
} = require('./controllers');

// -------------------------------------
// مسارات طلبات اللاعبين (Player Requests)
// -------------------------------------

// 1. إنشاء طلب جديد (صاحب الحجز)
router.post('/api/player-requests', verifyToken, checkRole(['player']), createPlayerRequestController);

// 2. جلب جميع الطلبات النشطة (لصفحة players.html)
router.get('/api/player-requests', verifyToken, checkRole(['player']), getAllPlayerRequestsController);

// 3. انضمام/مغادرة لطلب
router.post('/api/player-requests/:requestId/:action', verifyToken, checkRole(['player']), togglePlayerRequestController); 
// :action هنا يمكن أن تكون 'join' أو 'leave'

// -------------------------------------
// مسارات التقييمات (Ratings)
// -------------------------------------

// 4. إرسال تقييم لحجز مكتمل (بعد اللعب)
router.post('/api/bookings/:bookingId/rate', verifyToken, checkRole(['player']), submitRatingController);

// ... (بقية ملف routes.js)

// routes.js

// ...

// 7. جلب تقييمات ملعب معين (لعرضها في واجهة الملعب)
router.get('/api/fields/:fieldId/ratings', getFieldRatingsController); 

// ...

// routes.js (إضافات لمسارات الإشعارات)

// ... (تأكد من استيراد الدوال الجديدة) ...
const { 
    // ... (الدوال السابقة)
    getNotificationsController,
    markAllAsReadController,
    // ...
} = require('./controllers');

// -------------------------------------
// مسارات الإشعارات (Notifications)
// -------------------------------------

// 1. جلب الإشعارات وعدد غير المقروء
router.get('/api/notifications', verifyToken, getNotificationsController);

// 2. وضع علامة 'مقروء' على الكل
router.post('/api/notifications/mark-all-read', verifyToken, markAllAsReadController);
