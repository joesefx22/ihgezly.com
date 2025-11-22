// models.js - منطق التعامل مع قاعدة البيانات (PostgreSQL)
// يحتوي على جميع دوال CRUD للتعامل مع الجداول بشكل آمن ومُنظَّم.

const { execQuery, execQueryOne, withTransaction } = require('./db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// =======================================================
// 🛠️ دوال مساعدة عامة وسجلات النشاط (General Helpers & Logs)
// =======================================================

/**
 * تسجيل نشاط المستخدم/النظام (Activity Log)
 * @param {string} user_id - مُعرّف المستخدم الذي قام بالعملية.
 * @param {string} action - نوع الإجراء (مثال: 'BOOKING_CREATE', 'ADMIN_ACTION').
 * @param {string} description - وصف تفصيلي للعملية.
 * @param {string} entity_id - مُعرّف الكيان الذي تم العمل عليه (ملعب/حجز).
 * @param {Client} client - كائن اتصال المعاملة (إذا كان داخل withTransaction).
 */
async function createActivityLog(user_id, action, description, entity_id = null, client = null) {
    const query = `
        INSERT INTO activity_logs (user_id, action, description, entity_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const values = [user_id, action, description, entity_id];
    
    // استخدم client.query داخل المعاملات أو execQueryOne خارجها
    if (client) {
        return client.query(query, values); 
    } else {
        return execQueryOne(query, values);
    }
}

/**
 * جلب آخر سجلات النشاط للنظام (للأدمن)
 */
async function getSystemActivityLogs(limit = 15) {
    const query = `
        SELECT 
            al.id, 
            al.action, 
            al.description, 
            al.created_at, 
            u.name as user_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT $1;
    `;
    return execQuery(query, [limit]);
}

// =======================================================
// 👥 المستخدمون والمصادقة (Users & Auth)
// =======================================================

/**
 * جلب مستخدم بواسطة المعرف (ID)
 */
async function getUserById(id) {
    const query = `
        SELECT id, name, email, phone, role, is_approved, avatar_url, created_at 
        FROM users 
        WHERE id = $1;
    `;
    return execQueryOne(query, [id]);
}

/**
 * جلب مستخدم بواسطة البريد الإلكتروني (للتسجيل والدخول)
 */
async function findUserByEmail(email) {
    const query = `SELECT * FROM users WHERE email = $1;`; // نرجع كل شيء بما في ذلك الـ password للتحقق
    return execQueryOne(query, [email]);
}

/**
 * تسجيل مستخدم جديد (Registration)
 */
async function registerNewUser(data) {
    const { name, email, password, phone, role = 'player' } = data;
    
    // نتحقق من عدم وجود المستخدم مسبقًا
    if (await findUserByEmail(email)) {
        throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // is_approved تكون TRUE افتراضياً للاعبين، و FALSE لمالكي الملاعب الجدد حتى تتم الموافقة عليهم
    const is_approved = role === 'player' ? 'TRUE' : 'FALSE';

    const query = `
        INSERT INTO users (name, email, password, phone, role, is_approved)
        VALUES ($1, $2, $3, $4, $5, ${is_approved})
        RETURNING id, name, email, phone, role, is_approved, created_at;
    `;
    const values = [name, email, hashedPassword, phone, role];
    
    const user = await execQueryOne(query, values);
    await createActivityLog(user.id, 'USER_REGISTER', `New user registered with role: ${role}`, user.id);
    return user;
}

/**
 * تسجيل دخول المستخدم (Login)
 */
async function loginUser(email, password) {
    const user = await findUserByEmail(email);
    if (!user) return null; // المستخدم غير موجود

    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
        delete user.password; // إزالة كلمة المرور المشفرة من النتيجة
        await createActivityLog(user.id, 'USER_LOGIN', `User logged in successfully`, user.id);
        return user;
    }
    return null; // كلمة المرور غير صحيحة
}

/**
 * البحث عن مستخدم جوجل أو إنشاؤه (لـ Passport)
 * *مطلوب بواسطة server.js*
 */
async function findOrCreateGoogleUser(data) {
    const { googleId, name, email } = data;
    
    let user = await execQueryOne(`SELECT * FROM users WHERE google_id = $1 OR email = $2;`, [googleId, email]);
    
    if (user) {
        if (!user.google_id && googleId) {
            user = await execQueryOne(`UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *;`, [googleId, user.id]);
        }
        delete user.password;
        await createActivityLog(user.id, 'SOCIAL_LOGIN', `User logged in via Google`, user.id);
        return user;
    } else {
        const query = `
            INSERT INTO users (google_id, name, email, role, is_approved)
            VALUES ($1, $2, $3, 'player', TRUE)
            RETURNING id, name, email, role, is_approved, created_at;
        `;
        const values = [googleId, name, email];
        const newUser = await execQueryOne(query, values);
        await createActivityLog(newUser.id, 'SOCIAL_REGISTER', `New user registered via Google`, newUser.id);
        return newUser;
    }
}

// ---------------------------
// دوال إدارة الأدوار (Admin/Manager Functions)
// ---------------------------

/**
 * جلب جميع طلبات مديري الملاعب (Managers) المعلقة
 */
async function getPendingManagers() {
    const query = `
        SELECT id, name, email, phone, created_at 
        FROM users 
        WHERE role = 'manager' AND is_approved = FALSE;
    `;
    return execQuery(query);
}

/**
 * الموافقة على مدير ملعب (يتم ترقيته إلى 'owner')
 */
async function approveManager(manager_id, admin_id) {
    const user = await execQueryOne(`UPDATE users SET is_approved = TRUE, role = 'owner' WHERE id = $1 RETURNING id, name;`, [manager_id]);
    if (user) {
        await createActivityLog(admin_id, 'ADMIN_ACTION', `Approved owner: ${user.name} (${user.id})`, user.id);
    }
    return user;
}

/**
 * رفض/حظر طلب مدير ملعب معلق
 */
async function rejectManager(manager_id, admin_id) {
    const user = await execQueryOne(`UPDATE users SET role = 'rejected' WHERE id = $1 RETURNING id, name;`, [manager_id]);
    if (user) {
        await createActivityLog(admin_id, 'ADMIN_ACTION', `Rejected manager application: ${user.name} (${user.id})`, user.id);
    }
    return user;
}

/**
 * جلب جميع المستخدمين (للأدمن)
 */
async function getAllUsers(role = null) {
    let query = `
        SELECT id, name, email, phone, role, is_approved, created_at, avatar_url
        FROM users
    `;
    const params = [];
    if (role) {
        query += ` WHERE role = $1`;
        params.push(role);
    }
    query += ` ORDER BY created_at DESC;`;
    return execQuery(query, params);
}

// =======================================================
// 🏟️ إدارة الملاعب (Stadiums Management)
// =======================================================

/**
 * دالة مساعدة لحساب متوسط التقييم
 */
async function getStadiumAverageRating(stadium_id) {
    const query = `
        SELECT 
            AVG(rating)::numeric(10, 2) as average_rating, 
            COUNT(id) as total_ratings 
        FROM ratings 
        WHERE stadium_id = $1;
    `;
    return execQueryOne(query, [stadium_id]);
}

/**
 * جلب جميع الملاعب المتاحة
 */
async function getStadiums(filters = {}) {
    let query = `
        SELECT 
            s.*, 
            (SELECT AVG(rating) FROM ratings WHERE stadium_id = s.id)::numeric(10, 2) as average_rating
        FROM stadiums s 
        WHERE s.is_active = TRUE
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.location) {
        query += ` AND s.location ILIKE $${paramIndex++}`;
        params.push(`%${filters.location}%`);
    }

    if (filters.type) {
        query += ` AND s.type = $${paramIndex++}`;
        params.push(filters.type);
    }
    
    query += ` ORDER BY average_rating DESC NULLS LAST, s.name ASC;`;
    return execQuery(query, params);
}

