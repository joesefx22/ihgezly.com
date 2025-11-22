// controllers.js - منطق المتحكمات (Controllers Logic) - ملف موحد وكامل

const { validationResult } = require('express-validator'); 
const models = require('./models'); 
const { withTransaction } = require('./db'); 
const { sendEmail } = require('./emailService'); 
const passport = require('passport'); 

// ===================================
// 🛠️ دوال مساعدة عامة
// ===================================

/**
 * 🚨 معالج أخطاء التحقق من الصحة (Validation Errors Handler)
 */
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

/**
 * 💣 دالة مساعدة لمعالجة الأخطاء الداخلية
 */
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
        
        req.logIn(user, (err) => {
            if (err) return handleInternalError(res, err, 'Login failed');
            
            if (!user.is_approved && (user.role === 'owner' || user.role === 'manager')) {
                 req.logout(() => { /* Log out */ });
                 return res.status(403).json({ success: false, message: "الحساب قيد المراجعة ولم تتم الموافقة عليه بعد." });
            }

            delete user.password; 
            res.json({ success: true, message: 'تم تسجيل الدخول بنجاح', user: { id: user.id, name: user.name, role: user.role } });
        });
    })(req, res, next);
}

const logoutController = (req, res) => {
    req.logout((err) => {
        if (err) return handleInternalError(res, err, 'فشل في تسجيل الخروج');
        req.session.destroy(() => {
            res.clearCookie('connect.sid'); 
            res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
        });
    });
};

const getCurrentUserController = (req, res) => {
    if (req.user) {
        const user = { ...req.user };
        delete user.password; 
        res.json({ id: user.id, name: user.name, email: user.email, role: user.role, is_approved: user.is_approved });
    } else {
        res.status(401).json({ success: false, message: 'غير مصادق' });
    }
};

// ===================================
// 🏟️ المتحكمات: العامة واللاعب (Public & Player)
// ===================================

async function getStadiumsController(req, res) {
    try {
        const stadiums = await models.getStadiums(req.query);
        res.json(stadiums);
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب الملاعب');
    }
}

async function getStadiumDetailsController(req, res) {
    try {
        const stadium = await models.getStadiumById(req.params.stadiumId);
        if (!stadium) return res.status(404).json({ success: false, message: 'الملعب غير موجود' });
        
        const ratings = await models.getStadiumRatings(req.params.stadiumId);
        res.json({ ...stadium, ratings });
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب تفاصيل الملعب');
    }
}

async function getAvailableSlotsController(req, res) {
    try {
        const slots = await models.getAvailableSlots(req.params.stadiumId, req.query.date);
        res.json(slots);
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب الساعات المتاحة');
    }
}

async function createBookingController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    const bookingData = { ...req.body, user_id: req.user.id };
    try {
        const newBooking = await withTransaction(async (client) => {
            const booking = await models.createBooking(bookingData, client);
            await models.createActivityLog(bookingData.user_id, 'BOOKING_CREATED', `تم إنشاء حجز جديد للملعب ${booking.stadium_id}`, booking.booking_id, client);
            return booking;
        });

        const statusMessage = newBooking.deposit_amount > 0 ? 
            'تم إنشاء الحجز بنجاح، يرجى إتمام دفع العربون لتأكيد الحجز.' : 
            'تم إنشاء الحجز بنجاح، بانتظار تأكيد المالك/المدير.';

        res.status(201).json({ 
            success: true, 
            message: statusMessage, 
            booking: newBooking 
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
        res.json(bookings);
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب حجوزات المستخدم');
    }
}

async function cancelBookingPlayerController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction (إلغاء وإصدار كود تعويض)
    const { bookingId } = req.params;
    try {
        const result = await withTransaction(async (client) => {
            const cancelledBooking = await models.cancelBooking(bookingId, req.user.id, 'player_cancellation', client);
            if (!cancelledBooking) throw new Error("الحجز غير موجود أو لا يمكن إلغاؤه في الوقت الحالي.");
            
            await models.createActivityLog(req.user.id, 'PLAYER_CANCEL_BOOKING', `قام اللاعب بإلغاء الحجز ${bookingId}`, bookingId, client);
            return cancelledBooking;
        });

        const refundMessage = result.compensation_code ? ` وتم إصدار كود تعويض بقيمة ${result.compensation_amount}.` : '';
        res.json({ success: true, message: `تم إلغاء الحجز بنجاح.${refundMessage}` });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في إلغاء الحجز' });
    }
}

