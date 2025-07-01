import { setupAuth } from './auth.js';
import { fetchContacts } from './api.js';
import { initSocket } from './socket.js';
import { showMessagesSkeleton, hideMessagesSkeleton, hideContactsSkeleton } from './ui.js';
import { setContacts } from './state.js';

setupAuth();

const token = localStorage.getItem('nexus_token');
if (token) {
  initSocket(token);
  loadContacts(token);
}

async function loadContacts(token) {
  const contacts = await fetchContacts(token);
  hideContactsSkeleton();
  setContacts(contacts);
}
