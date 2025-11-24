// server.js - الملف الرئيسي المُصلح والمُبسط - النسخة النهائية الكاملة

require('dotenv').config();

/* ============ المكتبات الأساسية ============ */
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

// ============ 🛡️ استيراد المكونات الأساسية ============
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
        
        // إنشاء مستخدم أدمن افتراضي إذا لم يكن موجود (اختياري)
        await createDefaultAdmin();
    } catch (error) {
        console.error('❌ FATAL: Failed to connect or create tables:', error.message);
        process.exit(1);
    }
}

/* ============ 🛡️ إعداد الأمان (Middlewares) ============ */

// 1. Helmet - حماية الرؤوس
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" } // علشان الصور تعمل
}));

// 2. CORS - آمن ومحدد
app.use(cors({
    origin: isProduction ? process.env.FRONTEND_URL : [
        'http://localhost:3000', 
        'http://localhost:8080', 
        'http://localhost:5173',
        'http://127.0.0.1:3000'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 204
}));

// 3. Rate Limiting - مع استثناء Webhook
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب كل 15 دقيقة
    message: {
        success: false,
        message: 'لقد تجاوزت الحد الأقصى للطلبات. حاول مرة أخرى بعد 15 دقيقة.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// تطبيق Rate Limiting مع استثناء Webhook والملفات الثابتة
app.use((req, res, next) => {
    if (req.path.startsWith('/api/payment/webhook') || 
        req.path.startsWith('/uploads/') ||
        req.path.startsWith('/health')) {
        return next();
    }
    apiLimiter(req, res, next);
});

// 4. Body Parsers - مع دعم Raw Body للWebhook
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.startsWith('/api/payment/webhook')) {
            req.rawBody = buf.toString(); // حفظ الـ raw body للـ webhook
        }
    },
    limit: '10mb' // زيادة الحد علشان رفع الصور
}));

app.use(express.urlencoded({ 
    extended: true,
    limit: '10mb'
}));

// 5. Cookie Parser
app.use(cookieParser());

/* ============ 📁 خدمة الملفات الثابتة ============ */

// خدمة الملفات الثابتة (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: isProduction ? '1d' : '0' // Caching في production
}));

// خدمة ملفات الـ uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '7d' // caching للصور
}));

// خدمة ملفات الـ admin dashboard لو عندك
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

/* ============ 🛣️ استيراد وتحميل المسارات ============ */

const routes = require('./routes');
app.use('/', routes);

/* ============ 🎯 مسارات الداشبوردات الجديدة ============ */

// صفحة اللاعب الرئيسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// لوحة تحكم الموظف
app.get('/employee/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'employee-dashboard.html'));
});

// لوحة تحكم المالك
app.get('/owner/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'owner-dashboard.html'));
});

// لوحة تحكم الأدمن
app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// صفحة انتظار الموافقة
app.get('/pending-approval', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pending-approval.html'));
});

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// صفحة التسجيل
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

/* ============ 🔧 دوال مساعدة ============ */

// دالة إنشاء أدمن افتراضي (للتطوير)
async function createDefaultAdmin() {
    try {
        const models = require('./models');
        const existingAdmin = await models.findUserByEmail('admin@ehgzly.com');
        
        if (!existingAdmin) {
            console.log('👑 Creating default admin user...');
            await models.registerNewUser({
                name: 'System Admin',
                email: 'admin@ehgzly.com',
                password: 'admin123',
                role: 'admin',
                phone: '+201000000000'
            });
            console.log('✅ Default admin created: admin@ehgzly.com / admin123');
        }
    } catch (error) {
        console.log('⚠️ Could not create default admin:', error.message);
    }
}

/* ============ 💣 معالجة الأخطاء النهائية ============ */

// معالجة خطأ 404
app.use((req, res) => {
    // إذا كان طلب API
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
            success: false, 
            message: 'API endpoint غير موجود',
            path: req.path
        });
    }
    
    // إذا كان طلب صفحة
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// معالج الأخطاء العام
app.use((err, req, res, next) => {
    console.error('❌ Global Error Handler:', err.message);
    
    // Log التفاصيل الكاملة في development
    if (!isProduction) {
        console.error('Stack:', err.stack);
        console.error('URL:', req.url);
        console.error('Method:', req.method);
        console.error('Body:', req.body);
    }

    // معالجة أخطاء JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
            success: false, 
            message: 'Token مصادقة غير صالح' 
        });
    }
    
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
            success: false, 
            message: 'انتهت صلاحية token المصادقة' 
        });
    }

    // معالجة أخطاء رفع الملفات
    if (err.message && err.message.includes('يُسمح برفع الصور فقط')) {
        return res.status(400).json({ 
            success: false, 
            message: err.message 
        });
    }

    // معالجة أخطاء قاعدة البيانات
    if (err.code && err.code.startsWith('23')) { // Postgres errors
        return res.status(400).json({ 
            success: false, 
            message: 'خطأ في البيانات المدخلة' 
        });
    }

    const statusCode = err.status || 500;
    res.status(statusCode).json({
        success: false,
        message: isProduction ? 'حدث خطأ داخلي في السيرفر' : err.message,
        // إرجاع معلومات إضافية في development فقط
        ...(!isProduction && { 
            error: err.message,
            stack: err.stack
        })
    });
});

/* ============ 🚀 بدء السيرفر ============ */

initializeDB().then(() => {
    const server = app.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log(`🚀 Server running on ${APP_URL}`);
        console.log(`🔌 PostgreSQL connected successfully`);
        console.log(`🛡️  Security: JWT Auth, Rate Limiting, Helmet Active`);
        console.log(`💰 Webhook Ready: Raw body parser enabled`);
        console.log(`🌐 Environment: ${isProduction ? 'Production' : 'Development'}`);
        console.log('='.repeat(60));
        
        // معلومات إضافية للتطوير
        if (!isProduction) {
            console.log('\n📋 Available Routes:');
            console.log('├── /api/signup (POST)');
            console.log('├── /api/login (POST)');
            console.log('├── /api/stadiums (GET)');
            console.log('├── /api/bookings (POST)');
            console.log('├── /api/payment/webhook (POST)');
            console.log('├── /health (GET)');
            console.log('├── /health/db (GET)');
            console.log('├── / (Player Dashboard)');
            console.log('├── /employee/dashboard (Employee Dashboard)');
            console.log('├── /owner/dashboard (Owner Dashboard)');
            console.log('├── /admin/dashboard (Admin Dashboard)');
            console.log('└── /pending-approval (Pending Approval)');
            
            console.log('\n👑 Default Admin: admin@ehgzly.com / admin123');
        }
    });

    // معالجة الإغلاق النظيف
    process.on('SIGTERM', () => {
        console.log('🛑 SIGTERM received, shutting down gracefully');
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('🛑 SIGINT received, shutting down gracefully');
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
    });

}).catch(error => {
    console.error('❌ Failed to initialize database and start server:', error.message);
    process.exit(1);
});

module.exports = app;
