const BASE = '/api';

export async function apiLogin(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

export async function apiAcceptTerms(id, termsVersion) {
  const res = await fetch(`${BASE}/users/${id}/accept-terms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ termsVersion })
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Could not save your agreement');
  return result;
}
export async function apiRegister(data) {
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// CUSTOMERS
export async function apiGetCustomers() {
  const res = await fetch(`${BASE}/customers`);
  return res.json();
}
export async function apiAddCustomer(data) {
  const res = await fetch(`${BASE}/customers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Failed to add customer');
  return result;
}
export async function apiGetAvailableCustomers() {
  const res = await fetch(`${BASE}/customers/available`);
  return res.json();
}
export async function apiLinkCustomer(userId) {
  const res = await fetch(`${BASE}/customers/link/${userId}`, { method: 'POST' });
  return res.json();
}
export async function apiUpdateCustomer(id, data) {
  const res = await fetch(`${BASE}/customers/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Failed to update customer');
  return result;
}
export async function apiDeleteCustomer(id) {
  const res = await fetch(`${BASE}/customers/${id}`, { method: 'DELETE' });
  return res.json();
}

// ORDERS
export async function apiGetOrders(userId = null) {
  const url = userId ? `${BASE}/orders?userId=${userId}` : `${BASE}/orders`;
  const res = await fetch(url);
  return res.json();
}
export async function apiAddOrder(data) {
  const res = await fetch(`${BASE}/orders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
export async function apiUpdateOrder(id, data) {
  const res = await fetch(`${BASE}/orders/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
export async function apiAssignRider(orderId, riderId) {
  const res = await fetch(`${BASE}/orders/${orderId}/assign-rider`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ riderId }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Failed to assign rider');
  return result;
}
export async function apiGetDeliveryRoute() {
  const res = await fetch(`${BASE}/delivery-route`);
  return res.json();
}

// RIDER
export async function apiGetRiderBookings(riderId) {
  const res = await fetch(`${BASE}/rider/bookings?riderId=${encodeURIComponent(riderId)}`);
  return res.json();
}
export async function apiUpdateRiderBookingStatus(orderId, riderId, status) {
  const res = await fetch(`${BASE}/rider/bookings/${orderId}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ riderId, status }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Could not update status');
  return result;
}
export async function apiGetRiderRoute(fromLat, fromLng, toLat, toLng) {
  const qs = new URLSearchParams({ fromLat, fromLng, toLat, toLng });
  const res = await fetch(`${BASE}/rider/route?${qs}`);
  return res.json();
}

// PAYMENTS
export async function apiGetPayments() {
  const res = await fetch(`${BASE}/payments`);
  return res.json();
}
export async function apiAddPayment(data) {
  const res = await fetch(`${BASE}/payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// INVENTORY
export async function apiGetInventory() {
  const res = await fetch(`${BASE}/inventory`);
  return res.json();
}
export async function apiUpdateInventory(data) {
  const res = await fetch(`${BASE}/inventory`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

// STOCK ITEMS
export async function apiGetStockItems() {
  const res = await fetch(`${BASE}/stock-items`);
  return res.json();
}
export async function apiRestockItem(id, quantity) {
  const res = await fetch(`${BASE}/stock-items/${id}/restock`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Restock failed');
  return result;
}
export async function apiUpdateStockItem(id, data) {
  const res = await fetch(`${BASE}/stock-items/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Update failed');
  return result;
}

// CONTAINERS
export async function apiGetContainers() {
  const res = await fetch(`/api/containers`);
  return res.json();
}
export async function apiAddContainer(data) {
  const res = await fetch(`/api/containers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
export async function apiDeleteContainer(id) {
  const res = await fetch(`/api/containers/${id}`, { method: 'DELETE' });
  return res.json();
}
export async function apiGetUsers() {
  const res = await fetch(`/api/users`);
  return res.json();
}
export async function apiUpdateUser(id, data) {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
export async function apiGetRiderLocation() {
  const res = await fetch(`${BASE}/rider-location`);
  return res.json();
}
export async function apiPostRiderLocation(lat, lng) {
  const res = await fetch(`${BASE}/rider-location`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  });
  return res.json();
}
export async function apiCreateCheckout(data) {
  const res = await fetch(`${BASE}/checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.message || 'Failed to start checkout');
  return result;
}
export async function apiGeocode(q) {
  const res = await fetch(`${BASE}/geocode?q=${encodeURIComponent(q || '')}`);
  return res.json();
}
export async function apiReverseGeocode(lat, lng) {
  const res = await fetch(`${BASE}/reverse-geocode?lat=${lat}&lng=${lng}`);
  return res.json();
}
export async function apiGetNotifications(audience, userId) {
  const qs = audience === 'customer' ? `?audience=customer&userId=${userId}` : `?audience=admin`;
  const res = await fetch(`${BASE}/notifications${qs}`);
  return res.json();
}
export async function apiMarkNotificationRead(id) {
  const res = await fetch(`${BASE}/notifications/${id}/read`, { method: 'PUT' });
  return res.json();
}
export async function apiMarkAllNotificationsRead(audience, userId) {
  const res = await fetch(`${BASE}/notifications/read-all`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience, userId })
  });
  return res.json();
}