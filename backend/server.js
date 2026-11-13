require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const app  = express();
// Hostinger (and most hosts) inject PORT; keep 5000 for local XAMPP/dev.
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

// ── DB Connection ──
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'aguadoc',
  port:     Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
});

// Test connection on startup
pool.getConnection()
  .then(conn => { console.log('✅ MySQL connected!'); conn.release(); })
  .catch(err => console.error('❌ MySQL connection failed:', err.message));

// ── Helper ──
const id = () => Date.now().toString();

// ── Geocoding (Nominatim / OpenStreetMap — free, no API key needed) ──
// Nominatim's usage policy requires a real User-Agent and asks for max ~1 request/sec,
// which is fine here since this only runs once per order placed.
const GEO_UA = { 'User-Agent': 'AguaDoc-Capstone/1.0 (school project)' };

async function geocodeAddress(address) {
  if (!address) return { lat: null, lng: null };
  const q = `${address}, Lapu-Lapu City, Cebu, Philippines`;

  // Prefer Geoapify when configured
  try {
    const key = await getSetting('geoapify_api_key');
    if (key) {
      const url =
        `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q)}` +
        `&filter=countrycode:ph&limit=1&apiKey=${encodeURIComponent(key)}`;
      const geoRes = await fetch(url);
      const data = await geoRes.json();
      const hit = data?.features?.[0];
      if (hit?.geometry?.coordinates) {
        const [lng, lat] = hit.geometry.coordinates;
        return { lat: Number(lat), lng: Number(lng) };
      }
    }
  } catch (err) {
    console.warn('Geoapify geocode failed:', err.message);
  }

  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: GEO_UA }
    );
    const results = await geoRes.json();
    if (results[0]) {
      return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    }
  } catch (err) {
    console.warn('Geocoding failed for address:', address, err.message);
  }
  return { lat: null, lng: null };
}

async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  try {
    const key = await getSetting('geoapify_api_key');
    if (key) {
      const url =
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}` +
        `&apiKey=${encodeURIComponent(key)}`;
      const geoRes = await fetch(url);
      const data = await geoRes.json();
      const label = data?.features?.[0]?.properties?.formatted;
      if (label) return label;
    }
  } catch (err) {
    console.warn('Geoapify reverse geocode failed:', err.message);
  }

  try {
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: GEO_UA }
    );
    const data = await geoRes.json();
    return data.display_name || null;
  } catch (err) {
    console.warn('Reverse geocoding failed:', err.message);
    return null;
  }
}

// Prefer an explicit map pin; fall back to geocoding the address text.
async function resolveCoords({ lat, lng, address }) {
  const pinLat = lat != null && lat !== '' ? parseFloat(lat) : NaN;
  const pinLng = lng != null && lng !== '' ? parseFloat(lng) : NaN;
  if (Number.isFinite(pinLat) && Number.isFinite(pinLng)) {
    return { lat: pinLat, lng: pinLng };
  }
  return geocodeAddress(address);
}

// Your refill station's coordinates — used as the route's starting point.
// TODO: replace with AguaDoc's actual station location in Barangay Pajo.
const DEPOT = { lat: 10.3157, lng: 123.9740, name: 'AguaDoc Station' };

// Public OSRM mirrors — project-osrm.org is free but flaky (rate limits / timeouts).
const OSRM_BASES = [
  'https://router.project-osrm.org',
  'http://router.project-osrm.org',
];

function straightLineGeometry(points) {
  // points: [{lat,lng}, ...] → [[lng,lat], ...]
  return points
    .filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
    .map((p) => [Number(p.lng), Number(p.lat)]);
}

function haversineM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function fetchOsrmJson(pathAndQuery, { attempts = 3 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const base of OSRM_BASES) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(`${base}${pathAndQuery}`, {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timer);
        if (!res.ok) {
          lastErr = new Error(`OSRM HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        if (data?.code && data.code !== 'Ok') {
          lastErr = new Error(data.message || `OSRM ${data.code}`);
          continue;
        }
        return data;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
      }
    }
    // Brief backoff before next full attempt
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
  }
  throw lastErr || new Error('OSRM unavailable');
}

// ── Notifications helper ──
// audience: 'admin' | 'customer' | 'rider'. userId required for customer + rider.
async function createNotification({ audience, userId = null, message, type = 'System' }) {
  try {
    await pool.query(
      'INSERT INTO notifications (id, audience, userId, message, type, `read`) VALUES (?,?,?,?,?,0)',
      [id(), audience, userId, message, type]
    );
  } catch (err) {
    console.warn('Failed to create notification:', err.message);
  }
}

function isWalkInOrderType(type) {
  return Boolean(type && String(type).toLowerCase().includes('walk'));
}

// A walk-in customer's id only matches a real login if an admin explicitly linked their account
// (see /api/customers/link/:userId). This checks that before sending anything to a customer's own dashboard.
async function customerHasAccount(customerId) {
  const [[u]] = await pool.query('SELECT id FROM users WHERE id = ?', [customerId]);
  return !!u;
}

const DEBT_RISK_THRESHOLD = 300;     // matches the "High risk" cutoff used on the Predictions page
const LOW_STOCK_THRESHOLD = 20;      // percent

/** Round peso amounts to 2 decimal places (debt, payments, notifications). */
function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatPeso(value) {
  return `₱${roundMoney(value).toFixed(2)}`;
}

// ── Unpaid-balance reminders (runs periodically, not tied to any single request) ──
const REMINDER_COOLDOWN_HOURS = 24;  // don't re-remind the same customer more than once per day
async function checkUnpaidBalances() {
  try {
    const [debtors] = await pool.query(
      `SELECT * FROM customers
       WHERE balance > 0 AND (remindedAt IS NULL OR remindedAt < NOW() - INTERVAL ? HOUR)`,
      [REMINDER_COOLDOWN_HOURS]
    );
    if (debtors.length === 0) return;

    for (const c of debtors) {
      if (await customerHasAccount(c.id)) {
        await createNotification({
          audience: 'customer',
          userId: c.id,
          message: `Reminder: you have an outstanding balance of ${formatPeso(c.balance)}.`,
          type: 'Debt',
        });
      }
      await pool.query('UPDATE customers SET remindedAt = NOW() WHERE id = ?', [c.id]);
    }

    const totalOwed = debtors.reduce((sum, c) => sum + (parseFloat(c.balance) || 0), 0);
    await createNotification({
      audience: 'admin',
      message: `${debtors.length} customer(s) have unpaid balances totaling ${formatPeso(totalOwed)}.`,
      type: 'Debt',
    });
  } catch (err) {
    console.warn('Unpaid-balance check failed:', err.message);
  }
}

// ── App settings (admin-configurable; falls back to .env) ──
const SETTINGS_META = {
  xendit_secret_key: {
    label: 'Xendit / GCash secret key',
    secret: true,
    env: 'XENDIT_SECRET_KEY',
  },
  xendit_webhook_token: {
    label: 'Xendit webhook verification token',
    secret: true,
    env: 'XENDIT_WEBHOOK_TOKEN',
  },
  backend_public_url: {
    label: 'Backend public URL (ngrok / production)',
    secret: false,
    env: 'BACKEND_PUBLIC_URL',
  },
  frontend_url: {
    label: 'Frontend URL (customer app / production site)',
    secret: false,
    env: 'FRONTEND_URL',
  },
  semaphore_api_key: {
    label: 'Semaphore SMS API key',
    secret: true,
    env: 'SEMAPHORE_API_KEY',
  },
  semaphore_sender_name: {
    label: 'Semaphore sender name',
    secret: false,
    env: 'SEMAPHORE_SENDER_NAME',
  },
  geoapify_api_key: {
    label: 'Geoapify API key (MapLibre maps + routing)',
    secret: true,
    env: 'GEOAPIFY_API_KEY',
  },
};

function sanitizeFrontendBase(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function resolveFrontendBase(preferred) {
  const fromPreferred = sanitizeFrontendBase(preferred);
  const fromSettings = sanitizeFrontendBase(await getSetting('frontend_url'));
  const fromEnv = sanitizeFrontendBase(process.env.FRONTEND_URL);
  return fromPreferred || fromSettings || fromEnv || 'http://localhost:5173';
}

function isPlaceholderSecret(value) {
  if (value == null) return true;
  const v = String(value).trim();
  if (!v) return true;
  return /your_.*here|changeme|xxx+/i.test(v);
}

async function getSettingRaw(key) {
  try {
    const [[row]] = await pool.query(
      'SELECT settingValue FROM app_settings WHERE settingKey = ? LIMIT 1',
      [key]
    );
    if (row && row.settingValue != null && String(row.settingValue).trim() !== '') {
      return String(row.settingValue).trim();
    }
  } catch (err) {
    // Table may not exist yet on first boot — fall back to env.
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.warn(`Settings read failed (${key}):`, err.message);
    }
  }
  const envName = SETTINGS_META[key]?.env;
  const fromEnv = envName ? process.env[envName] : undefined;
  return fromEnv && String(fromEnv).trim() ? String(fromEnv).trim() : '';
}

async function getSetting(key) {
  const value = await getSettingRaw(key);
  return isPlaceholderSecret(value) ? '' : value;
}

