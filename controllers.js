// controllers.js - منطق المتحكمات (Controllers Logic) - الإصدار النهائي المُصلح

const { validationResult } = require('express-validator'); 
const models = require('./models'); 
const { withTransaction } = require('./db'); 
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ===================================
// 🛠️ دوال مساعدة عامة
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

function handleInternalError(res, error, message) {
    console.error(`${message} Error:`, error.message);
    res.status(500).json({ success: false, message: message + "، يرجى المحاولة لاحقاً." });
}

// ===================================
// 👥 المتحكمات: المصادقة (Auth)
// ===================================

async function registerController(req, res) {
    const { email, role = 'player' } = req.body; // ⬅️ التأكد من أن الافتراضي 'player'
    try {
        const existingUser = await models.findUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ success: false, message: "البريد الإلكتروني مسجل بالفعل." });
        }

        const newUser = await models.registerNewUser({...req.body, role});
        
        res.status(201).json({ 
            success: true, 
            message: "تم إنشاء الحساب بنجاح. يرجى تسجيل الدخول.", 
            user: { 
                id: newUser.id, 
                name: newUser.name,
                email: newUser.email,
                role: newUser.role, 
                is_approved: newUser.is_approved 
            } 
        });
    } catch (error) {
        handleInternalError(res, error, "فشل في عملية التسجيل.");
    }
}

async function loginController(req, res, next) {
    const { email, password } = req.body;
    
    try {
        const user = await models.findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        const isMatch = await models.comparePassword(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        }

        if (!user.is_approved && (user.role === 'owner' || user.role === 'manager')) {
            return res.status(403).json({ success: false, message: "الحساب قيد المراجعة ولم تتم الموافقة عليه بعد." });
        }

        // إنشاء JWT token
        const token = jwt.sign(
            { 
                id: user.id, 
                role: user.role, 
                email: user.email,
                is_approved: user.is_approved
            },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // إرجاع البيانات بدون كلمة المرور
        const userResponse = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_approved: user.is_approved,
            phone: user.phone,
            avatar_url: user.avatar_url
        };

        // 🎯 تحديد الصفحة المناسبة حسب الـ role
        let redirectTo = '/';
        let welcomeMessage = 'مرحباً بك!';
        
        switch(user.role) {
            case 'player':
                redirectTo = '/';
                welcomeMessage = 'مرحباً بك في منصة اللاعبين!';
                break;
                
            case 'owner':
                redirectTo = user.is_approved ? '/owner/dashboard' : '/pending-approval';
                welcomeMessage = user.is_approved 
                    ? 'مرحباً بك في لوحة تحكم الملاك!' 
                    : 'حسابك قيد المراجعة من الإدارة';
                break;
                
            case 'manager':
                redirectTo = user.is_approved ? '/employee/dashboard' : '/pending-approval';
                welcomeMessage = user.is_approved 
                    ? 'مرحباً بك في لوحة تحكم المديرين!' 
                    : 'حسابك قيد المراجعة من الإدارة';
                break;
                
            case 'admin':
                redirectTo = '/admin/dashboard';
                welcomeMessage = 'مرحباً بك في لوحة تحكم الأدمن!';
                break;
                
            default:
                redirectTo = '/';
        }

        res.json({ 
            success: true, 
            message: welcomeMessage,
            token,
            user: userResponse,
            // 🎯 إضافة معلومات التوجيه
            redirect: {
                path: redirectTo,
                role: user.role,
                is_approved: user.is_approved
            }
        });
        
    } catch (error) {
        handleInternalError(res, error, 'فشل في تسجيل الدخول');
    }
}

async function logoutController(req, res) {
    // مع JWT، التسجيل الخروج يكون على العميل بحذف التوكن
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
}

async function getCurrentUserController(req, res) {
    try {
        const user = await models.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }
        res.json({ 
            success: true, 
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email, 
                role: user.role, 
                is_approved: user.is_approved,
                phone: user.phone,
                avatar_url: user.avatar_url
            } 
        });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب بيانات المستخدم');
    }
}

// ===================================
// 🏟️ المتحكمات: العامة واللاعب
// ===================================

