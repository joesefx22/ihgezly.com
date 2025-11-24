// controllers.js - منطق المتحكمات (Controllers Logic)

const { validationResult } = require('express-validator'); 
const models = require('./models'); 
const { withTransaction } = require('./db'); // دالة المعاملات الرئيسية
const { sendEmail } = require('./emailService'); 
const config = require('./config'); // لاستيراد مفتاح الـ Webhook
const crypto = require('crypto'); // للتحقق من HMAC

// ===================================
// 🧩 دالة مساعدة لمعالجة الـ Validation
// ===================================

function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false, 
            message: "فشل في التحقق من صحة البيانات المدخلة",
            errors: errors.array() 
        });
    }
    next();
}

// ===================================
// 👥 المصادقة والتسجيل
// ===================================

async function registerController(req, res) {
    const { name, email, password, phone, role } = req.body;
    try {
        // التحقق من وجود المستخدم قبل بدء المعاملة
        const existingUser = await models.findUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ success: false, message: "البريد الإلكتروني مسجل بالفعل." });
        }
        
        // 🚨 استخدام withTransaction لتسجيل المستخدم وتسجيل النشاط كعملية واحدة (P0-1)
        const newUser = await withTransaction(async (client) => {
            const user = await models.registerNewUser({ name, email, password, phone, role }, client);
            // تسجيل النشاط
            await models.createActivityLog(user.id, 'USER_REGISTERED', `تم تسجيل حساب جديد بالدور: ${role}`, user.id, client);
            return user;
        });
        
        // إرسال إيميل ترحيب أو إشعار للإدارة
        if (newUser.role !== 'player' && !newUser.is_approved) {
            await sendEmail(email, '⏳ حسابك قيد المراجعة', `مرحباً ${name}، تم تسجيل حسابك كـ ${role}. سيتم مراجعته والموافقة عليه من قبل الإدارة قريباً.`);
        } else {
            await sendEmail(email, '🎉 مرحباً بك في احجزلي', `مرحباً ${name}، تم تسجيل حسابك بنجاح! يمكنك الآن بدء حجز الملاعب.`);
        }

        res.status(201).json({ success: true, message: "تم تسجيل المستخدم بنجاح.", user: { id: newUser.id, name: newUser.name, role: newUser.role, is_approved: newUser.is_approved } });
    } catch (error) {
        console.error('Error in registerController:', error);
        res.status(500).json({ success: false, message: "فشل في تسجيل المستخدم", error: error.message });
    }
}


