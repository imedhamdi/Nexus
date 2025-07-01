import { state } from './state.js';

const contactsList = document.getElementById('contacts-list');
const messagesContainer = document.getElementById('messages-container');

export function showContactsSkeleton() {
  contactsList.classList.add('loading');
  contactsList.innerHTML = '<div class="contact-skeleton skeleton"></div>'.repeat(5);
}

export function hideContactsSkeleton() {
  contactsList.classList.remove('loading');
  contactsList.innerHTML = '';
}

export function showMessagesSkeleton() {
  messagesContainer.classList.add('loading');
  messagesContainer.innerHTML = '<div class="message-skeleton skeleton"></div>'.repeat(3);
}

export function hideMessagesSkeleton() {
  messagesContainer.classList.remove('loading');
  messagesContainer.innerHTML = '';
}

export function appendMessage(m) {
  const div = document.createElement('div');
  div.className = 'message';
  div.textContent = m.content;
  messagesContainer.appendChild(div);
}
