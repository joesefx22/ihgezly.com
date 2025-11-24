// server.js - الملف الرئيسي المُصلح والمُبسط

require('dotenv').config();

/* ============ المكتبات الأساسية ============ */
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { createTables, healthCheck } = require('./db'); 
const models = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';

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

// 1. Helmet - حماية الرؤوس
app.use(helmet());

// 2. CORS - آمن ومحدد
app.use(cors({
    origin: isProduction ? process.env.FRONTEND_URL : ['http://localhost:3000', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    optionsSuccessStatus: 204
}));

// 3. Rate Limiting - مع استثناء Webhook
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'لقد تجاوزت الحد الأقصى للطلبات. حاول مرة أخرى بعد 15 دقيقة.',
    standardHeaders: true,
    legacyHeaders: false,
});

// تطبيق Rate Limiting مع استثناء Webhook
app.use((req, res, next) => {
    if (req.path.startsWith('/api/payment/webhook')) {
        return next();
    }
    apiLimiter(req, res, next);
});

// 4. Body Parsers - مع دعم Raw Body للWebhook
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/payment/webhook')) {
            req.rawBody = buf.toString();
        }
    },
    limit: '5mb'
}));

app.use(express.urlencoded({ extended: true }));

// 5. Cookie Parser
app.use(cookieParser());

/* ============ 🔐 إعداد Passport للمصادقة ============ */

// إستراتيجية Local (البريد وكلمة المرور)
passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const user = await models.findUserByEmail(email);

        if (!user) {
            return done(null, false, { message: 'البريد الإلكتروني غير مسجل.' });
        }

        // استخدام comparePassword من models
        const isMatch = await models.comparePassword(password, user.password);
        if (!isMatch) {
            return done(null, false, { message: 'كلمة مرور غير صحيحة.' });
        }
        
        // تحقق من حالة الموافقة للمالكين والمديرين
        if ((user.role === 'owner' || user.role === 'manager') && !user.is_approved) {
            return done(null, false, { message: 'حسابك قيد المراجعة من قبل الإدارة.' });
        }

        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// إستراتيجية Google OAuth (إذا كانت المتغيرات متوفرة)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${APP_URL}/auth/google/callback`
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

// التهيئة الأساسية لـ Passport (بدون جلسات)
app.use(passport.initialize());

/* ============ 📁 خدمة الملفات الثابتة ============ */

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads/images')));

/* ============ 🛣️ استيراد وتحميل المسارات ============ */

const routes = require('./routes');
app.use('/', routes);

/* ============ 💣 معالجة الأخطاء النهائية ============ */

// معالجة خطأ 404
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'الصفحة غير موجودة' 
    });
});

// معالج الأخطاء العام
app.use((err, req, res, next) => {
    console.error('❌ Global Error Handler:', err.message);
    console.error(err.stack);

    // معالجة أخطاء رفع الملفات
    if (err.message && err.message.includes('يُسمح برفع الصور فقط.')) {
        return res.status(400).json({ 
            success: false, 
            message: err.message 
        });
    }

    const statusCode = err.status || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'خطأ داخلي في السيرفر',
        // إخفاء تفاصيل الخطأ في بيئة الإنتاج
        error: isProduction ? undefined : err.message
    });
});

/* ============ 🚀 بدء السيرفر ============ */

initializeDB().then(() => {
    app.listen(PORT, () => {
        console.log('='.repeat(50));
        console.log(`✅ Server running on ${APP_URL}`);
        console.log(`🔌 PostgreSQL connected successfully`);
        console.log(`🔒 Security: JWT Auth, Rate Limiting, Helmet Active`);
        console.log(`💰 Webhook Ready: Raw body parser enabled`);
        console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
        console.log('='.repeat(50));
        
        // معلومات إضافية للتطوير
        if (!isProduction) {
            console.log('\n📋 Available Routes:');
            console.log('├── /api/signup (POST)');
            console.log('├── /api/login (POST)');
            console.log('├── /api/stadiums (GET)');
            console.log('├── /api/bookings (POST)');
            console.log('├── /api/payment/webhook (POST)');
            console.log('└── /health (GET)\n');
        }
    });
}).catch(error => {
    console.error('❌ Failed to initialize database and start server:', error.message);
    process.exit(1);
});

module.exports = app;



























// server.js - الملف الرئيسي المُصلح والمُبسط

require('dotenv').config();

/* ============ المكتبات الأساسية ============ */
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const { createTables, healthCheck } = require('./db'); 

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';

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

// 1. Helmet - حماية الرؤوس
app.use(helmet());

// 2. CORS - آمن ومحدد
app.use(cors({
    origin: isProduction ? process.env.FRONTEND_URL : ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    optionsSuccessStatus: 204
}));

// 3. Rate Limiting - مع استثناء Webhook
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'لقد تجاوزت الحد الأقصى للطلبات. حاول مرة أخرى بعد 15 دقيقة.',
    standardHeaders: true,
    legacyHeaders: false,
});

// تطبيق Rate Limiting مع استثناء Webhook
app.use((req, res, next) => {
    if (req.path.startsWith('/api/payment/webhook')) {
        return next();
    }
    apiLimiter(req, res, next);
});

// 4. Body Parsers - مع دعم Raw Body للWebhook
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/payment/webhook')) {
            req.rawBody = buf.toString();
        }
    },
    limit: '5mb'
}));

app.use(express.urlencoded({ extended: true }));

// 5. Cookie Parser
app.use(cookieParser());

/* ============ 📁 خدمة الملفات الثابتة ============ */

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads/images')));

/* ============ 🛣️ استيراد وتحميل المسارات ============ */

const routes = require('./routes');
app.use('/', routes);

/* ============ 💣 معالجة الأخطاء النهائية ============ */

// معالجة خطأ 404
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'الصفحة غير موجودة' 
    });
});

// معالج الأخطاء العام
app.use((err, req, res, next) => {
    console.error('❌ Global Error Handler:', err.message);
    console.error(err.stack);

    // معالجة أخطاء رفع الملفات
    if (err.message && err.message.includes('يُسمح برفع الصور فقط.')) {
        return res.status(400).json({ 
            success: false, 
            message: err.message 
        });
    }

    const statusCode = err.status || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'خطأ داخلي في السيرفر',
        // إخفاء تفاصيل الخطأ في بيئة الإنتاج
        error: isProduction ? undefined : err.message
    });
});

/* ============ 🚀 بدء السيرفر ============ */

initializeDB().then(() => {
    app.listen(PORT, () => {
        console.log('='.repeat(50));
        console.log(`✅ Server running on ${APP_URL}`);
        console.log(`🔌 PostgreSQL connected successfully`);
        console.log(`🔒 Security: JWT Auth, Rate Limiting, Helmet Active`);
        console.log(`💰 Webhook Ready: Raw body parser enabled`);
        console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
        console.log('='.repeat(50));
        
        // معلومات إضافية للتطوير
        if (!isProduction) {
            console.log('\n📋 Available Routes:');
            console.log('├── /api/signup (POST)');
            console.log('├── /api/login (POST)');
            console.log('├── /api/stadiums (GET)');
            console.log('├── /api/bookings (POST)');
            console.log('├── /api/payment/webhook (POST)');
            console.log('└── /health (GET)\n');
        }
    });
}).catch(error => {
    console.error('❌ Failed to initialize database and start server:', error.message);
    process.exit(1);
});

module.exports = app;
