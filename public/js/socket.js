import { addMessage } from './state.js';
import { appendMessage } from './ui.js';

let socket;

export function initSocket(token) {
  socket = io({ auth: { token } });
  socket.on('new-message', (msg) => {
    addMessage(msg);
    appendMessage(msg);
  });
}

export function sendMessage(partner, content) {
  return new Promise((resolve) => {
    socket.emit('send-message', { recipient: partner, content }, resolve);
  });
}
