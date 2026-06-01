const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'data', 'vacayyay.db');
const db      = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    avatar        TEXT    DEFAULT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS properties (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    title       TEXT    NOT NULL,
    location    TEXT    NOT NULL,
    price       INTEGER NOT NULL,
    rating      REAL    DEFAULT 0,
    reviews     INTEGER DEFAULT 0,
    badge       TEXT    DEFAULT 'New',
    badge_type  TEXT    DEFAULT 'new-spot',
    image       TEXT    NOT NULL,
    images      TEXT    DEFAULT '[]',
    category    TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    amenities   TEXT    DEFAULT '[]',
    host        TEXT    DEFAULT '{}',
    price_color TEXT    DEFAULT 'yellow',
    guests      INTEGER DEFAULT 2,
    bedrooms    INTEGER DEFAULT 1,
    beds        INTEGER DEFAULT 1,
    baths       INTEGER DEFAULT 1,
    lat         REAL,
    lng         REAL,
    highlights  TEXT    DEFAULT '[]',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_ref  TEXT    UNIQUE NOT NULL,
    user_id      INTEGER,
    property_id  INTEGER NOT NULL,
    checkin      TEXT    NOT NULL,
    checkout     TEXT    NOT NULL,
    guests       INTEGER DEFAULT 1,
    nights       INTEGER,
    subtotal     INTEGER,
    cleaning_fee INTEGER DEFAULT 75,
    service_fee  INTEGER,
    total        INTEGER,
    status       TEXT    DEFAULT 'confirmed',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)     REFERENCES users(id),
    FOREIGN KEY (property_id) REFERENCES properties(id)
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    user_id     INTEGER NOT NULL,
    property_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, property_id),
    FOREIGN KEY (user_id)     REFERENCES users(id),
    FOREIGN KEY (property_id) REFERENCES properties(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    property_id INTEGER NOT NULL,
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment     TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, property_id),
    FOREIGN KEY (user_id)     REFERENCES users(id),
    FOREIGN KEY (property_id) REFERENCES properties(id)
  );
`);

// ── Seed properties from JSON on first run ──────────────────────────────────
const seedCount = db.prepare('SELECT COUNT(*) as c FROM properties WHERE user_id IS NULL').get();
if (seedCount.c === 0) {
  const seedData = require('./data/properties.json');
  const ins = db.prepare(`
    INSERT INTO properties (
      user_id, title, location, price, rating, reviews,
      badge, badge_type, image, images, category, description,
      amenities, host, price_color, guests, bedrooms, beds, baths,
      lat, lng, highlights
    ) VALUES (
      NULL, @title, @location, @price, @rating, @reviews,
      @badge, @badgeType, @image, @images, @category, @description,
      @amenities, @host, @priceColor, @guests, @bedrooms, @beds, @baths,
      @lat, @lng, @highlights
    )
  `);
  const seedAll = db.transaction((props) => {
    for (const p of props) {
      ins.run({
        title: p.title, location: p.location, price: p.price,
        rating: p.rating, reviews: p.reviews,
        badge: p.badge, badgeType: p.badgeType,
        image: p.image,
        images:     JSON.stringify(p.images    || [p.image]),
        category:   p.category,
        description:p.description  || '',
        amenities:  JSON.stringify(p.amenities || []),
        host:       JSON.stringify(p.host      || {}),
        priceColor: p.priceColor   || 'yellow',
        guests: p.guests || 2, bedrooms: p.bedrooms || 1,
        beds: p.beds || 1, baths: p.baths || 1,
        lat: p.lat || null, lng: p.lng || null,
        highlights: JSON.stringify(p.highlights || []),
      });
    }
  });
  seedAll(seedData.properties);
  console.log(`✅ Seeded ${seedData.properties.length} properties into database`);
}

// ── Helper: parse a DB row into API-friendly shape ──────────────────────────
function safeJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function parseProperty(row) {
  if (!row) return null;
  return {
    ...row,
    badgeType:  row.badge_type,
    priceColor: row.price_color,
    images:     safeJSON(row.images,     [row.image]),
    amenities:  safeJSON(row.amenities,  []),
    host:       safeJSON(row.host,       {}),
    highlights: safeJSON(row.highlights, []),
  };
}

// Safe migrations for new columns
try { db.exec('ALTER TABLE properties ADD COLUMN contact_email TEXT DEFAULT NULL'); } catch {}

// Repair: drop reviews whose author no longer exists, then resync the rating/review
// counters on user-created listings so the header count matches the visible reviews.
// (Seeded demo listings keep their pre-set counters — they have no review rows.)
db.exec('DELETE FROM reviews WHERE user_id NOT IN (SELECT id FROM users)');
db.exec(`
  UPDATE properties SET
    reviews = (SELECT COUNT(*)               FROM reviews WHERE reviews.property_id = properties.id),
    rating  = COALESCE((SELECT ROUND(AVG(rating),2) FROM reviews WHERE reviews.property_id = properties.id), 0)
  WHERE user_id IS NOT NULL
`);

module.exports = { db, parseProperty };
