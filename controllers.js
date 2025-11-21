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
