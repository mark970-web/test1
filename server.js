const express = require('express');
const path    = require('path');
const fs      = require('fs');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const multer  = require('multer');
const { db, parseProperty } = require('./db');

// ── File upload setup ────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_EXT  = /\.(jpg|jpeg|png|gif|webp|avif)$/i;
const ALLOWED_MIME = /^image\/(jpeg|png|gif|webp|avif)$/;

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `prop-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (ALLOWED_EXT.test(file.originalname) && ALLOWED_MIME.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files are allowed (JPG, JPEG, PNG, GIF, WEBP). Received: ${path.extname(file.originalname) || file.mimetype}`));
    }
  },
});

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vacayyay-secret-key-2025';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  // Always revalidate JS/CSS/HTML so code fixes propagate instead of being served stale from cache
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// ── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); } catch {}
  }
  next();
}

// ── Page Routes ──────────────────────────────────────────────────────────────
const V = (f) => path.join(__dirname, 'views', f);
app.get('/',              (_, r) => r.sendFile(V('index.html')));
app.get('/search',        (_, r) => r.sendFile(V('search.html')));
app.get('/property/:id',  (_, r) => r.sendFile(V('property.html')));
app.get('/dashboard',     (_, r) => r.sendFile(V('dashboard.html')));
app.get('/login',         (_, r) => r.sendFile(V('login.html')));
app.get('/register',      (_, r) => r.sendFile(V('register.html')));
app.get('/list-property', (_, r) => r.sendFile(V('list-property.html')));
app.get('/account',       (_, r) => r.sendFile(V('account.html')));
app.get('/terms',         (_, r) => r.sendFile(V('terms.html')));
app.get('/privacy',       (_, r) => r.sendFile(V('privacy.html')));

// ── API: Categories ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',        label: 'All',        icon: 'explore' },
  { id: 'cabins',     label: 'Cabins',     icon: 'cabin' },
  { id: 'treehouses', label: 'Treehouses', icon: 'park' },
  { id: 'villas',     label: 'Villas',     icon: 'villa' },
  { id: 'a-frames',   label: 'A-Frames',   icon: 'change_history' },
  { id: 'glamping',   label: 'Glamping',   icon: 'holiday_village' },
  { id: 'castles',    label: 'Castles',    icon: 'fort' },
  { id: 'islands',    label: 'Islands',    icon: 'waves' },
  { id: 'beachfront', label: 'Beachfront', icon: 'beach_access' },
];
app.get('/api/categories', (_, res) => res.json(CATEGORIES));

// ── API: Image Upload ────────────────────────────────────────────────────────
app.post('/api/upload', requireAuth, (req, res) => {
  upload.array('images', 4)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large — max 10 MB per image.'
        : err.message;
      return res.status(400).json({ error: msg });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'No files uploaded.' });

    const urls = req.files.map(f => `/uploads/${f.filename}`);
    res.json({ urls });
  });
});

// ── Property query builder ────────────────────────────────────────────────────
function buildQuery({ category, minPrice, maxPrice, sort, q, location } = {}) {
  let sql    = 'SELECT * FROM properties WHERE 1=1';
  const params = {};
  if (category && category !== 'all') {
    sql += ' AND LOWER(category) = LOWER(@category)';
    params.category = category;
  }
  if (minPrice) { sql += ' AND price >= @minPrice'; params.minPrice = +minPrice; }
  if (maxPrice) { sql += ' AND price <= @maxPrice'; params.maxPrice = +maxPrice; }
  if (q) {
    sql += ' AND (LOWER(title) LIKE @q OR LOWER(location) LIKE @q OR LOWER(category) LIKE @q OR LOWER(description) LIKE @q)';
    params.q = `%${q.toLowerCase()}%`;
  }
  if (location) {
    sql += ' AND LOWER(location) LIKE @loc';
    params.loc = `%${location.toLowerCase()}%`;
  }
  if (sort === 'price-asc')  sql += ' ORDER BY price ASC';
  else if (sort === 'price-desc') sql += ' ORDER BY price DESC';
  else if (sort === 'rating')     sql += ' ORDER BY rating DESC';
  else                            sql += ' ORDER BY created_at DESC';
  return { sql, params };
}

