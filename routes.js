// routes.js
const express = require('express');
const router = express.Router();
const { login, signup } = require('./controllers');
const { verifyToken, checkRole } = require('./middleware');

// مسارات Authentication (غير محمية)
router.post('/auth/login', login);
router.post('/auth/signup', signup);

// مثال على مسار محمي (سيكون أساس عملك لاحقاً)
router.get('/user/profile', verifyToken, checkRole(['player', 'employee', 'owner', 'admin']), (req, res) => {
    // إذا وصل الطلب إلى هنا، فالمستخدم مسجل دخول وله دور صالح
    res.json({ message: "تم الوصول بنجاح لملفك الشخصي.", user: req.user });
});

module.exports = router;
