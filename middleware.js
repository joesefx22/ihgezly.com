// middlewares/auth.js - middleware للمصادقة والصلاحيات (النسخة النهائية المُصلحة)

const jwt = require('jsonwebtoken');
const { execQueryOne } = require('./db');

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
            email: decoded.email,
            is_approved: decoded.is_approved !== undefined ? decoded.is_approved : true
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

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `غير مصرح - لا تملك الصلاحية للوصول إلى هذا المورد. الأدوار المسموحة: ${allowedRoles.join(', ')}` 
            });
        }

        if ((req.user.role === 'owner' || req.user.role === 'manager') && req.user.is_approved === false) {
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
async function checkStadiumOwnership(req, res, next) {
    try {
        const stadiumId = req.params.stadiumId || req.body.stadium_id;
        
        if (!stadiumId) {
            return res.status(400).json({ 
                success: false, 
                message: 'معرف الملعب مطلوب' 
            });
        }

        // التحقق الفعلي من ملكية الملعب
        const stadium = await execQueryOne(
            'SELECT owner_id FROM stadiums WHERE id = $1',
            [stadiumId]
        );

        if (!stadium) {
            return res.status(404).json({ 
                success: false, 
                message: 'الملعب غير موجود' 
            });
        }

        // السماح للمالك أو الأدمن
        if (stadium.owner_id === req.user.id || req.user.role === 'admin') {
            return next();
        }

        // التحقق إذا كان المستخدم موظف معين في الملعب
        if (req.user.role === 'manager') {
            const assignment = await execQueryOne(
                'SELECT id FROM employee_assignments WHERE user_id = $1 AND stadium_id = $2',
                [req.user.id, stadiumId]
            );
            
            if (assignment) {
                return next();
            }
        }

        return res.status(403).json({ 
            success: false, 
            message: 'غير مصرح - لا تملك صلاحية الوصول لهذا الملعب' 
        });

    } catch (error) {
        console.error('Stadium Ownership Check Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'خطأ في التحقق من ملكية الملعب' 
        });
    }
}

/**
 * 🔍 ميدلوير للتحقق من ملكية الحجز
 */
async function checkBookingOwnership(req, res, next) {
    try {
        const bookingId = req.params.bookingId || req.body.booking_id;
        
        if (!bookingId) {
            return res.status(400).json({ 
                success: false, 
                message: 'معرف الحجز مطلوب' 
            });
        }

        // التحقق الفعلي من ملكية الحجز
        const booking = await execQueryOne(
            `SELECT b.user_id, b.stadium_id, s.owner_id 
             FROM bookings b 
             JOIN stadiums s ON b.stadium_id = s.id 
             WHERE b.id = $1`,
            [bookingId]
        );

        if (!booking) {
            return res.status(404).json({ 
                success: false, 
                message: 'الحجز غير موجود' 
            });
        }

        // السماح لصاحب الحجز أو مالك الملعب أو الأدمن
        if (booking.user_id === req.user.id || 
            booking.owner_id === req.user.id || 
            req.user.role === 'admin') {
            return next();
        }

        // التحقق إذا كان المستخدم موظف معين في الملعب
        if (req.user.role === 'manager') {
            const assignment = await execQueryOne(
                'SELECT id FROM employee_assignments WHERE user_id = $1 AND stadium_id = $2',
                [req.user.id, booking.stadium_id]
            );
            
            if (assignment) {
                return next();
            }
        }

        return res.status(403).json({ 
            success: false, 
            message: 'غير مصرح - لا تملك صلاحية الوصول لهذا الحجز' 
        });

    } catch (error) {
        console.error('Booking Ownership Check Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'خطأ في التحقق من ملكية الحجز' 
        });
    }
}

/**
 * 👑 ميدلوير للتحقق من صلاحيات الأدمن فقط
 */
function requireAdmin(req, res, next) {
    return checkPermissions(['admin'])(req, res, next);
}

/**
 * ⚽ ميدلوير للتحقق من صلاحيات المالكين والمديرين فقط
 */
function requireOwnerOrManager(req, res, next) {
    return checkPermissions(['owner', 'manager'])(req, res, next);
}

/**
 * 🎮 ميدلوير للتحقق من صلاحيات اللاعبين فقط
 */
function requirePlayer(req, res, next) {
    return checkPermissions(['player'])(req, res, next);
}

/**
 * 🔒 ميدلوير للتحقق من صلاحيات أي مستخدم مسجل
 */
function requireAuth(req, res, next) {
    return verifyToken(req, res, next);
}

module.exports = {
    verifyToken,
    checkPermissions,
    checkStadiumOwnership,
    checkBookingOwnership,
    requireAdmin,
    requireOwnerOrManager,
    requirePlayer,
    requireAuth,
    ROLES
};
