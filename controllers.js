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

// controllers.js (إضافة الدالة التالية)

// ... (تأكد من استيراد withTransaction)
const { withTransaction } = require('./db');

// -------------------------------------
// 11. تأكيد عملية الدفع وتحديث حالة الحجز
// -------------------------------------
async function confirmPaymentController(req, res) {
    // paymentRef هو الرقم المرجعي الذي نحصل عليه من بوابة الدفع (مثل Paymob)
    const { bookingId, paymentRef } = req.body; 
    const playerId = req.user.id; // تأمين: يجب أن يكون المستخدم الحالي هو صاحب الحجز

    if (!bookingId || !paymentRef) {
        return res.status(400).json({ message: "بيانات تأكيد الدفع غير كاملة." });
    }

    try {
        const result = await withTransaction(async (client) => {
            
            // 1. التحقق من الحجز وأمن المستخدم (FOR UPDATE لضمان عدم التزامن)
            const currentBooking = (await client.query(
                'SELECT status, player_id, deposit_amount FROM bookings WHERE booking_id = $1 AND deposit_paid = FALSE FOR UPDATE',
                [bookingId]
            )).rows[0];

            if (!currentBooking) {
                // قد يكون الحجز مؤكد بالفعل أو غير موجود
                throw new Error("هذا الحجز إما غير موجود أو تم تأكيده مسبقاً.");
            }
            if (currentBooking.player_id !== playerId) {
                // تحقق أمني حاسم
                throw new Error("غير مصرح لك بتأكيد هذا الحجز.");
            }

            // 2. تحديث حالة الحجز إلى مؤكد وحفظ مرجع الدفع
            const updateQuery = `
                UPDATE bookings
                SET status = 'booked_confirmed', deposit_paid = TRUE, payment_reference = $2, updated_at = CURRENT_TIMESTAMP
                WHERE booking_id = $1
                RETURNING booking_id, status
            `;
            await client.query(updateQuery, [bookingId, paymentRef]);

            // 3. (هنا يمكن إضافة منطق إرسال إيميل التأكيد للاعب ومالك الملعب)

            return { 
                message: "✅ تم تأكيد دفع العربون والحجز بنجاح!",
                bookingId: bookingId
            };
        });

        res.json(result);

    } catch (error) {
        console.error('confirmPaymentController error:', error.message);
        res.status(500).json({ message: error.message || "فشل تأكيد عملية الدفع والحجز. يرجى مراجعة الدعم." });
    }
}

module.exports = { 
    // ... (تصدير جميع الدوال الأخرى)
    confirmPaymentController 
};

// controllers.js (تعديلات وإضافات)

const axios = require('axios'); // تأكد من تثبيتها
const crypto = require('crypto'); // مكتبة Crypto لتوليد HMAC (موجودة في Node.js)
const { withTransaction } = require('./db');
const models = require('./models'); 
// ... (بقية الـ Imports) ...

// جلب مفاتيح Paymob من البيئة
const {
    PAYMOB_API_KEY,
    PAYMOB_INTEGRATION_ID,
    PAYMOB_HMAC_SECRET, 
    PAYMOB_IFRAME_ID
} = process.env; 

const PAYMOB_BASE_URL = 'https://accept.paymob.com/api';

// -------------------------------------
// دوال الاتصال بـ Paymob
// -------------------------------------

async function getAuthToken() {
    const response = await axios.post(`${PAYMOB_BASE_URL}/auth/tokens`, { api_key: PAYMOB_API_KEY });
    return response.data.token;
}

async function registerOrder(authToken, bookingId, amountCents) {
    const response = await axios.post(`${PAYMOB_BASE_URL}/ecommerce/orders`, {
        auth_token: authToken,
        delivery_needed: 'false',
        amount_cents: amountCents.toFixed(0), 
        merchant_order_id: `EHGLY-${bookingId}`, // رقم طلب فريد
        items: []
    });
    return response.data;
}

async function getPaymentKey(authToken, orderId, amountCents, user) {
    const response = await axios.post(`${PAYMOB_BASE_URL}/acceptance/payment_keys`, {
        auth_token: authToken,
        amount_cents: amountCents.toFixed(0),
        expiration: 3600, 
        order_id: orderId,
        billing_data: {
            // بيانات العميل المطلوبة
            email: user.email,
            first_name: user.name.split(' ')[0] || 'Player',
            phone_number: user.phone || '01000000000', 
            last_name: user.name.split(' ').slice(1).join(' ') || 'User',
            country: 'EG', city: 'NA', street: 'NA', apartment: 'NA', floor: 'NA', building: 'NA', shipping_method: 'NA', postal_code: 'NA', state: 'NA'
        },
        currency: 'EGP',
        integration_id: PAYMOB_INTEGRATION_ID,
    });
    return response.data.token;
}


// -------------------------------------
// تعديل دالة createBookingController
// -------------------------------------

// ... (تضمين المنطق الحالي لـ createBookingController) ...
async function createBookingController(req, res) {
    // ... (منطق جلب البيانات، التحقق، وحساب totalAmount و depositAmount) ...

    try {
        const result = await withTransaction(async (client) => {
            // ... (منطق التحقق من التوفر وإنشاء سجل الحجز newBooking) ...
            
            // 5. المنطق الحاسم لتوليد رابط Paymob
            if (depositAmount > 0) {
                // 5.1 جلب تفاصيل اللاعب
                const userProfile = await client.query('SELECT name, email, phone FROM users WHERE user_id = $1', [playerId]);
                const user = userProfile.rows[0];

                // 5.2 بدء عملية Paymob (جنيه إلى قرش)
                const amountCents = depositAmount * 100; 
                const authToken = await getAuthToken();
                const orderData = await registerOrder(authToken, newBooking.booking_id, amountCents);
                
                const paymentKey = await getPaymentKey(authToken, orderData.id, amountCents, user);
                
                // بناء رابط التوجيه لصفحة الدفع الآمنة (iFrame URL)
                const paymentUrl = `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentKey}`;

                // حفظ رقم طلب Paymob في قاعدة البيانات للمتابعة
                await client.query('UPDATE bookings SET payment_reference = $1 WHERE booking_id = $2', 
                    [orderData.id, newBooking.booking_id]);
                
                return { 
                    booking: newBooking, 
                    deposit_required: true, 
                    // 🚨 نرسل رابط Paymob الفعلي للواجهة الأمامية
                    payment_url: paymentUrl
                };
            }
            
            // ... (منطق الحجز بدون عربون) ...
        });
        
        res.json(result); 

    } catch (error) {
        console.error('Paymob Integration Error:', error.message);
        res.status(500).json({ message: "فشل الحجز. يرجى مراجعة الدعم أو محاولة الدفع لاحقاً." }); 
    }
}