async function getStadiumsController(req, res) {
    try {
        const stadiums = await models.getStadiums(req.query);
        res.json({ success: true, data: stadiums });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب الملاعب');
    }
}

async function getStadiumDetailsController(req, res) {
    try {
        const stadium = await models.getStadiumById(req.params.stadiumId);
        if (!stadium) return res.status(404).json({ success: false, message: 'الملعب غير موجود' });
        
        const ratings = await models.getStadiumRatings(req.params.stadiumId);
        res.json({ success: true, data: { ...stadium, ratings } });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب تفاصيل الملعب');
    }
}

async function getAvailableSlotsController(req, res) {
    try {
        const stadiumId = req.params.stadiumId;
        const date = req.query.date;
        
        // 🎯 محاولة جلب الساعات المُولَّدة أولاً
        let slots = await models.getStadiumSlots(stadiumId, date);
        
        if (slots.length === 0) {
            // إذا مفيش ساعات مُولَّدة، نولدها تلقائياً
            const stadium = await models.getStadiumById(stadiumId);
            if (stadium) {
                await models.generateDailySlots(stadium, date);
                slots = await models.getStadiumSlots(stadiumId, date);
            }
        }
        
        // تصفية الساعات المتاحة فقط للعرض
        const availableSlots = slots.filter(slot => slot.status === 'available');
        
        res.json({ success: true, data: availableSlots });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب الساعات المتاحة');
    }
}

