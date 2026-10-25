// Hostinger / production entry — keeps root package.json as ESM (Vite) while
// bootstrapping the CommonJS Express API in backend/server.js.
require('./backend/server.js');
