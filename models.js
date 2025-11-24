// models.js - منطق التعامل مع قاعدة البيانات (PostgreSQL)
// الإصدار النهائي المُصلح - متوافق مع Controllers ومعاملات آمنة

const { execQuery, execQueryOne } = require('./db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// =======================================================
// 🛠️ دوال مساعدة عامة وسجلات النشاط
// =======================================================

async function createActivityLog(user_id, action, description, entity_id = null, client = null) {
    const query = `
        INSERT INTO activity_logs (user_id, action, description, entity_id)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const values = [user_id, action, description, entity_id];
    
    if (client) {
        return client.query(query, values).then(res => res.rows[0]);
    }
    return execQueryOne(query, values);
}

async function comparePassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
}

// =======================================================
// 👥 المستخدمون والمصادقة
// =======================================================

async function getUserById(id) {
    const query = `
        SELECT id, name, email, phone, role, is_approved, avatar_url, created_at 
        FROM users 
        WHERE id = $1;
    `;
    return execQueryOne(query, [id]);
}

async function findUserByEmail(email) {
    const query = `SELECT * FROM users WHERE email = $1;`;
    return execQueryOne(query, [email]);
}

async function registerNewUser(data, client = null) {
    const { name, email, password, phone, role = 'player' } = data;
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const is_approved = role === 'player';

    const query = `
        INSERT INTO users (name, email, password, phone, role, is_approved)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, email, phone, role, is_approved, created_at;
    `;
    const values = [name, email, hashedPassword, phone, role, is_approved];
    
    if (client) {
        const result = await client.query(query, values);
        const user = result.rows[0];
        await createActivityLog(user.id, 'USER_REGISTER', `New user registered with role: ${role}`, user.id, client);
        return user;
    } else {
        const user = await execQueryOne(query, values);
        await createActivityLog(user.id, 'USER_REGISTER', `New user registered with role: ${role}`, user.id);
        return user;
    }
}

async function loginUser(email, password) {
    const user = await findUserByEmail(email);
    if (!user) return null;

    const isMatch = await comparePassword(password, user.password);
    if (isMatch) {
        delete user.password;
        await createActivityLog(user.id, 'USER_LOGIN', `User logged in successfully`, user.id);
        return user;
    }
    return null;
}

async function findOrCreateGoogleUser(data, client = null) {
    const { googleId, name, email } = data;
    
    let user = await execQueryOne(`SELECT * FROM users WHERE google_id = $1 OR email = $2;`, [googleId, email]);
    
    if (user) {
        if (!user.google_id && googleId) {
            const updateQuery = `UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *;`;
            if (client) {
                const result = await client.query(updateQuery, [googleId, user.id]);
                user = result.rows[0];
            } else {
                user = await execQueryOne(updateQuery, [googleId, user.id]);
            }
        }
        delete user.password;
        await createActivityLog(user.id, 'SOCIAL_LOGIN', `User logged in via Google`, user.id, client);
        return user;
    } else {
        const query = `
            INSERT INTO users (google_id, name, email, role, is_approved)
            VALUES ($1, $2, $3, 'player', TRUE)
            RETURNING id, name, email, role, is_approved, created_at;
        `;
        const values = [googleId, name, email];
        
        let newUser;
        if (client) {
            const result = await client.query(query, values);
            newUser = result.rows[0];
        } else {
            newUser = await execQueryOne(query, values);
        }
        
        await createActivityLog(newUser.id, 'SOCIAL_REGISTER', `New user registered via Google`, newUser.id, client);
        return newUser;
    }
}

async function getPendingManagers() {
    const query = `
        SELECT id, name, email, phone, created_at 
        FROM users 
        WHERE role IN ('manager', 'owner') AND is_approved = FALSE;
    `;
    return execQuery(query);
}

async function approveManager(manager_id, admin_id, client = null) {
    const query = `UPDATE users SET is_approved = TRUE, role = 'owner' WHERE id = $1 RETURNING id, name;`;
    
    let user;
    if (client) {
        const result = await client.query(query, [manager_id]);
        user = result.rows[0];
    } else {
        user = await execQueryOne(query, [manager_id]);
    }
    
    if (user) {
        await createActivityLog(admin_id, 'ADMIN_ACTION', `Approved owner: ${user.name} (${user.id})`, user.id, client);
    }
    return user;
}

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
// 🏟️ إدارة الملاعب
// =======================================================

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

async function getStadiumById(id) {
    const stadium = await execQueryOne(`SELECT * FROM stadiums WHERE id = $1;`, [id]);
    if (stadium) {
        const rating = await getStadiumAverageRating(id);
        stadium.rating = rating.average_rating;
        stadium.total_ratings = rating.total_ratings;
    }
    return stadium;
}

async function getOwnerStadiums(owner_id) {
    const query = `
        SELECT id, name, location, price_per_hour, image_url, is_active, created_at 
        FROM stadiums 
        WHERE owner_id = $1 
        ORDER BY created_at DESC;
    `;
    return execQuery(query, [owner_id]);
}

async function createStadium(data, user_id, client = null) {
    const { name, location, type, price_per_hour, deposit_amount, image_url, features } = data;
    const query = `
        INSERT INTO stadiums (owner_id, name, location, type, price_per_hour, deposit_amount, image_url, features)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;
    const values = [user_id, name, location, type, price_per_hour, deposit_amount, image_url, JSON.stringify(features || [])];
    
    let stadium;
    if (client) {
        const result = await client.query(query, values);
        stadium = result.rows[0];
    } else {
        stadium = await execQueryOne(query, values);
    }
    
    await createActivityLog(user_id, 'STADIUM_CREATE', `Created new stadium: ${stadium.name}`, stadium.id, client);
    return stadium;
}

async function updateStadium(stadium_id, data, user_id, client = null) {
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
        SET ${fields.join(', ')}, updated_at = NOW() 
        WHERE id = $${paramIndex} 
        RETURNING *;
    `;

    let updatedStadium;
    if (client) {
        const result = await client.query(query, values);
        updatedStadium = result.rows[0];
    } else {
        updatedStadium = await execQueryOne(query, values);
    }
    
    if (updatedStadium) {
        await createActivityLog(user_id, 'STADIUM_UPDATE', `Updated stadium: ${updatedStadium.name}`, updatedStadium.id, client);
    }
    return updatedStadium;
}

// =======================================================
// 📅 إدارة الحجوزات
// =======================================================

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

async function createBooking(data, client = null) {
    const { user_id, stadium_id, date, start_time, end_time, total_price, deposit_amount, remaining_amount, players_needed, compensation_code_value } = data;
    
    let actualRemainingAmount = remaining_amount;
    let finalCompensationCode = null;
    
    if (compensation_code_value) {
        const codeQuery = `SELECT * FROM compensation_codes WHERE code_value = $1 AND is_used = FALSE AND user_id = $2;`;
        let codeResult;
        if (client) {
            codeResult = await client.query(codeQuery, [compensation_code_value, user_id]);
        } else {
            codeResult = await execQuery(codeQuery, [compensation_code_value, user_id]);
        }
        
        if (!codeResult || codeResult.length === 0) {
            throw new Error('Compensation code is invalid, used, or not owned by user.');
        }
        
        const compensationAmount = parseFloat(codeResult.amount || codeResult.rows?.[0]?.amount);
        actualRemainingAmount = Math.max(0, remaining_amount - compensationAmount);
        finalCompensationCode = compensation_code_value;
    }

    const conflictQuery = `
        SELECT id FROM bookings 
        WHERE stadium_id = $1 AND date = $2 
        AND (start_time < $4 AND end_time > $3) 
        AND status IN ('confirmed', 'pending');
    `;
    
    let conflict;
    if (client) {
        conflict = await client.query(conflictQuery, [stadium_id, date, start_time, end_time]);
    } else {
        conflict = await execQuery(conflictQuery, [stadium_id, date, start_time, end_time]);
    }
    
    if (conflict && conflict.length > 0) {
        throw new Error('Time slot is already booked or conflicted.');
    }

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
    
    let newBooking;
    if (client) {
        const result = await client.query(bookingQuery, bookingValues);
        newBooking = result.rows[0];
        
        if (finalCompensationCode) {
            await client.query(`
                UPDATE compensation_codes 
                SET is_used = TRUE, used_at = NOW(), used_for_booking_id = $1 
                WHERE code_value = $2;
            `, [newBooking.id, finalCompensationCode]);
        }
    } else {
        newBooking = await execQueryOne(bookingQuery, bookingValues);
    }
    
    await createActivityLog(user_id, 'BOOKING_CREATE', `Created pending booking #${newBooking.id}`, newBooking.id, client);
    return newBooking;
}

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

async function confirmBooking(booking_id, user_id, client = null) {
    const query = `
        UPDATE bookings 
        SET status = 'confirmed'
        WHERE id = $1 AND status = 'pending'
        RETURNING *;
    `;
    
    let booking;
    if (client) {
        const result = await client.query(query, [booking_id]);
        booking = result.rows[0];
    } else {
        booking = await execQueryOne(query, [booking_id]);
    }
    
    if (booking) {
        await createActivityLog(user_id, 'BOOKING_CONFIRM', `Confirmed booking #${booking_id}`, booking_id, client);
    }
    return booking;
}

async function cancelBooking(booking_id, user_id, reason = 'user_cancellation', client = null) {
    const bookingQuery = `
        UPDATE bookings 
        SET status = 'cancelled' 
        WHERE id = $1 AND status != 'cancelled'
        RETURNING *;
    `;
    
    let booking;
    if (client) {
        const result = await client.query(bookingQuery, [booking_id]);
        booking = result.rows[0];
        
        if (booking && booking.deposit_paid > 0) {
            const newCode = `COMP-${uuidv4().substring(0, 8).toUpperCase()}`;
            const compensationQuery = `
                INSERT INTO compensation_codes (code_value, user_id, amount)
                VALUES ($1, $2, $3)
                RETURNING code_value;
            `;
            await client.query(compensationQuery, [newCode, booking.user_id, booking.deposit_paid]);
        }
    } else {
        booking = await execQueryOne(bookingQuery, [booking_id]);
    }
    
    if (booking) {
        await createActivityLog(user_id, 'BOOKING_CANCEL', `Cancelled booking #${booking_id}. Reason: ${reason}`, booking_id, client);
    }
    return booking;
}

// =======================================================
// ⏰ الساعات المحظورة
// =======================================================

async function blockTimeSlot(stadium_id, date, start_time, end_time, reason, user_id, client = null) {
    const query = `
        INSERT INTO blocked_slots (stadium_id, date, start_time, end_time, reason, blocked_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [stadium_id, date, start_time, end_time, reason, user_id];
    
    let blockedSlot;
    if (client) {
        const result = await client.query(query, values);
        blockedSlot = result.rows[0];
    } else {
        blockedSlot = await execQueryOne(query, values);
    }
    
    await createActivityLog(user_id, 'SLOT_BLOCK', `Blocked time slot on ${date} for stadium ${stadium_id}`, blockedSlot.id, client);
    return blockedSlot;
}

// =======================================================
// ⭐ التقييمات والمراجعات
// =======================================================

async function submitNewRating(stadium_id, user_id, rating, comment, client = null) {
    const query = `
        INSERT INTO ratings (stadium_id, user_id, rating, comment)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (stadium_id, user_id) DO UPDATE 
        SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = NOW()
        RETURNING *;
    `;
    const values = [stadium_id, user_id, rating, comment];
    
    let newRating;
    if (client) {
        const result = await client.query(query, values);
        newRating = result.rows[0];
    } else {
        newRating = await execQueryOne(query, values);
    }
    
    await createActivityLog(user_id, 'RATING_SUBMIT', `Submitted rating ${rating} for stadium ${stadium_id}`, stadium_id, client);
    return newRating;
}

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

async function canUserRateStadium(stadium_id, user_id, client = null) {
    const query = `
        SELECT 1 FROM bookings 
        WHERE stadium_id = $1 AND user_id = $2 AND status = 'confirmed' AND date < CURRENT_DATE
        LIMIT 1;
    `;
    
    let result;
    if (client) {
        result = await client.query(query, [stadium_id, user_id]);
    } else {
        result = await execQuery(query, [stadium_id, user_id]);
    }
    
    return result && result.length > 0;
}

// =======================================================
// 👥 طلبات اللاعبين الإضافيين
// =======================================================

async function createPlayerRequest(booking_id, requester_id, players_needed, details = null, client = null) {
    const query = `
        INSERT INTO player_requests (booking_id, requester_id, players_needed, details, status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING *;
    `;
    const values = [booking_id, requester_id, players_needed, details];
    
    let request;
    if (client) {
        const result = await client.query(query, values);
        request = result.rows[0];
    } else {
        request = await execQueryOne(query, values);
    }
    
    await createActivityLog(requester_id, 'PLAYER_REQUEST_CREATE', `Requested ${players_needed} players for booking ${booking_id}`, request.id, client);
    return request;
}

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

async function getPlayerRequestsForBooking(booking_id) {
    const query = `
        SELECT 
            pr.*,
            u.name as requester_name,
            u.avatar_url as requester_avatar
        FROM player_requests pr
        JOIN users u ON pr.requester_id = u.id
        WHERE pr.booking_id = $1 AND pr.status = 'active'
        ORDER BY pr.created_at DESC;
    `;
    return execQuery(query, [booking_id]);
}

async function joinPlayerRequest(request_id, player_id, client = null) {
    const joinQuery = `
        UPDATE player_requests 
        SET players_needed = players_needed - 1 
        WHERE id = $1 AND players_needed > 0
        RETURNING players_needed, requester_id;
    `;
    
    let result;
    if (client) {
        const queryResult = await client.query(joinQuery, [request_id]);
        result = queryResult.rows[0];
        
        if (result && result.players_needed === 0) {
            await client.query(`UPDATE player_requests SET status = 'completed' WHERE id = $1;`, [request_id]);
        }
    } else {
        result = await execQueryOne(joinQuery, [request_id]);
    }
    
    if (!result) {
        throw new Error('Could not join request or request is full/inactive.');
    }
    
    await createActivityLog(player_id, 'PLAYER_JOIN', `Joined player request #${request_id}. Remaining: ${result.players_needed}`, request_id, client);
    return result;
}

// =======================================================
// 🎫 أكواد التعويض
// =======================================================

async function createCompensationCode(user_id, amount, client = null) {
    const newCode = `COMP-${uuidv4().substring(0, 8).toUpperCase()}`;
    const query = `
        INSERT INTO compensation_codes (code_value, user_id, amount)
        VALUES ($1, $2, $3)
        RETURNING *;
    `;
    const values = [newCode, user_id, amount];
    
    let code;
    if (client) {
        const result = await client.query(query, values);
        code = result.rows[0];
    } else {
        code = await execQueryOne(query, values);
    }
    
    await createActivityLog(user_id, 'COMP_CODE_GENERATE', `Generated compensation code ${newCode} for amount ${amount}`, code.id, client);
    return code;
}

async function getValidCompensationCode(code_value, user_id) {
    const query = `
        SELECT * FROM compensation_codes 
        WHERE code_value = $1 AND user_id = $2 AND is_used = FALSE;
    `;
    return execQueryOne(query, [code_value, user_id]);
}

async function validateCode(code_value, stadium_id, user_id) {
    const code = await getValidCompensationCode(code_value, user_id);
    if (!code) {
        return { isValid: false, message: 'الكود غير صالح أو مستخدم مسبقاً' };
    }
    
    return {
        isValid: true,
        code_id: code.id,
        amount: code.amount,
        message: 'الكود صالح'
    };
}

async function updateCodeStatus(code_id, is_active, type, client = null) {
    const query = `
        UPDATE codes 
        SET is_active = $1, updated_at = NOW() 
        WHERE code_id = $2 AND code_type = $3
        RETURNING *;
    `;
    
    if (client) {
        const result = await client.query(query, [is_active, code_id, type]);
        return result.rows[0];
    } else {
        return execQueryOne(query, [is_active, code_id, type]);
    }
}

// =======================================================
// 💰 معالجة المدفوعات
// =======================================================

async function finalizePayment(booking_id, reference, amount, client = null) {
    const query = `
        UPDATE bookings 
        SET status = 'confirmed', payment_reference = $2, deposit_paid = $3, remaining_amount = total_price - $3
        WHERE booking_id = $1 AND status = 'pending_payment'
        RETURNING *;
    `;
    
    if (client) {
        const result = await client.query(query, [booking_id, reference, amount]);
        return result.rows[0];
    } else {
        return execQueryOne(query, [booking_id, reference, amount]);
    }
}

async function checkPaymentTransactionExists(provider_tx_id, client = null) {
    const query = `SELECT 1 FROM payment_transactions WHERE provider_tx_id = $1 LIMIT 1;`;
    
    if (client) {
        const result = await client.query(query, [provider_tx_id]);
        return result.rows.length > 0;
    } else {
        const result = await execQuery(query, [provider_tx_id]);
        return result.length > 0;
    }
}

async function recordPaymentTransaction(data, client = null) {
    const { provider_tx_id, booking_id, amount, status } = data;
    const query = `
        INSERT INTO payment_transactions (provider_tx_id, booking_id, amount, status)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    
    if (client) {
        const result = await client.query(query, [provider_tx_id, booking_id, amount, status]);
        return result.rows[0];
    } else {
        return execQueryOne(query, [provider_tx_id, booking_id, amount, status]);
    }
}

// =======================================================
// 📊 لوحة القيادة والإدارة
// =======================================================

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

async function getDashboardStats() {
    const totalUsers = await execQueryOne(`SELECT COUNT(*) as count FROM users;`);
    const totalStadiums = await execQueryOne(`SELECT COUNT(*) as count FROM stadiums;`);
    const totalBookings = await execQueryOne(`SELECT COUNT(*) as count FROM bookings;`);
    const pendingManagers = await execQueryOne(`SELECT COUNT(*) as count FROM users WHERE role IN ('manager', 'owner') AND is_approved = FALSE;`);
    
    return {
        totalUsers: parseInt(totalUsers.count),
        totalStadiums: parseInt(totalStadiums.count),
        totalBookings: parseInt(totalBookings.count),
        pendingManagers: parseInt(pendingManagers.count),
    };
}

// ===================================
// 📦 التصدير
// ===================================

module.exports = {
    // دوال مساعدة
    createActivityLog,
    comparePassword,
    
    // دوال المستخدمين والمصادقة
    getUserById,
    findUserByEmail,
    registerNewUser,
    loginUser,
    findOrCreateGoogleUser,
    getAllUsers,
    getPendingManagers,
    approveManager,
    
    // دوال إدارة الملاعب
    getStadiums,
    getStadiumById,
    getOwnerStadiums,
    getStadiumAverageRating,
    createStadium,
    updateStadium,
    
    // دوال الحجوزات
    getAvailableSlots,
    createBooking,
    getUserBookings,
    getStadiumBookings,
    confirmBooking,
    cancelBooking,
    
    // دوال الساعات المحظورة
    blockTimeSlot,
    
    // دوال التقييمات
    submitNewRating,
    getStadiumRatings,
    canUserRateStadium,
    
    // دوال طلبات اللاعبين
    createPlayerRequest,
    getActivePlayerRequests,
    getPlayerRequestsForBooking,
    joinPlayerRequest,
    
    // دوال أكواد التعويض
    createCompensationCode,
    getValidCompensationCode,
    validateCode,
    updateCodeStatus,
    
    // دوال المدفوعات
    finalizePayment,
    checkPaymentTransactionExists,
    recordPaymentTransaction,
    
    // دوال الإدارة
    getSystemActivityLogs,
    getDashboardStats,
};