async function createBookingController(req, res) {
    try {
        const { stadium_id, slot_id, date, start_time, end_time, payment_method, code, guest_name, guest_phone } = req.body;
        const user_id = req.user.id;
        
        const result = await withTransaction(async (client) => {
            // جلب بيانات الملعب
            const stadium = await models.getStadiumById(stadium_id);
            if (!stadium) throw new Error('الملعب غير موجود');
            
            // حساب الوقت المتبقي للساعة
            const slotDateTime = new Date(`${date} ${start_time}`);
            const timeToSlot = slotDateTime - new Date();
            const hoursToSlot = timeToSlot / (1000 * 60 * 60);
            
            // 🎯 تحديد العربون حسب وقت الحجز
            let depositAmount = 0;
            let bookingStatus = 'pending';
            let slotStatus = 'available';
            
            if (hoursToSlot > 24) {
                depositAmount = stadium.deposit_amount;
                bookingStatus = 'pending_payment';
            } else {
                depositAmount = 0;
                bookingStatus = 'booked_unconfirmed';
                slotStatus = 'booked_unconfirmed';
            }
            
            // تطبيق كود الخصم إذا وُجد
            let finalDeposit = depositAmount;
            if (code && payment_method === 'online') {
                try {
                    const discount = await models.validateDiscountCode(code, stadium_id, user_id);
                    if (discount.isValid) {
                        if (discount.amount) {
                            finalDeposit = Math.max(0, depositAmount - discount.amount);
                        } else if (discount.percent) {
                            finalDeposit = depositAmount * (1 - discount.percent / 100);
                        }
                    }
                } catch (discountError) {
                    // تجاهل خطأ الكود والمضي قدماً
                    console.log('Discount code error:', discountError.message);
                }
            }
            
            // التحقق من كود الدفع إذا وُجد
            if (payment_method === 'code' && code) {
                const paymentCode = await client.query(
                    'SELECT * FROM discount_codes WHERE code = $1 AND type = $2 AND field_id = $3 AND is_active = TRUE',
                    [code, 'payment', stadium_id]
                );
                
                if (!paymentCode.rows.length) {
                    throw new Error('كود الدفع غير صالح لهذا الملعب');
                }
                
                // إذا الكود صالح، تأكيد الحجز فوراً
                bookingStatus = 'confirmed';
                slotStatus = 'booked_confirmed';
            }
            
            const bookingData = {
                user_id,
                stadium_id,
                date,
                start_time,
                end_time,
                total_price: stadium.price_per_hour,
                deposit_amount: finalDeposit,
                players_needed: req.body.players_needed || 0,
                guest_name,
                guest_phone
            };
            
            const booking = await models.createBooking(bookingData, client);
            
            // تحديث حالة الساعة إذا لزم
            if (slot_id) {
                await client.query(
                    'UPDATE generated_slots SET status = $1, booking_id = $2 WHERE id = $3',
                    [slotStatus, booking.id, slot_id]
                );
            }
            
            return {
                booking,
                requires_payment: bookingStatus === 'pending_payment',
                deposit_amount: finalDeposit,
                payment_method
            };
        });
        
        let responseMessage = 'تم إنشاء الحجز بنجاح';
        let paymentInfo = null;
        
        if (result.requires_payment && result.payment_method === 'online') {
            responseMessage = 'تم إنشاء الحجز بنجاح، يرجى إتمام دفع العربون';
            paymentInfo = {
                amount: result.deposit_amount,
                booking_id: result.booking.id,
                // هنا يمكن إضافة بيانات Paymob
            };
        } else if (result.booking.status === 'booked_unconfirmed') {
            responseMessage = 'تم إنشاء الحجز بنجاح، بانتظار تأكيد الإدارة';
        }
        
        res.status(201).json({
            success: true,
            message: responseMessage,
            data: result.booking,
            payment: paymentInfo
        });
        
    } catch (error) {
        if (error.message.includes('conflict') || error.message.includes('invalid') || error.message.includes('غير صالح')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        handleInternalError(res, error, 'فشل في عملية الحجز');
    }
}

async function getUserBookingsController(req, res) {
    try {
        const bookings = await models.getUserBookings(req.user.id, req.query.status);
        res.json({ success: true, data: bookings });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب حجوزات المستخدم');
    }
}

async function cancelBookingPlayerController(req, res) {
    const { bookingId } = req.params;
    
    try {
        const result = await withTransaction(async (client) => {
            const booking = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
            if (!booking.rows.length) throw new Error("الحجز غير موجود");
            
            const bookingData = booking.rows[0];
            
            // حساب الوقت المتبقي
            const slotDateTime = new Date(`${bookingData.date} ${bookingData.start_time}`);
            const timeToSlot = slotDateTime - new Date();
            const hoursToSlot = timeToSlot / (1000 * 60 * 60);
            
            let compensationCode = null;
            
            // 🎯 إنشاء كود تعويض إذا الإلغاء قبل 24 ساعة
            if (hoursToSlot > 24 && bookingData.deposit_paid > 0) {
                compensationCode = await models.createCompensationCode(
                    req.user.id, 
                    bookingData.deposit_paid, 
                    client
                );
            }
            
            const cancelledBooking = await models.cancelBooking(bookingId, req.user.id, 'player_cancellation', client);
            if (!cancelledBooking) throw new Error("الحجز غير موجود أو لا يمكن إلغاؤه في الوقت الحالي.");
            
            // تحرير الساعة
            await client.query(
                'UPDATE generated_slots SET status = $1, booking_id = NULL WHERE booking_id = $2',
                ['available', bookingId]
            );
            
            await models.createActivityLog(
                req.user.id, 
                'BOOKING_CANCEL', 
                `قام اللاعب بإلغاء الحجز ${bookingId}`, 
                bookingId, 
                client
            );
            
            return { ...cancelledBooking, compensation_code: compensationCode?.code_value };
        });

        const refundMessage = result.compensation_code ? 
            ` وتم إصدار كود تعويض بقيمة ${result.deposit_paid}. الكود: ${result.compensation_code}` : 
            '';
            
        res.json({ 
            success: true, 
            message: `تم إلغاء الحجز بنجاح.${refundMessage}`,
            data: result
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || 'فشل في إلغاء الحجز' 
        });
    }
}

async function submitRatingController(req, res) {
    const { stadiumId } = req.params;
    const { rating, comment } = req.body;
    
    try {
        const newRating = await withTransaction(async (client) => {
            const canRate = await models.canUserRateStadium(stadiumId, req.user.id, client);
            if (!canRate) throw new Error("لا يمكن تقييم الملعب إلا بعد حجز وإتمام اللعب فيه.");
            
            const ratingResult = await models.submitNewRating(stadiumId, req.user.id, rating, comment, client);
            await models.createActivityLog(
                req.user.id, 
                'RATING_SUBMIT', 
                `تم تقييم الملعب ${stadiumId}`, 
                stadiumId, 
                client
            );
            return ratingResult;
        });

        res.status(201).json({ 
            success: true, 
            message: "تم تسجيل تقييمك بنجاح", 
            data: newRating 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || "فشل في تسجيل التقييم" 
        });
    }
}

// ===================================
// 💰 متحكمات الدفع والأكواد
// ===================================

async function handlePaymentNotificationController(req, res) {
    // التحقق من توقيع الـ webhook
    const signature = req.headers['x-payment-signature'];
    const expectedSignature = crypto
        .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET || 'webhook-secret')
        .update(req.rawBody)
        .digest('hex');

    if (signature !== expectedSignature) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ success: false, message: "توقيع غير صالح." });
    }

    const { booking_id, reference, status, amount } = req.body;
    
    if (!booking_id || !reference || !status) {
        return res.status(400).json({ success: false, message: "بيانات الإشعار غير كاملة." });
    }

    try {
        await withTransaction(async (client) => {
            // التحقق من عدم تكرار المعاملة
            const transactionExists = await models.checkPaymentTransactionExists(reference, client);
            if (transactionExists) {
                console.log(`⏭️  Transaction ${reference} already processed - skipping`);
                return;
            }

            if (status === 'successful' || status === 'confirmed') { 
                // تسجيل المعاملة
                await models.recordPaymentTransaction({
                    provider_tx_id: reference,
                    booking_id: booking_id,
                    amount: amount,
                    status: 'confirmed'
                }, client);

                // تأكيد الحجز
                const confirmedBooking = await models.finalizePayment(booking_id, reference, amount, client);
                
                // تحديث حالة الساعة
                await client.query(
                    'UPDATE generated_slots SET status = $1 WHERE booking_id = $2',
                    ['booked_confirmed', booking_id]
                );
                
                await models.createActivityLog(
                    confirmedBooking.user_id, 
                    'PAYMENT_SUCCESS', 
                    `تم تأكيد دفع العربون للحجز ${booking_id}`, 
                    booking_id, 
                    client
                );

                console.log(`✅ Payment confirmed for booking ${booking_id}`);
            } else if (status === 'failed' || status === 'cancelled') {
                await models.cancelBooking(booking_id, null, 'system_payment_failure', client);
                await models.createActivityLog(
                    null, 
                    'PAYMENT_FAILURE', 
                    `فشل دفع العربون للحجز ${booking_id}`, 
                    booking_id, 
                    client
                );
                console.log(`❌ Payment failed for booking ${booking_id}`);
            }
        });
        
        res.status(200).json({ success: true, message: "تم معالجة الإشعار بنجاح." });
    } catch (error) {
        console.error('Payment Notification Error:', error);
        res.status(500).json({ success: false, message: "فشل داخلي في معالجة الإشعار." });
    }
}

