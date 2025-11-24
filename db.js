// db.js - PostgreSQL Database Connection & Advanced Helpers (النسخة النهائية والآمنة للتشغيل المتكرر)

const { Pool } = require('pg');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid'); 

// ===================================
// 1. تكوين الاتصال (Connection Configuration)
// ===================================

const isProduction = process.env.NODE_ENV === 'production';

// يدعم اتصال Heroku/Render عبر DATABASE_URL أو التكوين المحلي
const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { 
    rejectUnauthorized: false 
  } : false
} : {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres', 
  database: process.env.DB_NAME || 'ehgzly_db',
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: false 
};

// إعدادات الأداء المتقدمة
Object.assign(poolConfig, {
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20, 
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 10000,
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 10000,
});

const pool = new Pool(poolConfig);

// ===================================
// 2. دوال تنفيذ الاستعلامات (Query Executors)
// ===================================

/**
 * 💡 دالة لتنفيذ استعلام وإرجاع النتيجة بالكامل
 * تُستخدم للاستعلامات العادية التي لا تحتاج لـ Transaction
 */
async function execQuery(text, params) {
    const res = await pool.query(text, params);
    return res.rows;
}

/**
 * 💡 دالة لتنفيذ استعلام وإرجاع صف واحد فقط
 * تُستخدم لجلب المستخدمين أو الملعب الواحد أو الإدراج/التحديث (RETURNING *)
 */
async function execQueryOne(text, params) {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
}

// ===================================
// 3. الدالة الحاسمة لإدارة المعاملات (P0-1 Fix)
// ===================================

/**
 * 🚨 الدالة الموثوقة لتغليف أي عملية قاعدة بيانات معقدة ضمن معاملة آمنة.
 * يجب أن تستدعى فقط من طبقة الـ Controllers.
 * @param {function(Client): Promise<any>} callback - دالة تحتوي على منطق DB وتستقبل الـ client
 * @returns {Promise<any>} - نتيجة الـ callback
 */
async function withTransaction(callback) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN'); // 1. بدء المعاملة
        
        // 2. تنفيذ منطق الـ Controller/Model
        const result = await callback(client); 
        
        await client.query('COMMIT'); // 3. نجاح: تثبيت المعاملة
        return result;
    } catch (err) {
        await client.query('ROLLBACK'); // 4. فشل: التراجع عن كل شيء
        throw err; 
    } finally {
        client.release(); // 5. تحرير الـ Client وإعادته للـ Pool (دائماً)
    }
}

// ===================================
// 4. إدارة مخطط قاعدة البيانات (Schema Management)
// ===================================

/**
 * دالة التحقق من صحة الاتصال
 */
async function healthCheck() {
  try {
    const result = await execQueryOne('SELECT NOW() as current_time, version() as version');
    return {
      status: 'healthy',
      database: 'connected',
      timestamp: result.current_time,
      version: result.version
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    };
  }
}

/**
 * دالة إنشاء جميع الجداول اللازمة (مُحسّنة للتشغيل المتكرر)
 */
async function createTables() {
    try {
        // تمكين امتداد UUID
        await execQuery(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
        await execQuery(`CREATE EXTENSION IF NOT EXISTS "btree_gist";`);

        // جدول المستخدمين
        await execQuery(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255),
                phone VARCHAR(20),
                role VARCHAR(20) NOT NULL DEFAULT 'player',
                is_approved BOOLEAN DEFAULT TRUE,
                google_id VARCHAR(100),
                avatar_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول الملاعب
        await execQuery(`
            CREATE TABLE IF NOT EXISTS stadiums (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                location TEXT NOT NULL,
                type VARCHAR(50) NOT NULL DEFAULT 'football',
                
                -- 🕒 الإعدادات الزمنية الجديدة
                opening_time TIME NOT NULL DEFAULT '08:00',
                closing_time TIME NOT NULL DEFAULT '22:00',
                slot_duration INTERVAL DEFAULT '1 hour',
                working_days JSONB DEFAULT '["saturday","sunday","monday","tuesday","wednesday","thursday","friday"]',
                
                price_per_hour DECIMAL(10,2) NOT NULL,
                deposit_amount DECIMAL(10,2) DEFAULT 0,
                image_url TEXT,
                features JSONB DEFAULT '[]',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 🆕 جدول تعيين الموظفين للملاعب
        await execQuery(`
            CREATE TABLE IF NOT EXISTS employee_assignments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE,
                role_in_field VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, stadium_id)
            );
        `);

        // 🆕 جدول الساعات المُولَّدة
        await execQuery(`
            CREATE TABLE IF NOT EXISTS generated_slots (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE,
                slot_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                status VARCHAR(40) DEFAULT 'available',
                booking_id UUID REFERENCES bookings(id),
                deposit_paid DECIMAL(10,2) DEFAULT 0,
                final_price DECIMAL(10,2) DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(stadium_id, slot_date, start_time)
            );
        `);

        // جدول الحجوزات مع قيد EXCLUDE لمنع التداخل
        await execQuery(`
            CREATE TABLE IF NOT EXISTS bookings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE NOT NULL,
                date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                total_price DECIMAL(10,2) NOT NULL,
                deposit_paid DECIMAL(10,2) DEFAULT 0,
                remaining_amount DECIMAL(10,2) DEFAULT 0,
                players_needed INTEGER DEFAULT 0,
                compensation_code VARCHAR(50),
                payment_reference VARCHAR(100),
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- 🚨 القيد الحاسم لضمان عدم تداخل الحجوزات
                EXCLUDE USING gist (
                    stadium_id WITH =,
                    tstzrange(
                        (date + start_time), 
                        (date + end_time)
                    ) WITH &&
                ) WHERE (status IN ('confirmed', 'pending'))
            );
        `);

        // 🆕 جدول الأكواد
        await execQuery(`
            CREATE TABLE IF NOT EXISTS discount_codes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                code VARCHAR(64) UNIQUE NOT NULL,
                type VARCHAR(20) NOT NULL,
                field_id UUID REFERENCES stadiums(id),
                amount DECIMAL(10,2),
                percent SMALLINT,
                is_active BOOLEAN DEFAULT TRUE,
                uses_left INT,
                created_by UUID REFERENCES users(id),
                expires_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول التقييمات
        await execQuery(`
            CREATE TABLE IF NOT EXISTS ratings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(stadium_id, user_id)
            );
        `);

        // جدول طلبات اللاعبين
        await execQuery(`
            CREATE TABLE IF NOT EXISTS player_requests (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
                requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
                players_needed INTEGER NOT NULL,
                details TEXT,
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول الساعات المحظورة
        await execQuery(`
            CREATE TABLE IF NOT EXISTS blocked_slots (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                reason TEXT,
                blocked_by_user_id UUID REFERENCES users(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول أكواد التعويض
        await execQuery(`
            CREATE TABLE IF NOT EXISTS compensation_codes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                code_value VARCHAR(50) UNIQUE NOT NULL,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                amount DECIMAL(10,2) NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                used_at TIMESTAMP WITH TIME ZONE,
                used_for_booking_id UUID REFERENCES bookings(id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول معاملات الدفع
        await execQuery(`
            CREATE TABLE IF NOT EXISTS payment_transactions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                provider_tx_id VARCHAR(100) UNIQUE NOT NULL,
                booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
                amount DECIMAL(10,2) NOT NULL,
                status VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول سجل النشاط
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
        
        console.log('✅ تم إنشاء أو التحقق من جميع جداول PostgreSQL بنجاح.');
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
