// db.js - PostgreSQL Database Connection & Advanced Helpers (النسخة النهائية والآمنة للتشغيل المتكرر)

const { Pool } = require('pg');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid'); 

// ===================================
// 1. تكوين الاتصال (Connection Configuration)
// ===================================

const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { 
    rejectUnauthorized: false 
  } : false
} : {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'your_default_password', 
  database: process.env.DB_NAME || 'ehgzly_db',
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: false 
};

Object.assign(poolConfig, {
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20, 
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
});

const pool = new Pool(poolConfig);


// ===================================
// 2. دوال تنفيذ الاستعلامات (Query Executors)
// ===================================

async function execQuery(text, params) {
    const { rows } = await pool.query(text, params);
    return rows;
}

async function execQueryOne(text, params) {
    const { rows } = await pool.query(text, params);
    return rows[0];
}

async function healthCheck() {
    const result = await execQueryOne('SELECT version();');
    return { status: 'ok', version: result ? result.version : 'unknown' };
}


// ===================================
// 3. دالة معالجة الـ Transactions الحيوية
// ===================================

/**
 * 🛡️ دالة مساعدة لتنفيذ مجموعة من العمليات داخل Transaction
 */
async function withTransaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error; 
    } finally {
        client.release();
    }
}


// ===================================
// 4. دالة إنشاء الجداول الكاملة (Create Tables)
// ===================================

async function createTables() {
    try {
        // يتم تنفيذ هذا الأمر مرة واحدة فقط إذا لم يكن الـ Extension موجوداً
        await execQuery(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

        // 1. جدول المستخدمين (Users)
        await execQuery(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255),
                phone VARCHAR(20),
                role VARCHAR(50) NOT NULL DEFAULT 'player', 
                is_approved BOOLEAN DEFAULT (CASE WHEN role = 'player' THEN TRUE ELSE FALSE END), 
                google_id VARCHAR(255) UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. جدول الملاعب (Stadiums)
        await execQuery(`
            CREATE TABLE IF NOT EXISTS stadiums (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) NOT NULL,
                location TEXT NOT NULL,
                description TEXT,
                price_per_hour NUMERIC(10, 2) NOT NULL,
                deposit_amount NUMERIC(10, 2) NOT NULL, 
                image_url TEXT,
                features JSONB, 
                type VARCHAR(50) NOT NULL, 
                is_active BOOLEAN DEFAULT TRUE,
                owner_id UUID REFERENCES users(id) ON DELETE RESTRICT, 
                average_rating NUMERIC(2, 1) DEFAULT 0.0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 3. جدول الحجوزات (Bookings) - (يحتوي على الـ GIST Index المتقدم)
        await execQuery(`
            CREATE TABLE IF NOT EXISTS bookings (
                booking_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE NOT NULL,
                date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                total_price NUMERIC(10, 2) NOT NULL,
                deposit_paid NUMERIC(10, 2) DEFAULT 0.0,
                remaining_amount NUMERIC(10, 2) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'booked_unconfirmed', 
                payment_reference VARCHAR(255), 
                code_used VARCHAR(50), 
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- ضمان عدم تضارب الحجوزات
                CONSTRAINT unique_booking_slot EXCLUDE USING gist (
                    stadium_id WITH =, 
                    tsrange(date + start_time, date + end_time) WITH &&
                ) WHERE (status IN ('booked_confirmed', 'booked_unconfirmed'))
            );
        `);
        
        // 4. جدول الأكواد (Codes) 
        await execQuery(`
            CREATE TABLE IF NOT EXISTS codes (
                code_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                code_value VARCHAR(50) UNIQUE NOT NULL, 
                user_id UUID REFERENCES users(id) ON DELETE CASCADE, 
                code_type VARCHAR(50) NOT NULL, 
                amount NUMERIC(10, 2) NOT NULL, 
                stadium_id UUID REFERENCES stadiums(id) ON DELETE SET NULL, 
                is_used BOOLEAN DEFAULT FALSE,
                used_at TIMESTAMP WITH TIME ZONE,
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 5. جدول حظر الساعات (Blocked Slots) 
        await execQuery(`
            CREATE TABLE IF NOT EXISTS blocked_slots (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE NOT NULL,
                date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                reason TEXT,
                blocked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 6. جدول التقييمات والمراجعات (Ratings)
        await execQuery(`
            CREATE TABLE IF NOT EXISTS ratings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE NOT NULL,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (stadium_id, user_id) 
            );
        `);

        // 7. جدول سجل النشاط (Activity Logs) 
        await execQuery(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE SET NULL, 
                action VARCHAR(100) NOT NULL, 
                description TEXT,
                entity_id UUID, 
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 8. جدول طلبات اللاعبين (Player Requests)
        await execQuery(`
            CREATE TABLE IF NOT EXISTS player_requests (
                request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                booking_id UUID REFERENCES bookings(booking_id) ON DELETE CASCADE NOT NULL,
                requester_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                players_needed INT NOT NULL,
                details TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'active', 
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // 9. جدول المشاركين في طلبات اللاعبين (Request Participants)
        await execQuery(`
            CREATE TABLE IF NOT EXISTS request_participants (
                request_id UUID REFERENCES player_requests(request_id) ON DELETE CASCADE NOT NULL,
                player_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (request_id, player_id)
            );
        `);


        console.log('✅ تم إنشاء أو التحقق من جميع جداول PostgreSQL بنجاح. لا توجد بيانات قديمة محذوفة.');
    } catch (error) {
        console.error('❌ خطأ فادح: فشل في إنشاء الجداول:', error.message);
        throw error;
    }
}


// ===================================
// 📝 التصدير (Export)
// ===================================

module.exports = { 
    execQuery, 
    execQueryOne, 
    withTransaction, 
    createTables, 
    healthCheck, 
    pool 
};