function loginController(req, res, next) {
    // يجب استخدام passport.authenticate للمصادقة وإصدار JWT بعد النجاح
    // المنطق يعتمد على setup في server.js و models.js
    passport.authenticate('local', { session: false }, async (err, user, info) => {
        if (err || !user) {
            return res.status(401).json({ success: false, message: info.message || 'فشل في المصادقة: البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        // 💡 إضافة تحقق إضافي لحالة is_approved لغير اللاعبين (P0-3)
        if (user.role !== 'player' && !user.is_approved) {
            return res.status(403).json({ success: false, message: 'حسابك قيد المراجعة من قبل الإدارة.' });
        }

        try {
            // إنشاء التوكن (JWT) (P0-3)
            const token = jwt.sign(
                { id: user.id, role: user.role, email: user.email }, 
                config.jwtSecret, 
                { expiresIn: config.jwtExpiresIn }
            );

            // تسجيل النشاط
            await models.createActivityLog(user.id, 'USER_LOGIN', `تسجيل دخول ناجح`, user.id);
            
            return res.json({ 
                success: true, 
                token: token, 
                user: { id: user.id, name: user.name, role: user.role, email: user.email } 
            });
        } catch (error) {
             console.error('Error creating token or logging activity:', error);
             return res.status(500).json({ success: false, message: 'فشل داخلي في تسجيل الدخول.' });
        }
    })(req, res, next);
}

// ===================================
// 🏟️ مسارات الملاعب (Stadiums Controllers)
// ===================================

async function createStadiumController(req, res) {
    // req.user من JWT (verifyToken)
    const user_id = req.user.id;
    const { name, location, default_price, default_deposit } = req.body;
    const image_url = req.file ? `/uploads/images/${req.file.filename}` : null; // Multer handled

    try {
        // 🚨 استخدام withTransaction لإنشاء الملعب وتعيين المالك وتسجيل النشاط
        const newStadium = await withTransaction(async (client) => {
            // 1. إنشاء الملعب
            const stadiumData = { name, location, default_price, default_deposit, image_url, owner_id: user_id };
            const stadium = await models.createStadium(stadiumData, client);

            // 2. تعيين المالك كمدير للملعب (للتوافق مع نظام الصلاحيات)
            await models.assignManagerToStadium(stadium.id, user_id, 'owner', client);

            // 3. تسجيل النشاط
            await models.createActivityLog(user_id, 'STADIUM_CREATED', `تم إنشاء ملعب جديد: ${name}`, stadium.id, client);
            return stadium;
        });

        res.status(201).json({ success: true, message: "تم إنشاء الملعب بنجاح", stadium: newStadium });
    } catch (error) {
        console.error('Error creating stadium:', error);
        res.status(500).json({ success: false, message: "فشل في إنشاء الملعب", error: error.message });
    }
}

async function updateStadiumController(req, res) {
    const { stadiumId } = req.params;
    const user_id = req.user.id;
    const updateData = req.body;
    const image_url = req.file ? `/uploads/images/${req.file.filename}` : null;

    if (image_url) {
        updateData.image_url = image_url;
    }

    try {
        // 🚨 استخدام withTransaction لتحديث الملعب وتسجيل النشاط
        const updatedStadium = await withTransaction(async (client) => {
            const stadium = await models.getStadiumById(stadiumId, client);
            if (!stadium) {
                throw new Error("الملعب غير موجود");
            }

            // 1. التحقق من الصلاحية (تم في الـ Middleware لكن نتحقق من أن المستخدم مرتبط بالملعب)
            const isAuthorized = await models.checkStadiumPermissions(stadiumId, user_id, ['admin', 'owner', 'manager'], client);
            if (!isAuthorized) {
                throw new Error("غير مصرح لك بتعديل هذا الملعب");
            }

            // 2. تحديث بيانات الملعب
            const result = await models.updateStadium(stadiumId, updateData, client);

            // 3. تسجيل النشاط
            await models.createActivityLog(user_id, 'STADIUM_UPDATED', `تم تحديث بيانات الملعب: ${stadium.name}`, stadiumId, client);

            return result;
        });

        res.status(200).json({ success: true, message: "تم تحديث بيانات الملعب بنجاح", stadium: updatedStadium });
    } catch (error) {
        console.error('Error updating stadium:', error);
        if (error.message.includes("غير مصرح")) {
            return res.status(403).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: "فشل في تحديث الملعب", error: error.message });
    }
}

// الدوال البسيطة لا تحتاج withTransaction
async function getStadiumDetailsController(req, res) {
    // ... (منطق جلب التفاصيل) ...
}

async function getAllStadiumsController(req, res) {
    // ... (منطق جلب القائمة) ...
}

// ===================================
// 📅 مسارات الحجز (Booking Controllers)
// ===================================

async function createBookingController(req, res) {
    const user_id = req.user.id; // اللاعب الذي قام بالحجز
    const { stadium_id, date, start_time, end_time, code } = req.body;
    
    // تحويل التاريخ والوقت إلى Timestamp objects للمقارنة
    const now = new Date();
    const bookingDateTime = new Date(`${date} ${start_time}`); // يفضل استخدام مكتبة مثل dayjs أو momentjs للتحقق الدقيق من المناطق الزمنية
    
    // حساب الفرق بالساعات (لأغراض العربون)
    const timeDifferenceHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    try {
        // 1. جلب بيانات الملعب (للحصول على السعر والعربون الافتراضي)
        const stadium = await models.getStadiumById(stadium_id);
        if (!stadium) {
            return res.status(404).json({ success: false, message: "الملعب المحدد غير موجود." });
        }
        
        // 2. تحديد حالة الحجز وقيمة العربون والدفع المتبقي (P1 - منطق العربون)
        let deposit_amount = 0;
        let bookingStatus = 'booked_unconfirmed'; // افتراضيًا، غير مؤكد
        const total_price = stadium.default_price; // افتراضياً السعر هو السعر الافتراضي للساعة الواحدة

        if (timeDifferenceHours > 24) {
            // الحجز أكثر من 24 ساعة مقدماً: يتطلب دفع عربون
            deposit_amount = stadium.default_deposit;
            bookingStatus = 'pending_payment'; // بانتظار الدفع
        }
        // إذا كان أقل من 24 ساعة: العربون 0، ويبقى 'booked_unconfirmed'

        // 3. تطبيق الكود (إن وجد)
        let code_used = null;
        if (code) {
             const validationResult = await models.validateCode(code, stadium_id, user_id);
             if (validationResult && validationResult.is_valid) {
                 code_used = validationResult.code_id;
                 // هنا يجب تطبيق الخصم على total_price، لكن نعتبر الكود فقط يسجل حاليًا
             } else {
                 return res.status(400).json({ success: false, message: "كود الخصم غير صالح أو مستخدم مسبقًا." });
             }
        }
        
        // 🚨 استخدام withTransaction لتأمين العملية والتحقق من التوفر (P0-6)
        const bookingResult = await withTransaction(async (client) => {
            
            // **التحقق من التوفر والقفل:** (هذا الجزء يجب أن يتم داخل دالة models.createBooking باستخدام Advisory Lock)
            // نعتبر أن models.createBooking الآن يتعامل مع قفل الصفوف/التحقق من التوفر قبل الإدراج بفضل EXCLUDE constraint في db.js

            // 1. إنشاء الحجز
            const bookingData = { 
                user_id, stadium_id, date, start_time, end_time, 
                total_price, deposit_amount, status: bookingStatus, code_used
            };
            const newBooking = await models.createBooking(bookingData, client);

            // 2. إذا تم استخدام كود، يجب تحديث حالته (P0-2)
            if (code_used) {
                await models.updateCodeStatus(code_used, false, 'used', client);
            }

            // 3. تسجيل النشاط
            await models.createActivityLog(user_id, 'BOOKING_CREATED', `تم إنشاء حجز ${newBooking.booking_id} للملعب ${stadium.name} بحالة: ${bookingStatus}`, newBooking.booking_id, client);
            
            return newBooking;
        });

        // 4. الرد على المستخدم بناءً على حالة الحجز
        if (bookingResult.status === 'pending_payment') {
            // 💡 هنا يجب الاتصال بـ Payment Gateway للحصول على رابط الدفع
            // مثال: const paymentLink = await paymentService.generatePaymentLink(bookingResult.booking_id, deposit_amount);
            
            return res.status(202).json({ 
                success: true, 
                message: "تم إنشاء الحجز بانتظار دفع العربون خلال X دقائق.", 
                booking: bookingResult,
                // paymentLink: paymentLink 
            });
        }
        
        // حجز غير مؤكد (أقل من 24 ساعة/عربون صفر)
        res.status(201).json({ 
            success: true, 
            message: "تم تسجيل الحجز بنجاح، بانتظار تأكيد المالك/المدير.", 
            booking: bookingResult 
        });

    } catch (error) {
        console.error('Error in createBookingController:', error);
        // التعامل مع خطأ التضارب في الحجز (EXCLUDE constraint)
        if (error.code === '23P01' || error.message.includes('conflicts')) { // 23P01 هو رمز خطأ postgres للتضارب
            return res.status(409).json({ success: false, message: "الساعة المطلوبة محجوزة بالفعل أو قيد الحجز." });
        }
        res.status(500).json({ success: false, message: "فشل في إنشاء الحجز", error: error.message });
    }
}


async function cancelBookingController(req, res) {
    const { bookingId } = req.params;
    const { reason } = req.body;
    const user_id = req.user.id; // الشخص الذي قام بالإلغاء (لاعب/مالك/مدير)
    
    try {
        // 🚨 استخدام withTransaction لعملية الإلغاء المعقدة (P0-2)
        const canceledData = await withTransaction(async (client) => {
            const booking = await models.getBookingById(bookingId, client);
            if (!booking) {
                throw new Error("الحجز غير موجود.");
            }
            
            // 1. إلغاء الحجز
            const canceledBooking = await models.cancelBooking(bookingId, user_id, reason, client);
            
            // 2. إنشاء كود تعويض إذا كان الإلغاء قبل أكثر من 24 ساعة و تم دفع عربون
            const now = new Date();
            const bookingDateTime = new Date(`${booking.date} ${booking.start_time}`);
            const timeDifferenceHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

            let compensationCode = null;
            if (timeDifferenceHours > 24 && canceledBooking.deposit_paid > 0) {
                // إنشاء كود تعويض بقيمة العربون
                compensationCode = await models.createCompensationCode(booking.user_id, canceledBooking.deposit_paid, canceledBooking.booking_id, client);
            }

            // 3. تسجيل النشاط
            await models.createActivityLog(user_id, 'BOOKING_CANCELED', `تم إلغاء حجز ${bookingId}. التعويض: ${compensationCode ? 'نعم' : 'لا'}`, bookingId, client);
            
            return { canceledBooking, compensationCode };
        });

        const message = canceledData.compensationCode 
            ? `تم إلغاء الحجز بنجاح. تم إصدار كود تعويض بقيمة ${canceledData.canceledBooking.deposit_paid} ريال.`
            : "تم إلغاء الحجز بنجاح. لا يوجد تعويض بسبب قرب موعد الحجز.";

        // إرسال إيميل إشعار للمستخدم
        // await sendEmail(user.email, 'إشعار إلغاء حجز', message);

        res.status(200).json({ success: true, message, booking: canceledData.canceledBooking, code: canceledData.compensationCode });

    } catch (error) {
        console.error('Error canceling booking:', error);
        res.status(500).json({ success: false, message: "فشل في إلغاء الحجز", error: error.message });
    }
}

// ... (بقية دوال الـ Booking) ...


// ===================================
// 💰 مسار إشعار الدفع (Webhook Controller)
// ===================================

async function handlePaymentNotificationController(req, res) {
    // 🚨 التأكد من الحصول على الـ rawBody في server.js (مهم جداً للتحقق من HMAC)
    const raw = req.rawBody; 
    
    // افتراض أن مزود الدفع يرسل التوقيع في هذا الهيدر أو في الـ body
    const signature = req.headers['x-payment-signature'] || req.body.signature; 
    
    // 1. 🚨 التحقق من التوقيع (HMAC Signature Verification - P0-5)
    if (!signature || !raw) {
        console.error('Webhook Error: Missing signature or raw body.');
        return res.status(401).send('Invalid signature or missing body');
    }

    try {
        const expectedSignature = crypto.createHmac('sha256', config.paymentWebhookSecret).update(raw).digest('hex');
        
        if (signature !== expectedSignature) {
            console.error('Webhook Error: HMAC signature mismatch.');
            return res.status(401).send('Invalid signature');
        }
        
        // افتراض أن الـ payload يحتوي على هذه الحقول الأساسية
        const { provider_tx_id, booking_id, amount, status } = req.body; 

        if (status !== 'paid' && status !== 'confirmed') {
            // التعامل مع حالة فشل الدفع أو الانتظار
            // يجب تحديث حالة الحجز إلى 'payment_failed' إذا كان هذا الإشعار نهائيًا
            console.log(`Payment Status: ${status} for TX: ${provider_tx_id}`);
            return res.status(200).send('Ignored: Not a successful payment status.');
        }

        // 2. 🚨 استخدام withTransaction لتأمين عملية تأكيد الحجز (P0-5)
        await withTransaction(async (client) => {
            
            // **Idempotency Check:** التحقق من أن الـ transaction لم تتم معالجتها مسبقاً
            const transactionExists = await models.checkPaymentTransactionExists(provider_tx_id, client);
            if (transactionExists) {
                // إرجاع 200 لتجنب إعادة إرسال الـ webhook من مزود الدفع
                console.warn(`Idempotency: Transaction ${provider_tx_id} already processed.`);
                return; // الخروج من المعاملة دون خطأ
            }

            // 1. تسجيل عملية الدفع
            await models.recordPaymentTransaction({ provider_tx_id, booking_id, amount, status: 'confirmed' }, client);

            // 2. تحديث حالة الحجز وتفاصيل الدفع
            const finalBooking = await models.finalizePayment(booking_id, provider_tx_id, amount, client);
            
            // 3. تسجيل النشاط
            await models.createActivityLog(finalBooking.user_id, 'PAYMENT_SUCCESS', `تم تأكيد دفع العربون للحجز ${finalBooking.booking_id}`, finalBooking.booking_id, client);
            
            // إرسال إيميل تأكيد
            // await sendEmail(finalBooking.user_email, '🎉 تأكيد الحجز والدفع', ...);

        });

        res.status(200).send('OK');

    } catch (error) {
        console.error('Error in payment webhook controller:', error);
        // عند حدوث خطأ داخلي يجب إرجاع 500 ليقوم مزود الدفع بإعادة المحاولة لاحقاً
        res.status(500).send('Internal Server Error');
    }
}


// ===================================
// ⭐ التقييمات والمراجعات (Ratings Controllers)
// ===================================

async function submitRatingController(req, res) {
    const { stadiumId } = req.params;
    const { rating, comment } = req.body;
    const user_id = req.user.id; // المستخدم الذي قام بالتقييم

    try {
        // 🚨 استخدام withTransaction لـ (1) إرسال التقييم و (2) تحديث متوسط التقييم (P0-2)
        const newRating = await withTransaction(async (client) => {
            
            // 1. التحقق من أن المستخدم لديه الحق في التقييم (أن يكون قد لعب في الملعب)
            const canRate = await models.canUserRateStadium(stadiumId, user_id, client);
            if (!canRate) {
                throw new Error("لا يمكنك تقييم ملعب لم تقم بالحجز أو اللعب فيه.");
            }

            // 2. إرسال التقييم
            const ratingResult = await models.submitNewRating(stadiumId, user_id, rating, comment, client);
            
            // 3. تحديث متوسط تقييم الملعب في جدول STADIUMS
            await models.updateStadiumAverageRating(stadiumId, client); 

            // 4. تسجيل النشاط
            await models.createActivityLog(user_id, 'RATING_SUBMITTED', `تم تقييم الملعب ${stadiumId}`, stadiumId, client);
            
            return ratingResult;
        });

        res.status(201).json({ success: true, message: "تم تسجيل تقييمك بنجاح", rating: newRating });
    } catch (error) {
        console.error('Error submitting rating:', error);
        if (error.message.includes("لا يمكنك")) {
             return res.status(403).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: "فشل في تسجيل التقييم", error: error.message });
    }
}

// ===================================
// 🛠️ مسارات الأدمن (Admin Controllers)
// ===================================

async function approveManagerController(req, res) {
    const { userId } = req.params;
    const admin_id = req.user.id;

    try {
        // 🚨 استخدام withTransaction لتأكيد الموافقة وتسجيل النشاط
        const approvedUser = await withTransaction(async (client) => {
            // 1. الموافقة على المستخدم
            const user = await models.approveUser(userId, client);
            if (!user) {
                throw new Error("المستخدم غير موجود.");
            }
            
            // 2. تسجيل النشاط
            await models.createActivityLog(admin_id, 'MANAGER_APPROVED', `تمت الموافقة على المستخدم ${user.email} كـ ${user.role}`, userId, client);
            
            // 3. إرسال إيميل إشعار للمستخدم
            await sendEmail(user.email, '✅ تم تفعيل حسابك', `تهانينا، تمت الموافقة على حسابك كـ ${user.role} في منصة احجزلي. يمكنك الآن تسجيل الدخول.`);

            return user;
        });

        res.status(200).json({ success: true, message: "تمت الموافقة على المستخدم بنجاح.", user: approvedUser });
    } catch (error) {
        console.error('Error approving manager:', error);
        res.status(500).json({ success: false, message: "فشل في الموافقة على المستخدم", error: error.message });
    }
}

// ... (إدراج بقية الدوال البسيطة هنا) ...

module.exports = {
    handleValidationErrors,
    registerController,
    loginController,
    // ... (بقية الـ controllers)
    createStadiumController,
    updateStadiumController,
    getStadiumDetailsController,
    getAllStadiumsController,
    createBookingController,
    cancelBookingController,
    handlePaymentNotificationController,
    submitRatingController,
    approveManagerController,
    // ... (تأكد من تصدير جميع الدوال)
};
