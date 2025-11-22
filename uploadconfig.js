// uploadConfig.js - تهيئة Multer لرفع الصور

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// التأكد من وجود مسار التحميل (يجب أن يتطابق مع الإعداد في server.js)
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
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// دالة التحقق من نوع الملف (للسماح بالصور فقط)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        // يمكنك إرسال رسالة خطأ هنا
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
    // دوال مساعدة للاستخدام المباشر في routes.js
    uploadSingle: (fieldName) => upload.single(fieldName), 
    uploadArray: (fieldName, maxCount) => upload.array(fieldName, maxCount),
    upload 
};
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

// uploadConfig.js - يتم استخدامه كـ Middleware في routes.js

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// يجب التأكد من وجود مسار التحميل 
const UPLOADS_DIR = path.join(__dirname, 'public/uploads/images');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 1. استخراج إعدادات التخزين
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // تأكد من أن المسار صحيح ويتم إنشاؤه
        cb(null, UPLOADS_DIR); 
    },
    filename: (req, file, cb) => {
        // ضمان اسم فريد للملف
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// 2. استخراج فلتر الملفات (للسماح بالصور فقط)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('يُسمح برفع الصور فقط.'), false);
    }
};

// 3. تهيئة Multer النهائية (كائن التحميل الرئيسي)
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB كحد أقصى (يمكن تعديله)
});

module.exports = {
    // تصدير دوال Multer للاستخدام في المسارات
    uploadSingle: (fieldName) => upload.single(fieldName), // لرفع ملف واحد باسم معين
    uploadArray: (fieldName, maxCount) => upload.array(fieldName, maxCount), // لرفع مجموعة ملفات
    upload 
};
