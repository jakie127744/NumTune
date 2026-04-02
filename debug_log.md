# Debug Log

Bug:

- Description: Persistent "Black Screen" and video player disappearing on both Host and Stage views.
- Location: `app/host/page.tsx`, `app/stage/page.tsx`, `lib/store.ts`
- Root Cause:
  1. ReactPlayer unmounting during state transitions/database refreshes when `currentSong` briefly became `null`.
  2. YouTube embedding restrictions and browser "Cookie Block" policies.
  3. Browser autoplay policies blocking audio on un-interacted pages.

Fix:

- Summary: Implemented a "Permanent Player" architecture, switched to raw standard IFrames with `youtube-nocookie.com`, and added a "Sticky Song" state logic.
- Files Changed: `app/host/page.tsx`, `app/stage/page.tsx`, `lib/store.ts`
- Why It Works:
  1. Permanent mounting prevents the player from being destroyed during syncs.
  2. Raw IFrames bypass library-specific initialization bugs.
  3. `youtube-nocookie.com` bypasses most common embedding blocks.
  4. "Sticky Logic" hides millisecond-length state gaps where the DB returns no song during a skip.

Prevention:

- Rule or Pattern: Always use permanent containers for continuous playback components (video/audio) to avoid unmounting flickers during state refreshes.
- Future Safeguard: Implement a user interaction "Handshake" (Start Button) for any page requiring audio to avoid silent autoplay blocks.

---

Bug (Update):

- Description: Video showing thumbnail but not playing/advancing automatically after switching to raw IFrame.
- Location: `app/host/page.tsx`, `app/stage/page.tsx`
- Root Cause: Raw IFrames are "dumb" and cannot communicate "onEnded" events back to the React app or the store. Using them fixed visibility but broke automation/sync.

Fix:

- Summary: Implemented "Hybrid Double-Player" architecture.
- Files Changed: `app/host/page.tsx`, `app/stage/page.tsx`
- Why It Works:
  - Visual Layer: Uses a Native IFrame for 100% reliable video playback that bypasses library restrictions.
  - Logic Layer: A hidden, size-0 ReactPlayer runs the same video in parallel. This hidden player handles the "onEnded" event to advance the queue and updates the local timer state, providing the "Handshake" the app needs without interfering with the visual reliability.

Prevention:

- Rule or Pattern: When a player library fails to bypass restrictive browser/video policies, use a Native IFrame for visuals and a separate invisible instance of the library for logic/event handling.
- Future Safeguard: Always check if architectural changes (like switching to raw IFrames) break event-driven features like auto-next logic.

---

Bug (Update):

- Description: Video can be played but not paused from the dashboard after switching to Native IFrame.
- Location: `app/host/page.tsx`, `app/stage/page.tsx`
- Root Cause: Native IFrames do not automatically listen to React state changes for Play/Pause. They require external commands through the YouTube standard messaging protocol.

Fix:

- Summary: Implemented a `postMessage` command bridge.
- Files Changed: `app/host/page.tsx`, `app/stage/page.tsx`
- Why It Works: A `useEffect` hook now monitors the `isPlaying` state and sends a `playVideo` or `pauseVideo` JSON command directly to the visual IFrame's `contentWindow`. This allows the reliable IFrame to remain responsive to dashboard controls.

Prevention:

- Rule or Pattern: When using raw IFrames for third-party players (YouTube/Vimeo), use the `postMessage` API to maintain control over the playback state (Play/Pause/Seek).
- Future Safeguard: Ensure all IFrames have stable IDs to prevent communication failures during re-renders.

---

Bug:

- Description: Macro-component rendering overhead causing poor frame rates during playback.
- Location: `components/host/HostPlayer.tsx`
- Root Cause: HostPlayer used `useState` updated by a high-frequency socket `onSync` listener (10+ times per second). The rapid state updates forced the entire macro-component to re-render.

Fix:

- Summary: Component abstraction for targeted rendering.
- Files Changed: `components/host/HostPlayer.tsx`
- Why It Works: The `elapsed` timeline and its high-frequency state updates were decoupled into a precise localized component `<PlayerProgressBar />`. Now, only the progress bar re-renders continuously rather than taking the heavy iframe container with it.

Prevention:

- Rule or Pattern: Always trap high-frequency mutable state inside dedicated small components rather than the common heavy parent layout component.
- Future Safeguard: Utilize refs instead of state for heavy components where only CSS styles and widths need high-frequency updates.

---

Bug:

- Description: Stage permanently stalled/paused if a video is restricted from embedding ("Play on YouTube" blocking).
- Location: `app/stage/page.tsx`
- Root Cause: Headless ReactPlayer `onError` was only pausing the visual component, allowing embed-restricted or copyright-blocked videos to freeze the session and break the party flow.

Fix:

- Summary: Automated unrestrictable-video fallback logic on the Stage.
- Files Changed: `app/stage/page.tsx`
- Why It Works: Evaluates error codes sent array-via `onError` event hooks (`101` and `150`). Triggers an on-screen toast to the live audience, waits exactly 3 seconds for context building, and programmatically executes a synchronized `playNext()` DB command on the queue to seamlessly recover the session.

Prevention:

- Rule or Pattern: Always implement active fallback mechanisms on critical UI failures where user interaction is physically impossible (remote display monitors).
- Future Safeguard: Add fallback handlers with timeout checks for stream components natively.