// -------------------------------------
// 12. Webhook Paymob (المسار الآمن لتأكيد الدفع)
// -------------------------------------

function checkPaymobHMAC(obj, secret) {
    // بناء سلسلة الـ HMAC المطلوبة من Paymob (التحقق من التوقيع)
    const sortedKeys = Object.keys(obj)
        .filter(key => key !== 'hmac' && key !== 'obj') 
        .sort();
        
    const dataToHash = sortedKeys.map(key => obj[key]).join('');
    
    const hash = crypto.createHmac('sha512', secret)
        .update(dataToHash)
        .digest('hex');

    return hash === obj.hmac;
}

async function paymobWebhookController(req, res) {
    // Paymob ترسل البيانات المهمة كـ Query Parameters (موجودة في req.query)
    const data = req.query; 
    
    try {
        // 1. التحقق الأمني من توقيع HMAC
        if (!checkPaymobHMAC(data, PAYMOB_HMAC_SECRET)) {
            return res.status(401).send('HMAC signature failed');
        }
        
        // البيانات موجودة داخل حقل 'obj'
        const transactionData = JSON.parse(data.obj); 

        // 2. التحقق من حالة الدفع
        if (transactionData.success === true && transactionData.pending === false) {
            
            const bookingIdFromPaymob = transactionData.order.merchant_order_id.replace('EHGLY-', '');
            const paymobOrderId = transactionData.order.id;
            
            // 3. تحديث حالة الحجز في قاعدة البيانات (معاملة آمنة)
            await withTransaction(async (client) => {
                const updateQuery = `
                    UPDATE bookings
                    SET status = 'booked_confirmed', deposit_paid = TRUE, payment_reference = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE booking_id = $1 AND status = 'booked_unconfirmed' 
                `;
                const result = await client.query(updateQuery, [bookingIdFromPaymob, paymobOrderId]);
                
                if (result.rowCount > 0) {
                    console.log(`✅ Webhook: Booking ${bookingIdFromPaymob} confirmed.`);
                }
            });

        } else if (transactionData.success === false) {
            console.log(`⚠️ Webhook: Payment failed for order ${transactionData.order.merchant_order_id}.`);
        }
        
        // يجب أن نرد برمز 200 لـ Paymob
        res.status(200).send('Webhook received successfully');

    } catch (error) {
        console.error('PAYMOB WEBHOOK ERROR:', error);
        res.status(500).send('Internal Server Error');
    }
}

module.exports = { 
    // ... (تصدير جميع الدوال الأخرى)
    createBookingController, 
    paymobWebhookController // الدالة الجديدة للـ Webhook
};

// controllers.js (إضافات لمنطق الموظف)

// ... (تأكد من استيراد models و withTransaction) ...

// -------------------------------------
// 12. جلب الملاعب المعينة للموظف
// -------------------------------------
async function getEmployeeFieldsController(req, res) {
    const employeeId = req.user.id;
    try {
        const fields = await models.getEmployeeAssignedFields(employeeId);
        res.json(fields);
    } catch (error) {
        console.error('getEmployeeFieldsController error:', error);
        res.status(500).json({ message: "فشل جلب الملاعب المعينة للموظف." });
    }
}

// -------------------------------------
// 13. جلب حجوزات اليوم لملعب معين
// -------------------------------------
async function getTodayBookingsController(req, res) {
    const { fieldId, date } = req.query; // date سيتم تمريره اليوم افتراضياً
    
    if (!fieldId || !date) {
        return res.status(400).json({ message: "يجب تحديد الملعب والتاريخ." });
    }
    
    // التحقق من صلاحية الموظف (أمني)
    const employeeId = req.user.id;
    const assignedFields = await models.getEmployeeAssignedFields(employeeId);
    if (!assignedFields.some(f => f.field_id === fieldId)) {
        return res.status(403).json({ message: "غير مصرح لك بالاطلاع على حجوزات هذا الملعب." });
    }

    try {
        const bookings = await models.getBookingsForEmployee(fieldId, date);
        res.json(bookings);
    } catch (error) {
        console.error('getTodayBookingsController error:', error);
        res.status(500).json({ message: "فشل جلب الحجوزات اليومية." });
    }
}

// -------------------------------------
// 14. تسجيل الحضور (Check-in)
// -------------------------------------
async function checkInController(req, res) {
    const { bookingId } = req.body;
    
    try {
        const result = await withTransaction(async (client) => {
            // يمكن إضافة منطق آخر هنا (مثلاً: التحقق من الوقت الحالي)
            return await models.updateBookingStatus(client, bookingId, 'played', true);
        });
        
        res.json({ message: "✅ تم تسجيل الحضور بنجاح (Check-in)." });
    } catch (error) {
        console.error('checkInController error:', error.message);
        res.status(409).json({ message: error.message || "فشل تسجيل الحضور." });
    }
}

// -------------------------------------
// 15. تأكيد الدفع النقدي (للحجوزات أقل من 24 ساعة)
// -------------------------------------
async function confirmCashController(req, res) {
    const { bookingId } = req.body;
    
    try {
        const result = await withTransaction(async (client) => {
            // هذا المنطق خاص بالحجوزات ذات العربون (deposit_amount = 0) وحالتها 'booked_unconfirmed' 
            // حيث يتم تحويلها إلى 'booked_confirmed'
            return await models.updateBookingStatus(client, bookingId, 'booked_confirmed', true);
        });
        
        res.json({ message: "💰 تم تأكيد الدفع النقدي وتأكيد الحجز." });
    } catch (error) {
        console.error('confirmCashController error:', error.message);
        res.status(409).json({ message: error.message || "فشل تأكيد الدفع النقدي." });
    }
}

module.exports = {
    // ... (تصدير جميع الدوال السابقة)
    getEmployeeFieldsController,
    getTodayBookingsController,
    checkInController,
    confirmCashController
};

// controllers.js (إضافات لمنطق المالك)

// ... (تأكد من استيراد models و withTransaction) ...
// ... (يفترض وجود دالة updateBookingStatus التي استخدمناها للموظف) ...