/**
 * جلب ملعب بواسطة المعرف (ID)
 */
async function getStadiumById(id) {
    const stadium = await execQueryOne(`SELECT * FROM stadiums WHERE id = $1;`, [id]);
    if (stadium) {
        const rating = await getStadiumAverageRating(id);
        stadium.rating = rating.average_rating;
        stadium.total_ratings = rating.total_ratings;
    }
    return stadium;
}

/**
 * جلب ملاعب مالك معين (للوحة تحكم المالك)
 */
async function getOwnerStadiums(owner_id) {
    const query = `
        SELECT id, name, location, price_per_hour, image_url, is_active, created_at 
        FROM stadiums 
        WHERE owner_id = $1 
        ORDER BY created_at DESC;
    `;
    return execQuery(query, [owner_id]);
}

/**
 * إنشاء ملعب جديد
 */
async function createStadium(data, user_id) {
    const { name, location, type, price_per_hour, deposit_amount, image_url, features } = data;
    const query = `
        INSERT INTO stadiums (owner_id, name, location, type, price_per_hour, deposit_amount, image_url, features)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;
    const values = [user_id, name, location, type, price_per_hour, deposit_amount, image_url, JSON.stringify(features || [])];
    
    const stadium = await execQueryOne(query, values);
    await createActivityLog(user_id, 'STADIUM_CREATE', `Created new stadium: ${stadium.name}`, stadium.id);
    return stadium;
}

/**
 * تحديث معلومات الملعب
 */
async function updateStadium(stadium_id, data, user_id) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const key in data) {
        if (data[key] !== undefined && key !== 'id' && key !== 'owner_id' && key !== 'created_at') {
            if (key === 'features') {
                 fields.push(`features = $${paramIndex++}`);
                 values.push(JSON.stringify(data[key]));
            } else {
                fields.push(`${key} = $${paramIndex++}`);
                values.push(data[key]);
            }
        }
    }
    
    if (fields.length === 0) return getStadiumById(stadium_id);

    values.push(stadium_id);
    const query = `
        UPDATE stadiums 
        SET ${fields.join(', ')}, created_at = NOW() 
        WHERE id = $${paramIndex} 
        RETURNING *;
    `;

    const updatedStadium = await execQueryOne(query, values);
    if (updatedStadium) {
        await createActivityLog(user_id, 'STADIUM_UPDATE', `Updated stadium: ${updatedStadium.name}`, updatedStadium.id);
    }
    return updatedStadium;
}

/**
 * حذف ملعب
 */
async function deleteStadium(stadium_id, user_id) {
    const stadium = await getStadiumById(stadium_id); 
    const result = await execQueryOne(`DELETE FROM stadiums WHERE id = $1 RETURNING id;`, [stadium_id]);
    
    if (result) {
        await createActivityLog(user_id, 'STADIUM_DELETE', `Deleted stadium: ${stadium ? stadium.name : stadium_id}`, stadium_id);
    }
    return result;
}


// =======================================================
// 📅 إدارة الحجوزات (Bookings Management)
// =======================================================

/**
 * جلب الفترات الزمنية المحجوزة والمحظورة لملعب وتاريخ معين
 */
async function getAvailableSlots(stadium_id, date) {
    const bookedSlotsQuery = `
        SELECT start_time, end_time FROM bookings 
        WHERE stadium_id = $1 AND date = $2 AND status IN ('confirmed', 'pending');
    `;
    const blockedSlotsQuery = `
        SELECT start_time, end_time FROM blocked_slots 
        WHERE stadium_id = $1 AND date = $2;
    `;
    
    const [bookedSlots, blockedSlots] = await Promise.all([
        execQuery(bookedSlotsQuery, [stadium_id, date]),
        execQuery(blockedSlotsQuery, [stadium_id, date])
    ]);
    
    return { bookedSlots, blockedSlots };
}

/**
 * إنشاء حجز جديد (يجب أن يتم داخل معاملة - TRANSACTION)
 */
async function createBooking(data) {
    const { user_id, stadium_id, date, start_time, end_time, total_price, deposit_amount, remaining_amount, players_needed, compensation_code_value } = data;
    
    // نستخدم withTransaction لضمان atomicity
    return withTransaction(async (client) => {
        let actualRemainingAmount = remaining_amount;
        let finalCompensationCode = null;
        
        // 1. معالجة كود التعويض
        if (compensation_code_value) {
            const codeResult = await client.query(`
                SELECT * FROM compensation_codes 
                WHERE code_value = $1 AND is_used = FALSE AND user_id = $2;
            `, [compensation_code_value, user_id]);
            
            if (codeResult.rows.length === 0) {
                throw new Error('Compensation code is invalid, used, or not owned by user.');
            }
            
            const compensationAmount = parseFloat(codeResult.rows[0].amount);
            actualRemainingAmount = Math.max(0, remaining_amount - compensationAmount);
            finalCompensationCode = compensation_code_value;
        }
        
        // 2. التحقق من تضارب الحجز (Conflict Check)
        const conflictQuery = `
            SELECT id FROM bookings 
            WHERE stadium_id = $1 AND date = $2 
            AND (start_time < $4 AND end_time > $3) 
            AND status IN ('confirmed', 'pending');
        `;
        const conflict = await client.query(conflictQuery, [stadium_id, date, start_time, end_time]);
        
        if (conflict.rows.length > 0) {
            throw new Error('Time slot is already booked or conflicted.');
        }

        // 3. إنشاء الحجز
        const bookingQuery = `
            INSERT INTO bookings (user_id, stadium_id, date, start_time, end_time, total_price, deposit_paid, remaining_amount, players_needed, compensation_code, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
            RETURNING *;
        `;
        const bookingValues = [
            user_id, stadium_id, date, start_time, end_time, 
            total_price, deposit_amount, actualRemainingAmount, 
            players_needed, finalCompensationCode
        ];
        
        const bookingResult = await client.query(bookingQuery, bookingValues);
        const newBooking = bookingResult.rows[0];
        
        // 4. وضع علامة "مُستخدم" على كود التعويض
        if (finalCompensationCode) {
            await client.query(`
                UPDATE compensation_codes 
                SET is_used = TRUE, used_at = NOW(), used_for_booking_id = $1 
                WHERE code_value = $2;
            `, [newBooking.id, finalCompensationCode]);
        }
        
        // 5. تسجيل النشاط
        await createActivityLog(user_id, 'BOOKING_CREATE', `Created pending booking #${newBooking.id}`, newBooking.id, client);
        
        return newBooking;
    });
}

