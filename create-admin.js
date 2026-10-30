// الاستخدام: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='كلمة-مرور-طويلة' node create-admin.js
const bcrypt = require('bcryptjs'); const db = require('./db');
const { ADMIN_EMAIL: e, ADMIN_PASSWORD: p } = process.env;
if (!e || !p || p.length < 12) { console.error('حدّد ADMIN_EMAIL و ADMIN_PASSWORD (12 حرفًا فأكثر).'); process.exit(1); }
if (db.prepare("SELECT 1 FROM users WHERE role='owner'").get()) { console.error('يوجد مالك بالفعل.'); process.exit(1); }
db.prepare("INSERT INTO users(email,hash,role) VALUES(?,?, 'owner')").run(e.toLowerCase(), bcrypt.hashSync(p, 12));
console.log('تم إنشاء حساب المالك.');
