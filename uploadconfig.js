// uploadConfig.js - تهيئة Multer لرفع الصور (النسخة النهائية)

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// التأكد من وجود مسار التحميل (يجب أن يتطابق مع الإعداد في server.js لخدمة الملفات الثابتة)
const UPLOADS_DIR = path.join(__dirname, 'public/uploads/images');

// التحقق من وجود المسار وإنشائه إذا لم يكن موجوداً
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. إعداد التخزين (Disk Storage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // يتم تمرير مسار الحفظ
        cb(null, UPLOADS_DIR); 
    },
    filename: (req, file, cb) => {
        // ضمان اسم فريد للملف باستخدام التاريخ وعشوائية لمنع التضارب
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // حفظ اسم الملف بالحقل الأصلي والمُلحق الفريد والامتداد الأصلي
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// 2. دالة التحقق من نوع الملف (للسماح بالصور فقط)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        // رفض الملف مع رسالة خطأ
        cb(new Error('يُسمح برفع الصور فقط.'), false); 
    }
};

// 3. تهيئة Multer النهائية (كائن التحميل الرئيسي)
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // الحد الأقصى لحجم الملف: 5MB
});

// 4. دالة مساعدة لتسهيل الاستخدام في Routes
// 'image' هو اسم الحقل (Form-Data field name) الذي نتوقع أن يحمل الصورة
const uploadSingle = upload.single('image');

module.exports = {
    upload, 
    uploadSingle // يتم تصديرها للاستخدام كـ Middleware في routes.js
};
