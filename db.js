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