async function submitRatingController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction (التقييم وتحديث المتوسط)
    const { stadiumId } = req.params;
    const { ratingValue, comment } = req.body;
    try {
        const newRating = await withTransaction(async (client) => {
            const canRate = await models.canUserRateStadium(stadiumId, req.user.id, client);
            if (!canRate) throw new Error("لا يمكن تقييم الملعب إلا بعد حجز وإتمام اللعب فيه.");
            
            const ratingResult = await models.submitNewRating(stadiumId, req.user.id, ratingValue, comment, client);
            await models.updateStadiumAverageRating(stadiumId, client); 
            await models.createActivityLog(req.user.id, 'RATING_SUBMITTED', `تم تقييم الملعب ${stadiumId}`, stadiumId, client);

            return ratingResult;
        });

        res.status(201).json({ success: true, message: "تم تسجيل تقييمك بنجاح", rating: newRating });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || "فشل في تسجيل التقييم" });
    }
}

// -------------------------------------
// 💰 متحكمات الدفع والأكواد (Payment & Codes)
// -------------------------------------

/**
 * 💡 دالة حساسة: لمعالجة إشعار الدفع الفوري (Webhook) من بوابة الدفع.
 */
async function handlePaymentNotificationController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    const { booking_id, reference, status, amount } = req.body; 
    
    // **ملاحظة أمان:** هنا يجب أن يتم التحقق من توقيع الـ Webhook
    if (!booking_id || !reference || !status) {
        return res.status(400).json({ success: false, message: "بيانات الإشعار غير كاملة." });
    }

    try {
        await withTransaction(async (client) => {
            if (status === 'successful' || status === 'confirmed') { 
                const confirmedBooking = await models.finalizePayment(booking_id, reference, amount, client);
                
                await models.createActivityLog(confirmedBooking.user_id, 'PAYMENT_SUCCESS', `تم تأكيد دفع العربون للحجز ${booking_id}`, booking_id, client);
                await sendEmail(confirmedBooking.user_email, '✅ تأكيد دفع العربون', `تم تأكيد دفع العربون بنجاح لحجزك رقم ${booking_id}.`);

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

/**
 * متحكم التحقق من صلاحية أكواد الخصم والتعويض قبل الحجز
 */
async function validateCodeController(req, res) {
    const { code, stadium_id } = req.body;
    try {
        const validationResult = await models.validateCode(code, stadium_id, req.user.id);
        res.json({ success: true, ...validationResult });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || "الكود غير صالح أو منتهي الصلاحية" });
    }
}

// -------------------------------------
// 👥 طلبات اللاعبين (Player Requests)
// -------------------------------------

async function createPlayerRequestController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    const { booking_id, players_needed, details } = req.body;
    try {
        const newRequest = await withTransaction(async (client) => {
            const request = await models.createPlayerRequest({ booking_id, requester_id: req.user.id, players_needed, details }, client);
            await models.createActivityLog(req.user.id, 'REQUEST_CREATED', `طلب لاعبين للحجز ${booking_id}`, booking_id, client);
            return request;
        });

        res.status(201).json({ success: true, message: 'تم إنشاء طلب اللاعبين بنجاح.', request: newRequest });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في إنشاء طلب اللاعبين' });
    }
}

async function getRequestsForBookingController(req, res) {
    try {
        const requests = await models.getPlayerRequestsForBooking(req.params.bookingId);
        res.json(requests);
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب طلبات اللاعبين');
    }
}

async function joinPlayerRequestController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction (الانضمام وتحديث الطلب)
    const { requestId } = req.params;
    try {
        const result = await withTransaction(async (client) => {
            const joinResult = await models.joinPlayerRequest(requestId, req.user.id, client);
            await models.createActivityLog(req.user.id, 'REQUEST_JOINED', `انضمام لطلب اللاعبين ${requestId}`, requestId, client);
            
            // إرسال إشعار لمنشئ الطلب (يجب أن يعيد joinResult بيانات المستخدمين)
            // await sendEmail(joinResult.requester_email, '📢 انضمام جديد', `انضم ${req.user.name} إلى طلب اللاعبين الخاص بك.`);
            
            return joinResult;
        });

        res.json({ success: true, message: 'تم الانضمام للطلب بنجاح.', result });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في الانضمام للطلب' });
    }
}