function maskSecret(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(12, s.length - 4))}${s.slice(-4)}`;
}

async function getPublicSettings() {
  const out = {};
  for (const [key, meta] of Object.entries(SETTINGS_META)) {
    const value = await getSetting(key);
    const configured = Boolean(value);
    out[key] = {
      label: meta.label,
      secret: meta.secret,
      configured,
      source: configured
        ? (await getSettingSource(key))
        : 'none',
      value: meta.secret ? undefined : (value || ''),
      hint: meta.secret ? maskSecret(value) : (value || null),
    };
  }
  return out;
}

async function getSettingSource(key) {
  try {
    const [[row]] = await pool.query(
      'SELECT settingValue FROM app_settings WHERE settingKey = ? LIMIT 1',
      [key]
    );
    if (row && row.settingValue != null && String(row.settingValue).trim() !== '' && !isPlaceholderSecret(row.settingValue)) {
      return 'admin';
    }
  } catch {
    // ignore
  }
  const envName = SETTINGS_META[key]?.env;
  const fromEnv = envName ? process.env[envName] : '';
  if (fromEnv && !isPlaceholderSecret(fromEnv)) return 'env';
  return 'none';
}

async function upsertSetting(key, value, updatedBy = 'Admin') {
  if (!SETTINGS_META[key]) throw new Error(`Unknown setting: ${key}`);
  const cleaned = value == null ? '' : String(value).trim();
  if (!cleaned) {
    await pool.query('DELETE FROM app_settings WHERE settingKey = ?', [key]);
    return;
  }
  await pool.query(
    `INSERT INTO app_settings (settingKey, settingValue, updatedBy)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE settingValue = VALUES(settingValue), updatedBy = VALUES(updatedBy)`,
    [key, cleaned, updatedBy]
  );
}

// ── Xendit (Payment Sessions API — GCash / Maya / cards via Xendit) ──
// Docs: https://docs.xendit.co/docs/payment-sessions-overview
async function xenditRequest(path, body) {
  const secretKey = await getSetting('xendit_secret_key');
  if (!secretKey) {
    throw new Error('Xendit / GCash secret key is not configured. Set it in Admin → Settings.');
  }
  const res = await fetch(`https://api.xendit.co${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Xendit uses HTTP Basic auth: secret key as the username, blank password.
      'Authorization': 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64'),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Xendit request failed');
  return data;
}

// Xendit signs webhooks with a fixed verification token in the x-callback-token header —
// a plain (constant-time) string compare against your Dashboard token, no HMAC needed.
async function verifyXenditWebhook(headerToken) {
  const crypto = require('crypto');
  const expected = await getSetting('xendit_webhook_token');
  if (!expected || !headerToken || headerToken.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(expected));
}

// ====================== ROUTES ======================

app.get('/api', (req, res) => res.json({ message: '✅ AguaDoc Backend is running!' }));