/**
 * جلب حجوزات مستخدم معين
 */
async function getUserBookings(user_id, status = null) {
    let query = `
        SELECT 
            b.*, 
            s.name as stadium_name, s.location, s.image_url 
        FROM bookings b
        JOIN stadiums s ON b.stadium_id = s.id
        WHERE b.user_id = $1
    `;
    const params = [user_id];
    
    if (status) {
        query += ` AND b.status = $2`;
        params.push(status);
    }
    
    query += ` ORDER BY b.date DESC, b.start_time DESC;`;
    return execQuery(query, params);
}

/**
 * جلب حجوزات ملعب معين (للمالك)
 */
async function getStadiumBookings(stadium_id, date = null, status = null) {
    let query = `
        SELECT 
            b.id, b.date, b.start_time, b.end_time, b.total_price, b.status, b.players_needed,
            u.name as user_name, u.phone as user_phone
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.stadium_id = $1
    `;
    const params = [stadium_id];
    let paramIndex = 2;

    if (date) {
        query += ` AND b.date = $${paramIndex++}`;
        params.push(date);
    }
    
    if (status) {
        query += ` AND b.status = $${paramIndex++}`;
        params.push(status);
    }
    
    query += ` ORDER BY b.date ASC, b.start_time ASC;`;
    return execQuery(query, params);
}

