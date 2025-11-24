// controllers.js - منطق المتحكمات (Controllers Logic) - الإصدار النهائي المُصلح

const { validationResult } = require('express-validator'); 
const models = require('./models'); 
const { withTransaction } = require('./db'); 
const { sendEmail } = require('./emailService'); 
const passport = require('passport');
const jwt = require('jsonwebtoken');

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
    const { email, role } = req.body;
    try {
        const existingUser = await models.findUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ success: false, message: "البريد الإلكتروني مسجل بالفعل." });
        }

        const newUser = await models.registerNewUser(req.body);
        
        if (newUser.role !== 'player' && !newUser.is_approved) {
            await sendEmail(email, '⏳ حسابك قيد المراجعة', `مرحباً ${newUser.name}، تم استلام طلبك. سيتم مراجعته من الإدارة.`);
        }

        res.status(201).json({ 
            success: true, 
            message: "تم إنشاء الحساب بنجاح. يرجى تسجيل الدخول.", 
            user: { id: newUser.id, role: newUser.role, is_approved: newUser.is_approved } 
        });
    } catch (error) {
        handleInternalError(res, error, "فشل في عملية التسجيل.");
    }
}

function loginController(req, res, next) {
    passport.authenticate('local', (err, user, info) => {
        if (err) return handleInternalError(res, err, 'Internal server error');
        if (!user) return res.status(401).json({ success: false, message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' });
        
        // إنشاء JWT token
        const token = jwt.sign(
            { id: user.id, role: user.role, email: user.email },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        if (!user.is_approved && (user.role === 'owner' || user.role === 'manager')) {
            return res.status(403).json({ success: false, message: "الحساب قيد المراجعة ولم تتم الموافقة عليه بعد." });
        }

        delete user.password; 
        res.json({ 
            success: true, 
            message: 'تم تسجيل الدخول بنجاح', 
            token,
            user: { id: user.id, name: user.name, role: user.role, email: user.email } 
        });
    })(req, res, next);
}

const logoutController = (req, res) => {
    // مع JWT، التسجيل الخروج يكون على العميل بحذف التوكن
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
};

const getCurrentUserController = async (req, res) => {
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
};

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
        const slots = await models.getAvailableSlots(req.params.stadiumId, req.query.date);
        res.json({ success: true, data: slots });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب الساعات المتاحة');
    }
}

async function createBookingController(req, res) {
    const bookingData = { ...req.body, user_id: req.user.id };
    
    try {
        const newBooking = await withTransaction(async (client) => {
            const booking = await models.createBooking(bookingData, client);
            await models.createActivityLog(bookingData.user_id, 'BOOKING_CREATE', `تم إنشاء حجز جديد للملعب ${booking.stadium_id}`, booking.id, client);
            return booking;
        });

        const statusMessage = newBooking.deposit_paid > 0 ? 
            'تم إنشاء الحجز بنجاح، يرجى إتمام دفع العربون لتأكيد الحجز.' : 
            'تم إنشاء الحجز بنجاح، بانتظار تأكيد المالك/المدير.';

        res.status(201).json({ 
            success: true, 
            message: statusMessage, 
            data: newBooking 
        });
    } catch (error) {
        if (error.message.includes('conflict') || error.message.includes('code is invalid')) {
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
            const cancelledBooking = await models.cancelBooking(bookingId, req.user.id, 'player_cancellation', client);
            if (!cancelledBooking) throw new Error("الحجز غير موجود أو لا يمكن إلغاؤه في الوقت الحالي.");
            
            await models.createActivityLog(req.user.id, 'BOOKING_CANCEL', `قام اللاعب بإلغاء الحجز ${bookingId}`, bookingId, client);
            return cancelledBooking;
        });

        const refundMessage = result.deposit_paid > 0 ? ` وتم إصدار كود تعويض بقيمة ${result.deposit_paid}.` : '';
        res.json({ success: true, message: `تم إلغاء الحجز بنجاح.${refundMessage}` });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في إلغاء الحجز' });
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
            await models.createActivityLog(req.user.id, 'RATING_SUBMIT', `تم تقييم الملعب ${stadiumId}`, stadiumId, client);
            return ratingResult;
        });

        res.status(201).json({ success: true, message: "تم تسجيل تقييمك بنجاح", data: newRating });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || "فشل في تسجيل التقييم" });
    }
}

// ===================================
// 💰 متحكمات الدفع والأكواد
// ===================================

