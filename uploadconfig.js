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

# قاعدة البيانات
DATABASE_URL=postgresql://username:password@localhost:5432/ehgzly_db
DB_HOST=localhost
DB_USER=postgres
DB_PASS=password
DB_NAME=ehgzly_db
DB_PORT=5432

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# البريد الإلكتروني
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# التطبيق
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:8080

# الدفع
PAYMENT_WEBHOOK_SECRET=your-payment-webhook-secret

// uploadConfig.js - إعدادات رفع الملفات
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// تأكد من وجود مجلد uploads
const uploadDir = path.join(__dirname, 'uploads', 'images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// إعدادات multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

// فلترة الملفات
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('يُسمح برفع الصور فقط.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// تصدير middleware لرفع ملف واحد
const uploadSingle = upload.single('image');

module.exports = {
    uploadSingle,
    upload
};
