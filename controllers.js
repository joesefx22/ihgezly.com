// controllers.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { jwtSecret, saltRounds } = require('./config');
const { getUserByEmail, createUser } = require('./models');

// 1. دالة تسجيل الدخول (login)
async function login(req, res) {
    const { email, password } = req.body;
    // (يمكن إضافة تحقق إضافي هنا لعدم ترك حقول فارغة)

    try {
        const user = await getUserByEmail(email); 

        if (!user) {
            return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
        }

        // التحقق من كلمة المرور
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
        }

        // توليد الـ JWT
        const payload = { id: user.user_id, role: user.role, email: user.email };
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' });

        // إرجاع التوكن والـ Role (مفتاح التوجيه للـ Frontend)
        res.json({ token, role: user.role, name: user.name, message: "تم تسجيل الدخول بنجاح." });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء تسجيل الدخول." });
    }
}

// 2. دالة إنشاء حساب (signup)
async function signup(req, res) {
    const { name, email, password } = req.body;
    // (يمكن إضافة تحقق إضافي هنا لعدم ترك حقول فارغة)

    try {
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: "هذا البريد الإلكتروني مسجل بالفعل." });
        }
        
        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // إنشاء المستخدم الافتراضي (player)
        const newUser = await createUser(name, email, hashedPassword);

        // إرجاع رسالة نجاح ليتوجه المستخدم لصفحة الدخول
        res.status(201).json({ message: "تم إنشاء حسابك بنجاح. يرجى تسجيل الدخول.", user: newUser });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء إنشاء الحساب." });
    }
}

module.exports = { login, signup };

// controllers.js (إضافة الدوال التالية)

// ... (الدوال الحالية: login, signup, getProfile) ...

// 4. دالة جلب حجوزات اللاعب
async function getMyBookings(req, res) {
    // ... (منطق جلب الحجوزات كما هو موضح في خطوة التفكير) ...
    const playerId = req.user.id;
    try {
        const bookings = await models.getPlayerBookings(playerId);
        res.json(bookings);
    } catch (error) {
        console.error('Get Bookings error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب الحجوزات." });
    }
}

// 5. دالة تحديث الملف الشخصي
async function updateProfile(req, res) {
    // ... (منطق تحديث الملف الشخصي بما في ذلك التحقق من كلمة المرور) ...
    const userId = req.user.id; 
    const { name, phone, password, current_password } = req.body;

    try {
        const updates = { name, phone };
        
        if (password) {
            if (!current_password) {
                return res.status(400).json({ message: "يجب إدخال كلمة المرور الحالية لتغيير كلمة المرور." });
            }
            const user = await models.getUserByEmail(req.user.email);
            const isMatch = await bcrypt.compare(current_password, user.password_hash);

            if (!isMatch) {
                return res.status(401).json({ message: "كلمة المرور الحالية غير صحيحة." });
            }
            
            updates.password_hash = await bcrypt.hash(password, saltRounds);
        }

        const updatedUser = await models.updatePlayerProfile(userId, updates);
        res.json({ message: "تم تحديث الملف الشخصي بنجاح.", user: updatedUser });

    } catch (error) {
        console.error('Update Profile error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء تحديث الملف." });
    }
}

// 6. دالة جلب طلبات 'لاعبوني معاكم'
async function getPlayerRequests(req, res) {
    try {
        const requests = await models.getActivePlayerRequests();
        res.json(requests);
    } catch (error) {
        console.error('Get Player Requests error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب طلبات اللاعبين." });
    }
}

module.exports = { 
    // ... (جميع الدوال الأخرى)
    getMyBookings,
    updateProfile,
    getPlayerRequests
};
