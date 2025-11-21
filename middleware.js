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
