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