async function validateCodeController(req, res) {
    const { code, stadium_id } = req.body;
    try {
        const validationResult = await models.validateCode(code, stadium_id, req.user.id);
        res.json({ success: true, data: validationResult });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || "الكود غير صالح أو منتهي الصلاحية" 
        });
    }
}

// ===================================
// 👥 طلبات اللاعبين
// ===================================

async function createPlayerRequestController(req, res) {
    const { booking_id, players_needed, details } = req.body;
    
    try {
        const newRequest = await withTransaction(async (client) => {
            const request = await models.createPlayerRequest(booking_id, req.user.id, players_needed, details, client);
            await models.createActivityLog(
                req.user.id, 
                'PLAYER_REQUEST_CREATE', 
                `طلب لاعبين للحجز ${booking_id}`, 
                request.id, 
                client
            );
            return request;
        });

        res.status(201).json({ 
            success: true, 
            message: 'تم إنشاء طلب اللاعبين بنجاح.', 
            data: newRequest 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || 'فشل في إنشاء طلب اللاعبين' 
        });
    }
}

async function getRequestsForBookingController(req, res) {
    try {
        const requests = await models.getPlayerRequestsForBooking(req.params.bookingId);
        res.json({ success: true, data: requests });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب طلبات اللاعبين');
    }
}

