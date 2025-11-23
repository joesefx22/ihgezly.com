// server.js - الملف الموحد والمنظم مع الإعدادات المتقدمة

require('dotenv').config();

/* ============ المكتبات الأساسية ============ */
const express = require('express');
const cors = require = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy; // تمت الإضافة
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const { execQuery, createTables, healthCheck, pool } = require('./db'); 
const models = require('./models'); // استيراد دوال الموديل للمصادقة

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET || 'a-very-strong-secret-key-for-session'; // مفتاح سري قوي

/* ============ 🗄️ إعداد قاعدة البيانات ============ */
async function initializeDB() {
    try {
        await createTables();
        const check = await healthCheck();
        console.log(`🔌 PostgreSQL connected: ${check.status} (Version: ${check.version})`);
    } catch (error) {
        console.error('❌ FATAL: Failed to connect or create tables:', error.message);
        process.exit(1);
    }
}


/* ============ 🛡️ إعداد الأمان (Middlewares) ============ */

// 1. Helmet: تأمين الرؤوس ضد نقاط الضعف المعروفة
app.use(helmet());

// 2. CORS: تفعيل الوصول من واجهة المستخدم (Front-End)
app.use(cors({
    origin: isProduction ? process.env.FRONTEND_URL : 'http://localhost:8080', // أو أي مسار للواجهة الأمامية
    credentials: true, // ضروري لإرسال ملفات تعريف الارتباط (Cookies)
}));

// 3. Rate Limiting: حد أقصى للطلبات
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب لكل IP
    message: 'عدد الطلبات تجاوز الحد المسموح به. يرجى المحاولة لاحقاً.',
    standardHeaders: true,
    legacyHeaders: false,
});
// تطبيق الحد على جميع مسارات API
app.use('/api/', apiLimiter); 

// 4. Cookie Parser: لتحليل ملفات تعريف الارتباط
app.use(cookieParser(SECRET)); 

// 5. Session: إعداد الجلسات (مطلوب لـ Passport)
app.use(session({
    secret: SECRET,
    resave: false,
    saveUninitialized: false, 
    cookie: { 
        secure: isProduction, // Secure فقط في الإنتاج (HTTPS)
        httpOnly: true, // لا يمكن الوصول إليه عبر JavaScript في المتصفح
        maxAge: 24 * 60 * 60 * 1000, // صلاحية الجلسة: يوم واحد
        sameSite: 'Lax' 
    },
}));

// 6. Body Parsers: لتحليل بيانات الطلبات
// **ملاحظة حول Webhook:** يفضل استخدام express.raw() لـ /api/payment/webhook إذا كانت بوابة الدفع تتطلب التحقق من التوقيع باستخدام الـ Raw Body.
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));


/* ============ 🔒 إعداد المصادقة (Passport) ============ */

// 1. تهيئة Local Strategy (البريد وكلمة المرور)
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await models.findUserByEmail(email);
        if (!user) return done(null, false); // المستخدم غير موجود

        const isValid = await models.comparePassword(password, user.password);
        if (!isValid) return done(null, false); // كلمة المرور غير صحيحة
        
        return done(null, user); // نجاح المصادقة
    } catch (err) {
        return done(err);
    }
}));

// 2. تهيئة Google Strategy (إذا كانت الأكواد موجودة في .env)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback" // يجب أن يتطابق مع المسار في routes.js
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            // منطق البحث عن المستخدم أو إنشائه
            const user = await models.findOrCreateGoogleUser({ 
                googleId: profile.id, 
                email: profile.emails[0].value,
                name: profile.displayName 
            }); 
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }));
}


// 3. Serialization / Deserialization
passport.serializeUser((user, done) => { 
    done(null, user.id); // حفظ مُعرف المستخدم في الجلسة
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await models.getUserById(id); // استدعاء من models.js
        done(null, user); 
    } catch (err) {
        done(err);
    }
});

// يجب أن يتم استدعاء initialize و session بعد app.use(session({...}));
app.use(passport.initialize());
app.use(passport.session()); 


/* ============ 🛡️ حماية CSRF ============ */

const csrfProtection = csrf({ cookie: true });
// تصدير دالة الحماية لاستخدامها في routes.js
module.exports.csrfProtection = csrfProtection; 


/* ============ 🖼️ خدمة الملفات الثابتة والصور ============ */

// لخدمة الملفات الثابتة (HTML, CSS, JS) من مجلد 'public'
app.use(express.static(path.join(__dirname, 'public')));
// لخدمة الصور المحملة بواسطة Multer من مجلد 'public/uploads/images'
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads/images'))); 


/* ============ 🔗 استيراد المسارات (Routes) ============ */

const apiRoutes = require('./routes'); // استيراد المسارات الموحدة
app.use('/', apiRoutes); // ربط جميع المسارات على المسار الرئيسي


/* ============ 💣 معالجة الأخطاء النهائية ============ */

// 1. معالجة خطأ 404 (الصفحة غير موجودة)
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
});

// 2. معالج الأخطاء العام (بما في ذلك CSRF Errors)
app.use((err, req, res, next) => {
    console.error('❌ Global Error Handler:', err.stack);
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ success: false, message: 'رمز CSRF غير صالح أو مفقود.' });
    }
    // معالجة خطأ Multer (رفع الصور)
    if (err.message === 'يُسمح برفع الصور فقط.') {
        return res.status(400).json({ success: false, message: err.message });
    }

    const statusCode = err.status || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'خطأ داخلي في السيرفر',
        // لا تعرض تفاصيل الخطأ في الإنتاج لأسباب أمنية
        error: isProduction ? undefined : err.stack
    });
});


/* ============ 🚀 بدء السيرفر ============ */

// تهيئة قاعدة البيانات ثم بدء السيرفر
initializeDB().then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on ${APP_URL}`);
      console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
      console.log(`🔐 Security: CSRF, Rate Limiting, Helmet Active`);
      console.log(`🎯 All setup completed successfully`);
    });
}).catch(error => {
    console.error('❌ Failed to start server after DB initialization:', error.message);
});
