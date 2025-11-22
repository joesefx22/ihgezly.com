// server.js (إضافة دالة التشغيل المجدولة)

// ... (تأكد من استيراد models)
const models = require('./models'); 
// ...

// دالة التشغيل المجدولة
function startScheduledJobs() {
    // تشغيل الدالة كل 5 دقائق (300000 مللي ثانية)
    // يمكن تغييرها حسب الحاجة (مثل 3600000 مللي ثانية = ساعة)
    const intervalTime = 300000; 

    // الدالة التي سيتم تنفيذها بشكل دوري
    const runJob = async () => {
        try {
            const result = await models.updatePastBookingsStatus();
            // نستخدم دالة logger.info المفترضة في server.js للتوثيق
            if (result.total > 0) {
                 logger.info(`[SCHEDULER] Updated ${result.total} bookings: ${result.played} played, ${result.missed} missed.`);
            }
        } catch (error) {
            logger.error(`[SCHEDULER] Failed to run status update job: ${error.message}`);
        }
    };
    
    // تشغيل فوري عند بدء التشغيل
    runJob();

    // إعداد المؤقت لتشغيل دوري
    setInterval(runJob, intervalTime);

    logger.info(`✅ Scheduled job for booking status update started, running every ${intervalTime / 1000} seconds.`);
}


// ... (داخل دالة بدء السيرفر app.listen)

    // بدء السيرفر
    app.listen(PORT, () => {
        logger.info(`✅ Server running on ${APP_URL}`);
        // ... (باقي سجلات بدء التشغيل)
        
        // 💡 استدعاء وظيفة الجدولة بعد بدء السيرفر بنجاح
        startScheduledJobs(); 
    });
// ...

// server.js (تعديل كامل)
require('dotenv').config();

/* ========= المكتبات الأساسية ========= */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

/* ========= استيراد ملفات الهيكل 7 ========= */
const { createTables, healthCheck } = require('./db');
const apiRoutes = require('./routes'); 
// لا نحتاج لاستيراد models, controllers, middleware, config هنا مباشرةً

const app = express();
const PORT = process.env.PORT || 3000;

/* ========= تطبيق الـ Middleware الأساسي ========= */
// 1. الأمان والحماية (موصى به في الهيكل الخاص بك)
app.use(helmet()); 
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب في النافذة
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter); // تطبيق الحد الأقصى للطلبات

// 2. تحليل جسم الطلب (مهم للـ POST/signup/login)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors()); // يجب تحديد Cors Options في الإنتاج لأمان أفضل

/* ========= ربط مسارات الـ API ========= */
// ربط جميع المسارات التي تم تعريفها في routes.js تحت المسار الأساسي /api
app.use('/api', apiRoutes); 

/* ========= تقديم الملفات الثابتة (Frontend) ========= */
app.use(express.static('public')); // افترض أن ملفاتك الأمامية في مجلد 'public'

// لأي مسار غير موجود، نرسل index.html (مهم لتطبيقات الصفحة الواحدة - SPA)
app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
        return res.sendFile('index.html', { root: 'public' });
    }
    res.status(404).json({ message: 'الصفحة غير موجودة' });
});

/* ========= بدء السيرفر ========= */
async function startServer() {
    try {
        // فحص الاتصال وإنشاء الجداول عند بدء التشغيل
        const dbStatus = await healthCheck();
        if (dbStatus.status === 'healthy') {
            await createTables(); // تأكد من وجود جدول users
        }

        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🔌 Database status: ${dbStatus.status}`);
        });
    } catch (error) {
        console.error('❌ Server failed to start:', error);
        process.exit(1);
    }
}

startServer();
