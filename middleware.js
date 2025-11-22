// middlewares/auth.js - Middlewares للتحقق من المصادقة والصلاحيات

const models = require('../models'); 

/**
 * Middleware للتحقق من تسجيل الدخول (عبر Session/Passport)
 */
function verifyToken(req, res, next) {
    if (req.isAuthenticated() && req.user) {
        // يمكننا هنا تحديث بيانات المستخدم في req.user إذا لزم الأمر
        return next();
    }
    // إرسال استجابة Unauthorized
    res.status(401).json({ success: false, message: 'غير مصرح لك بالدخول. يرجى تسجيل الدخول.' });
}


/**
 * Middleware للتحقق من الدور/الصلاحيات
 * @param {Array<string>} requiredRoles - الأدوار المطلوبة (مثل: ['admin', 'owner'])
 */
function checkPermissions(requiredRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            // هذا يجب أن يتم التقاطه بواسطة verifyToken، ولكنه فحص إضافي
            return res.status(401).json({ success: false, message: 'غير مصرح لك. لا يوجد دور محدد.' });
        }

        const userRole = req.user.role;

        if (requiredRoles.includes(userRole)) {
            return next();
        }

        // إرسال استجابة Forbidden
        res.status(403).json({ 
            success: false, 
            message: `غير مصرح لك. تحتاج إلى أحد الأدوار التالية: ${requiredRoles.join(', ')}` 
        });
    };
}

module.exports = {
    verifyToken,
    checkPermissions
};
// middleware.js
const jwt = require('jsonwebtoken');
const { jwtSecret, roles } = require('./config');

// 1. دالة التحقق من التوكن
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Authorization token required." });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, jwtSecret);
        // تخزين بيانات المستخدم (id, role, email) في الـ request
        req.user = decoded; 
        
        // إضافة: التحقق من أن الدور المستخرج من التوكن دور صحيح (لأمان إضافي)
        if (!roles.includes(req.user.role)) {
             throw new Error("Invalid role in token.");
        }
        
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token. Please log in again." });
    }
}

// 2. دالة التحقق من الـ Role
function checkRole(allowedRoles) {
    // التأكد أن allowedRoles عبارة عن مصفوفة (Array)
    const validRoles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return (req, res, next) => {
        if (!req.user || !req.user.role || !validRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: "Forbidden: You do not have the required permissions.",
                required_roles: validRoles 
            });
        }
        next();
    };
}

module.exports = { verifyToken, checkRole };
