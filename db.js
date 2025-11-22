// db.js - PostgreSQL Database Connection, Helpers, and Schema Management

const { Pool } = require('pg');
require('dotenv').config();

/* ===================================
 * 1. إعدادات الاتصال الآمنة
 * =================================== */

// تكوين متقدم لـ PostgreSQL (يدعم DATABASE_URL للإنتاج أو المتغيرات المحلية)
const poolConfig = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false // قد تحتاج إلى true إذا كان لديك شهادة موثوقة
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

// إضافة الإعدادات المشتركة لإدارة الاتصالات
Object.assign(poolConfig, {
  max: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 10000,
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT) || 10000,
});

const pool = new Pool(poolConfig);

/* ===================================
 * 2. دوال مساعدة لتنفيذ الاستعلامات
 * =================================== */

/**
 * تنفيذ استعلام واحد وإرجاع صفوف متعددة (Rows)
 */
async function execQuery(text, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } catch (error) {
    console.error('❌ Database Query Error:', { query: text, params, message: error.message });
    throw error;
  } finally {
    client.release(); // إعادة الاتصال إلى المجمع (Pool)
  }
}

/**
 * تنفيذ استعلام واحد وإرجاع صف واحد (One Row)
 */
async function execQueryOne(text, params = []) {
  const rows = await execQuery(text, params);
  return rows[0] || null;
}

/**
 * دالة المعاملات الآمنة (Transactions)
 * تستخدم لضمان أن مجموعة من عمليات DB تتم ككتلة واحدة (إما كلها تنجح أو كلها تفشل)
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
    console.error('❌ Transaction Rolled Back:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/* ===================================
 * 3. إنشاء وتحديث الجداول (Schema)
 * =================================== */

async function createTables() {
  const createTablesQuery = `
    -- تمكين امتداد UUID
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    -- 1. جدول المستخدمين
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      google_id VARCHAR(255) UNIQUE,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255),
      phone VARCHAR(20) UNIQUE,
      role VARCHAR(50) DEFAULT 'player', -- 'player', 'owner', 'manager', 'admin'
      is_approved BOOLEAN DEFAULT FALSE,
      avatar_url VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. جدول الملاعب
    CREATE TABLE IF NOT EXISTS stadiums (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      location VARCHAR(255) NOT NULL,
      type VARCHAR(50), -- 'natural', 'artificial'
      price_per_hour DECIMAL(10, 2) NOT NULL,
      deposit_amount DECIMAL(10, 2) DEFAULT 0,
      image_url VARCHAR(255),
      features JSONB, -- [ "Wifi", "Cafeteria" ]
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. جدول الحجوزات
    CREATE TABLE IF NOT EXISTS bookings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
      stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      start_time TIME WITHOUT TIME ZONE NOT NULL,
      end_time TIME WITHOUT TIME ZONE NOT NULL,
      total_price DECIMAL(10, 2) NOT NULL,
      deposit_paid DECIMAL(10, 2) DEFAULT 0,
      remaining_amount DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'completed'
      payment_id VARCHAR(255),
      compensation_code VARCHAR(50),
      players_needed INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      -- ضمان عدم تضارب الحجز في نفس الملعب والوقت
      UNIQUE(stadium_id, date, start_time) 
    );

    -- 4. جدول الساعات المحظورة
    CREATE TABLE IF NOT EXISTS blocked_slots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      start_time TIME WITHOUT TIME ZONE NOT NULL,
      end_time TIME WITHOUT TIME ZONE NOT NULL,
      reason VARCHAR(255),
      blocked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      -- لمنع تضارب حظر الساعات
      UNIQUE(stadium_id, date, start_time) 
    );
    
    -- 5. جدول التقييمات
    CREATE TABLE IF NOT EXISTS ratings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(stadium_id, user_id)
    );

    -- 6. جدول سجل النشاط (Logs)
    CREATE TABLE IF NOT EXISTS activity_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      description TEXT,
      entity_id UUID,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. جدول طلبات اللاعبين الإضافيين (Player Requests) - مُستخلصة من كودك
    CREATE TABLE IF NOT EXISTS player_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
        requester_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        players_needed INT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active', 
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. جدول أكواد التعويض (Compensation Codes) - مُستخلصة من كودك
    CREATE TABLE IF NOT EXISTS compensation_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code_value VARCHAR(50) UNIQUE NOT NULL, -- الكود الفعلي (مثل COMP-XYZ123)
        user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- اللاعب المستفيد
        amount NUMERIC(10, 2) NOT NULL, -- قيمة التعويض (قيمة العربون المدفوع)
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP WITH TIME ZONE,
        used_for_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await execQuery(createTablesQuery);
  console.log('✅ All PostgreSQL tables checked/created successfully.');
}

/* ===================================
 * 4. فحص صحة الاتصال (Health Check)
 * =================================== */
async function healthCheck() {
  const result = await execQueryOne('SELECT NOW() as current_time, version() as version');
  return {
    status: 'healthy',
    database: 'connected',
    timestamp: result.current_time,
    version: result.version.split(' ')[0] // جلب رقم الإصدار فقط
  };
}

/* ===================================
 * 5. التصدير
 * =================================== */
module.exports = {
  pool,
  execQuery,
  execQueryOne,
  withTransaction,
  createTables,
  healthCheck,
};
