// Who is using the app right now. Services use it to record who did what
// (sales, voids, expenses, stock changes).
let currentUser = null

export function setCurrentUser(user) { currentUser = user }
export function getCurrentUser() { return currentUser }
export function currentUserName() { return currentUser?.name || null }
