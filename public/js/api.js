import { askPin } from './ui.js';

export async function api(path, { method = 'GET', body, raw, contentType, query } = {}) {
  const headers = { 'X-Ember': '1' };
  let payload;
  if (raw) {
    payload = raw;
    headers['Content-Type'] = contentType;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  let r;
  try {
    r = await fetch(`/api${path}${qs}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw Object.assign(new Error("You're offline. Check your connection."), { status: 0 });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: r.status, data });
  return data;
}

/** Calls fn(pin); if the server says a PIN is needed, asks for it and retries. */
export async function withPin(fn, message) {
  try {
    return await fn(undefined);
  } catch (e) {
    if (!e.data?.needPin) throw e;
    const pin = await askPin(message || e.message);
    if (pin === null) throw Object.assign(new Error('Cancelled'), { cancelled: true });
    return fn(pin);
  }
}

// Shared app state with a tiny pub/sub.
const listeners = new Set();
export const state = {
  user: null,
  unread: 0,
  requests: 0,
  set(patch) {
    Object.assign(state, patch);
    for (const l of listeners) l(state);
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