async function joinPlayerRequestController(req, res) {
    const { requestId } = req.params;
    
    try {
        const result = await withTransaction(async (client) => {
            const joinResult = await models.joinPlayerRequest(requestId, req.user.id, client);
            await models.createActivityLog(
                req.user.id, 
                'PLAYER_JOIN', 
                `انضمام لطلب اللاعبين ${requestId}`, 
                requestId, 
                client
            );
            return joinResult;
        });

        res.json({ 
            success: true, 
            message: 'تم الانضمام للطلب بنجاح.', 
            data: result 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || 'فشل في الانضمام للطلب' 
        });
    }
}

// ===================================
// ⚽ المتحكمات: إدارة الملاعب
// ===================================

async function getOwnerStadiumsController(req, res) {
    try {
        const stadiums = await models.getOwnerStadiums(req.user.id);
        res.json({ success: true, data: stadiums });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب ملاعب المالك');
    }
}

async function createStadiumController(req, res) {
    try {
        const { name, location, price_per_hour, deposit_amount, features, type } = req.body;
        const userId = req.user.id;
        
        const image_url = req.file ? `/uploads/images/${req.file.filename}` : null;
        
        const newStadium = await withTransaction(async (client) => {
            const data = { 
                name, 
                location, 
                type, 
                price_per_hour: parseFloat(price_per_hour), 
                deposit_amount: parseFloat(deposit_amount), 
                image_url, 
                features: features ? JSON.parse(features) : [] 
            };
            const stadium = await models.createStadium(data, userId, client);
            return stadium;
        });

        res.status(201).json({ 
            success: true, 
            message: "تم إنشاء الملعب بنجاح", 
            data: newStadium 
        });
    } catch (error) {
        handleInternalError(res, error, "فشل في إنشاء الملعب");
    }
}

async function updateStadiumController(req, res) {
    try {
        const stadium_id = req.params.stadiumId;
        const updateData = req.body;
        
        if (req.file) {
            updateData.image_url = `/uploads/images/${req.file.filename}`;
        }
        
        const updatedStadium = await models.updateStadium(stadium_id, updateData, req.user.id);
        if (!updatedStadium) {
            return res.status(404).json({ 
                success: false, 
                message: 'الملعب غير موجود أو لا تملك صلاحية تعديله' 
            });
        }

        res.json({ 
            success: true, 
            message: 'تم تحديث الملعب بنجاح', 
            data: updatedStadium 
        });
    } catch (error) {
        handleInternalError(res, error, 'فشل في تحديث الملعب');
    }
}

async function getStadiumBookingsOwnerController(req, res) {
    try {
        const bookings = await models.getStadiumBookings(req.params.stadiumId, req.query.date, req.query.status);
        res.json({ success: true, data: bookings });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب حجوزات الملعب');
    }
}

async function confirmBookingOwnerController(req, res) {
    try {
        const confirmedBooking = await withTransaction(async (client) => {
            const booking = await models.confirmBooking(req.params.bookingId, req.user.id, client);
            if (!booking) throw new Error("الحجز غير موجود أو مؤكد بالفعل.");
            
            // تحديث حالة الساعة
            await client.query(
                'UPDATE generated_slots SET status = $1 WHERE booking_id = $2',
                ['booked_confirmed', req.params.bookingId]
            );
            
            await models.createActivityLog(
                req.user.id, 
                'BOOKING_CONFIRM', 
                `تم تأكيد الحجز ${req.params.bookingId}`, 
                req.params.bookingId, 
                client
            );
            return booking;
        });

        res.json({ 
            success: true, 
            message: 'تم تأكيد الحجز بنجاح.', 
            data: confirmedBooking 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || 'فشل في تأكيد الحجز' 
        });
    }
}