// ── API: Properties ──────────────────────────────────────────────────────────
app.get('/api/properties', (req, res) => {
  const { sql, params } = buildQuery(req.query);
  const rows = db.prepare(sql).all(params).map(parseProperty);
  res.json({ properties: rows, total: rows.length });
});

app.get('/api/properties/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Property not found' });
  res.json(parseProperty(row));
});

// ── API: Search ───────────────────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const { sql, params } = buildQuery(req.query);
  const rows = db.prepare(sql).all(params).map(parseProperty);
  res.json({ properties: rows, total: rows.length, query: req.query.q || req.query.location || '' });
});

// ── API: Create Property ─────────────────────────────────────────────────────
app.post('/api/properties', requireAuth, (req, res) => {
  const { title, location, price, category, description, image, images, amenities, guests, bedrooms, beds, baths, lat, lng, contact_email } = req.body;
  if (!title || !location || !price || !category || !image)
    return res.status(400).json({ error: 'title, location, price, category, and image are required' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const host = { name: user.name, avatar: user.avatar, rating: 5.0, reviews: 0, superhost: false, years: 0 };
  const allImages = [image, ...(Array.isArray(images) ? images : []).filter(Boolean)];
  const colors = ['yellow', 'teal', 'pink'];
  const priceColor = colors[Math.floor(Math.random() * colors.length)];

  const result = db.prepare(`
    INSERT INTO properties (
      user_id, title, location, price, rating, reviews,
      badge, badge_type, image, images, category, description,
      amenities, host, price_color,
      guests, bedrooms, beds, baths, lat, lng, highlights, contact_email
    ) VALUES (
      @userId, @title, @location, @price, 0, 0,
      'New', 'new-spot', @image, @images, @category, @description,
      @amenities, @host, @priceColor,
      @guests, @bedrooms, @beds, @baths, @lat, @lng, @highlights, @contactEmail
    )
  `).run({
    userId: user.id, title, location, price: +price,
    image, images: JSON.stringify(allImages),
    category, description: description || '',
    amenities: JSON.stringify(amenities || []),
    host: JSON.stringify(host),
    priceColor,
    guests: +guests || 2, bedrooms: +bedrooms || 1,
    beds: +beds || 1, baths: +baths || 1,
    lat: lat ? +lat : null, lng: lng ? +lng : null,
    highlights: JSON.stringify(['New listing']),
    contactEmail: contact_email || null,
  });

  res.status(201).json(parseProperty(db.prepare('SELECT * FROM properties WHERE id = ?').get(result.lastInsertRowid)));
});

// ── API: My Properties ────────────────────────────────────────────────────────
app.get('/api/my-properties', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM properties WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ properties: rows.map(parseProperty) });
});

app.delete('/api/properties/:id', requireAuth, (req, res) => {
  const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Not found' });
  if (prop.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM wishlists WHERE property_id = ?').run(req.params.id);
  db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── API: Auth ────────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim()))
    return res.status(409).json({ error: 'An account with this email already exists' });

  const hash = bcrypt.hashSync(password, 10);

  const result = db.prepare('INSERT INTO users (name, email, password_hash, avatar) VALUES (?, ?, ?, NULL)')
    .run(name.trim(), email.toLowerCase().trim(), hash);

  const token = jwt.sign({ id: result.lastInsertRowid, email: email.toLowerCase(), name: name.trim() }, JWT_SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase(), avatar: null } });
});

