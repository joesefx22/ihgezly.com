// middlewares/auth.js - Middlewares للتحقق من المصادقة والصلاحيات (نسخة هجينة: Session/JWT)

const jwt = require('jsonwebtoken');
const config = require('../config'); // استيراد config لـ jwtSecret و roles

// ===================================
// 1. دالة التحقق من المصادقة (Auth - Session & JWT)
// ===================================

/**
 * دالة Middleware للتحقق من مصادقة المستخدم.
 * تفحص أولاً الجلسة (Passport)، وإذا لم تنجح، تفحص الـ JWT Bearer Token.
 */
function verifyToken(req, res, next) {
    // 1.1. التحقق من Session (إذا تم تسجيل الدخول عبر Passport)
    // نستخدم req.isAuthenticated() التي يوفرها Passport.js
    if (req.isAuthenticated() && req.user) {
        // المصادقة ناجحة عبر الجلسة
        return next();
    }

    // 1.2. التحقق من Authorization Header (JWT - لطلبات API غير الموثقة بجلسة)
    const authHeader = req.headers.authorization;

    // إذا لم تنجح المصادقة بالجلسة، نتحقق من وجود توكن
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: "غير مصرح لك بالدخول. (Authorization token required)." });
    }

    const token = authHeader.split(' ')[1];

    try {
        // التحقق من التوكن باستخدام المفتاح السري من config.js
        const decoded = jwt.verify(token, config.jwtSecret);
        
        // تخزين بيانات المستخدم (id, role, email) في الـ request لاستخدامها لاحقاً
        req.user = decoded; 
        
        // فحص إضافي: التأكد من أن الدور في التوكن صحيح وغير مزور
        if (!config.roles.includes(req.user.role)) {
             throw new Error("Invalid role in token.");
        }
        
        next();
    } catch (err) {
        // خطأ في فك تشفير/صلاحية التوكن
        return res.status(401).json({ success: false, message: "Invalid or expired token. Please log in again.", error: err.message });
    }
}

// ===================================
// 2. دالة التحقق من الصلاحيات (Authorization - checkPermissions)
// ===================================

/**
 * دالة Middleware للتحقق من دور المستخدم (Role Based Access Control - RBAC).
 * @param {Array<string>} requiredRoles - الأدوار المطلوبة (مثل: ['admin', 'owner'])
 */
function checkPermissions(requiredRoles) {
    // التأكد أن requiredRoles عبارة عن مصفوفة
    const validRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

    return (req, res, next) => {
        // يجب أن يكون req.user موجوداً هنا بعد مرور الطلب عبر verifyToken
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, message: 'خطأ في المصادقة. لا يوجد دور مستخدم محدد.' });
        }

        const userRole = req.user.role;

        if (validRoles.includes(userRole)) {
            // 💡 فحص حالة is_approved للمستخدمين غير اللاعبين
            // هذا يضمن أن المالكين/المديرين لا يمكنهم استخدام لوحة التحكم قبل الموافقة
            if (userRole !== 'player' && req.user.is_approved === false) {
                 return res.status(403).json({ success: false, message: 'حسابك بانتظار موافقة الإدارة، لا يمكنك الوصول للمسار حالياً.' });
            }
            return next();
        }

        // إرسال استجابة Forbidden (ممنوع)
        res.status(403).json({ 
            success: false, 
            message: `غير مصرح لك. تحتاج إلى أحد الأدوار التالية: ${validRoles.join(', ')}` 
        });
    };
}


// ===================================
// 📝 التصدير (Export)
// ===================================

module.exports = { 
    verifyToken, 
    checkPermissions 
};
