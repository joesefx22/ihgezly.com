// controllers.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { jwtSecret, saltRounds } = require('./config');
const { getUserByEmail, createUser } = require('./models');

// 1. دالة تسجيل الدخول (login)
async function login(req, res) {
    const { email, password } = req.body;
    // (يمكن إضافة تحقق إضافي هنا لعدم ترك حقول فارغة)

    try {
        const user = await getUserByEmail(email); 

        if (!user) {
            return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
        }

        // التحقق من كلمة المرور
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
        }

        // توليد الـ JWT
        const payload = { id: user.user_id, role: user.role, email: user.email };
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' });

        // إرجاع التوكن والـ Role (مفتاح التوجيه للـ Frontend)
        res.json({ token, role: user.role, name: user.name, message: "تم تسجيل الدخول بنجاح." });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء تسجيل الدخول." });
    }
}

// 2. دالة إنشاء حساب (signup)
async function signup(req, res) {
    const { name, email, password } = req.body;
    // (يمكن إضافة تحقق إضافي هنا لعدم ترك حقول فارغة)

    try {
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: "هذا البريد الإلكتروني مسجل بالفعل." });
        }
        
        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // إنشاء المستخدم الافتراضي (player)
        const newUser = await createUser(name, email, hashedPassword);

        // إرجاع رسالة نجاح ليتوجه المستخدم لصفحة الدخول
        res.status(201).json({ message: "تم إنشاء حسابك بنجاح. يرجى تسجيل الدخول.", user: newUser });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء إنشاء الحساب." });
    }
}

module.exports = { login, signup };

// controllers.js (إضافة الدوال التالية)

// ... (الدوال الحالية: login, signup, getProfile) ...

