import { login, register } from './api.js';
import { setCurrentUser } from './state.js';
import { showContactsSkeleton, hideContactsSkeleton } from './ui.js';

export function setupAuth() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const avatarInput = document.getElementById('avatar-input');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const data = await login(username, password);
    if (data.token) {
      localStorage.setItem('nexus_token', data.token);
      setCurrentUser(data.user);
      hideAuth();
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('register-name').value,
      username: document.getElementById('register-username').value,
      password: document.getElementById('register-password').value,
      avatar: avatarInput.files[0]
    };
    const data = await register(payload);
    if (data.token) {
      localStorage.setItem('nexus_token', data.token);
      setCurrentUser(data.user);
      hideAuth();
    }
  });
}

function hideAuth() {
  document.getElementById('auth-container').classList.add('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  showContactsSkeleton();
}