// -------------------------------------
// 16. جلب إحصائيات لوحة مالك الملعب
// -------------------------------------
async function getOwnerDashboardController(req, res) {
    const ownerId = req.user.id;
    try {
        const stats = await models.getOwnerDashboardStats(ownerId);
        res.json(stats);
    } catch (error) {
        console.error('getOwnerDashboardController error:', error);
        res.status(500).json({ message: "فشل جلب إحصائيات لوحة التحكم." });
    }
}

// -------------------------------------
// 17. جلب ملاعب المالك
// -------------------------------------
async function getOwnerStadiumsController(req, res) {
    const ownerId = req.user.id;
    try {
        const stadiums = await models.getOwnerStadiums(ownerId);
        res.json(stadiums);
    } catch (error) {
        console.error('getOwnerStadiumsController error:', error);
        res.status(500).json({ message: "فشل جلب الملاعب." });
    }
}

// -------------------------------------
// 18. جلب حجوزات المالك
// -------------------------------------
async function getOwnerBookingsController(req, res) {
    const ownerId = req.user.id;
    const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        fieldId: req.query.fieldId,
        status: req.query.status
    };
    try {
        const bookings = await models.getOwnerBookings(ownerId, filters);
        res.json(bookings);
    } catch (error) {
        console.error('getOwnerBookingsController error:', error);
        res.status(500).json({ message: "فشل جلب الحجوزات." });
    }
}

// -------------------------------------
// 19. تأكيد حجز نقدي (للحجوزات المعلقة)
// -------------------------------------
async function confirmOwnerBookingController(req, res) {
    const { bookingId } = req.params;
    const ownerId = req.user.id;

    try {
        const result = await withTransaction(async (client) => {
            // التحقق من أن المالك يمتلك الملعب للحجز المعني (أمني)
            const checkQuery = 'SELECT f.owner_id FROM bookings b JOIN fields f ON b.field_id = f.field_id WHERE b.booking_id = $1';
            const checkResult = await client.query(checkQuery, [bookingId]);

            if (checkResult.rows.length === 0 || checkResult.rows[0].owner_id !== ownerId) {
                throw new Error("غير مصرح لك بتأكيد هذا الحجز.");
            }
            
            // يتم استخدام دالة تحديث الحالة العامة ( booked_unconfirmed -> booked_confirmed )
            return await models.updateBookingStatus(client, bookingId, 'booked_confirmed', true);
        });
        
        res.json({ message: "✅ تم تأكيد الحجز النقدي بنجاح." });
    } catch (error) {
        console.error('confirmOwnerBookingController error:', error.message);
        res.status(409).json({ message: error.message || "فشل تأكيد الحجز." });
    }
}

// -------------------------------------
// 20. إلغاء حجز (يتم أيضاً استخدامه لحالات عدم الحضور)
// -------------------------------------
async function cancelOwnerBookingController(req, res) {
    const { bookingId } = req.params;
    const ownerId = req.user.id;

    try {
        const result = await withTransaction(async (client) => {
            // التحقق من أن المالك يمتلك الملعب للحجز المعني (أمني)
            const checkQuery = 'SELECT f.owner_id FROM bookings b JOIN fields f ON b.field_id = f.field_id WHERE b.booking_id = $1';
            const checkResult = await client.query(checkQuery, [bookingId]);

            if (checkResult.rows.length === 0 || checkResult.rows[0].owner_id !== ownerId) {
                throw new Error("غير مصرح لك بإلغاء هذا الحجز.");
            }
            
            // إلغاء الحجز (يجب أن يتم تحديث الحالة إلى 'missed' أو 'cancelled' وإعادة الساعة كـ available)
            return await models.updateBookingStatus(client, bookingId, 'missed', false); 
        });
        
        res.json({ message: "❌ تم إلغاء الحجز بنجاح." });
    } catch (error) {
        console.error('cancelOwnerBookingController error:', error.message);
        res.status(409).json({ message: error.message || "فشل إلغاء الحجز." });
    }
}

module.exports = {
    // ... (تأكد من تصدير جميع الدوال الجديدة هنا)
    getOwnerDashboardController,
    getOwnerStadiumsController,
    getOwnerBookingsController,
    confirmOwnerBookingController,
    cancelOwnerBookingController,
    // ...
};

// controllers.js (إضافات لمنطق الأدمن)

// ... (تأكد من استيراد models و withTransaction) ...
// ... (يفترض وجود دالة createActivityLog من خطوات سابقة) ...

// -------------------------------------
// 21. جلب إحصائيات لوحة تحكم الأدمن
// -------------------------------------
async function getAdminDashboardController(req, res) {
    try {
        const stats = await models.getAdminDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('getAdminDashboardController error:', error);
        res.status(500).json({ message: "فشل جلب إحصائيات لوحة التحكم." });
    }
}

// -------------------------------------
// 22. جلب جميع المستخدمين
// -------------------------------------
async function getAllUsersController(req, res) {
    try {
        const users = await models.getAllUsers();
        res.json(users);
    } catch (error) {
        console.error('getAllUsersController error:', error);
        res.status(500).json({ message: "فشل جلب المستخدمين." });
    }
}

// -------------------------------------
// 23. جلب جميع الملاعب (للأدمن)
// -------------------------------------
async function getAllStadiumsController(req, res) {
    try {
        const stadiums = await models.getAllStadiums();
        res.json(stadiums);
    } catch (error) {
        console.error('getAllStadiumsController error:', error);
        res.status(500).json({ message: "فشل جلب الملاعب." });
    }
}

// -------------------------------------
// 24. جلب المستخدمين المنتظرين الموافقة
// -------------------------------------
async function getPendingManagersController(req, res) {
    try {
        const managers = await models.getPendingManagers();
        res.json(managers);
    } catch (error) {
        console.error('getPendingManagersController error:', error);
        res.status(500).json({ message: "فشل جلب طلبات الموافقة." });
    }
}

