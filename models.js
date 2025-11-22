// models.js
const { execQuery } = require('./db');

/**
 * دالة جلب المستخدم للتحقق من تسجيل الدخول
 */
async function getUserByEmail(email) {
    const query = `
        SELECT user_id, email, password_hash, role, name
        FROM users
        WHERE email = $1
    `;
    const result = await execQuery(query, [email]);
    return result.rows[0] || null;
}

/**
 * دالة إنشاء مستخدم جديد (افتراضياً role='player')
 */
async function createUser(name, email, hashedPassword) {
    // Role الافتراضي هو 'player' كما هو مطلوب في قواعد العمل
    const defaultRole = 'player'; 
    const query = `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING user_id, name, email, role;
    `;
    const result = await execQuery(query, [name, email, hashedPassword, defaultRole]);
    return result.rows[0];
}

module.exports = { getUserByEmail, createUser };

// models.js (إضافة الدوال التالية)

// ... (الدوال الحالية: getUserByEmail, createUser, getDetailedUserById) ...

/**
 * جلب حجوزات لاعب معين
 */
async function getPlayerBookings(playerId) {
    const query = `
        SELECT 
            b.*, f.name AS field_name, f.location
        FROM bookings b
        JOIN fields f ON b.field_id = f.field_id
        WHERE b.player_id = $1
        ORDER BY b.booking_date DESC, b.start_time DESC
    `;
    const result = await execQuery(query, [playerId]);
    return result.rows;
}

/**
 * تحديث الملف الشخصي للاعب (الاسم، الهاتف، كلمة المرور)
 */
async function updatePlayerProfile(userId, { name, phone, password_hash }) {
    // ... (منطق بناء الاستعلام كما هو موضح في خطوة التفكير) ...
    const fieldsToUpdate = [];
    const params = [userId];
    let paramIndex = 2;

    if (name) {
        fieldsToUpdate.push(`name = $${paramIndex++}`);
        params.push(name);
    }
    if (phone) {
        fieldsToUpdate.push(`phone = $${paramIndex++}`);
        params.push(phone);
    }
    if (password_hash) {
        fieldsToUpdate.push(`password_hash = $${paramIndex++}`);
        params.push(password_hash);
    }

    if (fieldsToUpdate.length === 0) {
        return getDetailedUserById(userId);
    }

    const query = `
        UPDATE users
        SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING user_id, name, email, role, phone;
    `;
    
    const result = await execQuery(query, params);
    return result.rows[0];
}

/**
 * جلب طلبات اللاعبين المفتوحة (لـ 'لاعبوني معاكم')
 */
async function getActivePlayerRequests() {
    const query = `
        SELECT 
            pr.request_id, pr.players_needed, b.booking_date, b.start_time, b.end_time, 
            f.name AS field_name, u.name AS booker_name
        FROM player_requests pr
        JOIN bookings b ON pr.booking_id = b.booking_id
        JOIN fields f ON b.field_id = f.field_id
        JOIN users u ON pr.requester_id = u.user_id
        WHERE pr.status = 'active' 
        AND b.booking_date >= CURRENT_DATE 
        ORDER BY b.booking_date ASC, b.start_time ASC
    `;
    const result = await execQuery(query);
    return result.rows;
}

module.exports = { 
    // ... (جميع الدوال الأخرى)
    getPlayerBookings,
    updatePlayerProfile,
    getActivePlayerRequests
};
// models.js (إضافة الدوال التالية إلى ملف النماذج)
// ... (تأكد من وجود الدوال السابقة مثل getDetailedUserById) ...

/**
 * جلب جميع الملاعب النشطة
 */
async function getAvailableFields() {
    const query = `
        SELECT field_id, name, location, area, type, price_per_hour, deposit_amount
        FROM fields
        WHERE is_active = TRUE
    `;
    const result = await execQuery(query);
    return result.rows;
}

/**
 * جلب جميع الساعات المحجوزة لملعب وتاريخ معين
 */
async function getBookedSlots(fieldId, date) {
    const query = `
        SELECT start_time, end_time
        FROM bookings
        WHERE field_id = $1 AND booking_date = $2 
        AND status IN ('booked_confirmed', 'booked_unconfirmed')
    `;
    const result = await execQuery(query, [fieldId, date]);
    return result.rows;
}

/**
 * إنشاء سجل حجز جديد (يجب استدعاؤها داخل معاملة)
 */
async function createBooking(client, bookingData) {
    const { field_id, player_id, booking_date, start_time, end_time, status, deposit_paid, total_amount, deposit_amount } = bookingData;

    const query = `
        INSERT INTO bookings (field_id, player_id, booking_date, start_time, end_time, status, deposit_paid, total_amount, deposit_amount)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING booking_id, status, deposit_amount
    `;
    const params = [field_id, player_id, booking_date, start_time, end_time, status, deposit_paid, total_amount, deposit_amount];

    const result = await client.query(query, params);
    return result.rows[0];
}

