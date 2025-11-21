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
