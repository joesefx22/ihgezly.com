// emailService.js - خدمة Nodemailer للإشعارات

const nodemailer = require('nodemailer');
require('dotenv').config(); 

// إعداد الناقل (Transporter) باستخدام إعدادات البيئة
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, 
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * دالة إرسال بريد إلكتروني
 */
async function sendEmail(to, subject, body) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn(`[EMAIL-MOCK] لم يتم تكوين خدمة البريد. تم تجاهل الإرسال إلى: ${to}`);
        return; 
    }
    
    try {
        let info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'احجزلي'}" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: body, 
        });

        console.log(`✅ تم إرسال الرسالة بنجاح إلى ${to}. ID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ فشل إرسال البريد الإلكتروني إلى ${to}:`, error);
    }
}

module.exports = {
    sendEmail
};
// emailService.js (ملف جديد)

const nodemailer = require('nodemailer');

// إعداد الناقل (Transporter) باستخدام إعدادات البيئة (في ملف .env)
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email', // مثال: smtp.sendgrid.net
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true إذا كان المنفذ 465، false للـ 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * دالة إرسال بريد إلكتروني
 * @param {string} to - البريد الإلكتروني للمستقبل
 * @param {string} subject - عنوان الرسالة
 * @param {string} body - محتوى الرسالة (HTML أو نص عادي)
 */
async function sendEmail(to, subject, body) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn(`[EMAIL-MOCK] لم يتم تكوين خدمة البريد. تم إرسال الرسالة إلى: ${to}, بعنوان: ${subject}`);
        return; // لا ترسل شيئاً في حالة عدم وجود تهيئة
    }
    
    try {
        let info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'احجزلي'}" <${process.env.EMAIL_USER}>`, // المرسل
            to: to, // المستقبل
            subject: subject, // العنوان
            html: body, // المحتوى بتنسيق HTML
            // text: body, // إذا كنت تفضل إرسال نص عادي
        });

        console.log(`✅ تم إرسال الرسالة بنجاح إلى ${to}. ID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ فشل إرسال البريد الإلكتروني إلى ${to}:`, error);
    }
}

module.exports = {
    sendEmail
};

// emailService.js (نهاية الملف)

// ... (الكود الكامل لـ transporter و sendEmail)

module.exports = {
    // 💡 تصدير الدالة هنا
    sendEmail 
};

// emailService.js

const nodemailer = require('nodemailer');
// استيراد dotenv لضمان عمل إعدادات البيئة
require('dotenv').config(); 

// إعداد الناقل (Transporter) باستخدام إعدادات البيئة
const transporter = nodemailer.createTransport({
    // هذه الإعدادات تأتي من البيئة (مثل .env)
    host: process.env.EMAIL_HOST || 'smtp.example.com', 
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * دالة إرسال بريد إلكتروني
 */
async function sendEmail(to, subject, body) {
    // كود فحص التهيئة لتجنب الأخطاء
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn(`[EMAIL-MOCK] لم يتم تكوين خدمة البريد. تم تجاهل الإرسال إلى: ${to}`);
        return; 
    }
    
    try {
        let info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'احجزلي'}" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: body, 
        });

        console.log(`✅ تم إرسال الرسالة بنجاح إلى ${to}. ID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ فشل إرسال البريد الإلكتروني إلى ${to}:`, error);
    }
}

module.exports = {
    sendEmail
};

// emailService.js - يجب استيراد هذه الدالة واستخدامها في controllers.js لـ الإشعارات

const nodemailer = require('nodemailer');
// تأكد من تهيئة .env في server.js للوصول إلى متغيرات البيئة
require('dotenv').config(); 

// 1. استخراج إعدادات الناقل (Transporter)
const transporter = nodemailer.createTransport({
    // هذه الإعدادات يجب أن تكون موجودة في .env أو تم استخراجها من ملفك القديم
    host: process.env.EMAIL_HOST || 'smtp.example.com', 
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // استخدم true للـ 465، و false للـ 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * إرسال بريد إلكتروني HTML
 */
async function sendEmail(to, subject, body) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn(`[EMAIL-MOCK] لم يتم تكوين خدمة البريد. تم تجاهل الإرسال إلى: ${to}`);
        return; 
    }
    
    try {
        let info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'احجزلي'}" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: body, 
        });

        console.log(`✅ تم إرسال الرسالة بنجاح إلى ${to}. ID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ فشل إرسال البريد الإلكتروني إلى ${to}:`, error);
    }
}

module.exports = {
    sendEmail
};