// -------------------------------------
// 25. الموافقة على مستخدم/مالك
// -------------------------------------
async function approveUserController(req, res) {
    const { userId } = req.params;
    const adminId = req.user.id;
    
    try {
        const updatedUser = await withTransaction(async (client) => {
            const user = await models.getUserById(userId, client);
            if (!user) throw new Error("المستخدم غير موجود.");
            
            // التأكد من أن الدور لا يزال يتطلب موافقة
            if (user.role === 'player') {
                 // إذا كان player، يتم تحويله إلى دوره المطلوب (owner أو employee) وتفعيله
                 if (!req.body.targetRole || !['owner', 'employee', 'admin'].includes(req.body.targetRole)) {
                     throw new Error("يجب تحديد دور مستهدف (owner/employee/admin).");
                 }
                 const approved = await models.updateApprovalStatus(userId, true, req.body.targetRole);
                 return approved;
            } else {
                 // تحديث الحالة فقط (is_approved = TRUE)
                 const approved = await models.updateApprovalStatus(userId, true, user.role);
                 return approved;
            }
        });

        // تسجيل النشاط
        await models.createActivityLog(adminId, 'APPROVAL', `تمت الموافقة على المستخدم: ${updatedUser.name} (${updatedUser.role})`, updatedUser.user_id);
        
        res.json({ message: `✅ تمت الموافقة على ${updatedUser.name} بنجاح.` });
    } catch (error) {
        console.error('approveUserController error:', error);
        res.status(500).json({ message: error.message || "فشل الموافقة على المستخدم." });
    }
}

// -------------------------------------
// 26. رفض (أو تعطيل) مستخدم
// -------------------------------------
async function rejectUserController(req, res) {
    const { userId } = req.params;
    const adminId = req.user.id;

    try {
        // الرفض يعني ترك is_approved = FALSE أو إرجاع الدور إلى player (حسب المنطق)
        // الأسهل هنا هو إبقائه كـ unapproved أو تعطيل الحساب تماماً. سنستخدم هنا إعادته إلى 'player' وتعطيل الموافقة
        const rejectedUser = await models.updateApprovalStatus(userId, false, 'player'); 

        // تسجيل النشاط
        await models.createActivityLog(adminId, 'REJECTION', `تم رفض/تعطيل حساب المستخدم: ${rejectedUser.name}، وتم إرجاع دوره إلى player.`, rejectedUser.user_id);

        res.json({ message: `❌ تم رفض/تعطيل المستخدم ${rejectedUser.name} بنجاح.` });
    } catch (error) {
        console.error('rejectUserController error:', error);
        res.status(500).json({ message: "فشل رفض المستخدم." });
    }
}

// -------------------------------------
// 27. جلب سجلات النشاط
// -------------------------------------
async function getActivityLogsController(req, res) {
    const limit = parseInt(req.query.limit) || 20;
    try {
        const logs = await models.getActivityLogs(limit);
        res.json(logs);
    } catch (error) {
        console.error('getActivityLogsController error:', error);
        res.status(500).json({ message: "فشل جلب سجلات النشاط." });
    }
}

module.exports = {
    // ... (تصدير جميع الدوال الأخرى)
    getAdminDashboardController,
    getAllUsersController,
    getAllStadiumsController,
    getPendingManagersController,
    approveUserController,
    rejectUserController,
    getActivityLogsController,
    // ...
};

// controllers.js (إضافات لمنطق CRUD الملاعب)

// ... (تأكد من استيراد models و withTransaction و createActivityLog) ...

// -------------------------------------
// 28. إنشاء ملعب جديد (Admin/Owner)
// -------------------------------------
async function createFieldController(req, res) {
    const { name, location, price_per_hour, deposit_amount, features, owner_id } = req.body;
    const userId = req.user.id; // هو المنشئ (سواء كان أدمن أو مالك)

    // إذا كان المنشئ أدمن، يجب تمرير owner_id في الـ body.
    // إذا كان المنشئ مالك، يتم استخدام userId الخاص به.
    const actualOwnerId = req.user.role === 'admin' ? owner_id : userId;
    
    // التحقق الأساسي
    if (!name || !location || !price_per_hour || !actualOwnerId) {
        return res.status(400).json({ message: "يرجى توفير الاسم والموقع والسعر ومعرف المالك." });
    }

    try {
        const newField = await withTransaction(async (client) => {
            const field = await models.createField(
                actualOwnerId,
                name,
                location,
                parseFloat(price_per_hour),
                parseFloat(deposit_amount || 0),
                features || [],
                client
            );
            return field;
        });

        const logAction = req.user.role === 'admin' ? 'ADMIN_CREATE_FIELD' : 'OWNER_CREATE_FIELD';
        await models.createActivityLog(userId, logAction, `تم إنشاء الملعب: ${newField.name} (ID: ${newField.field_id})`, newField.field_id);
        
        res.status(201).json({ 
            message: "تم إنشاء الملعب بنجاح.",
            fieldId: newField.field_id 
        });
    } catch (error) {
        console.error('createFieldController error:', error);
        res.status(500).json({ message: "فشل إنشاء الملعب." });
    }
}

// -------------------------------------
// 29. تحديث بيانات ملعب (Admin/Owner)
// -------------------------------------
async function updateFieldController(req, res) {
    const { fieldId } = req.params;
    const updates = req.body;
    const userId = req.user.id;

    try {
        // التحقق من الملكية/الصلاحية قبل التحديث
        const field = await models.getFieldById(fieldId);
        if (!field) return res.status(404).json({ message: "الملعب غير موجود." });

        if (req.user.role !== 'admin' && field.owner_id !== userId) {
            return res.status(403).json({ message: "ليس لديك صلاحية لتعديل هذا الملعب." });
        }
        
        const updatedField = await withTransaction(async (client) => {
            // تصفية البيانات التي لا يجب تحديثها
            delete updates.field_id;
            delete updates.owner_id;

            const updated = await models.updateField(fieldId, updates, client);
            return updated;
        });

        if (!updatedField) return res.status(400).json({ message: "لا توجد بيانات لتحديثها." });

        const logAction = req.user.role === 'admin' ? 'ADMIN_UPDATE_FIELD' : 'OWNER_UPDATE_FIELD';
        await models.createActivityLog(userId, logAction, `تم تحديث بيانات الملعب: ${updatedField.name} (ID: ${fieldId})`);

        res.json({ 
            message: "تم تحديث بيانات الملعب بنجاح.",
            fieldId: fieldId 
        });
    } catch (error) {
        console.error('updateFieldController error:', error);
        res.status(500).json({ message: "فشل تحديث بيانات الملعب." });
    }
}

