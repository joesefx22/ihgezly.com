// server.js (تعديلات بعد تعريف app، وقبل استيراد المسارات)

// ... (تأكد من استيراد المكتبات: helmet, rateLimit, cookieParser, csrf)

/* ========= 🛡️ إعدادات الأمان (Security Middleware) ========= */
// 1. الأمان العام: إعدادات HTTP Headers
app.use(helmet()); 

// 2. إعداد Cookies و Sessions لـ CSRF (مفترض أنها موجودة)
app.use(cookieParser(process.env.COOKIE_SECRET || 'a-very-secret-key'));
app.use(session({
    secret: process.env.SESSION_SECRET || 'another-super-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: isProduction, // استخدم secure cookies في الإنتاج
        httpOnly: true, // يمنع الوصول من JavaScript
        maxAge: 1000 * 60 * 60 * 24 // يوم واحد
    }
}));


// 3. إعداد CSRF Protection
const csrf = require('csurf'); // التأكد من الاستيراد
const csrfProtection = csrf({ cookie: true });


// 4. إعداد Rate Limiting العام والخاص بالمصادقة
const rateLimit = require('express-rate-limit'); // التأكد من الاستيراد

// Rate Limiter عام (يُطبق على جميع المسارات)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP خلال 15 دقيقة
    message: "تم تجاوز الحد الأقصى للطلبات المسموح بها. يرجى المحاولة لاحقاً.",
});
app.use(generalLimiter); // تطبيق الحد الأقصى العام

// Rate Limiter خاص بمسارات المصادقة (أكثر صرامة)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 5, // 5 محاولات تسجيل دخول/تسجيل حساب
    message: "لقد تجاوزت الحد الأقصى لمحاولات المصادقة (تسجيل الدخول/التسجيل). يرجى المحاولة بعد 15 دقيقة.",
});

// 💡 يجب تصدير العناصر الأمنية ليتم استخدامها في routes.js:
// قد تحتاج إلى تعديل ملف routes.js لجعله دالة أو استخدام exports لتعريفها في مكان مركزي.
// لأغراض التوضيح، سنفترض أنها مُصدّرة الآن.
module.exports.csrfProtection = csrfProtection;
module.exports.authLimiter = authLimiter;

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

// server.js (في الجزء العلوي)

const passport = require('passport'); // 💡 ضروري
const GoogleStrategy = require('passport-google-oauth20').Strategy; // 💡 ضروري إذا كنت تستخدم مصادقة Google

// ... (باقي تهيئة Express و DB)

/* ========= تهيئة Passport.js ========= */
// قم باستخراج هذا الجزء من ملف server.js القديم ووضعه هنا:
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
    // منطق البحث عن المستخدم أو إنشاءه هنا (باستخدام دوال models.js)
    // هذا المنطق يجب أن يكون موجوداً في ملفك server.js القديم
}));

passport.serializeUser((user, done) => { done(null, user.id); });
passport.deserializeUser(async (id, done) => {
    // منطق جلب المستخدم من قاعدة البيانات
    const user = await models.getUserById(id); 
    done(null, user);
});

// ... (تحت تهيئة session)
app.use(passport.initialize());
app.use(passport.session()); // إذا كنت تستخدم Sessions مع Passport


// server.js (قبل استيراد routes.js)
// ...

// 💡 خدمة الملفات الثابتة (الـ Frontend)
app.use(express.static(path.join(__dirname, 'public')));
// 💡 خدمة مجلد الصور المحملة (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads/images'))); 

// ربط المسارات
const routes = require('./routes');
app.use('/', routes);

// ... (في نهاية الملف)
// 💡 بدء السيرفر
app.listen(PORT, () => {
    // ... (رسائل بدء التشغيل)
});
