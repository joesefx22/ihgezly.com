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