// -------------------------------------
// 30. حذف/تعطيل ملعب (Admin/Owner)
// -------------------------------------
async function deleteFieldController(req, res) {
    const { fieldId } = req.params;
    const userId = req.user.id;

    try {
        const field = await models.getFieldById(fieldId);
        if (!field) return res.status(404).json({ message: "الملعب غير موجود." });

        if (req.user.role !== 'admin' && field.owner_id !== userId) {
            return res.status(403).json({ message: "ليس لديك صلاحية لتعطيل هذا الملعب." });
        }
        
        const deletedField = await withTransaction(async (client) => {
            // تعطيل الملعب
            const deleted = await models.deleteField(fieldId, client);
            return deleted;
        });

        const logAction = req.user.role === 'admin' ? 'ADMIN_DELETE_FIELD' : 'OWNER_DELETE_FIELD';
        await models.createActivityLog(userId, logAction, `تم تعطيل الملعب: ${deletedField.name} (ID: ${fieldId})`);

        res.json({ message: `تم تعطيل الملعب "${deletedField.name}" بنجاح.` });
    } catch (error) {
        console.error('deleteFieldController error:', error);
        res.status(500).json({ message: "فشل تعطيل الملعب." });
    }
}

// -------------------------------------
// 31. تفعيل ملعب (Admin/Owner)
// -------------------------------------
async function activateFieldController(req, res) {
    const { fieldId } = req.params;
    const userId = req.user.id;

    try {
        const field = await models.getFieldById(fieldId);
        if (!field) return res.status(404).json({ message: "الملعب غير موجود." });

        if (req.user.role !== 'admin' && field.owner_id !== userId) {
            return res.status(403).json({ message: "ليس لديك صلاحية لتفعيل هذا الملعب." });
        }
        
        const activatedField = await withTransaction(async (client) => {
            const activated = await models.activateField(fieldId, client);
            return activated;
        });

        const logAction = req.user.role === 'admin' ? 'ADMIN_ACTIVATE_FIELD' : 'OWNER_ACTIVATE_FIELD';
        await models.createActivityLog(userId, logAction, `تم تفعيل الملعب: ${activatedField.name} (ID: ${fieldId})`);

        res.json({ message: `✅ تم تفعيل الملعب "${activatedField.name}" بنجاح.` });
    } catch (error) {
        console.error('activateFieldController error:', error);
        res.status(500).json({ message: "فشل تفعيل الملعب." });
    }
}

module.exports = {
    // ... (تصدير جميع الدوال الأخرى)
    createFieldController,
    updateFieldController,
    deleteFieldController,
    activateFieldController,
    // ...
};

// controllers.js (إضافات لمنطق الحجز والدفع)

// ... (تأكد من استيراد models و withTransaction و createActivityLog) ...
// ... (يفترض وجود دالة getFieldDetailsController لعرض تفاصيل الملعب) ...

// ملاحظة: PAYMOB_KEY من المفترض أن يكون في ملف config أو .env
const PAYMOB_KEY = process.env.PAYMOB_KEY || 'MOCK_PAYMOB_INTEGRATION_KEY';

