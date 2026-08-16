// Where the active host room code is cached client-side (so a page refresh
// doesn't lose the room). This is deliberately NOT the same storage as
// before: keeping it in localStorage let a code minted under one auth
// identity (e.g. an anonymous session) silently survive a later login as a
// different account, which then failed every "does the caller own this
// room" check with a "You do not own this room" error.
//
// - Production: sessionStorage. It's discarded automatically when the
//   browser/tab closes, so a new browser session always starts clean and a
//   logged-in host gets a fresh room code tied to their real identity
//   (see queueSlice.generateRoomCode).
// - Development: localStorage, so devs aren't forced to re-auth / rescan a
//   QR code every time they restart the browser or dev server. Dev mode
//   also never requires logging in - ensureSession() auto-signs-in
//   anonymously either way.
const KEY = 'tunr_host_room_code';
const isDev = process.env.NODE_ENV !== 'production';

function backingStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  return isDev ? window.localStorage : window.sessionStorage;
}

export const roomCodeStorage = {
  get(): string | null {
    if (typeof window === 'undefined') return null;
    // Clean up any leftover value from before this change so a stale
    // localStorage code can never leak back in under a new auth identity.
    if (!isDev) window.localStorage.removeItem(KEY);
    return backingStore()?.getItem(KEY) ?? null;
  },
  set(code: string): void {
    backingStore()?.setItem(KEY, code);
  },
  remove(): void {
    backingStore()?.removeItem(KEY);
  },
};