async function cancelBookingOwnerController(req, res) {
    try {
        const result = await withTransaction(async (client) => {
            const cancelledBooking = await models.cancelBooking(req.params.bookingId, req.user.id, 'owner_cancellation', client);
            if (!cancelledBooking) throw new Error("الحجز غير موجود أو ملغى بالفعل.");
            
            // تحرير الساعة
            await client.query(
                'UPDATE generated_slots SET status = $1, booking_id = NULL WHERE booking_id = $2',
                ['available', req.params.bookingId]
            );
            
            await models.createActivityLog(
                req.user.id, 
                'BOOKING_CANCEL', 
                `قام المالك/الموظف بإلغاء الحجز ${req.params.bookingId}`, 
                req.params.bookingId, 
                client
            );
            return cancelledBooking;
        });

        res.json({ 
            success: true, 
            message: 'تم إلغاء الحجز بنجاح', 
            data: result 
        });
    } catch (error) {
        handleInternalError(res, error, error.message || 'فشل في إلغاء الحجز');
    }
}

async function blockSlotController(req, res) {
    const { stadium_id, date, start_time, end_time, reason } = req.body;
    
    try {
        const newBlock = await withTransaction(async (client) => {
            const block = await models.blockTimeSlot(stadium_id, date, start_time, end_time, reason, req.user.id, client);
            await models.createActivityLog(
                req.user.id, 
                'SLOT_BLOCK', 
                `تم حظر فترة زمنية للملعب ${stadium_id}`, 
                stadium_id, 
                client
            );
            return block;
        });
        
        res.status(201).json({ 
            success: true, 
            message: 'تم حظر الفترة الزمنية بنجاح', 
            data: newBlock 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || 'فشل في حظر الفترة الزمنية' 
        });
    }
}

// ===================================
// 🆕 المتحكمات الجديدة
// ===================================

// 🕒 كونترولر توليد الساعات
async function generateSlotsController(req, res) {
    const { stadiumId } = req.params;
    const { startDate, endDate } = req.body;
    
    try {
        const generatedSlots = await withTransaction(async (client) => {
            return await models.generateStadiumSlots(stadiumId, startDate, endDate, client);
        });
        
        res.json({
            success: true,
            message: `تم توليد ${generatedSlots.length} ساعة للملعب`,
            data: generatedSlots
        });
    } catch (error) {
        handleInternalError(res, error, 'فشل في توليد الساعات');
    }
}

// 👥 كونترولر تعيين الموظفين
async function assignEmployeeController(req, res) {
    const { userId, stadiumId, role } = req.body;
    
    try {
        const assignment = await withTransaction(async (client) => {
            const result = await models.assignEmployeeToStadium(userId, stadiumId, role, client);
            await models.createActivityLog(
                req.user.id,
                'EMPLOYEE_ASSIGN',
                `تم تعيين الموظف ${userId} للملعب ${stadiumId}`,
                stadiumId,
                client
            );
            return result;
        });
        
        res.json({
            success: true,
            message: 'تم تعيين الموظف بنجاح',
            data: assignment
        });
    } catch (error) {
        handleInternalError(res, error, 'فشل في تعيين الموظف');
    }
}

// 🎯 كونترولر جلب ملاعب الموظف
async function getEmployeeStadiumsController(req, res) {
    try {
        const assignments = await models.getEmployeeAssignments(req.user.id);
        res.json({ success: true, data: assignments });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب ملاعب الموظف');
    }
}

// 🎫 كونترولر توليد الأكواد
async function generateCodesController(req, res) {
    const { fieldId, type, count, amount, percent } = req.body;
    
    try {
        let codes = [];
        
        await withTransaction(async (client) => {
            if (type === 'payment') {
                codes = await models.generatePaymentCodes(fieldId, count, req.user.id, client);
            } else if (type === 'discount') {
                codes = await models.generateDiscountCodes(amount, percent, count, req.user.id, client);
            }
            
            await models.createActivityLog(
                req.user.id,
                'CODES_GENERATE',
                `تم توليد ${count} كود من نوع ${type}`,
                fieldId,
                client
            );
        });
        
        res.json({
            success: true,
            message: `تم توليد ${codes.length} كود بنجاح`,
            data: { codes }
        });
    } catch (error) {
        handleInternalError(res, error, 'فشل في توليد الأكواد');
    }
}

