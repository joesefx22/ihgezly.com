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
