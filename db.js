// db.js - PostgreSQL Database Connection & Helpers

const { Pool } = require('pg');
require('dotenv').config();

// تكوين متقدم لـ PostgreSQL
const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false
} : {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ehgzly_db',
  port: parseInt(process.env.DB_PORT) || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false
};

// إضافة الإعدادات المشتركة
Object.assign(poolConfig, {
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 10000,
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 10000,
});

const pool = new Pool(poolConfig);


// ===================================
// دوال مساعدة للاستعلام
// ===================================

/**
 * تنفيذ استعلام واحد وإرجاع صفوف متعددة
 */
async function execQuery(text, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } catch (error) {
    console.error('❌ Database Query Error:', text, params, error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * تنفيذ استعلام واحد وإرجاع صف واحد
 */
async function execQueryOne(text, params = []) {
  const rows = await execQuery(text, params);
  return rows[0] || null;
}

/**
 * دالة المعاملات الآمنة (Transactions)
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
    console.error('❌ Transaction Error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// ===================================
// إنشاء الجداول (مُستخرج من server.js القديم)
// ===================================
async function createTables() {
  const createTablesQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      google_id VARCHAR(255) UNIQUE,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255),
      phone VARCHAR(20) UNIQUE,
      role VARCHAR(50) DEFAULT 'player', -- 'player', 'owner', 'manager', 'admin'
      is_approved BOOLEAN DEFAULT FALSE,
      avatar_url VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stadiums (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      location VARCHAR(255) NOT NULL,
      type VARCHAR(50), -- 'natural', 'artificial'
      price_per_hour DECIMAL(10, 2) NOT NULL,
      deposit_amount DECIMAL(10, 2) DEFAULT 0,
      image_url VARCHAR(255),
      features JSONB, -- [ "Wifi", "Cafeteria" ]
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      total_price DECIMAL(10, 2) NOT NULL,
      deposit_paid DECIMAL(10, 2) DEFAULT 0,
      remaining_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'completed'
      payment_id VARCHAR(255),
      compensation_code VARCHAR(50),
      players_needed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blocked_slots (
      id SERIAL PRIMARY KEY,
      stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      reason VARCHAR(255),
      blocked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(stadium_id, date, start_time) -- لمنع تضارب حظر الساعات
    );
    
    CREATE TABLE IF NOT EXISTS ratings (
      id SERIAL PRIMARY KEY,
      stadium_id INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(stadium_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL, -- مثال: BOOKING_CONFIRMED, PROFILE_UPDATED
      description TEXT,
      entity_id INTEGER, -- (مثال: id الحجز أو الملعب)
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    -- يمكنك إضافة جدول managers_stadiums إذا كنت تدعم عدة مدراء لملعب واحد
  `;
  await execQuery(createTablesQuery);
  console.log('✅ All PostgreSQL tables checked/created successfully');
}

// دالة لفحص صحة الاتصال
async function healthCheck() {
  const result = await execQueryOne('SELECT NOW() as current_time, version() as version');
  return {
    status: 'healthy',
    database: 'connected',
    timestamp: result.current_time,
    version: result.version
  };
}


module.exports = {
  pool,
  execQuery,
  execQueryOne,
  withTransaction,
  createTables,
  healthCheck,
};
// db.js
const { Pool } = require('pg');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid'); // لاستخدام UUID في إنشاء الجداول

// تكوين الاتصال بقاعدة البيانات
const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
} : {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'secret', // بناءً على المستند القديم
  database: process.env.DB_NAME || 'sports_booking',
  port: parseInt(process.env.DB_PORT) || 5432,
};

const pool = new Pool(poolConfig);

/**
 * دالة لتنفيذ أي استعلام على قاعدة البيانات
 */
async function execQuery(text, params) {
    const client = await pool.connect();
    try {
        const res = await client.query(text, params);
        return res;
    } finally {
        client.release();
    }
}

/**
 * دالة لإنشاء الجداول الأساسية (بما في ذلك جدول المستخدمين)
 */
async function createTables() {
    try {
        console.log('⏳ Starting table creation...');
        
        // يجب تفعيل إضافة uuid-ossp في قاعدة البيانات أولاً: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        
        await execQuery(`
            -- جدول المستخدمين
            CREATE TABLE IF NOT EXISTS users (
                user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                -- role: player, employee, owner, admin
                role VARCHAR(50) NOT NULL DEFAULT 'player', 
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- إضافة جدول لضمان دالة uuid_generate_v4() تعمل
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
            
            -- يمكنك إضافة باقي جداول المشروع هنا (fields, field_slots, bookings, etc.)
        `);

        console.log('✅ All PostgreSQL tables created successfully');
    } catch (error) {
        console.error('❌ Error creating tables:', error.message);
        throw error;
    }
}

// دالة لاختبار الاتصال (مستخدمة في server.js)
async function healthCheck() {
    try {
        await execQuery('SELECT 1');
        return { status: 'healthy', database: 'connected' };
    } catch (error) {
        return { status: 'unhealthy', database: 'disconnected', error: error.message };
    }
}
// ... (الكود الأصلي لـ db.js) ...
// db.js (داخل دالة createTables)

// 12. Activity Logs Table (لتتبع جميع العمليات الإدارية والمهمة)
await execQuery(`
    CREATE TABLE IF NOT EXISTS activity_logs (
        log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL, -- نوع الحدث (مثل BOOKING_CONFIRMED, USER_ROLE_UPDATED)
        description TEXT,
        related_id UUID, -- معرف الكيان المرتبط (حجز، ملعب، مستخدم)
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
`);

async function createTables() {
    try {
        console.log('⏳ Starting table creation...');
        
        await execQuery(`
            -- تأكيد وجود إضافة UUID
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

            -- 1. جدول المستخدمين (Users) (تم إنشاؤه سابقاً)
            CREATE TABLE IF NOT EXISTS users (
                user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'player', 
                phone VARCHAR(20),
                profile_picture_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- 2. جدول الملاعب (Fields)
            CREATE TABLE IF NOT EXISTS fields (
                field_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(255) NOT NULL,
                location TEXT,
                area VARCHAR(100),
                type VARCHAR(50), 
                price_per_hour NUMERIC(10, 2) NOT NULL,
                deposit_amount NUMERIC(10, 2) DEFAULT 0, 
                owner_id UUID REFERENCES users(user_id),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- 3. جدول الحجوزات (Bookings)
            CREATE TABLE IF NOT EXISTS bookings (
                booking_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                field_id UUID REFERENCES fields(field_id) NOT NULL,
                player_id UUID REFERENCES users(user_id) NOT NULL,
                booking_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'booked_unconfirmed', 
                deposit_paid BOOLEAN DEFAULT FALSE,
                total_amount NUMERIC(10, 2) NOT NULL,
                deposit_amount NUMERIC(10, 2) NOT NULL,
                payment_reference VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- 4. جدول طلبات الانضمام (Player Requests - لـ 'لاعبوني معاكم')
            CREATE TABLE IF NOT EXISTS player_requests (
                request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                booking_id UUID REFERENCES bookings(booking_id) NOT NULL,
                requester_id UUID REFERENCES users(user_id) NOT NULL,
                players_needed INT NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'active', 
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- (إضافة باقي الجداول الضرورية في مشروعك)
        `);

        console.log('✅ All PostgreSQL tables created successfully');
    } catch (error) {
        console.error('❌ Error creating tables:', error.message);
        throw error;
    }
}

// ... (بقية db.js) ...

module.exports = { execQuery, createTables, healthCheck, pool };

// db.js (داخل دالة createTables)

// 13. Compensation Codes Table (أكواد التعويض للاعبين)
await execQuery(`
    CREATE TABLE IF NOT EXISTS compensation_codes (
        code_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code_value VARCHAR(50) UNIQUE NOT NULL, -- الكود الفعلي (مثل COMP-XYZ123)
        user_id UUID REFERENCES users(user_id) ON DELETE CASCADE, -- اللاعب المستفيد
        amount NUMERIC(10, 2) NOT NULL, -- قيمة التعويض (قيمة العربون المدفوع)
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP WITH TIME ZONE,
        used_for_booking_id UUID REFERENCES bookings(booking_id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
`);