/**
 * جلب تفاصيل حجز معينة (لصفحة الدفع payment.html)
 */
async function getBookingDetails(bookingId) {
    const query = `
        SELECT 
            b.booking_id, b.booking_date, b.start_time, b.end_time, b.total_amount, b.deposit_amount, b.status,
            f.name AS field_name, f.location, f.price_per_hour
        FROM bookings b
        JOIN fields f ON b.field_id = f.field_id
        WHERE b.booking_id = $1
    `;
    const result = await execQuery(query, [bookingId]);
    return result.rows[0];
}

module.exports = { 
    // ... (تصدير الدوال الأخرى)
    getAvailableFields,
    getBookedSlots,
    createBooking,
    getBookingDetails 
};

// models.js (إضافة الدوال التالية)

/**
 * جلب جميع الملاعب المعينة لموظف معين
 */
async function getEmployeeAssignedFields(employeeId) {
    const query = `
        SELECT f.field_id, f.name, f.location
        FROM fields f
        JOIN employee_assignments ea ON f.field_id = ea.field_id
        WHERE ea.user_id = $1 AND f.is_active = TRUE
    `;
    const result = await execQuery(query, [employeeId]);
    return result.rows;
}

/**
 * جلب حجوزات يوم معين لملعب معين
 */
async function getBookingsForEmployee(fieldId, date) {
    const query = `
        SELECT 
            b.booking_id, b.booking_date, b.start_time, b.end_time, b.status, 
            b.total_amount, b.deposit_amount, b.deposit_paid,
            u.name AS player_name, u.phone AS player_phone
        FROM bookings b
        JOIN users u ON b.player_id = u.user_id
        WHERE b.field_id = $1 AND b.booking_date = $2
        AND b.status IN ('booked_confirmed', 'booked_unconfirmed', 'played', 'missed')
        ORDER BY b.start_time ASC
    `;
    const result = await execQuery(query, [fieldId, date]);
    return result.rows;
}

/**
 * تحديث حالة الحجز (Check-in/Confirm Cash)
 */
async function updateBookingStatus(client, bookingId, status, isCashConfirmed = false) {
    const updateCash = isCashConfirmed ? ', deposit_paid = TRUE ' : '';
    
    const query = `
        UPDATE bookings
        SET status = $2, updated_at = CURRENT_TIMESTAMP ${updateCash}
        WHERE booking_id = $1
        RETURNING booking_id, status
    `;
    // لاحظ استخدام client.query داخل معاملة (Transaction)
    const result = await client.query(query, [bookingId, status]);
    if (result.rowCount === 0) {
        throw new Error("لم يتم العثور على الحجز أو تم تحديثه مسبقاً.");
    }
    return result.rows[0];
}

module.exports = {
    // ... (تصدير الدوال السابقة)
    getEmployeeAssignedFields,
    getBookingsForEmployee,
    updateBookingStatus
};
// models.js (أضف هذه الدوال في نهاية الملف)

/**
 * جلب ملاعب مالك معين
 */
async function getOwnerStadiums(ownerId) {
    const query = `
        SELECT field_id, name, location, price_per_hour, deposit_amount
        FROM fields
        WHERE owner_id = $1 AND is_active = TRUE
        ORDER BY name ASC
    `;
    const result = await execQuery(query, [ownerId]);
    return result.rows;
}

/**
 * جلب حجوزات مالك معين (مع دعم الفلاتر)
 */
