// server.js - الملف الموحد والمنظم ونقطة الدخول الرئيسية

require('dotenv').config();

/* ============ المكتبات الأساسية والمساعدة (كما كانت في النسخة الأصلية) ============ */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
// تم نقل هذه المكتبات التي كانت موجودة في ملفك القديم
const fs = require('fs');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer'); // سيتم استخدامها عبر emailService.js
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode'); // قد لا نحتاجها في server.js ولكنها كانت موجودة في ملفك القديم
const multer = require('multer'); // سيتم استخدامها عبر uploadConfig.js

/* ============ ملفات النظام المُنظَّمة (التي سنقوم بإنشائها) ============ */
// يتم استيراد دوال DB و Models مباشرة لاستخدامها في التهيئة (مثل Passport)
const { createTables, healthCheck } = require('./db'); 
const models = require('./models'); // استيراد دوال الموديل للمصادقة
const routes = require('./routes'); // ملف المسارات الرئيسي

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';

/* ============ 🗄️ إعداد قاعدة البيانات والتحقق من الصحة ============ */
async function initializeDB() {
    try {
        await createTables(); // إنشاء الجداول إذا لم تكن موجودة (المنطق موجود في db.js)
        const check = await healthCheck();
        console.log(`🔌 PostgreSQL connected: ${check.status} (Version: ${check.version})`);
    } catch (error) {
        console.error('❌ FATAL: Failed to connect or create tables:', error.message);
        process.exit(1);
    }
}
initializeDB();


/* ============ 🛡️ إعداد الأمان والـ Middlewares العامة ============ */

// 1. CORS
app.use(cors({
    origin: APP_URL, 
    credentials: true, 
}));

// 2. Helmet (لحماية رؤوس HTTP)
app.use(helmet());

// 3. Rate Limiter (لتحديد معدل الطلبات)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // حد 100 طلب لكل IP خلال 15 دقيقة
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// 4. Body Parsers (لتحليل جسم الطلبات JSON و URL-encoded)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


/* ============ 🍪 إعداد الجلسات والمصادقة (Session & Passport) ============ */

// 5. Session Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'my_super_secure_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction, 
        httpOnly: true, 
        maxAge: 7 * 24 * 60 * 60 * 1000 // أسبوع واحد
    }
}));

// 6. Passport Initialization
app.use(passport.initialize());
app.use(passport.session()); 

// 7. Passport Strategies (Google/Social Login)
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // يتم استدعاء دالة من models.js للبحث أو إنشاء المستخدم
        const user = await models.findOrCreateGoogleUser({ 
            googleId: profile.id, 
            name: profile.displayName,
            email: profile.emails[0].value 
        });
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

// 8. Passport Serialization
passport.serializeUser((user, done) => { 
    done(null, user.id); 
});

// 9. Passport Deserialization
passport.deserializeUser(async (id, done) => {
    try {
        const user = await models.getUserById(id); // استدعاء من models.js
        done(null, user); 
    } catch (err) {
        done(err);
    }
});


/* ============ 🔑 إعداد CSRF ============ */

// 10. Cookie Parser
app.use(cookieParser());

// 11. CSRF Protection
const csrfProtection = csrf({ cookie: true });

// تصدير دالة CSRF Token ليتم استخدامها في routes.js
module.exports.csrfProtection = csrfProtection; 

// مسار خاص لجلب CSRF Token (للـ Frontend)
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});


/* ============ 🌐 خدمة الملفات الثابتة والـ Routes ============ */

// 12. خدمة الملفات الثابتة (الـ Frontend: HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));
// 13. خدمة مجلد الصور المحملة (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads/images'))); 

// 14. ربط المسارات
app.use('/', routes);

// 15. معالجة 404 (يجب أن تكون آخر middleware)
app.use((req, res) => {
    // إرسال رد JSON للمسارات API غير الموجودة
    if (req.accepts('json') || req.path.startsWith('/api/')) {
         return res.status(404).json({ success: false, message: 'مسار API غير موجود' });
    }
    // إرسال صفحة 404 لطلبات الـ Frontend
    res.status(404).send('<!DOCTYPE html><html lang="ar">... صفحة 404 ...</html>');
});


/* ============ 🚀 بدء التشغيل ============ */

app.listen(PORT, () => {
    console.log(`✅ Server running on ${APP_URL}`);
    console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
});