async function handlePaymentNotificationController(req, res) {
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
                
                await models.createActivityLog(confirmedBooking.user_id, 'PAYMENT_SUCCESS', `تم تأكيد دفع العربون للحجز ${booking_id}`, booking_id, client);
                
                // إرسال إيميل تأكيد
                try {
                    await sendEmail(confirmedBooking.user_email, '✅ تأكيد دفع العربون', `تم تأكيد دفع العربون بنجاح لحجزك رقم ${booking_id}.`);
                } catch (emailError) {
                    console.error('Failed to send confirmation email:', emailError);
                }

            } else if (status === 'failed' || status === 'cancelled') {
                await models.cancelBooking(booking_id, null, 'system_payment_failure', client);
                await models.createActivityLog(null, 'PAYMENT_FAILURE', `فشل دفع العربون للحجز ${booking_id}`, booking_id, client);
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
        res.status(400).json({ success: false, message: error.message || "الكود غير صالح أو منتهي الصلاحية" });
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
            await models.createActivityLog(req.user.id, 'PLAYER_REQUEST_CREATE', `طلب لاعبين للحجز ${booking_id}`, request.id, client);
            return request;
        });

        res.status(201).json({ success: true, message: 'تم إنشاء طلب اللاعبين بنجاح.', data: newRequest });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في إنشاء طلب اللاعبين' });
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
            await models.createActivityLog(req.user.id, 'PLAYER_JOIN', `انضمام لطلب اللاعبين ${requestId}`, requestId, client);
            return joinResult;
        });

        res.json({ success: true, message: 'تم الانضمام للطلب بنجاح.', data: result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في الانضمام للطلب' });
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
                name, location, type, price_per_hour: parseFloat(price_per_hour), 
                deposit_amount: parseFloat(deposit_amount), image_url, 
                features: JSON.parse(features || '[]') 
            };
            const stadium = await models.createStadium(data, userId, client);
            return stadium;
        });

        res.status(201).json({ success: true, message: "تم إنشاء الملعب بنجاح", data: newStadium });
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
            return res.status(404).json({ success: false, message: 'الملعب غير موجود أو لا تملك صلاحية تعديله' });
        }

        res.json({ success: true, message: 'تم تحديث الملعب بنجاح', data: updatedStadium });
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
            
            await models.createActivityLog(req.user.id, 'BOOKING_CONFIRM', `تم تأكيد الحجز ${req.params.bookingId}`, req.params.bookingId, client);
            return booking;
        });

        res.json({ success: true, message: 'تم تأكيد الحجز بنجاح.', data: confirmedBooking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في تأكيد الحجز' });
    }
}

async function cancelBookingOwnerController(req, res) {
    try {
        const result = await withTransaction(async (client) => {
            const cancelledBooking = await models.cancelBooking(req.params.bookingId, req.user.id, 'owner_cancellation', client);
            if (!cancelledBooking) throw new Error("الحجز غير موجود أو ملغى بالفعل.");
            
            await models.createActivityLog(req.user.id, 'BOOKING_CANCEL', `قام المالك/الموظف بإلغاء الحجز ${req.params.bookingId}`, req.params.bookingId, client);
            return cancelledBooking;
        });

        res.json({ success: true, message: 'تم إلغاء الحجز بنجاح', data: result });
    } catch (error) {
        handleInternalError(res, error, error.message || 'فشل في إلغاء الحجز');
    }
}

async function blockSlotController(req, res) {
    const { stadium_id, date, start_time, end_time, reason } = req.body;
    
    try {
        const newBlock = await withTransaction(async (client) => {
            const block = await models.blockTimeSlot(stadium_id, date, start_time, end_time, reason, req.user.id, client);
            await models.createActivityLog(req.user.id, 'SLOT_BLOCK', `تم حظر فترة زمنية للملعب ${stadium_id}`, stadium_id, client);
            return block;
        });
        
        res.status(201).json({ success: true, message: 'تم حظر الفترة الزمنية بنجاح', data: newBlock });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في حظر الفترة الزمنية' });
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
            
            await models.createActivityLog(req.user.id, 'ADMIN_ACTION', `تم الموافقة على طلب المالك/المدير للمستخدم: ${user.email}`, userId, client);
            
            // إرسال إيميل إشعار
            try {
                await sendEmail(user.email, '✅ تم الموافقة على حسابك', 'تهانينا! تم الموافقة على حسابك كمالك/مدير ملعب. يمكنك الآن تسجيل الدخول.');
            } catch (emailError) {
                console.error('Failed to send approval email:', emailError);
            }
            
            return updatedUser;
        });

        res.json({ success: true, message: `تم الموافقة على ${approvedUser.name} كمالك ملعب.`, data: approvedUser });
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
            await models.createActivityLog(req.user.id, 'CODE_STATUS_UPDATE', `تم تغيير حالة الكود ${codeId} إلى ${isActive ? 'نشط' : 'معطل'} (${type})`, codeId, client);
            return result;
        });

        res.json({ success: true, message: `تم تحديث حالة الكود بنجاح.`, data: updatedCode });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في تحديث حالة الكود' });
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
    
    // Admin
    getAdminDashboardStatsController,
    getSystemLogsController,
    getPendingManagersController,
    approveManagerController,
    getAllUsersController,
    updateCodeStatusController,
};