/**
 * تأكيد الحجز (بواسطة المالك/المدير)
 */
async function confirmBooking(booking_id, user_id) {
    const query = `
        UPDATE bookings 
        SET status = 'confirmed'
        WHERE id = $1 AND status = 'pending'
        RETURNING *;
    `;
    const booking = await execQueryOne(query, [booking_id]);
    
    if (booking) {
        await createActivityLog(user_id, 'BOOKING_CONFIRM', `Confirmed booking #${booking_id}`, booking_id);
    }
    return booking;
}

/**
 * إلغاء الحجز (بواسطة المالك/اللاعب)
 */
async function cancelBooking(booking_id, user_id) {
    // نستخدم معاملة لضمان إنشاء كود تعويض إذا كان هناك عربون مدفوع
    return withTransaction(async (client) => {
        const bookingQuery = `
            UPDATE bookings 
            SET status = 'cancelled' 
            WHERE id = $1 AND status != 'cancelled'
            RETURNING *;
        `;
        const bookingResult = await client.query(bookingQuery, [booking_id]);
        const booking = bookingResult.rows[0];

        if (!booking) {
            throw new Error('Booking not found or already cancelled.');
        }

        // إنشاء كود تعويض بقيمة العربون المدفوع
        if (booking.deposit_paid > 0) {
            const newCode = `COMP-${uuidv4().substring(0, 8).toUpperCase()}`;
            const compensationQuery = `
                INSERT INTO compensation_codes (code_value, user_id, amount)
                VALUES ($1, $2, $3)
                RETURNING code_value;
            `;
            await client.query(compensationQuery, [newCode, booking.user_id, booking.deposit_paid]);
        }
        
        await createActivityLog(user_id, 'BOOKING_CANCEL', `Cancelled booking #${booking_id}`, booking_id, client);
        return booking;
    });
}

