const base = '';

export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

export async function register(data) {
  const form = new FormData();
  Object.keys(data).forEach(k => data[k] && form.append(k, data[k]));
  const res = await fetch('/api/auth/register', { method: 'POST', body: form });
  return res.json();
}

export async function fetchContacts(token) {
  const res = await fetch('/api/users', { headers: { Authorization: 'Bearer ' + token } });
  return res.json();
}

export async function fetchMessages(token, partner) {
  const res = await fetch(`/api/messages?partner=${partner}`, { headers: { Authorization: 'Bearer ' + token } });
  return res.json();
}
