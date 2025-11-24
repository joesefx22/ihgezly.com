// emailService.js - خدمة Nodemailer للإشعارات (النسخة النهائية)

const nodemailer = require('nodemailer');
require('dotenv').config();

// إعداد الناقل (Transporter) باستخدام إعدادات البيئة
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * دالة إرسال بريد إلكتروني
 * @param {string} to - البريد الإلكتروني للمستقبل
 * @param {string} subject - عنوان الرسالة
 * @param {string} body - محتوى الرسالة (HTML)
 */
async function sendEmail(to, subject, body) {
    // التحقق من وجود إعدادات البريد الإلكتروني
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn(`[EMAIL-MOCK] لم يتم تكوين خدمة البريد. تم محاكاة إرسال رسالة إلى: ${to}, بعنوان: ${subject}`);
        return;
    }
    
    try {
        const info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'احجزلي'}" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            html: body,
        });

        console.log(`✅ تم إرسال الرسالة بنجاح إلى ${to}. ID: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error(`❌ فشل إرسال البريد الإلكتروني إلى ${to}:`, error);
        throw error; // إعادة رمي الخطأ للتعامل معه في الدالة المستدعية
    }
}

module.exports = {
    sendEmail
};