// 4. دالة جلب حجوزات اللاعب
async function getMyBookings(req, res) {
    // ... (منطق جلب الحجوزات كما هو موضح في خطوة التفكير) ...
    const playerId = req.user.id;
    try {
        const bookings = await models.getPlayerBookings(playerId);
        res.json(bookings);
    } catch (error) {
        console.error('Get Bookings error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب الحجوزات." });
    }
}

// 5. دالة تحديث الملف الشخصي
async function updateProfile(req, res) {
    // ... (منطق تحديث الملف الشخصي بما في ذلك التحقق من كلمة المرور) ...
    const userId = req.user.id; 
    const { name, phone, password, current_password } = req.body;

    try {
        const updates = { name, phone };
        
        if (password) {
            if (!current_password) {
                return res.status(400).json({ message: "يجب إدخال كلمة المرور الحالية لتغيير كلمة المرور." });
            }
            const user = await models.getUserByEmail(req.user.email);
            const isMatch = await bcrypt.compare(current_password, user.password_hash);

            if (!isMatch) {
                return res.status(401).json({ message: "كلمة المرور الحالية غير صحيحة." });
            }
            
            updates.password_hash = await bcrypt.hash(password, saltRounds);
        }

        const updatedUser = await models.updatePlayerProfile(userId, updates);
        res.json({ message: "تم تحديث الملف الشخصي بنجاح.", user: updatedUser });

    } catch (error) {
        console.error('Update Profile error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء تحديث الملف." });
    }
}

// 6. دالة جلب طلبات 'لاعبوني معاكم'
async function getPlayerRequests(req, res) {
    try {
        const requests = await models.getActivePlayerRequests();
        res.json(requests);
    } catch (error) {
        console.error('Get Player Requests error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب طلبات اللاعبين." });
    }
}

module.exports = { 
    // ... (جميع الدوال الأخرى)
    getMyBookings,
    updateProfile,
    getPlayerRequests
};

// controllers.js (تعديلات وإضافات)

// ... (تأكد من استيراد models و withTransaction و bcrypt) ...
const models = require('./models');
const { withTransaction } = require('./db'); // مهم جداً
const bcrypt = require('bcrypt');
const saltRounds = 10; // أو أي قيمة تستخدمها

// دالة مساعدة: توليد الساعات المتاحة (يمكن تحسينها لجلب ساعات عمل الملعب)
function generateTimeSlots(startHour, endHour, durationMinutes = 60) {
    const slots = [];
    let current = new Date(0, 0, 0, startHour, 0);
    const end = new Date(0, 0, 0, endHour, 0);

    while (current < end) {
        const next = new Date(current.getTime() + durationMinutes * 60000);
        slots.push({
            start_time: current.toTimeString().split(' ')[0].substring(0, 5),
            end_time: next.toTimeString().split(' ')[0].substring(0, 5)
        });
        current = next;
    }
    return slots;
}

// دالة مساعدة: التحقق من حاجة العربون (قاعدة الـ 24 ساعة)
function isDepositRequired(bookingDate, startTime) {
    const bookingDateTime = new Date(`${bookingDate}T${startTime}:00`);
    const now = new Date();
    const diffHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    // العربون مطلوب إذا كان الحجز قبل أكثر من 24 ساعة
    return diffHours > 24; 
}


// -------------------------------------
// 7. جلب الملاعب المتاحة
// -------------------------------------
async function getAvailableFieldsController(req, res) {
    try {
        const fields = await models.getAvailableFields();
        res.json(fields);
    } catch (error) {
        console.error('getAvailableFieldsController error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب الملاعب المتاحة." });
    }
}

// -------------------------------------
// 8. جلب الساعات المتاحة
// -------------------------------------
async function getAvailableSlotsController(req, res) {
    const { fieldId, date } = req.query;

    if (!fieldId || !date) {
        return res.status(400).json({ message: "يجب تحديد الملعب والتاريخ." });
    }

    try {
        const bookedSlots = await models.getBookedSlots(fieldId, date);
        
        // نفترض ساعات العمل من 10:00 صباحاً إلى 12:00 ليلاً (24:00)
        const allSlots = generateTimeSlots(10, 24, 60); 

        const bookedTimes = bookedSlots.map(slot => `${slot.start_time}-${slot.end_time}`);
        
        const availableSlots = allSlots.filter(slot => {
            const slotTime = `${slot.start_time}-${slot.end_time}`;
            return !bookedTimes.includes(slotTime);
        });

        res.json(availableSlots);

    } catch (error) {
        console.error('getAvailableSlotsController error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب المواعيد المتاحة." });
    }
}

// -------------------------------------
// 9. إنشاء حجز جديد (العملية الحاسمة)
// -------------------------------------
async function createBookingController(req, res) {
    const playerId = req.user.id;
    const { field_id, booking_date, start_time, end_time, duration_hours } = req.body; 

    if (!field_id || !booking_date || !start_time || !end_time || !duration_hours) {
        return res.status(400).json({ message: "البيانات المدخلة غير كاملة للحجز." });
    }

    try {
        const result = await withTransaction(async (client) => {
            
            // 1. جلب تفاصيل الملعب (للسعر والعربون)
            const field = (await client.query('SELECT price_per_hour, deposit_amount FROM fields WHERE field_id = $1', [field_id])).rows[0];
            if (!field) {
                throw new Error("الملعب غير موجود.");
            }
            
            // 2. التحقق النهائي من التوفر (Locking)
            const bookedCheck = (await client.query(`
                SELECT booking_id FROM bookings
                WHERE field_id = $1 AND booking_date = $2 
                AND start_time = $3 AND end_time = $4 
                AND status IN ('booked_confirmed', 'booked_unconfirmed')
            `, [field_id, booking_date, start_time, end_time])).rows;

            if (bookedCheck.length > 0) {
                // فشل الحجز بسبب التزامن (Clash)
                throw new Error("هذا الموعد تم حجزه للتو. يرجى اختيار موعد آخر.");
            }
            
            // 3. حساب المبالغ وتحديد حالة الحجز
            const totalAmount = field.price_per_hour * duration_hours;
            let depositAmount = 0;
            let bookingStatus;

            if (isDepositRequired(booking_date, start_time)) {
                // حجز أكثر من 24 ساعة → مطلوب عربون
                depositAmount = field.deposit_amount;
                bookingStatus = 'booked_unconfirmed'; // غير مؤكد حتى الدفع
            } else {
                // حجز أقل من 24 ساعة → لا يوجد عربون، الحالة غير مؤكدة حسب قاعدة العمل
                depositAmount = 0;
                bookingStatus = 'booked_unconfirmed';
            }
            
            const bookingData = {
                field_id, player_id, booking_date, start_time, end_time,
                status: bookingStatus,
                deposit_paid: false,
                total_amount: totalAmount,
                deposit_amount: depositAmount
            };

            // 4. إنشاء سجل الحجز
            const newBooking = await models.createBooking(client, bookingData);

            // 5. إرجاع النتيجة (إما رابط دفع أو رسالة تأكيد)
            if (depositAmount > 0) {
                // 🚨 هنا يجب بناء رابط الدفع الفعلي (ربط مع Paymob)
                const paymentToken = 'MOCK_PAYMENT_TOKEN_' + newBooking.booking_id.substring(0, 8);
                
                return { 
                    booking: newBooking, 
                    deposit_required: true, 
                    payment_url: `/payment.html?booking_id=${newBooking.booking_id}&token=${paymentToken}` 
                };
            }
            
            return { 
                booking: newBooking, 
                deposit_required: false, 
                message: "تم الحجز بنجاح بدون عربون. يرجى مراجعة حجوزاتك لمتابعة التأكيد." 
            };

        });
        
        res.json(result); 

    } catch (error) {
        console.error('createBookingController error:', error.message);
        // إرجاع خطأ 409 للدلالة على تضارب الحجوزات
        res.status(409).json({ message: error.message || "فشل إنشاء الحجز بسبب مشكلة في الموعد." }); 
    }
}

// -------------------------------------
// 10. جلب تفاصيل الحجز للدفع
// -------------------------------------
async function getBookingDetailsController(req, res) {
    const { bookingId } = req.params;

    try {
        const booking = await models.getBookingDetails(bookingId);
        
        if (!booking) {
            return res.status(404).json({ message: "لم يتم العثور على تفاصيل الحجز." });
        }
        
        // 🚨 يجب إضافة تحقق أمني هنا: للتأكد من أن الحجز يخص المستخدم المسجل دخوله (req.user.id) 

        res.json(booking);
    } catch (error) {
        console.error('getBookingDetailsController error:', error);
        res.status(500).json({ message: "حدث خطأ داخلي أثناء جلب تفاصيل الدفع." });
    }
}


module.exports = { 
    // ... (تصدير الدوال الأخرى)
    getAvailableFieldsController,
    getAvailableSlotsController,
    createBookingController,
    getBookingDetailsController
};