// ===================================
// ⚽ المتحكمات: إدارة الملاعب (Owner / Manager)
// ===================================

async function getOwnerStadiumsController(req, res) {
    try {
        const stadiums = await models.getOwnerStadiums(req.user.id);
        res.json(stadiums);
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب ملاعب المالك');
    }
}

async function createStadiumController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    try {
        const { name, location, price_per_hour, deposit_amount, features, type, owner_id } = req.body;
        const userId = req.user.id; 
        
        const actualOwnerId = req.user.role === 'admin' ? owner_id : userId;
        const image_url = req.file ? `/uploads/images/${req.file.filename}` : null;
        
        const newStadium = await withTransaction(async (client) => {
            const data = { name, location, price_per_hour: parseFloat(price_per_hour), deposit_amount: parseFloat(deposit_amount), image_url, features: JSON.parse(features || '[]'), type, owner_id: actualOwnerId };
            const stadium = await models.createStadium(data, client);
            await models.createActivityLog(userId, 'STADIUM_CREATED', `تم إنشاء الملعب: ${name}`, stadium.id, client);
            return stadium;
        });

        res.status(201).json({ success: true, message: "تم إنشاء الملعب بنجاح", stadium: newStadium });
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
        
        // التحقق من صلاحية المالك/المدير يتم داخل models.updateStadium
        const updatedStadium = await models.updateStadium(stadium_id, updateData, req.user.id);
        if (!updatedStadium) {
            return res.status(404).json({ success: false, message: 'الملعب غير موجود أو لا تملك صلاحية تعديله' });
        }
        await models.createActivityLog(req.user.id, 'STADIUM_UPDATED', `تم تحديث الملعب: ${updatedStadium.name}`, stadium_id);

        res.json({ success: true, message: 'تم تحديث الملعب بنجاح', stadium: updatedStadium });
    } catch (error) {
        handleInternalError(res, error, 'فشل في تحديث الملعب');
    }
}

async function getStadiumBookingsOwnerController(req, res) {
    try {
        const bookings = await models.getStadiumBookings(req.params.stadiumId, req.user.id, req.query.date, req.query.status);
        res.json(bookings);
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب حجوزات الملعب');
    }
}

async function confirmBookingOwnerController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    try {
        const confirmedBooking = await withTransaction(async (client) => {
            const booking = await models.confirmBooking(req.params.bookingId, req.user.id, client);
            if (!booking) throw new Error("الحجز غير موجود أو مؤكد بالفعل.");

            await models.createActivityLog(req.user.id, 'OWNER_CONFIRM_BOOKING', `تم تأكيد الحجز ${req.params.bookingId}`, req.params.bookingId, client);
            await sendEmail(booking.user_email, '✅ تم تأكيد حجزك', `تم تأكيد حجزك رقم ${booking.booking_id} للملعب ${booking.stadium_name}.`);
            
            return booking;
        });

        res.json({ success: true, message: 'تم تأكيد الحجز بنجاح.', booking: confirmedBooking });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في تأكيد الحجز' });
    }
}

