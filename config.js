// config.js - ملف الإعدادات الأساسي والنهائي (مُحسّن)

require('dotenv').config();

// التحقق من المتغيرات الحرجة في بيئة الإنتاج
if (process.env.NODE_ENV === 'production') {
    const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.error('❌ متغيرات بيئة مطلوبة مفقودة:', missingVars.join(', '));
        process.exit(1);
    }
}

module.exports = {
    // ===================================
    // 🔐 إعدادات الأمان والمصادقة
    // ===================================
    jwtSecret: process.env.JWT_SECRET || "dev-secret-key-change-in-production",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    saltRounds: 10,
    sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',

    // ===================================
    // 👥 إعدادات الأدوار
    // ===================================
    roles: ['player', 'owner', 'manager', 'admin'],

    // ===================================
    // 💰 إعدادات الدفع
    // ===================================
    paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'dev-webhook-secret',
    depositCutoffHours: 24,

    // ===================================
    // 📧 إعدادات البريد الإلكتروني
    // ===================================
    senderEmail: process.env.SENDER_EMAIL || 'no-reply@ehgzly.com',

    // ===================================
    // 🎯 إعدادات التطبيق العامة
    // ===================================
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    appUrl: process.env.APP_URL || 'http://localhost:3000'
};
