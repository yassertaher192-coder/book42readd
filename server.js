const fs = require('fs'), path = require('path'), crypto = require('crypto');
const express = require('express'), session = require('express-session'), helmet = require('helmet');
const bcrypt = require('bcryptjs'), multer = require('multer');
const db = require('./db');
if (fs.existsSync('.env')) for (const l of fs.readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) { console.error('اضبط SESSION_SECRET في .env'); process.exit(1); }
const prod = process.env.NODE_ENV === 'production';
const app = express();
if (prod) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'] } } }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(session({ name: 'sid', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict', secure: prod, maxAge: 864e5 * 7 } }));
app.use('/covers', express.static('uploads/covers', { index: false, dotfiles: 'deny' }));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nowIso = () => new Date().toISOString();
const VISIBLE = "(status='published' OR (status='scheduled' AND publish_at<=?))";
const STATUS_AR = { draft: 'مسودة', scheduled: 'مجدول', published: 'منشور' };
const AV_AR = { available: 'متوفر', upcoming: 'قادم', unavailable: 'غير متوفر' };

const CSS = `:root{--ink:#101010;--gold:#C6A15B;--ivory:#F4EFE5;--panel:#1a1816;--wood:#2a2119}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--ivory);font:17px/1.9 'IBM Plex Sans Arabic',system-ui,sans-serif}
h1,h2,h3{font-family:'Noto Naskh Arabic',serif;font-weight:700;margin:0 0 .5em}a{color:var(--gold)}
header,footer{padding:1.2rem 5vw;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}
header{border-bottom:1px solid #2c2a26}footer{border-top:1px solid #2c2a26;color:#a79f90;font-size:.9rem}
.brand{font:700 1.5rem 'Noto Naskh Arabic',serif;color:var(--gold);text-decoration:none}
main{padding:2rem 5vw;max-width:1100px;margin:auto}
.hero{padding:4rem 0 2rem;text-align:center;background:radial-gradient(ellipse at 50% 0,#3a2c1a55,transparent 70%)}
.hero h1{font-size:clamp(2rem,6vw,3.6rem);color:var(--gold)}
.shelf{display:flex;gap:1.6rem;flex-wrap:wrap;align-items:flex-end;padding:1.5rem 1.5rem 0;min-height:210px;border-bottom:14px solid var(--wood);box-shadow:0 18px 22px -14px #000;background:linear-gradient(#0000,#e8b86a10);margin:2rem 0}
.shelf.empty{justify-content:center;align-items:center;color:#a79f90;font-family:'Noto Naskh Arabic',serif;font-size:1.4rem}
.book{width:140px;text-align:center;text-decoration:none;color:var(--ivory);transition:transform .25s}
.book:hover,.book:focus-visible{transform:translateY(-10px)}
.book img,.ph{width:140px;height:200px;object-fit:cover;border-radius:2px 6px 6px 2px;box-shadow:-4px 6px 14px #000a;display:block}
.ph{background:var(--panel);border:1px solid #3a352d;display:flex;align-items:center;justify-content:center;padding:.5rem;font-family:'Noto Naskh Arabic',serif;color:var(--gold)}
.book span{display:block;font-size:.85rem;line-height:1.4;margin:.6rem 0}
.detail{display:grid;grid-template-columns:260px 1fr;gap:2rem}.detail .ph,.detail img{width:260px;height:380px}
@media(max-width:700px){.detail{grid-template-columns:1fr}.detail img,.detail .ph{margin:auto}}
.meta{color:#a79f90;display:grid;grid-template-columns:auto 1fr;gap:.2rem 1rem}
form.f{display:grid;gap:.9rem;max-width:640px}label{display:grid;gap:.3rem;font-size:.95rem}
input,select,textarea,button{font:inherit;padding:.6rem;background:var(--panel);color:var(--ivory);border:1px solid #3a352d;border-radius:4px}
button,.btn{background:var(--gold);color:var(--ink);border:0;cursor:pointer;font-weight:700;padding:.6rem 1.2rem;text-decoration:none;border-radius:4px;display:inline-block}
button.d{background:#7a2b2b;color:var(--ivory)}table{width:100%;border-collapse:collapse}td,th{padding:.6rem;border-bottom:1px solid #2c2a26;text-align:right}
.err{background:#4a1f1f;padding:.6rem 1rem;border-radius:4px}.ok{background:#1f3a2a;padding:.6rem 1rem;border-radius:4px}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px}@media(prefers-reduced-motion:reduce){*{transition:none!important}}`;
const page = (title, body, { desc = '', img = '', admin = false } = {}) => {
  const s = db.settings();
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${esc(s.site_name)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${img ? `<meta property="og:image" content="${esc(process.env.SITE_URL || '')}${esc(img)}">` : ''}
${admin ? '<meta name="robots" content="noindex">' : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&family=Noto+Naskh+Arabic:wght@700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><header><a class="brand" href="/">${esc(s.site_name)}</a><nav><a href="/books">جميع الإصدارات</a></nav></header><main>${body}</main>
<footer><span>${esc(s.author_name)}</span><span>${esc(s.site_name)}</span></footer></body></html>`;
};
const bookCard = b => `<a class="book" href="/book/${encodeURIComponent(b.slug)}">${b.cover ? `<img loading="lazy" src="/covers/${esc(b.cover)}" alt="غلاف ${esc(b.title)}">` : `<div class="ph">${esc(b.title)}</div>`}<span>${esc(b.title)}</span></a>`;
const shelf = (books, msg) => books.length ? `<div class="shelf">${books.map(bookCard).join('')}</div>` : `<div class="shelf empty">${esc(msg)}</div>`;
const listVisible = () => db.prepare(`SELECT * FROM books WHERE ${VISIBLE} ORDER BY sort, id DESC`).all(nowIso());

// ---------- العامة ----------
app.get('/', (req, res) => {
  const s = db.settings(), books = listVisible();
  res.send(page(s.site_name, `<section class="hero"><h1>${esc(s.site_name)}</h1><p>${esc(s.tagline)}</p><a class="btn" href="/books">تصفّح المكتبة</a></section>${shelf(books, s.empty_message)}`, { desc: s.tagline }));
});
app.get('/books', (req, res) => {
  const q = String(req.query.q || '').trim(), s = db.settings();
  let books = listVisible();
  if (q) books = books.filter(b => [b.title, b.author, b.summary, b.isbn].some(v => (v || '').includes(q)));
  res.send(page('جميع الإصدارات', `<h1>جميع الإصدارات</h1><form method="get"><input name="q" value="${esc(q)}" placeholder="ابحث بالعنوان أو المؤلف"> <button>بحث</button></form>${q && !books.length ? '<p>لا توجد نتائج مطابقة لبحثك.</p>' : shelf(books, s.empty_message)}`));
});
app.get('/book/:slug', (req, res, next) => {
  const b = db.prepare(`SELECT b.*, c.name cat FROM books b LEFT JOIN categories c ON c.id=b.category_id WHERE slug=? AND ${VISIBLE.replace(/status/g, 'b.status').replace(/publish_at/, 'b.publish_at')}`).get(req.params.slug, nowIso());
  if (!b) return next();
  const rows = [['المؤلف', b.author], ['التصنيف', b.cat], ['الناشر', b.publisher], ['سنة النشر', b.year], ['عدد الصفحات', b.pages], ['ISBN', b.isbn], ['الحالة', AV_AR[b.availability]]].filter(r => r[1]);
  res.send(page(b.title, `<div class="detail"><div>${b.cover ? `<img src="/covers/${esc(b.cover)}" alt="غلاف ${esc(b.title)}">` : `<div class="ph">${esc(b.title)}</div>`}</div>
<div><h1>${esc(b.title)}</h1><p>${esc(b.summary)}</p><div class="meta">${rows.map(r => `<b>${r[0]}</b><span>${esc(r[1])}</span>`).join('')}</div><p style="white-space:pre-wrap">${esc(b.description)}</p></div></div>`, { desc: b.summary, img: b.cover ? '/covers/' + b.cover : '' }));
});
app.get('/robots.txt', (q, r) => r.type('text').send(`User-agent: *\nDisallow: /admin\nSitemap: ${process.env.SITE_URL || ''}/sitemap.xml`));
app.get('/sitemap.xml', (q, r) => {
  const u = process.env.SITE_URL || '';
  r.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${u}/</loc></url>${listVisible().map(b => `<url><loc>${u}/book/${encodeURIComponent(b.slug)}</loc></url>`).join('')}</urlset>`);
});