// ===================================
// 👑 المتحكمات: لوحة الأدمن
// ===================================

async function getAdminDashboardStatsController(req, res) {
    try {
        const stats = await models.getDashboardStats();
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        handleInternalError(res, error, "فشل في جلب الإحصائيات");
    }
}

async function getSystemLogsController(req, res) {
    const limit = parseInt(req.query.limit) || 15;
    try {
        const logs = await models.getSystemActivityLogs(limit);
        res.status(200).json({ success: true, data: logs });
    } catch (error) {
        handleInternalError(res, error, "فشل في جلب سجل النشاط");
    }
}

async function getPendingManagersController(req, res) {
    try {
        const managers = await models.getPendingManagers();
        res.json({ success: true, data: managers });
    } catch (error) {
        handleInternalError(res, error, "فشل في جلب طلبات المديرين المعلقة");
    }
}

async function approveManagerController(req, res) {
    const { userId } = req.params;
    
    try {
        const approvedUser = await withTransaction(async (client) => {
            const user = await models.getUserById(userId);
            if (!user) throw new Error("المستخدم غير موجود.");
            
            const updatedUser = await models.approveManager(userId, req.user.id, client);
            
            await models.createActivityLog(
                req.user.id, 
                'ADMIN_ACTION', 
                `تم الموافقة على طلب المالك/المدير للمستخدم: ${user.email}`, 
                userId, 
                client
            );
            
            return updatedUser;
        });

        res.json({ 
            success: true, 
            message: `تم الموافقة على ${approvedUser.name} كمالك ملعب.`, 
            data: approvedUser 
        });
    } catch (error) {
        handleInternalError(res, error, error.message || 'فشل في الموافقة على المدير');
    }
}

async function getAllUsersController(req, res) {
    try {
        const users = await models.getAllUsers(req.query.role);
        res.json({ success: true, data: users });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب قائمة المستخدمين');
    }
}

async function updateCodeStatusController(req, res) {
    const { codeId } = req.params;
    const { isActive, type } = req.body;
    
    try {
        const updatedCode = await withTransaction(async (client) => {
            const result = await models.updateCodeStatus(codeId, isActive, type, client);
            await models.createActivityLog(
                req.user.id, 
                'CODE_STATUS_UPDATE', 
                `تم تغيير حالة الكود ${codeId} إلى ${isActive ? 'نشط' : 'معطل'}`, 
                codeId, 
                client
            );
            return result;
        });

        res.json({ 
            success: true, 
            message: `تم تحديث حالة الكود بنجاح.`, 
            data: updatedCode 
        });
    } catch (error) {
        res.status(400).json({ 
            success: false, 
            message: error.message || 'فشل في تحديث حالة الكود' 
        });
    }
}

// ===================================
// 📝 التصدير
// ===================================

module.exports = {
    handleValidationErrors,
    handleInternalError,
    
    // Auth
    registerController,
    loginController,
    logoutController,
    getCurrentUserController,
    
    // Public & Player
    getStadiumsController,
    getStadiumDetailsController,
    getAvailableSlotsController,
    createBookingController,
    getUserBookingsController,
    cancelBookingPlayerController,
    submitRatingController,
    
    // Payment & Codes
    validateCodeController,
    handlePaymentNotificationController,
    
    // Player Requests
    createPlayerRequestController,
    getRequestsForBookingController,
    joinPlayerRequestController,
    
    // Owner
    getOwnerStadiumsController,
    createStadiumController,
    updateStadiumController,
    getStadiumBookingsOwnerController,
    confirmBookingOwnerController,
    cancelBookingOwnerController,
    blockSlotController,
    
    // 🆕 المتحكمات الجديدة
    generateSlotsController,
    assignEmployeeController,
    getEmployeeStadiumsController,
    generateCodesController,
    
    // Admin
    getAdminDashboardStatsController,
    getSystemLogsController,
    getPendingManagersController,
    approveManagerController,
    getAllUsersController,
    updateCodeStatusController,
};