// ── API: Bookings ────────────────────────────────────────────────────────────
app.post('/api/bookings', optionalAuth, (req, res) => {
  const { propertyId, checkin, checkout, guests } = req.body;
  if (!propertyId || !checkin || !checkout)
    return res.status(400).json({ error: 'propertyId, checkin, and checkout are required' });

  const prop = parseProperty(db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId));
  if (!prop) return res.status(404).json({ error: 'Property not found' });

  const nights     = Math.max(1, Math.ceil((new Date(checkout) - new Date(checkin)) / 86400000));
  const subtotal   = prop.price * nights;
  const cleaning   = 75;
  const serviceFee = Math.round(subtotal * 0.12);
  const total      = subtotal + cleaning + serviceFee;
  const bookingRef = `VY-${Date.now()}`;

  db.prepare(`
    INSERT INTO bookings (booking_ref, user_id, property_id, checkin, checkout, guests, nights, subtotal, cleaning_fee, service_fee, total, status)
    VALUES (@ref, @uid, @pid, @ci, @co, @guests, @nights, @sub, @clean, @svc, @total, 'confirmed')
  `).run({ ref: bookingRef, uid: req.user?.id || null, pid: +propertyId, ci: checkin, co: checkout, guests: guests || 1, nights, sub: subtotal, clean: cleaning, svc: serviceFee, total });

  res.json({ bookingId: bookingRef, property: prop.title, location: prop.location, image: prop.image, checkin, checkout, nights, guests: guests || 1, subtotal, cleaning, serviceFee, total, status: 'confirmed' });
});

app.get('/api/bookings', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, p.title, p.location, p.image
    FROM bookings b JOIN properties p ON p.id = b.property_id
    WHERE b.user_id = ? ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json({ bookings: rows });
});

// ── API: Wishlists ────────────────────────────────────────────────────────────
app.get('/api/wishlist', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT p.* FROM properties p JOIN wishlists w ON w.property_id = p.id WHERE w.user_id = ?`).all(req.user.id);
  res.json({ properties: rows.map(parseProperty) });
});

app.get('/api/wishlist/ids', requireAuth, (req, res) => {
  const ids = db.prepare('SELECT property_id FROM wishlists WHERE user_id = ?').all(req.user.id).map(r => r.property_id);
  res.json({ ids });
});

app.post('/api/wishlist/:propertyId', requireAuth, (req, res) => {
  const pid = +req.params.propertyId;
  db.prepare('INSERT OR IGNORE INTO wishlists (user_id, property_id) VALUES (?, ?)').run(req.user.id, pid);
  const ids = db.prepare('SELECT property_id FROM wishlists WHERE user_id = ?').all(req.user.id).map(r => r.property_id);
  res.json({ wishlist: ids });
});

app.delete('/api/wishlist/:propertyId', requireAuth, (req, res) => {
  const pid = +req.params.propertyId;
  db.prepare('DELETE FROM wishlists WHERE user_id = ? AND property_id = ?').run(req.user.id, pid);
  const ids = db.prepare('SELECT property_id FROM wishlists WHERE user_id = ?').all(req.user.id).map(r => r.property_id);
  res.json({ wishlist: ids });
});

// ── API: Avatar Upload ────────────────────────────────────────────────────────
app.post('/api/user/avatar', requireAuth, (req, res) => {
  upload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large — max 10 MB.' : err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const url = `/uploads/${req.file.filename}`;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.user.id);
    res.json({ avatar: url });
  });
});

// ── API: Account management ────────────────────────────────────────────────────
app.put('/api/user/email', requireAuth, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'New email and current password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Current password is incorrect.' });

  const newEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(newEmail);
  if (existing && existing.id !== user.id)
    return res.status(409).json({ error: 'That email is already in use by another account.' });

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, user.id);
  // Re-issue token since it embeds the email
  const token = jwt.sign({ id: user.id, email: newEmail, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, email: newEmail, avatar: user.avatar } });
});

app.put('/api/user/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new passwords are required.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash))
    return res.status(401).json({ error: 'Current password is incorrect.' });

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
  res.json({ success: true });
});

app.delete('/api/user/account', requireAuth, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password is required to delete your account.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Password is incorrect.' });

  const uid = user.id;
  const wipe = db.transaction(() => {
    const myProps = db.prepare('SELECT id FROM properties WHERE user_id = ?').all(uid).map(r => r.id);
    // Other people's listings this user reviewed — their counters must be recalculated after
    const reviewedProps = db.prepare('SELECT DISTINCT property_id FROM reviews WHERE user_id = ?')
      .all(uid).map(r => r.property_id);

    // Remove dependent rows tied to this user's own listings first
    for (const pid of myProps) {
      db.prepare('DELETE FROM reviews   WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM wishlists WHERE property_id = ?').run(pid);
      db.prepare('DELETE FROM bookings  WHERE property_id = ?').run(pid);
    }
    // Remove this user's own activity
    db.prepare('DELETE FROM reviews   WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM wishlists WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM bookings  WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM properties WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);

    // Recalculate rating/review counts on surviving listings this user had reviewed
    for (const pid of reviewedProps) {
      if (myProps.includes(pid)) continue; // those were deleted
      const s = db.prepare('SELECT ROUND(AVG(rating),2) avg, COUNT(*) cnt FROM reviews WHERE property_id = ?').get(pid);
      db.prepare('UPDATE properties SET rating = ?, reviews = ? WHERE id = ?').run(s.cnt ? s.avg : 0, s.cnt, pid);
    }
  });
  wipe();
  res.json({ success: true });
});

// ── API: Host contact email ───────────────────────────────────────────────────
app.get('/api/properties/:id/host-email', requireAuth, (req, res) => {
  const prop = db.prepare('SELECT user_id, contact_email FROM properties WHERE id = ?').get(req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  // Use property-specific contact email first; fall back to account email
  let email = prop.contact_email;
  if (!email && prop.user_id) {
    email = db.prepare('SELECT email FROM users WHERE id = ?').get(prop.user_id)?.email;
  }
  if (!email) return res.status(404).json({ error: 'No host contact available for this property' });
  res.json({ email });
});

// ── API: Booked date ranges for a property ────────────────────────────────────
app.get('/api/properties/:id/booked-dates', (req, res) => {
  const rows = db.prepare(
    "SELECT checkin, checkout FROM bookings WHERE property_id = ? AND checkout >= date('now') AND status = 'confirmed'"
  ).all(req.params.id);
  res.json({ bookings: rows });
});

// ── API: Reviews ─────────────────────────────────────────────────────────────
app.get('/api/properties/:id/reviews', (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.user_id, r.rating, r.comment, r.created_at,
           u.name, u.avatar
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.property_id = ?
    ORDER BY r.created_at DESC
  `).all(req.params.id);
  res.json({ reviews: rows });
});