// ---------- لوحة المطوّر ----------
const fails = new Map();
app.get('/admin/login', (req, res) => res.send(page('دخول', loginForm(), { admin: true })));
const loginForm = err => `<h1>لوحة المطوّر</h1>${err ? `<p class="err">${err}</p>` : ''}<form class="f" method="post" action="/admin/login"><label>البريد<input name="email" type="email" required autocomplete="username"></label><label>كلمة المرور<input name="password" type="password" required autocomplete="current-password"></label><button>دخول</button></form>`;
app.post('/admin/login', (req, res) => {
  const k = req.ip, f = fails.get(k) || { n: 0, t: Date.now() };
  if (Date.now() - f.t > 9e5) { f.n = 0; f.t = Date.now(); }
  if (f.n >= 5) return res.status(429).send(page('دخول', loginForm('محاولات كثيرة. حاول بعد 15 دقيقة.'), { admin: true }));
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email || '').toLowerCase());
  const ok = bcrypt.compareSync(String(req.body.password || ''), u ? u.hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!u || !ok || !['owner', 'editor'].includes(u.role)) { f.n++; fails.set(k, f); return res.status(401).send(page('دخول', loginForm('بيانات الدخول غير صحيحة.'), { admin: true })); }
  req.session.regenerate(() => {
    req.session.uid = u.id; req.session.csrf = crypto.randomBytes(24).toString('hex');
    audit(u.id, 'login'); res.redirect('/admin');
  });
});
const audit = (uid, action, detail) => db.prepare('INSERT INTO audit_logs(user_id,action,detail) VALUES(?,?,?)').run(uid, action, detail || null);
// التحقق من الصلاحية على الخادم وفي قاعدة البيانات عند كل طلب
const guard = (req, res, next) => {
  const u = req.session.uid && db.prepare('SELECT id,role FROM users WHERE id=?').get(req.session.uid);
  if (!u || !['owner', 'editor'].includes(u.role)) return res.redirect('/admin/login');
  req.user = u; next();
};
const csrf = (req, res, next) => (req.body && req.body._csrf === req.session.csrf) ? next() : res.status(403).send('رمز الحماية غير صالح');
const T = req => `<input type="hidden" name="_csrf" value="${req.session.csrf}">`;
const upload = multer({ dest: 'uploads/tmp', limits: { fileSize: 5 * 1024 * 1024 } });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAGIC = b => b[0] === 0xFF && b[1] === 0xD8 ? 'image/jpeg' : b.slice(1, 4).toString() === 'PNG' ? 'image/png' : (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') ? 'image/webp' : null;
const slugify = t => t.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'book';

app.get('/admin', guard, (req, res) => {
  const books = db.prepare('SELECT * FROM books ORDER BY sort, id DESC').all();
  const c = st => books.filter(b => b.status === st).length, msg = req.query.m ? `<p class="ok">${esc(req.query.m)}</p>` : '';
  res.send(page('لوحة المطوّر', `<h1>لوحة المطوّر</h1>${msg}<p>منشور: ${c('published')} · مسودات: ${c('draft')} · مجدول: ${c('scheduled')}</p>
<p><a class="btn" href="/admin/books/new">كتاب جديد</a> <a href="/admin/settings">إعدادات الموقع</a></p>
${books.length ? `<table><tr><th>العنوان</th><th>الحالة</th><th>الترتيب</th><th></th></tr>${books.map(b => `<tr><td>${esc(b.title)}</td><td>${STATUS_AR[b.status]}</td><td>${b.sort}</td><td><a href="/admin/books/${b.id}">تعديل</a></td></tr>`).join('')}</table>` : '<p>لا توجد كتب بعد. ابدأ بإضافة أول كتاب.</p>'}
<form method="post" action="/admin/logout">${T(req)}<button>خروج</button></form>`, { admin: true }));
});
app.post('/admin/logout', guard, csrf, (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

const bookForm = (req, b = {}, err) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const dt = b.publish_at ? b.publish_at.slice(0, 16) : '';
  return page(b.id ? 'تعديل كتاب' : 'كتاب جديد', `<h1>${b.id ? 'تعديل كتاب' : 'كتاب جديد'}</h1>${err ? `<p class="err">${esc(err)}</p>` : ''}
<form class="f" method="post" enctype="multipart/form-data" action="/admin/books/${b.id || 'new'}">
<label>العنوان *<input name="title" required maxlength="200" value="${esc(b.title)}"></label>
<label>المؤلف<input name="author" value="${esc(b.author || db.settings().author_name)}"></label>
<label>نبذة<textarea name="summary" rows="2">${esc(b.summary)}</textarea></label>
<label>الوصف<textarea name="description" rows="6">${esc(b.description)}</textarea></label>
<label>التصنيف<select name="category_id"><option value="">—</option>${cats.map(c => `<option value="${c.id}" ${b.category_id == c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
<label>تصنيف جديد<input name="new_category"></label>
<label>الصفحات<input name="pages" type="number" min="1" value="${esc(b.pages)}"></label><label>السنة<input name="year" type="number" value="${esc(b.year)}"></label>
<label>ISBN<input name="isbn" value="${esc(b.isbn)}"></label><label>الناشر<input name="publisher" value="${esc(b.publisher)}"></label>
<label>حالة الإصدار<select name="availability">${Object.entries(AV_AR).map(([k, v]) => `<option value="${k}" ${b.availability === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
<label>ترتيب الرف<input name="sort" type="number" value="${b.sort || 0}"></label>
<label>الغلاف (JPG/PNG/WebP، حتى 5MB)<input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label>
<label>حالة النشر<select name="status">${Object.entries(STATUS_AR).map(([k, v]) => `<option value="${k}" ${(b.status || 'draft') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
<label>تاريخ الجدولة (عند اختيار «مجدول»)<input name="publish_at" type="datetime-local" value="${esc(dt)}"></label>
${T(req)}<button>حفظ</button></form>
${b.id ? `<form method="post" action="/admin/books/${b.id}/delete" onsubmit="return confirm('حذف الكتاب نهائيًا؟')">${T(req)}<button class="d">حذف</button></form>` : ''}<p><a href="/admin">رجوع</a></p>`, { admin: true });
};
app.get('/admin/books/new', guard, (req, res) => res.send(bookForm(req)));
app.get('/admin/books/:id(\\d+)', guard, (req, res, next) => { const b = db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id); b ? res.send(bookForm(req, b)) : next(); });

const saveBook = (req, res) => {
  const f = req.body, id = req.params.id !== 'new' ? Number(req.params.id) : null;
  const old = id ? db.prepare('SELECT * FROM books WHERE id=?').get(id) : null;
  const tmp = req.file;
  const fail = m => { if (tmp) fs.unlink(tmp.path, () => {}); return res.status(400).send(bookForm(req, { ...old, ...f, id }, m)); };
  const title = String(f.title || '').trim();
  if (!title) return fail('العنوان مطلوب.');
  let cover = old ? old.cover : null;
  if (tmp) {
    const mime = MAGIC(fs.readFileSync(tmp.path).subarray(0, 12));
    if (!mime) return fail('نوع الملف غير مسموح. ارفع JPG أو PNG أو WebP.');
    cover = crypto.randomBytes(16).toString('hex') + EXT[mime];
    fs.renameSync(tmp.path, path.join('uploads/covers', cover));
  }
  let status = ['draft', 'scheduled', 'published'].includes(f.status) ? f.status : 'draft', pub = null;
  if (status === 'scheduled') { const d = new Date(f.publish_at); if (isNaN(d)) return fail('حدّد تاريخ الجدولة.'); pub = d.toISOString(); }
  let cat = f.category_id ? Number(f.category_id) : null;
  if (f.new_category && f.new_category.trim()) { db.prepare('INSERT OR IGNORE INTO categories(name) VALUES(?)').run(f.new_category.trim()); cat = db.prepare('SELECT id FROM categories WHERE name=?').get(f.new_category.trim()).id; }
  const n = v => (v === '' || v == null) ? null : Number(v);
  const v = [title, f.author || null, f.summary || null, f.description || null, cat, n(f.pages), n(f.year), f.isbn || null, f.publisher || null,
    ['available', 'upcoming', 'unavailable'].includes(f.availability) ? f.availability : 'available', cover, status, pub, Number(f.sort) || 0];
  try {
    if (old) {
      db.prepare("UPDATE books SET title=?,author=?,summary=?,description=?,category_id=?,pages=?,year=?,isbn=?,publisher=?,availability=?,cover=?,status=?,publish_at=?,sort=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(...v, id);
      if (tmp && old.cover) fs.unlink(path.join('uploads/covers', old.cover), () => {});
    } else {
      let slug = slugify(title); if (db.prepare('SELECT 1 FROM books WHERE slug=?').get(slug)) slug += '-' + Date.now().toString(36);
      db.prepare("INSERT INTO books(slug,title,author,summary,description,category_id,pages,year,isbn,publisher,availability,cover,status,publish_at,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(slug, ...v);
    }
  } catch (e) { return fail('تعذّر الحفظ: تحقق من قيم الحقول.'); }
  audit(req.user.id, old ? 'book.update' : 'book.create', title);
  res.redirect('/admin?m=' + encodeURIComponent('تم الحفظ'));
};
app.post('/admin/books/:id', guard, upload.single('cover'), csrf, saveBook);
app.post('/admin/books/:id(\\d+)/delete', guard, csrf, (req, res) => {
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(req.params.id);
  if (b) { db.prepare('DELETE FROM books WHERE id=?').run(b.id); if (b.cover) fs.unlink(path.join('uploads/covers', b.cover), () => {}); audit(req.user.id, 'book.delete', b.title); }
  res.redirect('/admin?m=' + encodeURIComponent('تم الحذف'));
});
app.get('/admin/settings', guard, (req, res) => {
  const s = db.settings(), L = { site_name: 'اسم الموقع', author_name: 'اسم المؤلف', tagline: 'العبارة التعريفية', empty_message: 'رسالة الرفوف الفارغة' };
  res.send(page('الإعدادات', `<h1>إعدادات الموقع</h1><form class="f" method="post">${Object.entries(L).map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(s[k])}"></label>`).join('')}${T(req)}<button>حفظ</button></form><p><a href="/admin">رجوع</a></p>`, { admin: true }));
});
app.post('/admin/settings', guard, csrf, (req, res) => {
  for (const k of ['site_name', 'author_name', 'tagline', 'empty_message']) if (k in req.body) db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(req.body[k]).slice(0, 300), k);
  audit(req.user.id, 'settings.update'); res.redirect('/admin?m=' + encodeURIComponent('تم حفظ الإعدادات'));
});

app.use((req, res) => res.status(404).send(page('غير موجود', '<h1>الصفحة غير موجودة</h1><p><a href="/">العودة إلى المكتبة</a></p>')));
app.use((err, req, res, next) => { console.error(err); res.status(500).send(page('خطأ', '<h1>حدث خطأ غير متوقع</h1>')); });
app.listen(process.env.PORT || 3000, () => console.log('running'));
