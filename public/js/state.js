export const state = {
  currentUser: null,
  contacts: [],
  messages: []
};

export function setCurrentUser(user) {
  state.currentUser = user;
}

export function setContacts(list) {
  state.contacts = list;
}

export function addMessage(msg) {
  state.messages.push(msg);
}

export function clearMessages() {
  state.messages = [];
}
