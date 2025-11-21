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
