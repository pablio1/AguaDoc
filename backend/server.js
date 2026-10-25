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
  try {
    const query = encodeURIComponent(`${address}, Lapu-Lapu City, Cebu, Philippines`);
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`,
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

// ── Notifications helper ──
// audience: 'admin' or 'customer'. userId is required (and only meaningful) for 'customer' notifications.
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

// A walk-in customer's id only matches a real login if an admin explicitly linked their account
// (see /api/customers/link/:userId). This checks that before sending anything to a customer's own dashboard.
async function customerHasAccount(customerId) {
  const [[u]] = await pool.query('SELECT id FROM users WHERE id = ?', [customerId]);
  return !!u;
}

const DEBT_RISK_THRESHOLD = 300;     // matches the "High risk" cutoff used on the Predictions page
const LOW_STOCK_THRESHOLD = 20;      // percent

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
          message: `Reminder: you have an outstanding balance of ₱${c.balance}.`,
          type: 'Debt',
        });
      }
      await pool.query('UPDATE customers SET remindedAt = NOW() WHERE id = ?', [c.id]);
    }

    const totalOwed = debtors.reduce((sum, c) => sum + parseFloat(c.balance), 0);
    await createNotification({
      audience: 'admin',
      message: `${debtors.length} customer(s) have unpaid balances totaling ₱${totalOwed.toFixed(2)}.`,
      type: 'Debt',
    });
  } catch (err) {
    console.warn('Unpaid-balance check failed:', err.message);
  }
}

// ── Xendit (Payment Sessions API — the current recommended integration, not the legacy /v2/invoices) ──
// Docs: https://docs.xendit.co/docs/payment-sessions-overview
const XENDIT_SECRET_KEY     = process.env.XENDIT_SECRET_KEY;
const XENDIT_WEBHOOK_TOKEN  = process.env.XENDIT_WEBHOOK_TOKEN; // exact string, from Dashboard → Settings → Webhooks
const FRONTEND_URL          = process.env.FRONTEND_URL || 'http://localhost:5173'; // your local Vite dev server — never needs to be HTTPS
const BACKEND_PUBLIC_URL    = process.env.BACKEND_PUBLIC_URL; // your ngrok HTTPS URL for this backend (e.g. https://xxxx.ngrok-free.dev)

async function xenditRequest(path, body) {
  const res = await fetch(`https://api.xendit.co${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Xendit uses HTTP Basic auth: secret key as the username, blank password.
      'Authorization': 'Basic ' + Buffer.from(`${XENDIT_SECRET_KEY}:`).toString('base64'),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Xendit request failed');
  return data;
}