app.post('/api/properties/:id/reviews', requireAuth, (req, res) => {
  const { rating, comment } = req.body;
  const pid = +req.params.id;
  if (!rating || !comment?.trim()) return res.status(400).json({ error: 'Rating and comment are required.' });
  if (rating < 1 || rating > 5)   return res.status(400).json({ error: 'Rating must be 1–5.' });

  const prop = db.prepare('SELECT id FROM properties WHERE id = ?').get(pid);
  if (!prop) return res.status(404).json({ error: 'Property not found.' });

  try {
    db.prepare('INSERT INTO reviews (user_id, property_id, rating, comment) VALUES (?, ?, ?, ?)')
      .run(req.user.id, pid, rating, comment.trim());
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'You have already reviewed this property.' });
    throw e;
  }

  // Recalculate property rating and review count
  const stats = db.prepare('SELECT ROUND(AVG(rating),2) as avg, COUNT(*) as cnt FROM reviews WHERE property_id = ?').get(pid);
  db.prepare('UPDATE properties SET rating = ?, reviews = ? WHERE id = ?').run(stats.avg, stats.cnt, pid);

  const review = db.prepare(`
    SELECT r.id, r.user_id, r.rating, r.comment, r.created_at, u.name, u.avatar
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.id = last_insert_rowid()
  `).get();
  res.status(201).json({ review, rating: stats.avg, reviewCount: stats.cnt });
});

app.listen(PORT, () => {
  console.log(`\n🌴 VacayYay is live at http://localhost:${PORT}\n`);
});