// =======================================================
// ⏰ الساعات المحظورة (Blocked Slots)
// =======================================================

/**
 * حظر فترة زمنية معينة لملعب
 */
async function blockTimeSlot(stadium_id, date, start_time, end_time, reason, user_id) {
    const query = `
        INSERT INTO blocked_slots (stadium_id, date, start_time, end_time, reason, blocked_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [stadium_id, date, start_time, end_time, reason, user_id];
    
    const blockedSlot = await execQueryOne(query, values);
    await createActivityLog(user_id, 'SLOT_BLOCK', `Blocked time slot on ${date} for stadium ${stadium_id}`, blockedSlot.id);
    return blockedSlot;
}

/**
 * جلب جميع الساعات المحظورة لملعب معين
 */
async function getBlockedSlots(stadium_id, date = null) {
    let query = `SELECT id, date, start_time, end_time, reason FROM blocked_slots WHERE stadium_id = $1`;
    const params = [stadium_id];
    if (date) {
        query += ` AND date = $2`;
        params.push(date);
    }
    query += ` ORDER BY date ASC, start_time ASC;`;
    return execQuery(query, params);
}

// =======================================================
// ⭐ التقييمات والمراجعات (Ratings Logic)
// =======================================================

/**
 * إرسال تقييم جديد للملعب (أو تحديثه)
 */
async function submitNewRating(stadium_id, user_id, rating, comment) {
    const query = `
        INSERT INTO ratings (stadium_id, user_id, rating, comment)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (stadium_id, user_id) DO UPDATE 
        SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = NOW()
        RETURNING *;
    `;
    const values = [stadium_id, user_id, rating, comment];
    
    const newRating = await execQueryOne(query, values);
    await createActivityLog(user_id, 'RATING_SUBMIT', `Submitted rating ${rating} for stadium ${stadium_id}`, stadium_id);
    return newRating;
}

/**
 * جلب تقييمات ملعب معين
 */
async function getStadiumRatings(stadium_id) {
    const query = `
        SELECT r.rating, r.comment, r.created_at, u.name as user_name, u.avatar_url
        FROM ratings r
        JOIN users u ON r.user_id = u.id
        WHERE r.stadium_id = $1
        ORDER BY r.created_at DESC;
    `;
    return execQuery(query, [stadium_id]);
}

// =======================================================
// 👥 طلبات اللاعبين الإضافيين (Player Requests)
// =======================================================

/**
 * إنشاء طلب لاعبين إضافيين جديد
 */
async function createPlayerRequest(booking_id, requester_id, players_needed) {
    const query = `
        INSERT INTO player_requests (booking_id, requester_id, players_needed, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING *;
    `;
    const values = [booking_id, requester_id, players_needed];
    
    const request = await execQueryOne(query, values);
    await createActivityLog(requester_id, 'PLAYER_REQUEST_CREATE', `Requested ${players_needed} players for booking ${booking_id}`, request.id);
    return request;
}

/**
 * جلب جميع طلبات اللاعبين النشطة
 */
async function getActivePlayerRequests() {
    const query = `
        SELECT 
            pr.*, 
            s.name as stadium_name, s.location, s.price_per_hour,
            b.date, b.start_time, b.end_time,
            u.name as requester_name
        FROM player_requests pr
        JOIN bookings b ON pr.booking_id = b.id
        JOIN stadiums s ON b.stadium_id = s.id
        JOIN users u ON pr.requester_id = u.id
        WHERE pr.status = 'active' AND b.date >= CURRENT_DATE
        ORDER BY b.date ASC, b.start_time ASC;
    `;
    return execQuery(query);
}

/**
 * الانضمام إلى طلب لاعبين إضافيين
 */
async function joinPlayerRequest(request_id, player_id) {
    const joinQuery = `
        UPDATE player_requests 
        SET players_needed = players_needed - 1 
        WHERE id = $1 AND players_needed > 0
        RETURNING players_needed;
    `;
    const result = await execQueryOne(joinQuery, [request_id]);
    
    if (result) {
        if (result.players_needed === 0) {
            await execQueryOne(`UPDATE player_requests SET status = 'completed' WHERE id = $1;`, [request_id]);
        }
        await createActivityLog(player_id, 'PLAYER_JOIN', `Joined player request #${request_id}. Remaining: ${result.players_needed}`, request_id);
    } else {
        throw new Error('Could not join request or request is full/inactive.');
    }
    
    return result;
}