app.get('/api/geocode', async (req, res) => {
  try {
    const coords = await geocodeAddress(req.query.q || '');
    res.json(coords);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const address = await reverseGeocode(req.query.lat, req.query.lng);
    res.json({ address, lat: parseFloat(req.query.lat), lng: parseFloat(req.query.lng) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xendit redirects the customer's browser here after payment (must be public HTTPS via
// backend_public_url). We bounce them to the real frontend (production site), not localhost.
app.get('/return', async (req, res) => {
  try {
    const { checkout, orderId, front } = req.query;
    const configured = await resolveFrontendBase();
    const fromQuery = sanitizeFrontendBase(front);

    let target = configured;
    if (fromQuery) {
      const cfgHost = new URL(configured).hostname;
      const frontHost = new URL(fromQuery).hostname;
      const allow =
        fromQuery === configured ||
        cfgHost === frontHost ||
        cfgHost === 'localhost' ||
        cfgHost === '127.0.0.1' ||
        frontHost === 'localhost' ||
        frontHost === '127.0.0.1';
      if (allow) target = fromQuery;
    }

    const qs = new URLSearchParams();
    if (checkout) qs.set('checkout', String(checkout));
    if (orderId) qs.set('orderId', String(orderId));
    res.redirect(`${target}/?${qs.toString()}`);
  } catch (err) {
    console.error('Checkout return redirect failed:', err.message);
    res.status(500).send('Could not return to AguaDoc after payment. Please open the app manually.');
  }
});

// ── AUTH ──
app.post('/api/register', async (req, res) => {
  const { fullName, username, email, password, phone, address, gender, termsAccepted, termsVersion } = req.body;
  try {
    // Server-side check too — the checkbox alone can be bypassed by calling the API directly.
    if (!termsAccepted)
      return res.status(400).json({ success: false, message: 'You must accept the Terms & Agreement to create an account.' });

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?', [email, username]
    );
    if (existing.length > 0)
      return res.status(400).json({ success: false, message: 'User already exists' });

    const newId = id();
    await pool.query(
      'INSERT INTO users (id, fullName, username, email, password, phone, address, gender, role, termsAcceptedAt, termsVersion) VALUES (?,?,?,?,?,?,?,?,?,NOW(),?)',
      [newId, fullName || username, username, email, password, phone, address, gender, 'customer', termsVersion || null]
    );
    res.json({ success: true, user: { id: newId, fullName: fullName || username, username, email, phone, address, gender, role: 'customer', termsAcceptedAt: new Date().toISOString(), termsVersion: termsVersion || null } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE (email = ? OR username = ?) AND password = ?',
      [username, username, password]
    );
    if (rows.length === 0)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const { password: _, ...user } = rows[0];
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Records that an existing account has read and accepted the credit terms.
app.post('/api/users/:id/accept-terms', async (req, res) => {
  try {
    const { termsVersion } = req.body;
    const [result] = await pool.query(
      'UPDATE users SET termsAcceptedAt = NOW(), termsVersion = ? WHERE id = ?',
      [termsVersion || null, req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ success: false, message: 'User not found' });
    const [[row]] = await pool.query('SELECT termsAcceptedAt, termsVersion FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, ...row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all registered users (customers)
app.get('/api/users', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, fullName, username, email, phone, address, role FROM users ORDER BY createdAt DESC'
  );
  res.json(rows);
});

// ── CUSTOMERS ──
app.get('/api/customers', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM customers ORDER BY createdAt DESC');
  res.json(
    rows.map((c) => ({
      ...c,
      balance: roundMoney(c.balance),
    }))
  );
});

// Update own profile (and optionally change password)
app.put('/api/users/:id', async (req, res) => {
  const { fullName, email, phone, address, currentPassword, newPassword } = req.body;

  const [existingRows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (existingRows.length === 0) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  const existing = existingRows[0];

  let passwordToSave = existing.password;
  if (newPassword) {
    if (currentPassword !== existing.password) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    passwordToSave = newPassword;
  }

  await pool.query(
    'UPDATE users SET fullName = ?, email = ?, phone = ?, address = ?, password = ? WHERE id = ?',
    [
      fullName ?? existing.fullName,
      email ?? existing.email,
      phone ?? existing.phone,
      address ?? existing.address,
      passwordToSave,
      req.params.id,
    ]
  );

  const [rows] = await pool.query(
    'SELECT id, fullName, username, email, phone, address, role FROM users WHERE id = ?',
    [req.params.id]
  );
  res.json(rows[0]);
});

// ── Registered accounts not yet linked to debt tracking ──
app.get('/api/customers/available', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, fullName, email, phone, address FROM users
     WHERE role = 'customer' AND id NOT IN (SELECT id FROM customers)
     ORDER BY fullName ASC`
  );
  res.json(rows);
});

// ── Link a registered account into debt tracking (reuses their account id, so it's the same identity) ──
app.post('/api/customers/link/:userId', async (req, res) => {
  try {
    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ success: false, message: 'Account not found' });

    await pool.query(
      'INSERT INTO customers (id, fullName, email, phone, address, balance) VALUES (?,?,?,?,?,0)',
      [user.id, user.fullName, user.email, user.phone, user.address]
    );
    const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [user.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { fullName, email, phone, address, balance } = req.body;
    const newId = id();
    await pool.query(
      'INSERT INTO customers (id, fullName, email, phone, address, balance, orders) VALUES (?,?,?,?,?,?,0)',
      [newId, fullName, email || null, phone, address, roundMoney(balance || 0)]
    );
    const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [newId]);
    await createNotification({ audience: 'admin', message: `New walk-in customer added: ${fullName}.`, type: 'System' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Failed to add customer:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const { fullName, email, phone, address, balance, orders, agreementSigned } = req.body;
    const [[before]] = await pool.query('SELECT balance FROM customers WHERE id = ?', [req.params.id]);
    const newBalance = roundMoney(balance ?? 0);

    await pool.query(
      'UPDATE customers SET fullName=?, email=?, phone=?, address=?, balance=?, orders=? WHERE id=?',
      [fullName, email || null, phone, address, newBalance, orders ?? 0, req.params.id]
    );

    // Only touch the signed-agreement date when the caller actually sent the flag — the Payments page
    // updates a customer's balance without it and must not wipe a signature.
    if (agreementSigned !== undefined) {
      await pool.query(
        'UPDATE customers SET agreementSignedAt = CASE WHEN ? THEN COALESCE(agreementSignedAt, NOW()) ELSE NULL END WHERE id = ?',
        [agreementSigned ? 1 : 0, req.params.id]
      );
    }
    const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.params.id]);

    // Only fire once, right when the customer crosses INTO high-risk territory — not on every save after that.
    const oldBalance = parseFloat(before?.balance ?? 0);
    if (newBalance >= DEBT_RISK_THRESHOLD && oldBalance < DEBT_RISK_THRESHOLD) {
      await createNotification({
        audience: 'admin',
        message: `${fullName} now owes ${formatPeso(newBalance)} — flagged as high debt risk.`,
        type: 'Debt',
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Failed to update customer:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  await pool.query('DELETE FROM customers WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── NOTIFICATIONS ──
app.get('/api/notifications', async (req, res) => {
  const { audience, userId } = req.query;
  try {
    let rows;
    if (audience === 'customer' || audience === 'rider') {
      if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
      [rows] = await pool.query(
        'SELECT * FROM notifications WHERE audience = ? AND userId = ? ORDER BY createdAt DESC LIMIT 50',
        [audience, userId]
      );
    } else {
      [rows] = await pool.query(
        'SELECT * FROM notifications WHERE audience = "admin" ORDER BY createdAt DESC LIMIT 100'
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET `read` = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/notifications/read-all', async (req, res) => {
  const { audience, userId } = req.body;
  try {
    if (audience === 'customer' || audience === 'rider') {
      if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
      await pool.query(
        'UPDATE notifications SET `read` = 1 WHERE audience = ? AND userId = ?',
        [audience, userId]
      );
    } else {
      await pool.query('UPDATE notifications SET `read` = 1 WHERE audience = "admin"');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ORDERS ──
app.get('/api/orders', async (req, res) => {
  const { userId } = req.query;
  const [rows] = userId
    ? await pool.query(
        `SELECT o.*, r.fullName AS riderName, r.phone AS riderPhone
         FROM orders o
         LEFT JOIN users r ON r.id = o.riderId
         WHERE o.userId = ?
         ORDER BY o.date DESC`,
        [userId]
      )
    : await pool.query(
        `SELECT o.*, r.fullName AS riderName, r.phone AS riderPhone
         FROM orders o
         LEFT JOIN users r ON r.id = o.riderId
         ORDER BY o.date DESC`
      );
  res.json(rows);
});

// Admin assigns (or reassigns) a rider to a delivery order
app.put('/api/orders/:id/assign-rider', async (req, res) => {
  try {
    const { riderId } = req.body;
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });

    const [[rider]] = await pool.query(
      `SELECT id, fullName, role FROM users WHERE id = ? AND role = 'rider'`,
      [riderId]
    );
    if (!rider) return res.status(400).json({ success: false, message: 'Rider not found' });

    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.type && String(order.type).toLowerCase().includes('walk'))
      return res.status(400).json({ success: false, message: 'Walk-in orders do not need a rider' });
    if (['Delivered', 'Cancelled', 'Ready to Go'].includes(order.status))
      return res.status(400).json({ success: false, message: `Cannot assign rider to ${order.status} order` });

    await pool.query(
      `UPDATE orders SET riderId = ?, status = 'Assigned' WHERE id = ?`,
      [riderId, req.params.id]
    );

    if (order.userId) {
      await createNotification({
        audience: 'customer',
        userId: order.userId,
        message: `${rider.fullName} was assigned to deliver your order ${order.ref}.`,
        type: 'Order',
      });
    }

    await createNotification({
      audience: 'rider',
      userId: riderId,
      message: `New delivery assigned: ${order.ref} · ${order.quantity || 1} gal · ${order.address || 'see address in app'}`,
      type: 'Order',
    });

    const [[row]] = await pool.query(
      `SELECT o.*, r.fullName AS riderName
       FROM orders o
       LEFT JOIN users r ON r.id = o.riderId
       WHERE o.id = ?`,
      [req.params.id]
    );
    res.json(row);
  } catch (err) {
    console.error('Failed to assign rider:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { userId, type, quantity, status, total, address, payMethod, priority, notes, lat: bodyLat, lng: bodyLng } = req.body;
    const newId  = id();
    const newRef = 'ORD-' + newId.slice(-6);
    const { lat, lng } = await resolveCoords({ lat: bodyLat, lng: bodyLng, address });
    await pool.query(
      'INSERT INTO orders (id, ref, userId, type, quantity, status, total, address, payMethod, priority, notes, lat, lng) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [newId, newRef, userId, type, quantity || 1, status || 'Pending', total || 0, address || '', payMethod || '', priority || 'normal', notes || '', lat, lng]
    );
    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [newId]);

    const [[customer]] = await pool.query('SELECT fullName FROM users WHERE id = ?', [userId]);
    await createNotification({
      audience: 'admin',
      message: `New ${type || 'delivery'} order from ${customer?.fullName || 'a customer'} — ${quantity || 1} gal.`,
      type: 'Order',
    });

    res.json(rows[0]);
  } catch (err) {
    console.error('Failed to place order:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── RIDER BOOKINGS (admin assigns; open jobs can be claimed) ──
app.get('/api/rider/bookings', async (req, res) => {
  try {
    const { riderId } = req.query;
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });

    const [mine] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o
       LEFT JOIN users u ON u.id = o.userId
       WHERE o.riderId = ?
         AND o.status IN ('Assigned', 'Accepted', 'Processing', 'Out for Delivery')
       ORDER BY
         CASE WHEN o.priority = 'priority' THEN 0 ELSE 1 END,
         o.date ASC`,
      [riderId]
    );

    const [done] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o
       LEFT JOIN users u ON u.id = o.userId
       WHERE o.riderId = ? AND o.status = 'Delivered'
       ORDER BY o.date DESC
       LIMIT 20`,
      [riderId]
    );

    const [available] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o
       LEFT JOIN users u ON u.id = o.userId
       WHERE (o.riderId IS NULL OR o.riderId = '')
         AND o.status IN ('Pending', 'Processing')
         AND (o.type IS NULL OR o.type NOT LIKE '%Walk%')
       ORDER BY
         CASE WHEN o.priority = 'priority' THEN 0 ELSE 1 END,
         o.date ASC
       LIMIT 30`
    );

    res.json({ available, mine, done });
  } catch (err) {
    console.error('Failed to load rider bookings:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/rider/bookings/:id/claim', async (req, res) => {
  try {
    const { riderId } = req.body;
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });

    const [[rider]] = await pool.query(
      `SELECT id, fullName FROM users WHERE id = ? AND role = 'rider'`,
      [riderId]
    );
    if (!rider) return res.status(400).json({ success: false, message: 'Rider not found' });

    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (isWalkInOrderType(order.type))
      return res.status(400).json({ success: false, message: 'Walk-in orders do not need a rider' });
    if (order.riderId && order.riderId !== riderId)
      return res.status(409).json({ success: false, message: 'Already claimed by another rider' });
    if (!['Pending', 'Processing', 'Assigned'].includes(order.status))
      return res.status(400).json({ success: false, message: `Cannot claim ${order.status} order` });

    await pool.query(
      `UPDATE orders SET riderId = ?, status = 'Accepted' WHERE id = ?`,
      [riderId, req.params.id]
    );

    if (order.userId) {
      await createNotification({
        audience: 'customer',
        userId: order.userId,
        message: `${rider.fullName} claimed your order ${order.ref} and is preparing delivery.`,
        type: 'Order',
      });
    }
    await createNotification({
      audience: 'admin',
      message: `${rider.fullName} claimed open job ${order.ref}.`,
      type: 'Order',
    });

    const [[row]] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o LEFT JOIN users u ON u.id = o.userId WHERE o.id = ?`,
      [req.params.id]
    );
    res.json(row);
  } catch (err) {
    console.error('Failed to claim booking:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/rider/bookings/:id/decline', async (req, res) => {
  try {
    const { riderId, reason } = req.body;
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });

    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.riderId !== riderId)
      return res.status(403).json({ success: false, message: 'Not your booking' });
    if (!['Assigned', 'Accepted'].includes(order.status))
      return res.status(400).json({ success: false, message: 'Can only decline before delivery starts' });

    await pool.query(
      `UPDATE orders SET riderId = NULL, status = 'Pending' WHERE id = ?`,
      [req.params.id]
    );

    await createNotification({
      audience: 'admin',
      message: `Rider declined ${order.ref}${reason ? `: ${reason}` : ''}. Order returned to unassigned.`,
      type: 'Order',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to decline booking:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/rider/bookings/:id/status', async (req, res) => {
  try {
    const { riderId, status, podNote, podCashCollected, podPhoto } = req.body;
    const allowed = ['Assigned', 'Accepted', 'Processing', 'Out for Delivery', 'Delivered'];
    if (!riderId || !allowed.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid riderId or status' });

    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.riderId !== riderId)
      return res.status(403).json({ success: false, message: 'Not your booking' });

    const previousStatus = order.status;

    if (status === 'Delivered' && status !== previousStatus) {
      const cash = podCashCollected != null && podCashCollected !== ''
        ? Number(podCashCollected)
        : null;
      if (cash != null && !Number.isFinite(cash))
        return res.status(400).json({ success: false, message: 'Invalid cash amount' });

      let photo = null;
      if (typeof podPhoto === 'string' && podPhoto.startsWith('data:image/')) {
        if (podPhoto.length > 900_000) {
          return res.status(400).json({ success: false, message: 'Photo too large (max ~650KB)' });
        }
        photo = podPhoto;
      }

      await pool.query(
        `UPDATE orders
         SET status = 'Delivered',
             deliveredAt = NOW(),
             podNote = ?,
             podCashCollected = ?,
             podPhoto = ?
         WHERE id = ?`,
        [podNote || null, cash, photo, req.params.id]
      );

      await settleOfflineOrderPayment({ ...order, status });
      await consumeInventoryForOrder(order);
    } else {
      await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    }

    if (order.userId && status !== previousStatus) {
      await createNotification({
        audience: 'customer',
        userId: order.userId,
        message: status === 'Out for Delivery'
          ? `Your order ${order.ref} is out for delivery — track your rider live.`
          : status === 'Delivered'
            ? `Your order ${order.ref} has been delivered. Thank you!`
            : status === 'Accepted'
              ? `Your order ${order.ref} was accepted by your rider. Delivery is being prepared.`
              : `Your order ${order.ref} is now ${status}.`,
        type: 'Order',
      });
    }

    // Auto-SMS customer via Semaphore when rider accepts (or starts delivery from Assigned)
    let sms = null;
    const acceptanceTransition =
      (status === 'Accepted' && previousStatus !== 'Accepted') ||
      (status === 'Out for Delivery' && ['Assigned', 'Pending'].includes(previousStatus));

    if (acceptanceTransition) {
      const [[rider]] = await pool.query(
        'SELECT fullName, username FROM users WHERE id = ? LIMIT 1',
        [riderId]
      );
      const riderName = rider?.fullName || rider?.username || 'your rider';
      sms = await sendRiderAcceptedSms({ order, riderName });

      if (sms?.ok) {
        await createNotification({
          audience: 'admin',
          message: `SMS sent to customer for ${order.ref}: rider ${riderName} accepted the delivery.`,
          type: 'Order',
        });
      } else if (sms && !sms.skipped) {
        await createNotification({
          audience: 'admin',
          message: `Rider accepted ${order.ref}, but SMS failed: ${sms.reason || 'unknown error'}`,
          type: 'System',
        });
      }
    }

    const [[row]] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o LEFT JOIN users u ON u.id = o.userId WHERE o.id = ?`,
      [req.params.id]
    );
    res.json({ ...row, sms });
  } catch (err) {
    console.error('Failed to update rider booking:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Driving directions — Geoapify Routing (MapLibre-friendly), with OSRM/straight fallbacks
async function geoapifyRoute(waypoints, { alternatives = false, optimize = false } = {}) {
  const key = await getSetting('geoapify_api_key');
  if (!key) {
    const err = new Error('Geoapify API key is not configured');
    err.code = 'GEOAPIFY_NOT_CONFIGURED';
    throw err;
  }
  // waypoints: [{lat,lng}, ...] — Geoapify expects lat,lng joined by |
  const wp = waypoints
    .map((p) => `${Number(p.lat)},${Number(p.lng)}`)
    .join('|');
  const params = new URLSearchParams({
    waypoints: wp,
    mode: 'drive',
    details: 'instruction_details',
    apiKey: key,
  });
  if (alternatives) params.set('alternatives', '1');
  if (optimize) params.set('optimize_waypoints', 'true'); // keep if supported; also try optimize_stops below
  if (optimize) params.set('optimize_stops', 'true');

  const url = `https://api.geoapify.com/v1/routing?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || `Geoapify routing failed (${res.status})`);
  }
  return data;
}

function flattenGeoapifyCoords(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return geometry.coordinates || [];
  if (geometry.type === 'MultiLineString') {
    return (geometry.coordinates || []).flat();
  }
  return [];
}

function parseGeoapifyRoutes(data) {
  const features = Array.isArray(data?.features) ? data.features : [];
  // Some responses nest under results (format=json)
  if (!features.length && Array.isArray(data?.results)) {
    return data.results.map((result, index) => {
      const coords = flattenGeoapifyCoords(result.geometry) ||
        (result.legs || []).flatMap((leg) => flattenGeoapifyCoords(leg.geometry));
      const steps = (result.legs || []).flatMap((leg) =>
        (leg.steps || []).map((step) => {
          const loc = step.from?.[0] || step.maneuver?.location || step.location;
          return {
            name: step.road_name || step.name || step.instruction?.text || '',
            ref: '',
            type: step.instruction?.type || step.maneuver?.type || 'continue',
            modifier: step.instruction?.modifier || step.maneuver?.modifier || '',
            distanceM: step.distance ?? step.distance_m ?? 0,
            durationS: step.time ?? step.duration ?? 0,
            location: Array.isArray(loc)
              ? { lat: Number(loc[1] ?? loc.lat), lng: Number(loc[0] ?? loc.lng) }
              : (loc?.lat != null ? { lat: Number(loc.lat), lng: Number(loc.lng) } : null),
          };
        })
      );
      return {
        index,
        geometry: coords,
        distanceM: result.distance ?? result.distance_m ?? 0,
        durationS: result.time ?? result.duration ?? 0,
        steps,
        fallback: false,
        provider: 'geoapify',
      };
    }).filter((r) => r.geometry.length >= 2);
  }

  return features.map((feature, index) => {
    const props = feature.properties || {};
    const coords = flattenGeoapifyCoords(feature.geometry);
    const steps = (props.legs || []).flatMap((leg) =>
      (leg.steps || []).map((step) => {
        const loc = step.from?.[0] || step.maneuver?.location || step.location;
        return {
          name: step.road_name || step.name || step.instruction?.text || '',
          ref: '',
          type: step.instruction?.type || 'continue',
          modifier: step.instruction?.modifier || '',
          distanceM: step.distance ?? 0,
          durationS: step.time ?? 0,
          location: Array.isArray(loc)
            ? { lat: Number(loc[1] ?? loc.lat), lng: Number(loc[0] ?? loc.lng) }
            : (loc?.lat != null ? { lat: Number(loc.lat), lng: Number(loc.lng) } : null),
        };
      })
    );
    return {
      index,
      geometry: coords,
      distanceM: props.distance ?? 0,
      durationS: props.time ?? 0,
      steps,
      fallback: false,
      provider: 'geoapify',
    };
  }).filter((r) => r.geometry.length >= 2);
}

app.get('/api/rider/route', async (req, res) => {
  try {
    const fromLat = parseFloat(req.query.fromLat);
    const fromLng = parseFloat(req.query.fromLng);
    const toLat = parseFloat(req.query.toLat);
    const toLng = parseFloat(req.query.toLng);
    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
      return res.status(400).json({ success: false, message: 'from/to lat,lng required' });
    }

    const from = { lat: fromLat, lng: fromLng };
    const to = { lat: toLat, lng: toLng };

    // 1) Geoapify
    try {
      const data = await geoapifyRoute([from, to], { alternatives: true });
      const routes = parseGeoapifyRoutes(data);
      if (routes.length) {
        const route = routes[0];
        return res.json({
          geometry: route.geometry,
          distanceM: route.distanceM,
          durationS: route.durationS,
          steps: route.steps,
          routes,
          fallback: false,
          provider: 'geoapify',
        });
      }
      throw new Error('Empty Geoapify geometry');
    } catch (geoErr) {
      console.warn('Geoapify rider route failed:', geoErr.message);
    }

    // 2) OSRM
    try {
      const data = await fetchOsrmJson(
        `/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}` +
          `?overview=full&geometries=geojson&alternatives=true&steps=true`
      );
      const routes = (data.routes || []).map((route, index) => {
        const steps = (route.legs || []).flatMap((leg) =>
          (leg.steps || []).map((step) => ({
            name: step.name || '',
            ref: step.ref || '',
            type: step.maneuver?.type || 'continue',
            modifier: step.maneuver?.modifier || '',
            distanceM: step.distance,
            durationS: step.duration,
            location: Array.isArray(step.maneuver?.location)
              ? { lng: step.maneuver.location[0], lat: step.maneuver.location[1] }
              : null,
          }))
        );
        return {
          index,
          geometry: route.geometry?.coordinates || [],
          distanceM: route.distance,
          durationS: route.duration,
          steps,
          fallback: false,
          provider: 'osrm',
        };
      }).filter((r) => r.geometry.length >= 2);
      if (routes.length) {
        const route = routes[0];
        return res.json({
          geometry: route.geometry,
          distanceM: route.distanceM,
          durationS: route.durationS,
          steps: route.steps,
          routes,
          fallback: false,
          provider: 'osrm',
          warning: 'Geoapify unavailable — using OSRM backup.',
        });
      }
    } catch (osrmErr) {
      console.warn('OSRM rider route failed:', osrmErr.message);
    }

    // 3) Straight line
    const distanceM = haversineM(from, to);
    const durationS = Math.max(60, Math.round((distanceM / 1000 / 25) * 3600));
    const geometry = straightLineGeometry([from, to]);
    const route = {
      index: 0,
      geometry,
      distanceM,
      durationS,
      steps: [{ name: 'Direct path', ref: '', type: 'continue', modifier: '', distanceM, durationS }],
      fallback: true,
      provider: 'fallback',
    };
    return res.json({
      geometry,
      distanceM,
      durationS,
      steps: route.steps,
      routes: [route],
      fallback: true,
      provider: 'fallback',
      warning: 'Live routing unavailable — showing a direct path.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELIVERY ROUTE (multi-stop via Geoapify, OSRM trip fallback) ──
app.get('/api/delivery-route', async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT * FROM orders
       WHERE status IN ('Pending','Assigned','Accepted','Processing','Out for Delivery')
         AND lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY date ASC`
    );

    if (orders.length === 0) {
      return res.json({ depot: DEPOT, stops: [], geometry: [], fallback: false, provider: 'none' });
    }

    const stopPoints = orders.map((o) => ({ lat: Number(o.lat), lng: Number(o.lng), order: o }));

    // Geoapify: depot → stops (optimize intermediate order when possible)
    try {
      const waypoints = [DEPOT, ...stopPoints];
      // Need fixed end for optimize_stops — duplicate last stop as destination
      if (waypoints.length >= 3) {
        waypoints.push(stopPoints[stopPoints.length - 1]);
      }
      const data = await geoapifyRoute(waypoints, { optimize: waypoints.length >= 4 });
      const routes = parseGeoapifyRoutes(data);
      if (routes[0]?.geometry?.length >= 2) {
        // Prefer waypoint order from properties if present
        let stops = orders;
        const props = data.features?.[0]?.properties;
        const ordered = props?.waypoints || data.results?.[0]?.waypoints;
        if (Array.isArray(ordered) && ordered.length) {
          const idxs = ordered
            .map((w) => w.original_index ?? w.originalIndex)
            .filter((i) => i != null && i > 0 && i <= orders.length)
            .map((i) => i - 1);
          const uniq = [...new Set(idxs)];
          if (uniq.length) stops = uniq.map((i) => orders[i]).filter(Boolean);
        }
        return res.json({
          depot: DEPOT,
          stops,
          geometry: routes[0].geometry,
          fallback: false,
          provider: 'geoapify',
        });
      }
      throw new Error('Empty Geoapify multi-stop geometry');
    } catch (geoErr) {
      console.warn('Geoapify delivery route failed:', geoErr.message);
    }

    // OSRM trip fallback
    try {
      const points = [DEPOT, ...orders.map((o) => ({ lat: Number(o.lat), lng: Number(o.lng) }))];
      const coordString = points.map((o) => `${o.lng},${o.lat}`).join(';');
      const trip = await fetchOsrmJson(
        `/trip/v1/driving/${coordString}?source=first&roundtrip=false&geometries=geojson&overview=full`
      );
      if (!trip.trips?.[0]?.geometry?.coordinates) throw new Error('OSRM trip empty');
      const stops = trip.waypoints
        .map((wp, inputIndex) => ({ inputIndex, tripOrder: wp.waypoint_index }))
        .filter((w) => w.inputIndex !== 0)
        .sort((a, b) => a.tripOrder - b.tripOrder)
        .map((w) => orders[w.inputIndex - 1]);
      return res.json({
        depot: DEPOT,
        stops,
        geometry: trip.trips[0].geometry.coordinates,
        fallback: false,
        provider: 'osrm',
        warning: 'Geoapify unavailable — using OSRM backup.',
      });
    } catch (osrmErr) {
      console.warn('OSRM delivery trip failed:', osrmErr.message);
    }

    const geometry = straightLineGeometry([
      DEPOT,
      ...orders.map((o) => ({ lat: Number(o.lat), lng: Number(o.lng) })),
    ]);
    return res.json({
      depot: DEPOT,
      stops: orders,
      geometry,
      fallback: true,
      provider: 'fallback',
      warning: 'Live routing unavailable — showing a straight-line path between stops.',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Assign today's pending delivery stops to a rider and notify them
app.post('/api/delivery-route/send', async (req, res) => {
  try {
    const { riderId, orderIds } = req.body || {};
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });

    const [[rider]] = await pool.query(
      `SELECT id, fullName FROM users WHERE id = ? AND role = 'rider'`,
      [riderId]
    );
    if (!rider) return res.status(400).json({ success: false, message: 'Rider not found' });

    let orders;
    if (Array.isArray(orderIds) && orderIds.length) {
      const placeholders = orderIds.map(() => '?').join(',');
      [orders] = await pool.query(
        `SELECT * FROM orders WHERE id IN (${placeholders})`,
        orderIds
      );
    } else {
      [orders] = await pool.query(
        `SELECT * FROM orders
         WHERE status IN ('Pending','Assigned','Accepted','Processing')
           AND (type IS NULL OR type NOT LIKE '%Walk%')
           AND (riderId IS NULL OR riderId = '' OR riderId = ?)
         ORDER BY date ASC`,
        [riderId]
      );
    }

    const assignable = orders.filter(
      (o) => !['Delivered', 'Cancelled', 'Ready to Go'].includes(o.status)
    );
    if (!assignable.length) {
      return res.status(400).json({ success: false, message: 'No delivery stops to send' });
    }

    for (const order of assignable) {
      const nextStatus = ['Assigned', 'Accepted', 'Processing', 'Out for Delivery'].includes(order.status)
        ? order.status
        : 'Assigned';
      await pool.query(
        `UPDATE orders SET riderId = ?, status = ? WHERE id = ?`,
        [riderId, nextStatus, order.id]
      );
    }

    const stopSummary = assignable
      .slice(0, 5)
      .map((o) => o.ref || o.id)
      .join(', ');
    const extra = assignable.length > 5 ? ` (+${assignable.length - 5} more)` : '';

    await createNotification({
      audience: 'rider',
      userId: riderId,
      message: `Route sent: ${assignable.length} stop${assignable.length === 1 ? '' : 's'} — ${stopSummary}${extra}. Open Rider to navigate.`,
      type: 'Order',
    });

    res.json({
      success: true,
      riderId,
      riderName: rider.fullName,
      count: assignable.length,
      orderIds: assignable.map((o) => o.id),
    });
  } catch (err) {
    console.error('Failed to send route to driver:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── RIDER LOCATION (live tracking) — one row per rider user id ──
app.get('/api/rider-location', async (req, res) => {
  try {
    let riderId = req.query.riderId || null;
    const orderId = req.query.orderId || null;

    if (!riderId && orderId) {
      const [[order]] = await pool.query('SELECT riderId FROM orders WHERE id = ?', [orderId]);
      riderId = order?.riderId || null;
    }

    if (!riderId) {
      // Legacy fallback: newest location among all riders (single-rider installs)
      const [[row]] = await pool.query(
        'SELECT id AS riderId, lat, lng, updatedAt FROM rider_location ORDER BY updatedAt DESC LIMIT 1'
      );
      return res.json(row || { lat: null, lng: null, updatedAt: null, riderId: null });
    }

    const [[row]] = await pool.query(
      'SELECT id AS riderId, lat, lng, updatedAt FROM rider_location WHERE id = ?',
      [riderId]
    );
    res.json(row || { riderId, lat: null, lng: null, updatedAt: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/rider-location', async (req, res) => {
  try {
    const { lat, lng, riderId } = req.body;
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ success: false, message: 'lat/lng required' });
    }

    await pool.query(
      `INSERT INTO rider_location (id, lat, lng, updatedAt)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), updatedAt = NOW()`,
      [riderId, Number(lat), Number(lng)]
    );
    // Keep legacy "main" row in sync for any old clients still reading it
    await pool.query(
      `INSERT INTO rider_location (id, lat, lng, updatedAt)
       VALUES ('main', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), updatedAt = NOW()`,
      [Number(lat), Number(lng)]
    ).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── XENDIT CHECKOUT ──
// Creates the order (unpaid) then a hosted Xendit Payment Session for it.
// The order is only marked "paid" later, by the webhook below — never by this endpoint,
// since a customer reaching the success page proves nothing on its own.
app.post('/api/checkout', async (req, res) => {
  try {
    const { userId, type, quantity, priority, address, notes, total, lat: bodyLat, lng: bodyLng } = req.body;
    const newId  = id();
    const newRef = 'ORD-' + newId.slice(-6);
    const { lat, lng } = await resolveCoords({ lat: bodyLat, lng: bodyLng, address });

    await pool.query(
      `INSERT INTO orders (id, ref, userId, type, quantity, status, total, address, priority, notes, lat, lng, paymentStatus)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'unpaid')`,
      [newId, newRef, userId, type, quantity || 1, 'Pending', total || 0, address || '', priority || 'normal', notes || '', lat, lng]
    );

    const [[user]] = await pool.query('SELECT fullName, email FROM users WHERE id = ?', [userId]);

    const backendPublicUrl = await getSetting('backend_public_url');
    if (!backendPublicUrl) {
      return res.status(503).json({
        success: false,
        message: 'Backend public URL is not configured. Set it in Admin → Settings (needed for GCash return links).',
      });
    }

    // Prefer the page the customer checked out from (production domain), then Settings → Frontend URL.
    const frontendBase = await resolveFrontendBase(
      req.body?.returnOrigin || req.get('origin') || req.get('referer')
    );
    const frontQs = `&front=${encodeURIComponent(frontendBase)}`;

    const session = await xenditRequest('/sessions', {
      reference_id: newId, // carried straight through to the webhook — used to find this order again
      session_type: 'PAY',
      mode: 'PAYMENT_LINK',
      currency: 'PHP',
      amount: total,
      country: 'PH',
      description: `AguaDoc — ${type} (${quantity} gal)`,
      customer: {
        reference_id: `${userId}-${newId}`, // unique per order — Xendit rejects reusing a customer reference_id
        type: 'INDIVIDUAL',
        email: user?.email || undefined,
        individual_detail: { given_names: user?.fullName || 'Customer' },
      },
      success_return_url: `${backendPublicUrl}/return?checkout=success&orderId=${newId}${frontQs}`,
      cancel_return_url:  `${backendPublicUrl}/return?checkout=cancel&orderId=${newId}${frontQs}`,
    });

    await pool.query('UPDATE orders SET checkoutSessionId = ? WHERE id = ?', [session.payment_session_id, newId]);

    res.json({ orderId: newId, checkoutUrl: session.payment_link_url });
  } catch (err) {
    console.error('Checkout creation failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xendit calls this when a payment session is actually completed. This — not the customer's
// browser redirect — is the real source of truth for whether money changed hands.
app.post('/api/webhooks/xendit', async (req, res) => {
  try {
    if (!(await verifyXenditWebhook(req.headers['x-callback-token']))) {
      console.warn('Rejected webhook: bad or missing callback token');
      return res.status(401).json({ success: false, message: 'Invalid callback token' });
    }

    const { event, data } = req.body;
    if (event === 'payment_session.completed' && data?.status === 'COMPLETED') {
      const orderId = data.reference_id; // the order id we set at session creation
      if (orderId) {
        await pool.query("UPDATE orders SET paymentStatus = 'paid' WHERE id = ?", [orderId]);
        const [[order]] = await pool.query('SELECT ref, userId, total FROM orders WHERE id = ?', [orderId]);

        // This was the missing piece — Payment History reads from the `payments` table,
        // which a Xendit-confirmed payment never wrote to before now.
        if (order) {
          await pool.query(
            'INSERT INTO payments (id, custId, orderId, amount, method) VALUES (?,?,?,?,?)',
            [id(), order.userId, orderId, order.total, 'Xendit']
          );
        }

        await createNotification({
          audience: 'admin',
          message: `Payment confirmed via Xendit for order ${order?.ref || orderId}.`,
          type: 'Payment',
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handling failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

function isOfflinePayMethod(method) {
  const m = String(method || '').toLowerCase();
  return (
    m.includes('cash') ||
    m.includes('arrival') ||
    m.includes('cod') ||
    m.includes('pay on') ||
    m.includes('walk-in')
  );
}

/** Record cash/COD payment when an offline order is completed at the station or by the rider. */
async function settleOfflineOrderPayment(order) {
  if (!order?.id) return null;
  if (String(order.paymentStatus || '').toLowerCase() === 'paid') return null;
  if (!isOfflinePayMethod(order.payMethod)) return null;

  const [[existing]] = await pool.query(
    'SELECT id FROM payments WHERE orderId = ? LIMIT 1',
    [order.id]
  );
  if (existing) {
    await pool.query("UPDATE orders SET paymentStatus = 'paid' WHERE id = ?", [order.id]);
    return existing;
  }

  const paymentId = id();
  await pool.query(
    'INSERT INTO payments (id, custId, orderId, amount, method) VALUES (?,?,?,?,?)',
    [
      paymentId,
      order.userId || null,
      order.id,
      roundMoney(order.total),
      order.payMethod || 'Cash',
    ]
  );
  await pool.query("UPDATE orders SET paymentStatus = 'paid' WHERE id = ?", [order.id]);
  return { id: paymentId };
}

/** Liters drawn from the station tank per ordered gallon jug (~5-gal refill). */
const LITERS_PER_ORDER_GALLON = 19;

/**
 * Deduct stock + tank water once when an order is fulfilled (Delivered / Ready to Go).
 * Default refill kit: slim refill + cap + seal. Empty containers are not deducted.
 */
async function consumeInventoryForOrder(order) {
  if (!order?.id) return null;
  const qty = Math.max(0, parseInt(order.quantity, 10) || 0);
  if (qty < 1) return null;

  try {
    const [[fresh]] = await pool.query(
      'SELECT id, quantity, inventoryConsumedAt, ref FROM orders WHERE id = ? LIMIT 1',
      [order.id]
    );
    if (!fresh || fresh.inventoryConsumedAt) return null;
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      console.warn('inventoryConsumedAt missing — run migration 008_inventory_consume.sql');
      return null;
    }
    console.warn('consumeInventoryForOrder check failed:', err.message);
    return null;
  }

  const liters = qty * LITERS_PER_ORDER_GALLON;
  const deductions = [
    { id: 'stk-ref-slim', qty },
    { id: 'stk-caps', qty },
    { id: 'stk-seals', qty },
  ];

  for (const d of deductions) {
    const [[item]] = await pool.query('SELECT * FROM stock_items WHERE id = ? LIMIT 1', [d.id]);
    if (!item) continue;
    const beforeStock = Number(item.stock) || 0;
    const afterStock = Math.max(0, beforeStock - d.qty);
    await pool.query('UPDATE stock_items SET stock = ? WHERE id = ?', [afterStock, d.id]);

    const logId = `cl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await pool.query(
        `INSERT INTO restock_logs
           (id, stockItemId, itemName, category, quantityAdded, stockBefore, stockAfter, performedBy, note)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          logId,
          item.id,
          item.name,
          item.category,
          -d.qty,
          beforeStock,
          afterStock,
          'System',
          `Consumed by order ${order.ref || order.id}`,
        ]
      );
    } catch (logErr) {
      console.warn('Stock consume log failed:', logErr.message);
    }

    if (afterStock <= Number(item.minAlert) && beforeStock > Number(item.minAlert)) {
      await createNotification({
        audience: 'admin',
        message: `Low stock after order ${order.ref || order.id}: ${item.name} is at ${afterStock} (min ${item.minAlert}).`,
        type: 'Inventory',
      });
    }
  }

  const [[tank]] = await pool.query(
    'SELECT waterLevel, maxCapacity, readyGallons, totalGallons FROM inventory WHERE id = 1'
  );
  if (tank) {
    const prevLevel = parseFloat(tank.waterLevel) || 0;
    const maxCap = parseFloat(tank.maxCapacity) || 10000;
    const nextLevel = Math.max(0, Math.round((prevLevel - liters) * 100) / 100);
    const nextReady = Math.max(0, (parseInt(tank.readyGallons, 10) || 0) - qty);
    const nextTotal = (parseInt(tank.totalGallons, 10) || 0) + qty;

    await pool.query(
      'UPDATE inventory SET waterLevel = ?, readyGallons = ?, totalGallons = ? WHERE id = 1',
      [nextLevel, nextReady, nextTotal]
    );

    const oldPct = maxCap > 0 ? (prevLevel / maxCap) * 100 : 100;
    const newPct = maxCap > 0 ? (nextLevel / maxCap) * 100 : 0;
    if (newPct < LOW_STOCK_THRESHOLD && oldPct >= LOW_STOCK_THRESHOLD) {
      await createNotification({
        audience: 'admin',
        message: `Water supply low: ${Math.round(newPct)}% remaining after order ${order.ref || order.id}.`,
        type: 'Inventory',
      });
    }
  }

  try {
    await pool.query('UPDATE orders SET inventoryConsumedAt = NOW() WHERE id = ?', [order.id]);
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') {
      console.warn('Failed to mark inventoryConsumedAt:', err.message);
    }
  }

  return { qty, liters };
}

/** Fix older walk-in/COD orders that were completed before payment rows were written. */
async function backfillOfflinePayments({ userId } = {}) {
  const params = [];
  let sql = `
    SELECT * FROM orders
    WHERE status IN ('Ready to Go', 'Delivered')
      AND (paymentStatus IS NULL OR paymentStatus = '' OR LOWER(paymentStatus) != 'paid')
  `;
  if (userId) {
    sql += ' AND userId = ?';
    params.push(userId);
  }
  const [rows] = await pool.query(sql, params);
  for (const order of rows) {
    if (isOfflinePayMethod(order.payMethod)) {
      await settleOfflineOrderPayment(order);
    }
  }
}

app.put('/api/orders/:id', async (req, res) => {
  try {
    const { status, type, quantity } = req.body;
    const [[before]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    await pool.query(
      'UPDATE orders SET status=?, type=?, quantity=? WHERE id=?',
      [status, type, quantity, req.params.id]
    );

    // Walk-in / COD: cash + stock/tank deduction when the order is completed
    if (
      before &&
      status &&
      status !== before.status &&
      (status === 'Ready to Go' || status === 'Delivered')
    ) {
      await settleOfflineOrderPayment({ ...before, status });
      await consumeInventoryForOrder(before);
    }

    const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);

    if (before && status && status !== before.status) {
      await createNotification({
        audience: 'customer',
        userId: before.userId,
        message: `Your order ${before.ref} is now ${status}.`,
        type: 'Order',
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Failed to update order:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PAYMENTS ──
app.get('/api/payments', async (req, res) => {
  try {
    const { userId } = req.query;
    await backfillOfflinePayments(userId ? { userId } : {});
    if (userId) {
      const [rows] = await pool.query(
        `SELECT p.*, o.ref AS orderRef, o.type AS orderType, o.status AS orderStatus
         FROM payments p
         LEFT JOIN orders o ON o.id = p.orderId
         WHERE p.custId = ?
         ORDER BY p.date DESC`,
        [userId]
      );
      return res.json(rows);
    }
    const [rows] = await pool.query(
      `SELECT p.*, o.ref AS orderRef
       FROM payments p
       LEFT JOIN orders o ON o.id = p.orderId
       ORDER BY p.date DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to load payments:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

const DEBT_PRICE_PER_GALLON = 40;

/** Apply a cash/GCash collection against Debt Management balance + credit gallons. */
async function applyPaymentToCustomerDebt(custId, amount) {
  if (!custId) return null;
  const paid = roundMoney(amount);
  if (paid <= 0) return null;

  const [[cust]] = await pool.query('SELECT * FROM customers WHERE id = ? LIMIT 1', [custId]);
  if (!cust) return null;

  const prevBalance = roundMoney(cust.balance);
  const newBalance = roundMoney(Math.max(0, prevBalance - paid));
  // Keep gallons-on-credit in sync — Debt Management derives display balance from orders × ₱40
  const newOrders = Math.max(0, Math.floor((newBalance + 1e-9) / DEBT_PRICE_PER_GALLON));

  await pool.query(
    'UPDATE customers SET balance = ?, orders = ? WHERE id = ?',
    [newBalance, newOrders, custId]
  );

  const [[updated]] = await pool.query('SELECT * FROM customers WHERE id = ?', [custId]);
  return updated;
}

app.post('/api/payments', async (req, res) => {
  try {
    const { custId, orderId, amount, method } = req.body;
    const paid = roundMoney(amount);
    if (!custId) {
      return res.status(400).json({ success: false, message: 'Customer is required.' });
    }
    if (paid <= 0) {
      return res.status(400).json({ success: false, message: 'Enter a valid payment amount.' });
    }

    const newId = id();
    await pool.query(
      'INSERT INTO payments (id, custId, orderId, amount, method) VALUES (?,?,?,?,?)',
      [newId, custId, orderId || null, paid, method || 'Cash']
    );
    const [[payment]] = await pool.query('SELECT * FROM payments WHERE id = ?', [newId]);

    // Always reduce debt on the server so Debt Management cannot stay stale
    const customer = await applyPaymentToCustomerDebt(custId, paid);

    if (await customerHasAccount(custId)) {
      await createNotification({
        audience: 'customer',
        userId: custId,
        message: `Payment of ${formatPeso(paid)} received via ${method || 'Cash'} — thank you!`,
        type: 'Payment',
      });
    }

    res.json({ ...payment, customer });
  } catch (err) {
    console.error('Failed to record payment:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── INVENTORY ──
app.get('/api/inventory', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM inventory WHERE id = 1');
  res.json(rows[0]);
});

app.put('/api/inventory', async (req, res) => {
  try {
    const { waterLevel, maxCapacity, readyGallons, totalGallons } = req.body;
    const [[before]] = await pool.query('SELECT waterLevel, maxCapacity FROM inventory WHERE id = 1');

    await pool.query(
      'UPDATE inventory SET waterLevel=?, maxCapacity=?, readyGallons=?, totalGallons=? WHERE id=1',
      [waterLevel, maxCapacity, readyGallons, totalGallons]
    );
    const [rows] = await pool.query('SELECT * FROM inventory WHERE id = 1');

    const oldPct = before ? (before.waterLevel / before.maxCapacity) * 100 : 100;
    const newPct = (waterLevel / maxCapacity) * 100;
    if (newPct < LOW_STOCK_THRESHOLD && oldPct >= LOW_STOCK_THRESHOLD) {
      await createNotification({
        audience: 'admin',
        message: `Water supply low: ${Math.round(newPct)}% remaining.`,
        type: 'Inventory',
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Failed to update inventory:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── STOCK ITEMS (Inventory Monitor catalog) ──
app.get('/api/stock-items', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM stock_items ORDER BY category, name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/stock-items/:id/restock', async (req, res) => {
  try {
    const qty = Math.max(1, parseInt(req.body.quantity, 10) || 0);
    const performedBy = String(req.body.performedBy || 'Admin').slice(0, 255);
    const note = req.body.note != null ? String(req.body.note).slice(0, 500) : null;
    const [[before]] = await pool.query('SELECT * FROM stock_items WHERE id = ?', [req.params.id]);
    if (!before) return res.status(404).json({ success: false, message: 'Item not found' });

    await pool.query('UPDATE stock_items SET stock = stock + ? WHERE id = ?', [qty, req.params.id]);
    const [[row]] = await pool.query('SELECT * FROM stock_items WHERE id = ?', [req.params.id]);

    const logId = `rl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await pool.query(
      `INSERT INTO restock_logs
         (id, stockItemId, itemName, category, quantityAdded, stockBefore, stockAfter, performedBy, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [logId, before.id, before.name, before.category, qty, before.stock, row.stock, performedBy, note]
    );
    const [[log]] = await pool.query('SELECT * FROM restock_logs WHERE id = ?', [logId]);

    await createNotification({
      audience: 'admin',
      message: `Restocked ${before.name}: +${qty} (now ${row.stock}).`,
      type: 'Inventory',
    });

    res.json({ item: row, log });
  } catch (err) {
    console.error('Failed to restock:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/restock-logs', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const [rows] = await pool.query(
      'SELECT * FROM restock_logs ORDER BY createdAt DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/stock-items/:id', async (req, res) => {
  try {
    const { stock, minAlert, unitPrice } = req.body;
    const [[before]] = await pool.query('SELECT * FROM stock_items WHERE id = ?', [req.params.id]);
    if (!before) return res.status(404).json({ success: false, message: 'Item not found' });

    await pool.query(
      `UPDATE stock_items SET
         stock = COALESCE(?, stock),
         minAlert = COALESCE(?, minAlert),
         unitPrice = COALESCE(?, unitPrice)
       WHERE id = ?`,
      [
        stock != null ? parseInt(stock, 10) : null,
        minAlert != null ? parseInt(minAlert, 10) : null,
        unitPrice != null ? parseFloat(unitPrice) : null,
        req.params.id,
      ]
    );

    const [[row]] = await pool.query('SELECT * FROM stock_items WHERE id = ?', [req.params.id]);
    if (row.stock <= row.minAlert) {
      await createNotification({
        audience: 'admin',
        message: `Low stock: ${row.name} is at ${row.stock} (min ${row.minAlert}).`,
        type: 'Inventory',
      });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CONTAINERS ──
app.get('/api/containers', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM containers ORDER BY createdAt DESC');
  res.json(rows);
});

app.post('/api/containers', async (req, res) => {
  const { id: cid, status, lastRefill } = req.body;
  await pool.query(
    'INSERT INTO containers (id, status, lastRefill) VALUES (?,?,?)',
    [cid, status, lastRefill]
  );
  const [rows] = await pool.query('SELECT * FROM containers WHERE id = ?', [cid]);
  res.json(rows[0]);
});

app.delete('/api/containers/:id', async (req, res) => {
  await pool.query('DELETE FROM containers WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── SMS (Semaphore) ──
// Docs: POST https://api.semaphore.co/api/v4/messages
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';
const SEMAPHORE_ACCOUNT_URL = 'https://api.semaphore.co/api/v4/account';
const PENDING_DELIVERY_STATUSES = [
  'Pending',
  'Assigned',
  'Accepted',
  'Processing',
  'Out for Delivery',
];

/** Normalize PH mobile numbers for Semaphore (09XXXXXXXXX or 639XXXXXXXXX). */
function normalizePhMobile(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('630') && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.startsWith('63') && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`;
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return digits;
  return null;
}

function personalizeSms(template, { name, status, ref, address, rider } = {}) {
  return String(template || '')
    .replace(/\[Name\]/gi, name || 'Customer')
    .replace(/\[Status\]/gi, status || '')
    .replace(/\[Order\]/gi, ref || '')
    .replace(/\[Address\]/gi, address || '')
    .replace(/\[Rider\]/gi, rider || 'your rider');
}

async function resolveCustomerContact(userId) {
  if (!userId) return { name: 'Customer', phone: null };
  const [[user]] = await pool.query(
    'SELECT fullName, phone FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const [[customer]] = await pool.query(
    'SELECT fullName, phone FROM customers WHERE id = ? LIMIT 1',
    [userId]
  );
  return {
    name: user?.fullName || customer?.fullName || 'Customer',
    phone: normalizePhMobile(user?.phone || customer?.phone || null),
  };
}

/**
 * Fire-and-forget friendly: returns a result object, never throws to callers.
 * Used when a rider accepts a delivery booking.
 */
async function sendRiderAcceptedSms({ order, riderName }) {
  try {
    const contact = await resolveCustomerContact(order.userId);
    if (!contact.phone) {
      return { ok: false, skipped: true, reason: 'Customer has no valid mobile number' };
    }

    const message = personalizeSms(
      'Hi [Name], your AguaDoc order [Order] was accepted by [Rider]. We are preparing your delivery to [Address]. Salamat!',
      {
        name: contact.name,
        ref: order.ref || order.id,
        address: order.address || 'your address',
        rider: riderName || 'your rider',
        status: 'Accepted',
      }
    );

    const data = await sendSemaphoreSms({ number: contact.phone, message });
    const first = Array.isArray(data) ? data[0] : data;
    return {
      ok: true,
      phone: contact.phone,
      messageId: first?.message_id || null,
      status: first?.status || 'Queued',
    };
  } catch (err) {
    console.error('Auto SMS on rider accept failed:', err.message);
    return { ok: false, skipped: false, reason: err.message, code: err.code || null };
  }
}

async function fetchPendingDeliveryRecipients() {
  const placeholders = PENDING_DELIVERY_STATUSES.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT
       o.id AS orderId,
       o.ref,
       o.status,
       o.type,
       o.quantity,
       o.total,
       o.address,
       o.date,
       o.userId,
       COALESCE(u.fullName, c.fullName, 'Customer') AS customerName,
       COALESCE(NULLIF(TRIM(u.phone), ''), NULLIF(TRIM(c.phone), '')) AS phone
     FROM orders o
     LEFT JOIN users u ON u.id = o.userId
     LEFT JOIN customers c ON c.id = o.userId
     WHERE o.status IN (${placeholders})
     ORDER BY o.date DESC`,
    PENDING_DELIVERY_STATUSES
  );

  return rows.map((row) => {
    const normalizedPhone = normalizePhMobile(row.phone);
    return {
      ...row,
      phone: row.phone || null,
      normalizedPhone,
      canSms: Boolean(normalizedPhone),
    };
  });
}

function extractSemaphoreError(data, status) {
  if (data == null) return `Semaphore request failed (${status})`;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (Array.isArray(data)) {
    const first = data[0];
    return first?.message || first?.error || first?.detail || JSON.stringify(first);
  }
  if (typeof data === 'object') {
    if (data.message) return String(data.message);
    if (data.error) return String(data.error);
    if (data.errors) {
      if (typeof data.errors === 'string') return data.errors;
      if (Array.isArray(data.errors)) return data.errors.map((e) => e?.message || e).join('; ');
      if (typeof data.errors === 'object') {
        return Object.entries(data.errors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('; ');
      }
    }
  }
  return `Semaphore request failed (${status})`;
}

async function sendSemaphoreSms({ number, message }) {
  const apikey = await getSetting('semaphore_api_key');
  if (!apikey) {
    const err = new Error('Semaphore API key is not configured. Set it in Admin → Settings.');
    err.code = 'SMS_NOT_CONFIGURED';
    throw err;
  }

  const body = new URLSearchParams();
  body.set('apikey', apikey);
  body.set('number', number);
  body.set('message', message);
  const senderName = await getSetting('semaphore_sender_name');
  if (senderName) body.set('sendername', senderName);

  const resp = await fetch(SEMAPHORE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const rawText = await resp.text();
  let data = null;
  try { data = rawText ? JSON.parse(rawText) : null; } catch { data = rawText; }

  if (!resp.ok) {
    let msg = extractSemaphoreError(data, resp.status);
    // Common Semaphore failure when account has no approved sender name
    if (resp.status >= 500 && !senderName) {
      msg += ' — Often caused by no approved Sender Name. Apply for one in Semaphore, then set it in Integrations.';
    } else if (resp.status >= 500 && senderName) {
      msg += ' — Check Semaphore credits, that the sender name is Approved, and the API key is correct.';
    }
    const err = new Error(msg);
    err.details = data;
    err.status = resp.status;
    throw err;
  }
  return data;
}

app.get('/api/sms/status', async (req, res) => {
  try {
    const apikey = await getSetting('semaphore_api_key');
    const senderName = await getSetting('semaphore_sender_name');
    const payload = {
      configured: Boolean(apikey),
      senderName: senderName || null,
      provider: 'Semaphore',
      source: await getSettingSource('semaphore_api_key'),
    };
    if (!apikey) return res.json(payload);

    try {
      const url = `${SEMAPHORE_ACCOUNT_URL}?apikey=${encodeURIComponent(apikey)}`;
      const resp = await fetch(url);
      const data = await resp.json().catch(() => null);
      if (resp.ok && data) {
        payload.account = {
          creditBalance: data.credit_balance ?? data.balance ?? null,
          accountName: data.account_name || data.name || null,
        };
      }
    } catch {
      // Account lookup is optional — sending can still work.
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN SETTINGS (Xendit/GCash + Semaphore) ──
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getPublicSettings();
    res.json({
      settings,
      groups: {
        payments: {
          title: 'GCash / Xendit payments',
          keys: ['xendit_secret_key', 'xendit_webhook_token', 'backend_public_url'],
        },
        sms: {
          title: 'Semaphore SMS',
          keys: ['semaphore_api_key', 'semaphore_sender_name'],
        },
        maps: {
          title: 'MapLibre + Geoapify',
          keys: ['geoapify_api_key'],
        },
      },
    });
  } catch (err) {
    console.error('Failed to load settings:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public map config for MapLibre (API key is restricted by Geoapify domain rules)
app.get('/api/maps/config', async (req, res) => {
  try {
    const apiKey = await getSetting('geoapify_api_key');
    res.json({
      provider: 'geoapify',
      apiKey: apiKey || '',
      configured: Boolean(apiKey),
      styles: {
        light: apiKey
          ? `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${encodeURIComponent(apiKey)}`
          : null,
        dark: apiKey
          ? `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${encodeURIComponent(apiKey)}`
          : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const incoming = req.body?.settings || {};
    const updatedBy = req.body?.updatedBy || 'Admin';
    const allowed = Object.keys(SETTINGS_META);
    const changed = [];

    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
      const next = incoming[key];
      // null/undefined = leave unchanged; '' = clear admin override (fall back to .env)
      if (next === null || next === undefined) continue;
      if (SETTINGS_META[key].secret && String(next).includes('•')) {
        // Ignore masked placeholder submissions
        continue;
      }
      await upsertSetting(key, next, updatedBy);
      changed.push(key);
    }

    await createNotification({
      audience: 'admin',
      message: changed.length
        ? `Integration settings updated (${changed.join(', ')}).`
        : 'Settings saved (no changes detected).',
      type: 'System',
    });

    res.json({ success: true, changed, settings: await getPublicSettings() });
  } catch (err) {
    console.error('Failed to save settings:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/sms/pending-deliveries', async (req, res) => {
  try {
    const recipients = await fetchPendingDeliveryRecipients();
    res.json({
      count: recipients.length,
      smsReady: recipients.filter((r) => r.canSms).length,
      recipients,
    });
  } catch (err) {
    console.error('Failed to list SMS recipients:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/sms/send', async (req, res) => {
  try {
    const {
      orderIds,
      message,
      sendAll = false,
    } = req.body || {};

    const template = String(message || '').trim();
    if (!template) {
      return res.status(400).json({ success: false, message: 'Message is required.' });
    }
    if (/^\s*TEST\b/i.test(template)) {
      return res.status(400).json({
        success: false,
        message: 'Semaphore ignores messages that start with "TEST". Please rephrase.',
      });
    }

    const all = await fetchPendingDeliveryRecipients();
    let selected = all;
    if (!sendAll) {
      const idSet = new Set((Array.isArray(orderIds) ? orderIds : []).map(String));
      if (idSet.size === 0) {
        return res.status(400).json({ success: false, message: 'Select at least one recipient.' });
      }
      selected = all.filter((r) => idSet.has(String(r.orderId)));
    }

    const eligible = selected.filter((r) => r.canSms);
    if (eligible.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No selected customers have a valid Philippine mobile number.',
      });
    }

    const results = [];
    for (const row of eligible) {
      const text = personalizeSms(template, {
        name: row.customerName,
        status: row.status,
        ref: row.ref,
        address: row.address,
      });
      try {
        const data = await sendSemaphoreSms({
          number: row.normalizedPhone,
          message: text,
        });
        const first = Array.isArray(data) ? data[0] : data;
        results.push({
          orderId: row.orderId,
          customerName: row.customerName,
          phone: row.normalizedPhone,
          ok: true,
          status: first?.status || 'Queued',
          messageId: first?.message_id || null,
        });
      } catch (err) {
        results.push({
          orderId: row.orderId,
          customerName: row.customerName,
          phone: row.normalizedPhone,
          ok: false,
          error: err.message,
        });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    await createNotification({
      audience: 'admin',
      message: `SMS blast via Semaphore: ${sent} sent, ${failed} failed (pending deliveries).`,
      type: 'System',
    });

    res.json({
      success: failed === 0,
      sent,
      failed,
      skipped: selected.length - eligible.length,
      results,
    });
  } catch (err) {
    console.error('Failed to send SMS:', err.message);
    const status = err.code === 'SMS_NOT_CONFIGURED' ? 503 : 500;
    res.status(status).json({ success: false, message: err.message, details: err.details || null });
  }
});

// Serve the Vite production build (repo-root /dist) when present — used on Hostinger.
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get(/^(?!\/api).*/, (req, res, next) => {
  const indexHtml = path.join(distPath, 'index.html');
  res.sendFile(indexHtml, (err) => (err ? next() : undefined));
});

app.listen(PORT, () => {
  console.log(`🚀 AguaDoc Backend running on http://localhost:${PORT}`);
  checkUnpaidBalances();                                   // run once at startup
  setInterval(checkUnpaidBalances, 10 * 60 * 1000);        // then re-check every 10 minutes
});