// Xendit signs webhooks with a fixed verification token in the x-callback-token header —
// a plain (constant-time) string compare against your Dashboard token, no HMAC needed.
function verifyXenditWebhook(headerToken) {
  const crypto = require('crypto');
  if (!headerToken || headerToken.length !== XENDIT_WEBHOOK_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(XENDIT_WEBHOOK_TOKEN));
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

// Xendit redirects the customer's browser here after payment (this URL must be public/HTTPS,
// which is why it points at this tunneled backend). We just bounce them back to your real,
// local frontend — this route does nothing but forward the query params along.
app.get('/return', (req, res) => {
  const { checkout, orderId } = req.query;
  res.redirect(`${FRONTEND_URL}/?checkout=${checkout}&orderId=${orderId}`);
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
  res.json(rows);
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
      [newId, fullName, email || null, phone, address, balance || 0]
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

    await pool.query(
      'UPDATE customers SET fullName=?, email=?, phone=?, address=?, balance=?, orders=? WHERE id=?',
      [fullName, email || null, phone, address, balance, orders ?? 0, req.params.id]
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
    const newBalance = parseFloat(balance ?? 0);
    if (newBalance >= DEBT_RISK_THRESHOLD && oldBalance < DEBT_RISK_THRESHOLD) {
      await createNotification({
        audience: 'admin',
        message: `${fullName} now owes ₱${newBalance} — flagged as high debt risk.`,
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
    const [rows] = audience === 'customer'
      ? await pool.query('SELECT * FROM notifications WHERE audience = "customer" AND userId = ? ORDER BY createdAt DESC', [userId])
      : await pool.query('SELECT * FROM notifications WHERE audience = "admin" ORDER BY createdAt DESC');
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
    if (audience === 'customer') {
      await pool.query('UPDATE notifications SET `read` = 1 WHERE audience = "customer" AND userId = ?', [userId]);
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
    ? await pool.query('SELECT * FROM orders WHERE userId = ? ORDER BY date DESC', [userId])
    : await pool.query('SELECT * FROM orders ORDER BY date DESC');
  res.json(rows);
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

// ── RIDER BOOKINGS ──
app.get('/api/rider/bookings', async (req, res) => {
  try {
    const { riderId } = req.query;
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });

    const [available] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o
       LEFT JOIN users u ON u.id = o.userId
       WHERE o.status = 'Pending'
         AND (o.riderId IS NULL OR o.riderId = '')
         AND (o.paymentStatus IS NULL OR o.paymentStatus = '' OR o.paymentStatus = 'paid'
              OR o.payMethod IN ('Cash on Delivery', 'Pay on arrival'))
       ORDER BY
         CASE WHEN o.priority = 'priority' THEN 0 ELSE 1 END,
         o.date ASC`
    );

    const [mine] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o
       LEFT JOIN users u ON u.id = o.userId
       WHERE o.riderId = ?
         AND o.status IN ('Accepted', 'Processing', 'Out for Delivery')
       ORDER BY o.date ASC`,
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

    res.json({ available, mine, done });
  } catch (err) {
    console.error('Failed to load rider bookings:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/rider/bookings/:id/accept', async (req, res) => {
  try {
    const { riderId } = req.body;
    if (!riderId) return res.status(400).json({ success: false, message: 'riderId required' });

    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.riderId && order.riderId !== riderId)
      return res.status(409).json({ success: false, message: 'Already taken by another rider' });
    if (order.status !== 'Pending')
      return res.status(400).json({ success: false, message: `Cannot accept order in status ${order.status}` });

    await pool.query(
      `UPDATE orders SET riderId = ?, status = 'Accepted' WHERE id = ? AND status = 'Pending'`,
      [riderId, req.params.id]
    );

    if (order.userId) {
      await createNotification({
        audience: 'customer',
        userId: order.userId,
        message: `A rider accepted your order ${order.ref}. Delivery is on the way soon.`,
        type: 'Order',
      });
    }
    await createNotification({
      audience: 'admin',
      message: `Rider claimed order ${order.ref}.`,
      type: 'Order',
    });

    const [[row]] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o LEFT JOIN users u ON u.id = o.userId WHERE o.id = ?`,
      [req.params.id]
    );
    res.json(row);
  } catch (err) {
    console.error('Failed to accept booking:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/rider/bookings/:id/status', async (req, res) => {
  try {
    const { riderId, status } = req.body;
    const allowed = ['Accepted', 'Processing', 'Out for Delivery', 'Delivered'];
    if (!riderId || !allowed.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid riderId or status' });

    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.riderId !== riderId)
      return res.status(403).json({ success: false, message: 'Not your booking' });

    await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

    if (order.userId && status !== order.status) {
      await createNotification({
        audience: 'customer',
        userId: order.userId,
        message: status === 'Out for Delivery'
          ? `Your order ${order.ref} is out for delivery — track your rider live.`
          : status === 'Delivered'
            ? `Your order ${order.ref} has been delivered. Thank you!`
            : `Your order ${order.ref} is now ${status}.`,
        type: 'Order',
      });
    }

    const [[row]] = await pool.query(
      `SELECT o.*, u.fullName AS customerName, u.phone AS customerPhone
       FROM orders o LEFT JOIN users u ON u.id = o.userId WHERE o.id = ?`,
      [req.params.id]
    );
    res.json(row);
  } catch (err) {
    console.error('Failed to update rider booking:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Driving directions from rider GPS → drop-off (OSRM free public API)
app.get('/api/rider/route', async (req, res) => {
  try {
    const { fromLat, fromLng, toLat, toLng } = req.query;
    if (![fromLat, fromLng, toLat, toLng].every(Boolean))
      return res.status(400).json({ success: false, message: 'from/to lat,lng required' });

    const osrmRes = await fetch(
      `http://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}` +
      `?overview=full&geometries=geojson`
    );
    const data = await osrmRes.json();
    if (data.code !== 'Ok' || !data.routes?.[0])
      return res.status(500).json({ success: false, message: 'Could not build route' });

    const route = data.routes[0];
    res.json({
      geometry: route.geometry.coordinates, // [lng, lat][]
      distanceM: route.distance,
      durationS: route.duration,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELIVERY ROUTE (optimized stop order via OSRM's free public Trip API) ──
app.get('/api/delivery-route', async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT * FROM orders
       WHERE status IN ('Pending','Accepted','Processing','Out for Delivery')
         AND lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY date ASC`
    );

    if (orders.length === 0) {
      return res.json({ depot: DEPOT, stops: [], geometry: [] });
    }

    // OSRM wants "lng,lat" pairs, depot first so the trip starts there.
    const coordString = [DEPOT, ...orders].map(o => `${o.lng},${o.lat}`).join(';');

    const osrmRes = await fetch(
      `http://router.project-osrm.org/trip/v1/driving/${coordString}` +
      `?source=first&roundtrip=false&geometries=geojson&overview=full`
    );
    const trip = await osrmRes.json();

    if (trip.code !== 'Ok') {
      return res.status(500).json({ success: false, message: 'Route optimization failed', detail: trip });
    }

    // waypoints[i] corresponds to input point i (0 = depot, 1..n = orders[0..n-1]).
    // waypoint_index is where that point falls in the OPTIMIZED visiting order.
    const stops = trip.waypoints
      .map((wp, inputIndex) => ({ inputIndex, tripOrder: wp.waypoint_index }))
      .filter(w => w.inputIndex !== 0)
      .sort((a, b) => a.tripOrder - b.tripOrder)
      .map(w => orders[w.inputIndex - 1]);

    res.json({
      depot: DEPOT,
      stops,
      geometry: trip.trips[0].geometry.coordinates, // array of [lng, lat]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── RIDER LOCATION (live tracking) — a single shared row, updated by whichever
// rider currently has the tracker page open. Good enough for one active delivery run;
// would need a per-rider id if you ever have multiple riders out at once. ──
app.get('/api/rider-location', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT lat, lng, updatedAt FROM rider_location WHERE id = "main"');
    res.json(row || { lat: null, lng: null, updatedAt: null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/rider-location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await pool.query('UPDATE rider_location SET lat = ?, lng = ?, updatedAt = NOW() WHERE id = "main"', [lat, lng]);
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
      success_return_url: `${BACKEND_PUBLIC_URL}/return?checkout=success&orderId=${newId}`,
      cancel_return_url:  `${BACKEND_PUBLIC_URL}/return?checkout=cancel&orderId=${newId}`,
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
    if (!verifyXenditWebhook(req.headers['x-callback-token'])) {
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

app.put('/api/orders/:id', async (req, res) => {
  try {
    const { status, type, quantity } = req.body;
    const [[before]] = await pool.query('SELECT ref, userId, status FROM orders WHERE id = ?', [req.params.id]);

    await pool.query(
      'UPDATE orders SET status=?, type=?, quantity=? WHERE id=?',
      [status, type, quantity, req.params.id]
    );
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
  const [rows] = await pool.query('SELECT * FROM payments ORDER BY date DESC');
  res.json(rows);
});

app.post('/api/payments', async (req, res) => {
  try {
    const { custId, orderId, amount, method } = req.body;
    const newId = id();
    await pool.query(
      'INSERT INTO payments (id, custId, orderId, amount, method) VALUES (?,?,?,?,?)',
      [newId, custId, orderId, amount, method]
    );
    const [rows] = await pool.query('SELECT * FROM payments WHERE id = ?', [newId]);

    if (await customerHasAccount(custId)) {
      await createNotification({
        audience: 'customer',
        userId: custId,
        message: `Payment of ₱${amount} received via ${method} — thank you!`,
        type: 'Payment',
      });
    }

    res.json(rows[0]);
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