async function cancelBookingOwnerController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    try {
        const result = await withTransaction(async (client) => {
            const cancelledBooking = await models.cancelBooking(req.params.bookingId, req.user.id, 'owner_cancellation', client);
            if (!cancelledBooking) throw new Error("الحجز غير موجود أو ملغى بالفعل.");
            
            await models.createActivityLog(req.user.id, 'OWNER_CANCEL_BOOKING', `قام المالك/الموظف بإلغاء الحجز ${req.params.bookingId}`, req.params.bookingId, client);
            
            return cancelledBooking;
        });

        res.json({ success: true, message: 'تم إلغاء الحجز بنجاح' });
    } catch (error) {
        handleInternalError(res, error, error.message || 'فشل في إلغاء الحجز');
    }
}

async function blockSlotController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    const { stadium_id, date, start_time, end_time, reason } = req.body;
    try {
        const newBlock = await withTransaction(async (client) => {
            const block = await models.blockTimeSlot(stadium_id, date, start_time, end_time, reason, req.user.id, client);
            await models.createActivityLog(req.user.id, 'SLOT_BLOCKED', `تم حظر فترة زمنية للملعب ${stadium_id}`, stadium_id, client);
            return block;
        });
        
        res.status(201).json({ success: true, message: 'تم حظر الفترة الزمنية بنجاح', block: newBlock });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في حظر الفترة الزمنية' });
    }
}

// ===================================
// 👑 المتحكمات: لوحة الأدمن (Admin)
// ===================================

async function getAdminDashboardStatsController(req, res) {
    try {
        const stats = await models.getAdminDashboardStats();
        res.status(200).json(stats);
    } catch (error) {
        handleInternalError(res, error, "فشل في جلب الإحصائيات");
    }
}

async function getSystemLogsController(req, res) {
    const limit = parseInt(req.query.limit) || 15;
    try {
        const logs = await models.getSystemActivityLogs(limit);
        res.status(200).json(logs);
    } catch (error) {
        handleInternalError(res, error, "فشل في جلب سجل النشاط");
    }
}

async function getPendingManagersController(req, res) {
    try {
        const managers = await models.getPendingManagers();
        res.json(managers);
    } catch (error) {
        handleInternalError(res, error, "فشل في جلب طلبات المديرين المعلقة");
    }
}

async function approveManagerController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    const { userId } = req.params;
    try {
        const approvedUser = await withTransaction(async (client) => {
            const user = await models.getUserById(userId, client);
            if (!user) throw new Error("المستخدم غير موجود.");
            
            const updatedUser = await models.approveManager(userId, req.user.id, client);
            
            await models.createActivityLog(req.user.id, 'ADMIN_APPROVE_MANAGER', `تم الموافقة على طلب المالك/المدير للمستخدم: ${user.email}`, userId, client);
            await sendEmail(user.email, '✅ تم الموافقة على حسابك', 'تهانينا! تم الموافقة على حسابك كمالك/مدير ملعب. يمكنك الآن تسجيل الدخول.');
            
            return updatedUser;
        });

        res.json({ success: true, message: `تم الموافقة على ${approvedUser.name} كمالك ملعب.`, user: approvedUser });
    } catch (error) {
        handleInternalError(res, error, error.message || 'فشل في الموافقة على المدير');
    }
}

async function getAllUsersController(req, res) {
    try {
        const users = await models.getAllUsers();
        res.json(users);
    } catch (error) {
        handleInternalError(res, error, 'فشل في جلب قائمة المستخدمين');
    }
}

async function updateCodeStatusController(req, res) {
    // 🛡️ عملية حرجة: يجب أن تتم كـ Transaction
    const { codeId } = req.params;
    const { isActive, type } = req.body; 
    try {
        const updatedCode = await withTransaction(async (client) => {
            const result = await models.updateCodeStatus(codeId, isActive, type, client);
            await models.createActivityLog(req.user.id, 'CODE_STATUS_UPDATE', `تم تغيير حالة الكود ${codeId} إلى ${isActive ? 'نشط' : 'معطل'} (${type})`, codeId, client);
            return result;
        });

        res.json({ success: true, message: `تم تحديث حالة الكود بنجاح.`, code: updatedCode });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'فشل في تحديث حالة الكود' });
    }
}

// -------------------------------------
// 📝 التصدير (Export) - جميع الدوال
// -------------------------------------

module.exports = {
    handleValidationErrors,
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
