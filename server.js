// server.js - الملف الموحد والمنظم مع الإعدادات المتقدمة

require('dotenv').config();

/* ============ المكتبات الأساسية ============ */
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy; // تمت الإضافة
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken'); // 💡 تم إضافة JWT
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

// 1. CORS
app.use(cors({
    origin: '*', // يمكن تعديل هذا ليناسب الواجهة الأمامية (Front-End) الخاصة بك
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
}));

// 2. Helmet (حماية إضافية للـ Headers)
app.use(helmet());

// 3. Rate Limiting (تحديد معدل الطلبات)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: 'لقد تجاوزت الحد الأقصى للطلبات. حاول مرة أخرى بعد 15 دقيقة.',
    standardHeaders: true,
    legacyHeaders: false,
});
// 💡 استبعاد Webhook من الـ Rate Limit لتجنب تعطيل مزود الدفع
app.use((req, res, next) => {
    if (req.path.startsWith('/api/payment/webhook')) {
        return next();
    }
    limiter(req, res, next);
});


// 4. Body Parsers (تحليل طلبات HTTP)
// 🚨 الإعداد الحرج: يجب قراءة الـ raw body لمسار الـ Webhook (P0-5)
app.use(express.json({
    // نقوم بحفظ الـ raw body فقط للمسار المحدد قبل تحليل JSON
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/payment/webhook')) {
            // تخزين البايتات الخام في req.rawBody لاستخدامها في التحقق من HMAC
            req.rawBody = buf.toString(); 
        }
    },
    limit: '5mb'
}));

// لتحليل البيانات المشفرة في عنوان URL (النماذج التقليدية)
app.use(express.urlencoded({ extended: true }));


// 5. Cookies & Session
app.use(cookieParser());
app.use(session({
    secret: SECRET, 
    resave: false, 
    saveUninitialized: false,
    cookie: { 
        secure: isProduction, // استخدم Secure cookie في الإنتاج
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 ساعة
    }
}));


// 6. CSRF Protection (نحتفظ به للـ Non-API routes/Forms القديمة فقط - P0-4)
// تم إزالة الحاجة لـ csrfProtection من API routes في ملف routes.js
const csrfProtection = csrf({ cookie: true });


// ============ 🔑 إعداد Passport/Authentication ============ 

// تهيئة Passport لـ Local Strategy (تسجيل الدخول بالبريد وكلمة المرور)
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const user = await models.findUserByEmail(email);

        if (!user) {
            return done(null, false, { message: 'البريد الإلكتروني غير مسجل.' });
        }

        const isMatch = await models.comparePassword(password, user.password); // دالة المقارنة
        if (!isMatch) {
            return done(null, false, { message: 'كلمة مرور غير صحيحة.' });
        }
        
        // 💡 تحقق إضافي لحالة is_approved (P0-3)
        if (user.role !== 'player' && !user.is_approved) {
             return done(null, false, { message: 'حسابك قيد المراجعة من قبل الإدارة.' });
        }

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));


// تهيئة Passport لـ Google OAuth2
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
    // يجب نقل منطق البحث عن المستخدم أو إنشائه هنا
    // (هذا المنطق يستخدم دوال models.js)
    // على سبيل المثال: models.findOrCreateUser({ googleId: profile.id, ... }, done);
    // استخدم (done) لإنهاء المصادقة
}));

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


// 💡 خدمة الملفات الثابتة والصور
app.use(express.static(path.join(__dirname, 'public')));
// لخدمة الصور المحملة بواسطة Multer (يجب أن يتطابق المسار مع uploadConfig.js)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads/images'))); 


/* ============ 🛣️ استيراد المسارات (Routes) ============ */

const routes = require('./routes');
app.use('/', routes); // تضمين جميع المسارات على المسار الرئيسي


/* ============ 💣 معالجة الأخطاء النهائية ============ */

// 1. معالجة خطأ 404 (الصفحة غير موجودة)
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
});

// 2. معالج الأخطاء العام (بما في ذلك CSRF Errors)
app.use((err, req, res, next) => {
    console.error('❌ Global Error Handler:', err.stack);
    
    // 💡 معالجة أخطاء CSRF (قد تحدث في Non-API routes)
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ success: false, message: 'رمز CSRF غير صالح أو مفقود.' });
    }
    
    // معالجة خطأ Multer (رفع الصور)
    if (err.message && err.message.includes('يُسمح برفع الصور فقط.')) {
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
      console.log(`🔌 PostgreSQL connected successfully`);
      console.log(`🔒 Security: Helmet, Rate Limiting Active. CSRF removed from JWT APIs.`);
      console.log(`💰 Webhook Ready: Raw body parser enabled for /api/payment/webhook`);
      console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
    });
}).catch(error => {
    console.error('❌ Failed to initialize database and start server:', error);
    process.exit(1);
});

// تصدير CSRF فقط للـ routes التي لا تزال تستخدمه (لتجنب كسرها)
module.exports = { 
    csrfProtection,
    app
};

// server.js - الملف الرئيسي المُحدث مع JWT

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { execQuery, createTables, healthCheck, pool } = require('./db'); 
const models = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';

// ===================================
// 🛡️ إعداد الأمان
// ===================================

app.use(helmet());
app.use(cors({
    origin: isProduction ? process.env.FRONTEND_URL : ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true,
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'عدد الطلبات تجاوز الحد المسموح به. يرجى المحاولة لاحقاً.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// استثناء Webhook من Rate Limiting
app.use((req, res, next) => {
    if (req.path.startsWith('/api/payment/webhook')) {
        return next();
    }
    apiLimiter(req, res, next);
});

app.use(cookieParser());
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/payment/webhook')) {
            req.rawBody = buf.toString();
        }
    },
    limit: '5mb'
}));
app.use(express.urlencoded({ extended: true }));

// ===================================
// 🔐 إعداد Passport
// ===================================

passport.use(new LocalStrategy({ 
    usernameField: 'email' 
}, async (email, password, done) => {
    try {
        const user = await models.findUserByEmail(email);
        if (!user) return done(null, false, { message: 'البريد الإلكتروني غير مسجل.' });

        const isValid = await models.comparePassword(password, user.password);
        if (!isValid) return done(null, false, { message: 'كلمة المرور غير صحيحة.' });
        
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
        try {
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

passport.serializeUser((user, done) => { 
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await models.getUserById(id);
        done(null, user); 
    } catch (err) {
        done(err);
    }
});

app.use(passport.initialize());

// ===================================
// 🗄️ إعداد قاعدة البيانات
// ===================================

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

// ===================================
// 🔗 خدمة الملفات والمسارات
// ===================================

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads/images')));

const routes = require('./routes');
app.use('/', routes);

// ===================================
// 💣 معالجة الأخطاء
// ===================================

app.use((req, res, next) => {
    res.status(404).json({ success: false, message: 'الصفحة غير موجودة' });
});

app.use((err, req, res, next) => {
    console.error('❌ Global Error Handler:', err.stack);
    
    if (err.message && err.message.includes('يُسمح برفع الصور فقط.')) {
        return res.status(400).json({ success: false, message: err.message });
    }

    const statusCode = err.status || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'خطأ داخلي في السيرفر',
        error: isProduction ? undefined : err.stack
    });
});

// ===================================
// 🚀 بدء السيرفر
// ===================================

initializeDB().then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on ${APP_URL}`);
      console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
      console.log(`🔐 Security: JWT Auth, Rate Limiting, Helmet Active`);
      console.log(`💰 Webhook Ready: Raw body parser enabled for payment webhooks`);
    });
}).catch(error => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
});

module.exports = app;