// دالة مساعدة لإنشاء مُحاكاة لـ PayMob
async function mockPaymobPaymentIntent(bookingId, amount, customerInfo) {
    // في بيئة الإنتاج، يتم هنا استدعاء PayMob API للحصول على payment token
    // هنا، نُنشئ رابط دفع وهمي ورقم مرجعي
    const mockRef = `TRX_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const mockPaymentUrl = `/payment.html?id=${bookingId}&amount=${amount}&ref=${mockRef}`; 
    
    // يُفترض أن PayMob تتوقع المبلغ بالقرش، لذا نضرب في 100
    const amountInCents = Math.round(amount * 100);

    console.log(`[MOCK PAYMOB] Creating intent for Booking ID: ${bookingId}, Amount: ${amountInCents} EGP cents`);
    
    return {
        payment_reference: mockRef,
        payment_url: mockPaymentUrl,
        amount_to_pay: amount,
        success: true
    };
}

// controllers.js (تعديل دالة bookingRequestController)

async function bookingRequestController(req, res) {
    // ... (جلب المتغيرات السابقة)
    // إضافة codeId لبيانات الـ body
    const { fieldId, bookingDate, startTime, endTime, playersNeeded, codeId } = req.body; // <-- الجديد

    // ... (التحقق من البيانات ووجود الملعب وحالة الساعة)
    
    try {
        const field = await models.getFieldDetailsForBooking(fieldId);
        // ... (التحقق من حالة SlotStatus)

        const totalAmount = field.price_per_hour; 
        let finalAmount = totalAmount;
        let depositAmount = field.deposit_amount;
        let initialStatus = 'booked_unconfirmed';
        let appliedCode = null;


        // 💡 1. تطبيق الكود إذا تم تمريره
        if (codeId) {
            const code = await models.getCodeById(codeId);
            
            // تحقق بسيط مرة أخرى (تم التحقق في validateCodeController بالفعل)
            if (code && code.is_active && code.used_count < code.max_uses) {
                appliedCode = code;
                
                if (code.code_type === 'discount' && code.discount_percent > 0) {
                    const discount = finalAmount * (code.discount_percent / 100);
                    finalAmount -= discount;
                } else if ((code.code_type === 'compensation' || code.code_type === 'payment_code') && code.fixed_amount > 0) {
                    finalAmount -= code.fixed_amount;
                }
                
                finalAmount = Math.max(0, finalAmount);
                
                // إعادة حساب العربون بعد الخصم
                if (finalAmount <= depositAmount) {
                     depositAmount = finalAmount; // العربون لا يجب أن يتجاوز المبلغ المتبقي
                }
                
                // إذا كان المبلغ النهائي صفرًا، يتم تأكيد الحجز مباشرة
                if (finalAmount <= 0) {
                    depositAmount = 0;
                    initialStatus = 'booked_confirmed';
                }
            }
        }
        
        // 💡 2. منطق العربون العادي (للمبلغ المتبقي/بدون كود)
        if (initialStatus !== 'booked_confirmed') {
             const now = new Date();
             const bookingDateTime = new Date(`${bookingDate}T${startTime}:00`);
             const hoursDifference = (bookingDateTime - now) / (1000 * 60 * 60);

             if (hoursDifference > 24) {
                 // حالة العربون العادي: يتم تأكيد الساعة بمجرد دفع العربون
                 initialStatus = 'booked_unconfirmed';
             } else {
                 // أقل من 24 ساعة، لا عربون، الحجز معلق لانتظار الموافقة اليدوية
                 depositAmount = 0;
                 initialStatus = 'pending_owner_approval'; 
             }
        }

        const booking = await withTransaction(async (client) => {
            const newBooking = await models.createNewBooking(
                userId, fieldId, bookingDate, startTime, endTime, 
                finalAmount, depositAmount, playersNeeded, initialStatus, client 
            );
            
            // 💡 3. تسجيل استخدام الكود
            if (appliedCode) {
                await models.incrementCodeUsage(appliedCode.code_id, client);
            }
            return newBooking;
        });

        await models.createActivityLog(userId, 'BOOKING_REQUEST', `طلب حجز: ${field.name} في ${bookingDate}، المبلغ المتبقي: ${finalAmount} ج.م`);

        if (depositAmount > 0) {
            // ... (response requiresPayment)
            res.json({
                message: "تم حجز الساعة، يرجى إكمال عملية دفع العربون.",
                requiresPayment: true,
                depositAmount: depositAmount,
                bookingId: booking.booking_id
            });
        } else {
            // ... (response no payment needed)
            res.json({
                message: `تم تسجيل الحجز بنجاح. ${initialStatus === 'booked_confirmed' ? 'تم تأكيده بالكود.' : 'سينتظر موافقة المالك.'}`,
                requiresPayment: false,
                bookingId: booking.booking_id,
                status: initialStatus
            });
        }

    } catch (error) {
        console.error('bookingRequestController error:', error);
        res.status(500).json({ message: "فشل في تسجيل طلب الحجز." });
    }
}
// -------------------------------------
// 32. حجز ساعة ملعب (Booking Request)
// -------------------------------------
async function bookingRequestController(req, res) {
    const { fieldId, bookingDate, startTime, endTime, playersNeeded } = req.body;
    const userId = req.user.id;
    
    if (!fieldId || !bookingDate || !startTime || !endTime) {
        return res.status(400).json({ message: "يرجى توفير جميع بيانات الحجز." });
    }

    try {
        const field = await models.getFieldDetailsForBooking(fieldId);
        if (!field) return res.status(404).json({ message: "الملعب غير موجود أو غير نشط." });

        const slotStatus = await models.getSlotStatus(fieldId, bookingDate, startTime);
        if (slotStatus !== 'available') {
            return res.status(409).json({ message: `الساعة المطلوبة محجوزة بالفعل أو حالتها: ${slotStatus}` });
        }
        
        const totalAmount = field.price_per_hour; // يتم تعديلها لاحقاً إذا كان الحجز لأكثر من ساعة
        const now = new Date();
        const bookingDateTime = new Date(`${bookingDate}T${startTime}:00`);
        const hoursDifference = (bookingDateTime - now) / (1000 * 60 * 60);

        let depositAmount = 0;
        let initialStatus = 'booked_unconfirmed';
        
        // منطق العربون: إذا كان الحجز قبل أكثر من 24 ساعة، يُطلب عربون.
        if (hoursDifference > 24) {
            depositAmount = field.deposit_amount;
        }

        if (depositAmount > 0) {
            initialStatus = 'booked_unconfirmed'; // ينتظر الدفع
        } else {
            // أقل من 24 ساعة، لا يوجد عربون، يصبح الحجز معلقاً لحين تأكيده يدوياً من المالك/الموظف
            initialStatus = 'pending_owner_approval'; 
        }

        const booking = await withTransaction(async (client) => {
            const newBooking = await models.createNewBooking(
                userId, fieldId, bookingDate, startTime, endTime, 
                totalAmount, depositAmount, playersNeeded, initialStatus, client
            );
            return newBooking;
        });

        await models.createActivityLog(userId, 'BOOKING_REQUEST', `طلب حجز: ${field.name} في ${bookingDate}، المبلغ: ${totalAmount} ج.م`);

        if (depositAmount > 0) {
            // إرسال إلى صفحة الدفع
            res.json({
                message: "تم حجز الساعة، يرجى إكمال عملية دفع العربون.",
                requiresPayment: true,
                depositAmount: depositAmount,
                bookingId: booking.booking_id
            });
        } else {
            // حجز معلق بانتظار الموافقة اليدوية
            res.json({
                message: "تم تسجيل الحجز بنجاح. سيتم تأكيده يدوياً من المالك خلال ساعة.",
                requiresPayment: false,
                bookingId: booking.booking_id
            });
        }

    } catch (error) {
        console.error('bookingRequestController error:', error);
        res.status(500).json({ message: "فشل في تسجيل طلب الحجز." });
    }
}

// -------------------------------------
// 33. جلب تفاصيل الحجز للدفع
// -------------------------------------
async function getBookingInfoController(req, res) {
    const { bookingId } = req.params;
    const userId = req.user.id;

    try {
        const booking = await models.getBookingInfoForPayment(bookingId, userId);

        if (!booking) return res.status(404).json({ message: "الحجز غير موجود أو لا تملك الصلاحية." });
        if (booking.status !== 'booked_unconfirmed') return res.status(400).json({ message: "حالة الحجز لا تتطلب الدفع حالياً." });
        if (booking.deposit_amount === 0) return res.status(400).json({ message: "هذا الحجز لا يتطلب عربوناً." });

        res.json(booking);
    } catch (error) {
        console.error('getBookingInfoController error:', error);
        res.status(500).json({ message: "فشل جلب تفاصيل الحجز." });
    }
}

// -------------------------------------
// 34. بدء عملية الدفع (PayMob Integration Mock)
// -------------------------------------
async function initiatePaymentController(req, res) {
    const { bookingId, customerInfo } = req.body;
    const userId = req.user.id;

    if (!bookingId) return res.status(400).json({ message: "معرف الحجز مطلوب." });

    try {
        const booking = await models.getBookingInfoForPayment(bookingId, userId);
        if (!booking) return res.status(404).json({ message: "الحجز غير موجود أو لا تملك الصلاحية." });
        if (booking.status !== 'booked_unconfirmed') return res.status(400).json({ message: "حالة الحجز لا تتطلب الدفع حالياً." });

        const amountToPay = booking.deposit_amount;
        if (amountToPay <= 0) return res.status(400).json({ message: "لا يوجد عربون مستحق للدفع." });

        // محاكاة الاتصال بخدمة الدفع
        const paymentIntent = await mockPaymobPaymentIntent(bookingId, amountToPay, customerInfo);

        if (paymentIntent.success) {
            res.json({
                message: "تم إنشاء طلب الدفع بنجاح.",
                payment_url: paymentIntent.payment_url,
                payment_reference: paymentIntent.payment_reference,
            });
        } else {
            res.status(500).json({ message: "فشل في إنشاء رابط الدفع." });
        }
    } catch (error) {
        console.error('initiatePaymentController error:', error);
        res.status(500).json({ message: "فشل في بدء عملية الدفع." });
    }
}

// -------------------------------------
// 35. معالجة إشعار الدفع (Webhook/Callback Mock)
// -------------------------------------
async function paymentCallbackController(req, res) {
    const { booking_id, success, reference } = req.query; // يتم استخدام query params لسهولة المحاكاة

    // ملاحظة: في PayMob الحقيقية، يتم التحقق من التوقيع (HMAC) هنا لأسباب أمنية
    if (!booking_id || !reference) {
        return res.status(400).json({ message: "بيانات الإشعار غير مكتملة." });
    }

    try {
        if (success === 'true') {
            const updatedBooking = await withTransaction(async (client) => {
                const updated = await models.updateBookingStatus(booking_id, 'booked_confirmed', reference, client);
                return updated;
            });

            await models.createActivityLog(updatedBooking.user_id, 'PAYMENT_SUCCESS', `تم تأكيد دفع عربون الحجز ${booking_id} بنجاح. مرجع الدفع: ${reference}`);
            
            // في البيئة الحقيقية، يتم إرسال بريد تأكيد هنا.
            // نعيد توجيه المستخدم إلى صفحة التأكيد
            return res.redirect(`/payment.html?status=success&ref=${reference}&booking_id=${booking_id}`);

        } else {
            // فشل الدفع، قد يتم إرجاع حالة الحجز إلى 'cancelled' أو 'failed_payment'
            await withTransaction(async (client) => {
                await models.updateBookingStatus(booking_id, 'failed_payment', reference, client);
            });
            
            await models.createActivityLog(null, 'PAYMENT_FAILED', `فشل دفع عربون الحجز ${booking_id}. مرجع الدفع: ${reference}`);
            
            return res.redirect(`/payment.html?status=failure&ref=${reference}&booking_id=${booking_id}`);
        }
    } catch (error) {
        console.error('paymentCallbackController error:', error);
        // في الـ Webhook الحقيقي يجب إرجاع 200/400/500 code فقط
        res.status(500).json({ message: "خطأ داخلي في معالجة الإشعار." });
    }
}

module.exports = {
    // ... (تصدير جميع الدوال الأخرى)
    bookingRequestController,
    getBookingInfoController,
    initiatePaymentController,
    paymentCallbackController,
    // ...
};

// controllers.js (إضافات لمنطق إدارة الأكواد)

// -------------------------------------
// 36. إنشاء كود جديد (Admin Only)
// -------------------------------------
async function createCodeController(req, res) {
    const { code_value, code_type, field_id, discount_percent, fixed_amount, max_uses, expires_at } = req.body;
    const created_by = req.user.id;
    
    if (!code_value || !code_type) {
        return res.status(400).json({ message: "الاسم والنوع مطلوبان." });
    }

    try {
        const newCode = await withTransaction(async (client) => {
            return models.createCode({
                code_value: code_value.toUpperCase(),
                code_type,
                field_id: field_id || null,
                discount_percent: discount_percent || 0,
                fixed_amount: fixed_amount || 0,
                max_uses: max_uses || 1,
                expires_at: expires_at || null,
                created_by
            }, client);
        });

        await models.createActivityLog(created_by, 'ADMIN_CREATE_CODE', `تم إنشاء كود: ${newCode.code_value} (${newCode.code_type})`);
        res.status(201).json({ message: "تم إنشاء الكود بنجاح.", code: newCode });

    } catch (error) {
        console.error('createCodeController error:', error);
        if (error.code === '23505') { // PostgreSQL unique violation error code
             return res.status(409).json({ message: "هذا الكود موجود بالفعل. يرجى اختيار اسم آخر." });
        }
        res.status(500).json({ message: "فشل إنشاء الكود." });
    }
}

// -------------------------------------
// 37. جلب جميع الأكواد (Admin Only)
// -------------------------------------
async function getAllCodesController(req, res) {
    try {
        const codes = await models.getAllCodes();
        res.json(codes);
    } catch (error) {
        console.error('getAllCodesController error:', error);
        res.status(500).json({ message: "فشل جلب الأكواد." });
    }
}

// -------------------------------------
// 38. تعطيل/تفعيل الكود (Admin Only)
// -------------------------------------
async function toggleCodeStatusController(req, res) {
    const { codeId } = req.params;
    const { isActive } = req.body; // boolean

    try {
        const updatedCode = await withTransaction(async (client) => {
            return models.updateCodeStatus(codeId, isActive, client);
        });

        if (!updatedCode) return res.status(404).json({ message: "الكود غير موجود." });

        const action = isActive ? 'تفعيل' : 'تعطيل';
        await models.createActivityLog(req.user.id, `ADMIN_${action}_CODE`, `تم ${action} الكود: ${updatedCode.code_value}`);
        
        res.json({ message: `تم ${action} الكود بنجاح.`, code: updatedCode });
    } catch (error) {
        console.error('toggleCodeStatusController error:', error);
        res.status(500).json({ message: "فشل تحديث حالة الكود." });
    }
}

// -------------------------------------
// 39. التحقق من كود الخصم/الدفع (Player Flow)
// -------------------------------------
async function validateCodeController(req, res) {
    const { codeValue, fieldId } = req.body;
    
    if (!codeValue || !fieldId) {
        return res.status(400).json({ message: "يرجى توفير الكود ومعرف الملعب." });
    }

    try {
        const code = await models.validateCode(codeValue.toUpperCase(), fieldId);

        if (!code) {
            return res.status(404).json({ message: "الكود غير صالح، منتهي الصلاحية، أو تجاوز الحد الأقصى للاستخدام." });
        }
        
        // إرسال بيانات الخصم ليتم عرضها في الواجهة الأمامية
        let discountType = null;
        let discountAmount = 0;
        
        if (code.code_type === 'discount') {
            discountType = 'percent';
            discountAmount = code.discount_percent; // النسبة
        } else if (code.code_type === 'compensation' || code.code_type === 'payment_code') {
            discountType = 'fixed';
            discountAmount = code.fixed_amount; // المبلغ الثابت
        }
        
        res.json({
            message: `تم تطبيق كود ${code.code_type === 'discount' ? 'الخصم' : 'الدفع'} بنجاح.`,
            codeId: code.code_id,
            codeType: code.code_type,
            discountType,
            discountValue: discountAmount,
            appliedFieldId: code.field_id
        });

    } catch (error) {
        console.error('validateCodeController error:', error);
        res.status(500).json({ message: "فشل في التحقق من الكود." });
    }
}

// controllers.js (إضافات لمنطق طلبات اللاعبين والتقييمات)

// ... (تأكد من استيراد الدوال الجديدة من models) ...

// =========================================================
// 40. Player Requests Controllers (طلب لاعبين إضافيين)
// =========================================================

// إنشاء طلب لاعبين (بعد حجز مؤكد)
async function createPlayerRequestController(req, res) {
    const { bookingId, playersNeeded, notes } = req.body;
    const userId = req.user.id;

    if (!bookingId || playersNeeded === undefined || playersNeeded <= 0) {
        return res.status(400).json({ message: "بيانات الطلب غير مكتملة." });
    }
    
    try {
        const booking = await models.getBookingInfoForPayment(bookingId, userId); 
        if (!booking || booking.status !== 'booked_confirmed') {
            return res.status(400).json({ message: "لا يمكن إنشاء طلب لاعبين إلا لحجز مؤكد." });
        }
        
        const request = await withTransaction(async (client) => {
            // يتم إنشاء الطلب ثم إضافة صاحب الحجز كمشارك تلقائي
            const newRequest = await models.createPlayerRequest(bookingId, playersNeeded, notes, userId, client);
            await models.joinPlayerRequest(newRequest.request_id, userId, client);
            return newRequest;
        });

        await models.createActivityLog(userId, 'PLAYER_REQUEST_CREATED', `طلب لاعبين للحجز ${bookingId}`);
        res.status(201).json({ message: "تم نشر طلب اللاعبين بنجاح.", requestId: request.request_id });

    } catch (error) {
        console.error('createPlayerRequestController error:', error);
        res.status(500).json({ message: "فشل في إنشاء طلب اللاعبين." });
    }
}

// جلب جميع الطلبات النشطة (لصفحة players.html)
async function getAllPlayerRequestsController(req, res) {
    const { area } = req.query; 
    try {
        const filters = {};
        if (area) filters.area = area;
        
        const requests = await models.getAllActivePlayerRequests(filters);
        res.json(requests);
    } catch (error) {
        console.error('getAllPlayerRequestsController error:', error);
        res.status(500).json({ message: "فشل في جلب طلبات اللاعبين." });
    }
}

// انضمام ومغادرة (تستخدم نفس الـ API مع اختلاف الباراميتر)
async function togglePlayerRequestController(req, res) {
    const { requestId, action } = req.params; // action يمكن أن تكون 'join' أو 'leave'
    const userId = req.user.id;

    if (action !== 'join' && action !== 'leave') {
        return res.status(400).json({ message: "الإجراء غير صالح." });
    }
    
    try {
        let result;
        await withTransaction(async (client) => {
            if (action === 'join') {
                result = await models.joinPlayerRequest(requestId, userId, client);
            } else {
                result = await models.leavePlayerRequest(requestId, userId, client);
            }
        });
        
        if (result) {
            await models.createActivityLog(userId, `PLAYER_REQUEST_${action.toUpperCase()}`, `${action === 'join' ? 'انضم' : 'غادر'} الطلب ${requestId}`);
            res.json({ message: `تم ${action === 'join' ? 'الانضمام' : 'المغادرة'} إلى الطلب بنجاح.` });
        } else {
            res.status(200).json({ message: `تمت معالجة الطلب بنجاح. ${action === 'leave' ? 'لم تكن مشاركاً.' : 'أنت بالفعل مشارك.'}` });
        }
    } catch (error) {
        console.error('togglePlayerRequestController error:', error);
        res.status(500).json({ message: "فشل في معالجة طلب الانضمام/المغادرة." });
    }
}


// =========================================================
// 41. Ratings Controllers (نظام التقييمات)
// =========================================================

// إرسال تقييم لحجز مكتمل
async function submitRatingController(req, res) {
    const { bookingId } = req.params;
    const { ratingValue, comment } = req.body;
    const userId = req.user.id;

    if (!ratingValue || ratingValue < 1 || ratingValue > 5) {
        return res.status(400).json({ message: "قيمة التقييم (1-5) مطلوبة." });
    }
    
    try {
        const validation = await models.canUserRateBooking(bookingId, userId);
        if (!validation.canRate) {
            return res.status(403).json({ message: validation.message });
        }
        
        const newRating = await withTransaction(async (client) => {
            return models.submitRating(bookingId, userId, validation.fieldId, ratingValue, comment, client);
        });

        await models.createActivityLog(userId, 'RATING_SUBMITTED', `تقييم الملعب ${validation.fieldId} بـ ${ratingValue} نجوم.`);
        res.status(201).json({ message: "تم إرسال التقييم بنجاح.", rating: newRating });

    } catch (error) {
        console.error('submitRatingController error:', error);
        res.status(500).json({ message: "فشل في إرسال التقييم." });
    }
}

// ... (تصدير جميع الدوال في نهاية controllers.js)

// controllers.js (إضافات لمنطق الإشعارات)

// -------------------------------------
// 42. جلب إشعارات المستخدم (Notifications)
// -------------------------------------
async function getNotificationsController(req, res) {
    const userId = req.user.id;
    try {
        const notifications = await models.getNotificationsByUserId(userId);
        const unreadCount = await models.getUnreadNotificationsCount(userId);
        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('getNotificationsController error:', error);
        res.status(500).json({ message: "فشل في جلب الإشعارات." });
    }
}

// -------------------------------------
// 43. وضع علامة 'مقروء' على جميع الإشعارات
// -------------------------------------
async function markAllAsReadController(req, res) {
    const userId = req.user.id;
    try {
        const count = await models.markAllNotificationsAsRead(userId);
        res.json({ message: `تم وضع علامة 'مقروء' على ${count} إشعار.`, updatedCount: count });
    } catch (error) {
        console.error('markAllAsReadController error:', error);
        res.status(500).json({ message: "فشل في تحديث حالة الإشعارات." });
    }
}