async function getOwnerBookings(ownerId, filters) {
    const { startDate, endDate, fieldId, status } = filters;
    let query = `
        SELECT 
            b.booking_id, b.booking_date, b.start_time, b.end_time, b.status, 
            b.total_amount, b.deposit_amount, b.deposit_paid,
            f.name AS pitch_name, f.location,
            u.name AS player_name, u.phone AS player_phone
        FROM bookings b
        JOIN fields f ON b.field_id = f.field_id
        JOIN users u ON b.player_id = u.user_id
        WHERE f.owner_id = $1
    `;
    const params = [ownerId];
    let paramIndex = 2;

    if (startDate && endDate) {
        query += ` AND b.booking_date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        params.push(startDate, endDate);
    }
    if (fieldId) {
        query += ` AND b.field_id = $${paramIndex++}`;
        params.push(fieldId);
    }
    if (status) {
        query += ` AND b.status = $${paramIndex++}`;
        params.push(status);
    }

    query += ` ORDER BY b.booking_date DESC, b.start_time DESC`;
    
    const result = await execQuery(query, params);
    // تأكد من تمرير ID الذي تستخدمه الواجهة الأمامية
    return result.rows.map(b => ({
        ...b,
        id: b.booking_id
    }));
}

/**
 * جلب إحصائيات مالك الملعب للوحة التحكم
 */
async function getOwnerDashboardStats(ownerId) {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM fields WHERE owner_id = $1 AND is_active = TRUE) AS total_fields,
            (SELECT COUNT(*) FROM bookings b JOIN fields f ON b.field_id = f.field_id WHERE f.owner_id = $1) AS total_bookings,
            (SELECT SUM(total_amount) FROM bookings b JOIN fields f ON b.field_id = f.field_id WHERE f.owner_id = $1 AND b.status = 'played') AS total_revenue_gross,
            (SELECT SUM(total_amount) FROM bookings b JOIN fields f ON b.field_id = f.field_id WHERE f.owner_id = $1 AND b.status = 'booked_confirmed' AND b.booking_date >= CURRENT_DATE) AS upcoming_bookings_value,
            (SELECT COUNT(*) FROM bookings b JOIN fields f ON b.field_id = f.field_id WHERE f.owner_id = $1 AND b.status = 'booked_unconfirmed' AND b.deposit_amount = 0) AS pending_cash_bookings
    `;
    const result = await execQuery(query, [ownerId]);
    return result.rows[0] || {};
}

module.exports = {
    // ... (تأكد من تصدير جميع الدوال السابقة)
    getOwnerStadiums,
    getOwnerBookings,
    getOwnerDashboardStats,
    // ...
};

// models.js (أضف هذه الدوال في نهاية الملف)

/**
 * جلب إحصائيات لوحة تحكم الأدمن العامة
 */
async function getAdminDashboardStats() {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM users) AS total_users,
            (SELECT COUNT(*) FROM fields WHERE is_active = TRUE) AS total_stadiums,
            (SELECT COUNT(*) FROM bookings) AS total_bookings,
            (SELECT SUM(total_amount) FROM bookings WHERE status = 'played') AS total_revenue_gross,
            (SELECT COUNT(*) FROM users WHERE is_approved = FALSE AND role IN ('owner', 'employee')) AS pending_managers
    `;
    const result = await execQuery(query);
    return result.rows[0] || {};
}

/**
 * جلب جميع المستخدمين مع معلومات الدور والموافقة
 */
async function getAllUsers() {
    const query = `
        SELECT user_id, name, email, phone, role, is_approved, created_at
        FROM users
        ORDER BY created_at DESC
    `;
    const result = await execQuery(query);
    return result.rows;
}

/**
 * جلب المستخدمين المنتظرين الموافقة (مالك/موظف)
 */
async function getPendingManagers() {
    const query = `
        SELECT user_id, name, email, role, created_at
        FROM users
        WHERE is_approved = FALSE AND role IN ('owner', 'employee')
        ORDER BY created_at ASC
    `;
    const result = await execQuery(query);
    return result.rows;
}

/**
 * تحديث حالة الموافقة للمستخدم
 */
async function updateApprovalStatus(userId, isApproved, role) {
    const query = `
        UPDATE users
        SET is_approved = $1, role = $2
        WHERE user_id = $3
        RETURNING user_id, name, email, is_approved, role
    `;
    const result = await execQuery(query, [isApproved, role, userId]);
    return result.rows[0];
}

/**
 * جلب سجلات النشاط (Activity Logs)
 */
async function getActivityLogs(limit = 20) {
    const query = `
        SELECT 
            l.action_id, l.action, l.description, l.created_at, 
            u.name AS user_name, u.role AS user_role
        FROM activity_logs l
        LEFT JOIN users u ON l.user_id = u.user_id
        ORDER BY l.created_at DESC
        LIMIT $1
    `;
    const result = await execQuery(query, [limit]);
    return result.rows;
}

/**
 * جلب جميع الملاعب (لإدارة الأدمن)
 */
async function getAllStadiums() {
    const query = `
        SELECT 
            f.field_id, f.name, f.location, f.price_per_hour, f.is_active,
            u.name AS owner_name
        FROM fields f
        JOIN users u ON f.owner_id = u.user_id
        ORDER BY f.name ASC
    `;
    const result = await execQuery(query);
    return result.rows;
}

// ... (تأكد من إضافة الدوال الجديدة في تصدير الدوال)
module.exports = {
    // ... (تصدير الدوال السابقة)
    getAdminDashboardStats,
    getAllUsers,
    getPendingManagers,
    updateApprovalStatus,
    getActivityLogs,
    getAllStadiums,
    // ...
};

// models.js (إضافات لدوال CRUD للملاعب)

/**
 * دالة مساعدة لجلب معرفات الموظفين المرتبطين بملعب
 */
async function getAssignedEmployees(fieldId, client) {
    const query = `
        SELECT user_id
        FROM employee_assignments
        WHERE field_id = $1
    `;
    const result = await execQuery(query, [fieldId], client);
    return result.rows.map(row => row.user_id);
}


/**
 * 1. إنشاء ملعب جديد
 */
async function createField(ownerId, name, location, pricePerHour, depositAmount, features, client) {
    const query = `
        INSERT INTO fields (owner_id, name, location, price_per_hour, deposit_amount, features, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        RETURNING field_id, name
    `;
    const result = await execQuery(query, [ownerId, name, location, pricePerHour, depositAmount, features], client);
    return result.rows[0];
}

/**
 * 2. تحديث بيانات ملعب موجود
 */
async function updateField(fieldId, updates, client) {
    const fields = [];
    const values = [];
    let index = 1;

    for (const key in updates) {
        if (updates[key] !== undefined) {
            fields.push(`${key} = $${index++}`);
            values.push(updates[key]);
        }
    }

    if (fields.length === 0) return null;

    values.push(fieldId);

    const query = `
        UPDATE fields
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE field_id = $${index}
        RETURNING field_id, name
    `;

    const result = await execQuery(query, values, client);
    return result.rows[0];
}

/**
 * 3. حذف (تعطيل) ملعب
 */
async function deleteField(fieldId, client) {
    // يفضل التعطيل بدلاً من الحذف لضمان بقاء سجل الحجوزات
    const query = `
        UPDATE fields
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE field_id = $1
        RETURNING field_id, name
    `;
    const result = await execQuery(query, [fieldId], client);
    return result.rows[0];
}

/**
 * 4. تفعيل ملعب
 */
async function activateField(fieldId, client) {
    const query = `
        UPDATE fields
        SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE field_id = $1
        RETURNING field_id, name
    `;
    const result = await execQuery(query, [fieldId], client);
    return result.rows[0];
}


// ... (أضف الدوال الجديدة إلى تصدير الدوال)
module.exports = {
    // ... (تصدير الدوال السابقة)
    createField,
    updateField,
    deleteField,
    activateField,
    getAssignedEmployees,
    // ...
};

// models.js (إضافات لدوال الحجز والدفع)

/**
 * جلب تفاصيل الملعب وسعر العربون
 */
async function getFieldDetailsForBooking(fieldId) {
    const query = `
        SELECT field_id, name, price_per_hour, deposit_amount, owner_id
        FROM fields
        WHERE field_id = $1 AND is_active = TRUE
    `;
    const result = await execQuery(query, [fieldId]);
    return result.rows[0];
}

/**
 * جلب حالة فتح الساعة المحددة
 * @returns { 'available' | 'booked_confirmed' | 'booked_unconfirmed' | 'blocked' }
 */
async function getSlotStatus(fieldId, bookingDate, startTime) {
    // التحقق من الحجوزات المؤكدة أو المعلقة
    const query = `
        SELECT status
        FROM bookings
        WHERE field_id = $1 
        AND booking_date = $2 
        AND start_time = $3
        AND status IN ('booked_confirmed', 'booked_unconfirmed')
    `;
    const result = await execQuery(query, [fieldId, bookingDate, startTime]);
    if (result.rows.length > 0) {
        return result.rows[0].status;
    }
    
    // التحقق من الساعات المحظورة (مغلقة من المالك/الأدمن)
    const blockQuery = `
        SELECT *
        FROM blocked_slots
        WHERE field_id = $1 
        AND block_date = $2 
        AND start_time = $3
    `;
    const blockResult = await execQuery(blockQuery, [fieldId, bookingDate, startTime]);
    if (blockResult.rows.length > 0) {
        return 'blocked';
    }

    return 'available';
}

/**
 * إنشاء حجز جديد (المرحلة الأولى: حجز الساعة)
 */
async function createNewBooking(userId, fieldId, bookingDate, startTime, endTime, totalAmount, depositAmount, playersNeeded, initialStatus, client) {
    const query = `
        INSERT INTO bookings (
            user_id, field_id, booking_date, start_time, end_time, 
            total_amount, deposit_amount, players_needed, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING booking_id, total_amount, deposit_amount, status
    `;
    const result = await execQuery(query, [
        userId, fieldId, bookingDate, startTime, endTime, 
        totalAmount, depositAmount, playersNeeded, initialStatus
    ], client);
    return result.rows[0];
}

/**
 * تحديث حالة الحجز بعد الدفع
 */
async function updateBookingStatus(bookingId, newStatus, paymentReference = null, client) {
    const query = `
        UPDATE bookings
        SET status = $1, 
            payment_ref = COALESCE($2, payment_ref),
            updated_at = CURRENT_TIMESTAMP
        WHERE booking_id = $3
        RETURNING booking_id, status
    `;
    const result = await execQuery(query, [newStatus, paymentReference, bookingId], client);
    return result.rows[0];
}

/**
 * جلب معلومات الحجز لصفحة الدفع
 */
async function getBookingInfoForPayment(bookingId, userId) {
    const query = `
        SELECT 
            b.booking_id, b.booking_date, b.start_time, b.end_time,
            b.deposit_amount, b.total_amount, b.status,
            f.name AS field_name, f.location
        FROM bookings b
        JOIN fields f ON b.field_id = f.field_id
        WHERE b.booking_id = $1 AND b.user_id = $2
    `;
    const result = await execQuery(query, [bookingId, userId]);
    return result.rows[0];
}

// ... (أضف الدوال الجديدة إلى تصدير الدوال)
module.exports = {
    // ... (تصدير الدوال السابقة)
    getFieldDetailsForBooking,
    getSlotStatus,
    createNewBooking,
    updateBookingStatus,
    getBookingInfoForPayment,
    // ...
};

// models.js (إضافات لدوال إدارة الأكواد)

/**
 * دالة مساعدة لجلب الكود بالمعرف (مطلوبة في Booking Request Controller)
 */
async function getCodeById(codeId, client = null) {
    const query = `
        SELECT *
        FROM discount_codes
        WHERE code_id = $1
    `;
    const result = await execQuery(query, [codeId], client);
    return result.rows[0];
}

/**
 * 1. إنشاء كود جديد (Admin Only)
 */
async function createCode(codeData, client) {
    const { code_value, code_type, field_id, discount_percent, fixed_amount, max_uses, expires_at, created_by } = codeData;
    const query = `
        INSERT INTO discount_codes (code_value, code_type, field_id, discount_percent, fixed_amount, max_uses, expires_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `;
    const result = await execQuery(query, [code_value, code_type, field_id, discount_percent, fixed_amount, max_uses, expires_at, created_by], client);
    return result.rows[0];
}

/**
 * 2. جلب جميع الأكواد (Admin Only)
 */
async function getAllCodes() {
    const query = `
        SELECT c.*, f.name AS field_name, u.name AS creator_name
        FROM discount_codes c
        LEFT JOIN fields f ON c.field_id = f.field_id
        LEFT JOIN users u ON c.created_by = u.user_id
        ORDER BY c.created_at DESC
    `;
    const result = await execQuery(query);
    return result.rows;
}

/**
 * 3. تحديث حالة الكود (تعطيل/تفعيل) (Admin Only)
 */
async function updateCodeStatus(codeId, isActive, client) {
    const query = `
        UPDATE discount_codes
        SET is_active = $1, updated_at = CURRENT_TIMESTAMP
        WHERE code_id = $2
        RETURNING *
    `;
    const result = await execQuery(query, [isActive, codeId], client);
    return result.rows[0];
}

/**
 * 4. التحقق من الكود قبل الحجز (Player Flow)
 */
async function validateCode(codeValue, fieldId = null) {
    const query = `
        SELECT *
        FROM discount_codes
        WHERE code_value = $1
          AND is_active = TRUE
          AND used_count < max_uses
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (field_id IS NULL OR field_id = $2)
    `;
    const result = await execQuery(query, [codeValue, fieldId]);
    return result.rows[0];
}

/**
 * 5. تسجيل استخدام الكود (داخل transaction الحجز)
 */
async function incrementCodeUsage(codeId, client) {
    const query = `
        UPDATE discount_codes
        SET used_count = used_count + 1
        WHERE code_id = $1
    `;
    await execQuery(query, [codeId], client);
}

module.exports = {
    // ... (تصدير الدوال السابقة)
    getCodeById,
    createCode,
    getAllCodes,
    updateCodeStatus,
    validateCode,
    incrementCodeUsage,
    // ...
};

// models.js (إضافات لمنطق طلبات اللاعبين والتقييمات)

// ===================================
// 1. دوال إدارة طلبات اللاعبين (Player Requests)
// ===================================

/**
 * إنشاء طلب لاعبين إضافيين مرتبط بحجز مؤكد
 */
async function createPlayerRequest(bookingId, playersNeeded, notes, userId, client) {
    const query = `
        INSERT INTO player_requests (booking_id, user_id, players_needed, notes, status)
        VALUES ($1, $2, $3, $4, 'open')
        RETURNING *
    `;
    const result = await execQuery(query, [bookingId, userId, playersNeeded, notes], client);
    return result.rows[0];
}

/**
 * جلب جميع الطلبات النشطة مع تفاصيل الملعب وعدد المشاركين
 */
async function getAllActivePlayerRequests(filters = {}) {
    // جلب جميع الطلبات المفتوحة التي لم يكتمل عددها بعد
    let query = `
        SELECT 
            pr.*, 
            f.name AS field_name, 
            f.location,
            b.booking_date,
            b.start_time,
            b.end_time,
            u.name AS booker_name,
            (
                SELECT COUNT(*) 
                FROM request_participants rp 
                WHERE rp.request_id = pr.request_id
            ) AS current_participants
        FROM player_requests pr
        JOIN bookings b ON pr.booking_id = b.booking_id
        JOIN fields f ON b.field_id = f.field_id
        JOIN users u ON pr.user_id = u.user_id
        WHERE pr.status = 'open' AND b.booking_date >= CURRENT_DATE 
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (filters.area) {
        query += ` AND f.area = $${paramIndex++}`;
        params.push(filters.area);
    }
    
    query += ` ORDER BY b.booking_date ASC, b.start_time ASC`;

    const result = await execQuery(query, params);
    return result.rows;
}

/**
 * انضمام لاعب إلى طلب
 */
async function joinPlayerRequest(requestId, userId, client) {
    const query = `
        INSERT INTO request_participants (request_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (request_id, user_id) DO NOTHING
        RETURNING *
    `;
    const result = await execQuery(query, [requestId, userId], client);
    return result.rowCount > 0;
}

/**
 * مغادرة لاعب لطلب
 */
async function leavePlayerRequest(requestId, userId, client) {
    const query = `
        DELETE FROM request_participants 
        WHERE request_id = $1 AND user_id = $2
        RETURNING *
    `;
    const result = await execQuery(query, [requestId, userId], client);
    return result.rowCount > 0;
}

// ===================================
// 2. دوال نظام التقييمات (Ratings)
// ===================================

/**
 * التحقق مما إذا كان يمكن للمستخدم تقييم الحجز
 */
async function canUserRateBooking(bookingId, userId) {
    const query = `
        SELECT 
            b.booking_id, 
            b.status, 
            f.field_id,
            (SELECT COUNT(*) FROM ratings r WHERE r.booking_id = b.booking_id AND r.user_id = $2) AS existing_rating
        FROM bookings b
        JOIN fields f ON b.field_id = f.field_id
        WHERE b.booking_id = $1 AND b.user_id = $2 
    `;
    const result = await execQuery(query, [bookingId, userId]);
    const booking = result.rows[0];

    if (!booking) return { canRate: false, message: "الحجز غير موجود أو ليس لك." };
    // يتم التقييم فقط للحجوزات التي تم اللعب فيها (يجب أن ينتقل حالة الحجز إلى 'played' من واجهة المالك/الموظف)
    if (booking.status !== 'played') return { canRate: false, message: "لا يمكن تقييم إلا بعد لعب الساعة." };
    if (parseInt(booking.existing_rating) > 0) return { canRate: false, message: "لقد قمت بتقييم هذا الحجز مسبقاً." };

    return { canRate: true, fieldId: booking.field_id };
}

/**
 * تسجيل تقييم جديد للملعب وتحديث المتوسط
 */
async function submitRating(bookingId, userId, fieldId, rating, comment, client) {
    const insertQuery = `
        INSERT INTO ratings (booking_id, user_id, field_id, rating_value, comment)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `;
    const ratingResult = await execQuery(insertQuery, [bookingId, userId, fieldId, rating, comment], client);
    
    // تحديث متوسط التقييم للملعب
    const updateFieldRatingQuery = `
        UPDATE fields
        SET average_rating = (
            SELECT AVG(rating_value) 
            FROM ratings 
            WHERE field_id = $1
        )
        WHERE field_id = $1
    `;
    await execQuery(updateFieldRatingQuery, [fieldId], client);

    return ratingResult.rows[0];
}

// ... (يجب إضافة الدوال الجديدة إلى تصدير الدوال في نهاية models.js)

// models.js (إضافات لنظام الإشعارات)

/**
 * 1. إنشاء إشعار جديد (يتم استدعاؤها من الـ Controllers)
 */
async function createNotification(userId, type, message, relatedId = null, client = null) {
    // يجب التأكد من إنشاء جدول notifications في قاعدة البيانات أولاً
    // (notification_id, user_id, type, message, related_id, is_read, created_at)
    const query = `
        INSERT INTO notifications (user_id, type, message, related_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;
    await execQuery(query, [userId, type, message, relatedId], client);
}

/**
 * 2. جلب إشعارات المستخدم (أحدث 20 إشعار)
 */
async function getNotificationsByUserId(userId, limit = 20) {
    const query = `
        SELECT *
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
    `;
    const result = await execQuery(query, [userId, limit]);
    return result.rows;
}

/**
 * 3. جلب عدد الإشعارات غير المقروءة
 */
async function getUnreadNotificationsCount(userId) {
    const query = `
        SELECT COUNT(*)
        FROM notifications
        WHERE user_id = $1 AND is_read = FALSE
    `;
    const result = await execQueryOne(query, [userId]);
    return parseInt(result.count || 0);
}

/**
 * 4. وضع علامة 'مقروء' على جميع الإشعارات
 */
async function markAllNotificationsAsRead(userId) {
    const query = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = $1 AND is_read = FALSE
        RETURNING notification_id
    `;
    const result = await execQuery(query, [userId]);
    return result.rowCount; // عدد الإشعارات التي تم تحديثها
}

module.exports = {
    // ... (تصدير الدوال السابقة)
    createNotification,
    getNotificationsByUserId,
    getUnreadNotificationsCount,
    markAllNotificationsAsRead,
    // ...
};

// models.js (إضافات لمنطق المالك/الموظف)

// ===================================
// 1. دوال إدارة المالك (Owner/Employee Management)
// ===================================

/**
 * جلب جميع الملاعب التي يديرها مستخدم معين (مالك أو موظف)
 */
async function getStadiumsByManagerId(userId) {
    // يجب أن تكون الدالة قادرة على جلب كل الملاعب المرتبطة به
    const query = `
        SELECT f.*
        FROM fields f
        JOIN employee_assignments ea ON f.field_id = ea.field_id
        WHERE ea.user_id = $1
    `;
    const result = await execQuery(query, [userId]);
    return result.rows;
}

/**
 * جلب الإحصائيات الأساسية للملاعب التي يديرها
 */
async function getOwnerStats(stadiumIds) {
    if (stadiumIds.length === 0) return { total_bookings: 0, total_revenue_paid: 0, total_value_of_bookings: 0 };
    
    // حساب الإيرادات من الحجوزات المؤكدة والملعوبة
    const query = `
        SELECT 
            COUNT(booking_id) AS total_bookings,
            COALESCE(SUM(total_amount - remaining_amount), 0) AS total_revenue_paid,
            COALESCE(SUM(total_amount), 0) AS total_value_of_bookings
        FROM bookings
        WHERE field_id = ANY($1::uuid[]) 
          AND status IN ('booked_confirmed', 'played')
    `;
    const result = await execQueryOne(query, [stadiumIds]);
    return result;
}

/**
 * جلب جميع الحجوزات للملاعب التي يديرها (مع تفاصيل اللاعب)
 */
async function getOwnerBookings(stadiumIds) {
    if (stadiumIds.length === 0) return [];
    
    const query = `
        SELECT 
            b.booking_id AS id, 
            b.field_id,
            b.booking_date, 
            b.start_time, 
            b.end_time, 
            b.status, 
            b.total_amount,
            b.deposit_amount,
            b.remaining_amount,
            f.name AS field_name, 
            u.name AS player_name, 
            u.phone AS player_phone
        FROM bookings b
        JOIN fields f ON b.field_id = f.field_id
        JOIN users u ON b.user_id = u.user_id
        WHERE b.field_id = ANY($1::uuid[])
        ORDER BY b.booking_date DESC, b.start_time DESC
    `;
    const result = await execQuery(query, [stadiumIds]);
    return result.rows;
}

/**
 * تأكيد حجز (يتم استخدامه للحجوزات التي تتطلب موافقة يدوية)
 */
async function confirmBooking(bookingId, client) {
    const query = `
        UPDATE bookings 
        SET status = 'booked_confirmed' 
        WHERE booking_id = $1 AND status = 'booked_unconfirmed' AND deposit_amount = 0
        RETURNING *
    `;
    const result = await execQuery(query, [bookingId], client);
    return result.rows[0];
}

/**
 * إلغاء حجز وتحديث حالة الملعب
 */
async function cancelBooking(bookingId, client) {
    const query = `
        UPDATE bookings 
        SET status = 'cancelled' 
        WHERE booking_id = $1 AND status IN ('booked_confirmed', 'booked_unconfirmed')
        RETURNING *
    `;
    const bookingResult = await execQuery(query, [bookingId], client);
    const booking = bookingResult.rows[0];
    
    if (booking) {
        // 💡 خطوة حاسمة: إعادة فتح (إتاحة) الساعة الملغاة
        const updateSlotQuery = `
            UPDATE field_slots
            SET status = 'available'
            WHERE field_id = $1 AND slot_date = $2 AND start_time = $3
        `;
        await execQuery(updateSlotQuery, [booking.field_id, booking.booking_date, booking.start_time], client);
    }
    
    return booking;
}

// ... (تأكد من إضافة الدوال الجديدة إلى تصدير الدوال في نهاية models.js)

// models.js (إضافات لمنطق الأدمن)

// ===================================
// 2. دوال إدارة الأدمن (Admin Management)
// ===================================

/**
 * جلب إحصائيات لوحة الأدمن العامة
 */
async function getAdminDashboardStats() {
    // 1. إجمالي المستخدمين
    const totalUsers = await execQueryOne(`SELECT COUNT(*) FROM users`);

    // 2. إجمالي الملاعب
    const totalStadiums = await execQueryOne(`SELECT COUNT(*) FROM fields`);

    // 3. إجمالي الإيرادات والحجوزات (المكتملة والمؤكدة)
    const bookingStats = await execQueryOne(`
        SELECT 
            COUNT(*) AS total_bookings, 
            COALESCE(SUM(total_amount - remaining_amount), 0) AS total_revenue
        FROM bookings
        WHERE status IN ('booked_confirmed', 'played')
    `);

    // 4. الحسابات بانتظار الموافقة
    const pendingManagers = await execQueryOne(`
        SELECT COUNT(*) 
        FROM users 
        WHERE is_approved = FALSE AND role IN ('owner', 'employee')
    `);

    return {
        totalUsers: parseInt(totalUsers.count || 0),
        totalStadiums: parseInt(totalStadiums.count || 0),
        totalBookings: parseInt(bookingStats.total_bookings || 0),
        totalRevenue: parseFloat(bookingStats.total_revenue || 0),
        pendingManagers: parseInt(pendingManagers.count || 0)
    };
}

/**
 * جلب جميع المستخدمين
 */
async function getAllUsers() {
    const query = `
        SELECT user_id, name, email, phone, role, is_approved, created_at
        FROM users
        ORDER BY created_at DESC
    `;
    const result = await execQuery(query);
    return result.rows;
}

/**
 * جلب المديرين (Owners/Employees) بانتظار الموافقة
 */
async function getPendingManagers() {
    const query = `
        SELECT user_id, name, email, phone, role, created_at
        FROM users
        WHERE is_approved = FALSE AND role IN ('owner', 'employee')
        ORDER BY created_at ASC
    `;
    const result = await execQuery(query);
    return result.rows;
}

/**
 * تحديث دور المستخدم أو حالة الموافقة
 */
async function updateUserManagerStatus(userId, updates, client = null) {
    const setParts = [];
    const values = [];
    let paramIndex = 1;

    // بناء جملة التحديث
    if (updates.role) {
        setParts.push(`role = $${paramIndex++}`);
        values.push(updates.role);
    }
    if (updates.isApproved !== undefined) {
        setParts.push(`is_approved = $${paramIndex++}`);
        values.push(updates.isApproved);
    }
    
    if (setParts.length === 0) return null;

    values.push(userId);
    
    const query = `
        UPDATE users
        SET ${setParts.join(', ')}
        WHERE user_id = $${paramIndex}
        RETURNING user_id, name, email, role, is_approved
    `;
    const result = await execQuery(query, values, client);
    return result.rows[0];
}

/**
 * إنشاء ملعب جديد
 */
async function createStadium(data, client = null) {
    // ... (منطق إنشاء ملعب - تم إضافته في الخطوة السابقة)
    // للتذكير: يجب أن يحتوي على منطق لـ INSERT INTO fields
}

/**
 * حذف ملعب وجميع البيانات المرتبطة به (يجب أن يتم داخل Transaction)
 */
async function deleteStadium(fieldId, client) {
    // يتم حذف البيانات المرتبطة أولاً لتجنب مشاكل الـ Foreign Key
    // ... (منطق حذف البيانات المرتبطة: طلبات اللاعبين، التقييمات، الحجوزات، الساعات، التخصيص)
    // ...
    const result = await execQuery(`DELETE FROM fields WHERE field_id = $1 RETURNING field_id`, [fieldId], client);
    return result.rowCount > 0;
}

/**
 * إنشاء كود خصم/دفع جديد
 */
async function createCode(data, client = null) {
    // ... (منطق إنشاء كود - تم إضافته في الخطوة السابقة)
    // للتذكير: يجب أن يحتوي على منطق لـ INSERT INTO codes
}

// ... (تأكد من تصدير جميع الدوال الجديدة في نهاية models.js)

// models.js (دوال الدفع والتأكيد الجديدة)

/**
 * جلب تفاصيل الحجز المطلوبة للدفع
 * (تستخدم في مرحلة بدء الدفع للتأكد من بيانات المستخدم والمبلغ)
 */
async function getBookingDetailsForPayment(bookingId) {
    const query = `
        SELECT 
            b.booking_id, b.user_id, b.booking_date, b.start_time, b.deposit_amount, b.status, b.field_id,
            u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
            f.name AS field_name
        FROM bookings b
        JOIN users u ON b.user_id = u.user_id
        JOIN fields f ON b.field_id = f.field_id
        WHERE b.booking_id = $1 AND b.status = 'booked_unconfirmed' AND b.deposit_amount > 0
    `;
    const result = await execQueryOne(query, [bookingId]);
    return result;
}

/**
 * تحديث الحجز بمعرف معاملة Paymob (قبل التوجيه للدفع)
 */
async function updateBookingWithPaymobId(bookingId, paymobOrderId) {
    const query = `
        UPDATE bookings 
        SET paymob_order_id = $1
        WHERE booking_id = $2
        RETURNING *
    `;
    await execQuery(query, [paymobOrderId, bookingId]);
}

/**
 * تأكيد الدفع وإتمام الحجز (يتم استدعاؤها من الـ Webhook)
 */
async function finalizeBookingAfterPayment(bookingId, client) {
    const query = `
        UPDATE bookings 
        SET status = 'booked_confirmed', remaining_amount = total_amount - deposit_amount 
        WHERE booking_id = $1 AND status = 'booked_unconfirmed'
        RETURNING *
    `;
    const result = await execQuery(query, [bookingId], client);
    return result.rows[0];
}

// ... (تأكد من تصدير الدوال الجديدة)
