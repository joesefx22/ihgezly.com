// config.js
module.exports = {
    // إعدادات JWT
    jwtSecret: process.env.JWT_SECRET || "YOUR_ULTRA_SECURE_KEY_1234567890", 
    jwtExpiresIn: '1d', // مدة صلاحية التوكن
    
    // إعدادات تشفير كلمة المرور
    saltRounds: 10,
    
    // الأدوار المسموح بها (مهمة لتجنب الأخطاء الإملائية)
    roles: ['player', 'employee', 'owner', 'admin'],
    
    // إعدادات أخرى (الدفع، الإشعارات، إلخ...)
};
