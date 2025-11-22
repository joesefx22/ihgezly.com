// uploadConfig.js (مثال على ملف جديد)

const multer = require('multer');
const path = require('path');

// إعداد التخزين (Disk Storage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // تحديد مجلد الحفظ
        cb(null, path.join(__dirname, 'public/uploads/images')); 
    },
    filename: (req, file, cb) => {
        // ضمان اسم فريد للملف
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// دالة التحقق من نوع الملف (للسماح بالصور فقط)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('يُسمح برفع الصور فقط.'), false);
    }
};

// تهيئة Multer النهائية
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB كحد أقصى
});

module.exports = {
    upload // تصدير الكائن للاستخدام في المتحكمات
};

// uploadConfig.js

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// التأكد من وجود مسار التحميل
const UPLOADS_DIR = path.join(__dirname, 'public/uploads/images');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// إعداد التخزين (Disk Storage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR); 
    },
    filename: (req, file, cb) => {
        // ضمان اسم فريد للملف
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// دالة التحقق من نوع الملف (للسماح بالصور فقط)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('يُسمح برفع الصور فقط.'), false);
    }
};

// تهيئة Multer النهائية
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB كحد أقصى
});

module.exports = {
    // 💡 التصدير الأساسي (لتحميل صورة واحدة باسم 'pitch_image' مثلاً)
    uploadSingle: upload.single('pitch_image'),
    // 💡 تصدير كائن Multer خام إذا احتجت لعدة ملفات
    upload 
};