// =======================================================
// 🎫 أكواد التعويض (Compensation Codes)
// =======================================================

/**
 * إنشاء كود تعويض جديد
 */
async function createCompensationCode(user_id, amount) {
    const newCode = `COMP-${uuidv4().substring(0, 8).toUpperCase()}`;
    const query = `
        INSERT INTO compensation_codes (code_value, user_id, amount)
        VALUES ($1, $2, $3)
        RETURNING *;
    `;
    const code = await execQueryOne(query, [newCode, user_id, amount]);
    await createActivityLog(user_id, 'COMP_CODE_GENERATE', `Generated compensation code ${newCode} for amount ${amount}`, code.id);
    return code;
}

/**
 * جلب كود تعويض للتحقق من صلاحيته (Validation)
 */
async function getValidCompensationCode(code_value, user_id) {
    const query = `
        SELECT * FROM compensation_codes 
        WHERE code_value = $1 AND user_id = $2 AND is_used = FALSE;
    `;
    return execQueryOne(query, [code_value, user_id]);
}

// =======================================================
// 📊 لوحة القيادة (Admin Dashboard)
// =======================================================

/**
 * جلب إحصائيات لوحة القيادة (للأدمن)
 */
async function getDashboardStats() {
    const totalUsers = await execQueryOne(`SELECT COUNT(*) as count FROM users;`);
    const totalStadiums = await execQueryOne(`SELECT COUNT(*) as count FROM stadiums;`);
    const totalBookings = await execQueryOne(`SELECT COUNT(*) as count FROM bookings;`);
    const pendingManagers = await execQueryOne(`SELECT COUNT(*) as count FROM users WHERE role = 'manager' AND is_approved = FALSE;`);
    
    return {
        totalUsers: parseInt(totalUsers.count),
        totalStadiums: parseInt(totalStadiums.count),
        totalBookings: parseInt(totalBookings.count),
        pendingManagers: parseInt(pendingManagers.count),
    };
}


// ===================================
// 📦 التصدير (Exports)
// ===================================

module.exports = {
    // دوال المستخدمين والمصادقة
    getUserById,
    findUserByEmail,
    registerNewUser,
    loginUser,
    findOrCreateGoogleUser,
    getAllUsers,
    getPendingManagers,
    approveManager,
    rejectManager,
    
    // دوال إدارة الملاعب
    getStadiums,
    getStadiumById,
    getOwnerStadiums,
    getStadiumAverageRating,
    createStadium,
    updateStadium,
    deleteStadium,
    
    // دوال الحجوزات
    getAvailableSlots,
    createBooking,
    getUserBookings,
    getStadiumBookings,
    confirmBooking,
    cancelBooking,
    
    // دوال الساعات المحظورة
    blockTimeSlot,
    getBlockedSlots,
    
    // دوال التقييمات
    submitNewRating,
    getStadiumRatings,
    
    // دوال طلبات اللاعبين
    createPlayerRequest,
    getActivePlayerRequests,
    joinPlayerRequest,
    
    // دوال أكواد التعويض
    createCompensationCode,
    getValidCompensationCode,
    
    // دوال الإدارة والتقارير
    createActivityLog,
    getSystemActivityLogs,
    getDashboardStats,
};
