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

// middlewares/auth.js - مصادقة JWT موحدة ومُصلحة

const jwt = require('jsonwebtoken');

// الأدوار المسموحة في النظام
const ROLES = ['player', 'owner', 'manager', 'admin'];

/**
 * 🔐 ميدلوير التحقق من توكن JWT
 */
function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                message: 'مطلوب توكن مصادقة' 
            });
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'توكن المصادقة غير صالح' 
            });
        }

        // فك تشفير التوكن
        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || 'fallback-secret'
        );

        // التحقق من وجود البيانات الأساسية
        if (!decoded.id || !decoded.role || !decoded.email) {
            return res.status(401).json({ 
                success: false, 
                message: 'توكن المصادقة تالف' 
            });
        }

        // التحقق من صحة الدور
        if (!ROLES.includes(decoded.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'دور المستخدم غير صالح' 
            });
        }

        // إضافة بيانات المستخدم للطلب
        req.user = {
            id: decoded.id,
            role: decoded.role,
            email: decoded.email
        };

        next();
    } catch (error) {
        console.error('JWT Verification Error:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'انتهت صلاحية التوكن، يرجى تسجيل الدخول مرة أخرى' 
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false, 
                message: 'توكن مصادقة غير صالح' 
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: 'خطأ في التحقق من المصادقة' 
        });
    }
}

/**
 * 🛡️ ميدلوير التحقق من الصلاحيات
 * @param {string[]} allowedRoles - الأدوار المسموح لها بالوصول
 */
function checkPermissions(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'غير مصرح - يرجى تسجيل الدخول' 
            });
        }

        // التحقق من أن الدور مسموح
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'غير مصرح - لا تملك الصلاحية للوصول إلى هذا المورد' 
            });
        }

        // تحقق إضافي للمالكين والمديرين - يجب أن يكون الحساب مفعل
        if ((req.user.role === 'owner' || req.user.role === 'manager') && !req.user.is_approved) {
            return res.status(403).json({ 
                success: false, 
                message: 'حسابك قيد المراجعة من قبل الإدارة' 
            });
        }

        next();
    };
}

/**
 * 🎯 ميدلوير للتحقق من ملكية الملعب (للمالكين والمديرين)
 */
function checkStadiumOwnership(req, res, next) {
    const stadiumId = req.params.stadiumId || req.body.stadium_id;
    
    if (!stadiumId) {
        return res.status(400).json({ 
            success: false, 
            message: 'معرف الملعب مطلوب' 
        });
    }

    // TODO: يمكن إضافة منطق للتحقق من ملكية الملعب
    // هذا يحتاج استعلام إضافي لقاعدة البيانات
    // مؤقتاً نعتمد على checkPermissions فقط

    // middlewares/auth.js - middleware للمصادقة والصلاحيات

const jwt = require('jsonwebtoken');

/**
 * middleware للتحقق من J token
 */
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            success: false, 
            message: 'مطلوب token للمصادقة' 
        });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token غير صالح أو منتهي الصلاحية' 
        });
    }
}

/**
 * middleware للتحقق من الصلاحيات
 */
function checkPermissions(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'غير مصرح بالوصول' 
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'ليس لديك صلاحية للوصول إلى هذا المورد' 
            });
        }

        next();
    };
}

module.exports = {
    verifyToken,
    checkPermissions
};
    next();
}

/**
 * 🔍 ميدلوير للتحقق من ملكية الحجز (لللاعبين)
 */
function checkBookingOwnership(req, res, next) {
    const bookingId = req.params.bookingId || req.body.booking_id;
    
    if (!bookingId) {
        return res.status(400).json({ 
            success: false, 
            message: 'معرف الحجز مطلوب' 
        });
    }

    // TODO: يمكن إضافة منطق للتحقق من ملكية الحجز
    // هذا يحتاج استعلام إضافي لقاعدة البيانات
    
    next();
}

module.exports = {
    verifyToken,
    checkPermissions,
    checkStadiumOwnership,
    checkBookingOwnership
};
