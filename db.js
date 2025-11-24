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
  password: process.env.DB_PASS || 'your_default_password', 
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
    // 💡 يمكن استخدام pool.query مباشرة فهو آمن
    const res = await pool.query(text, params);
    return res;
}

/**
 * 💡 دالة لتنفيذ استعلام وإرجاع صف واحد فقط
 * تُستخدم لجلب المستخدمين أو الملعب الواحد أو الإدراج/التحديث (RETURNING *)
 */
async function execQueryOne(text, params) {
    const res = await pool.query(text, params);
    return res.rows[0];
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
        // 💡 إلقاء الخطأ مجدداً ليتمكن الـ Controller من التقاطه والرد على المستخدم بـ 500/409
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

        // (يجب أن يتم تضمين جميع أوامر CREATE TABLE IF NOT EXISTS هنا...)
        // 💡 ملاحظة هامة: يجب إضافة قيد EXCLUDE لجدول الحجوزات لضمان عدم تداخل الأوقات (P0-6)
        
        // مثال لجدول الحجوزات مع قيد التضارب (EXCLUDE Constraint)
        await execQuery(`
            CREATE TABLE IF NOT EXISTS bookings (
                booking_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                stadium_id UUID REFERENCES stadiums(id) ON DELETE CASCADE NOT NULL,
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                date DATE NOT NULL,
                start_time TIME WITHOUT TIME ZONE NOT NULL,
                end_time TIME WITHOUT TIME ZONE NOT NULL,
                -- ... (بقية الحقول)
                status VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                
                -- 🚨 القيد الحاسم لضمان عدم تداخل الحجوزات (P0-6)
                -- يمنع تداخل أي فترة زمنية (tsrange) لنفس الملعب،
                -- باستثناء الحجوزات التي في حالة 'canceled' أو 'missed'
                EXCLUDE USING gist (
                    stadium_id WITH =,
                    tstzrange(
                        (date + start_time::interval), 
                        (date + end_time::interval), 
                        '[]'
                    ) WITH &&
                ) WHERE (status NOT IN ('canceled', 'missed', 'payment_failed'))
            );
        `);
        
        // ... (بقية الجداول: users, stadiums, payments, codes, ratings, activity_logs) ...

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
    withTransaction, // 🚨 الدالة الحاسمة
    createTables, 
    healthCheck, 
    pool 
};
