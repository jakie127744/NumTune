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

---

Bug:

- Description: Vercel build failure due to missing type declarations for 'yt-search' and a TypeScript error in SongbookPanel.tsx.
- Location: `app/api/yt-search/route.ts`, `components/host/SongbookPanel.tsx`
- Root Cause: 
  1. The `yt-search` package was missing its corresponding `@types/yt-search` devDependency.
  2. Accessing `video.snippet.thumbnails.medium.url` in `SongbookPanel.tsx` without checking for undefined (as `medium` is optional in the interface).

Fix:

- Summary: Installed missing types and implemented optional chaining for thumbnail access.
- Files Changed: `package.json`, `components/host/SongbookPanel.tsx`
- Why It Works:
  1. Installing `@types/yt-search` provides the necessary TypeScript declarations for the module, resolving the "implicitly has an 'any' type" error.
  2. Adding optional chaining `medium?.url` and a fallback to `high.url` ensures the code safely handles cases where a medium-sized thumbnail is not provided by the API.

Prevention:

- Rule or Pattern: Always check for and install `@types/` packages for third-party libraries when using TypeScript.
- Future Safeguard: Enable strict null checks in `tsconfig.json` (already enabled) and use optional chaining/fallbacks for any nested properties marked as optional in interfaces.

---

Bug:
- Description: Song track looping indefinitely and not advancing to next queue item after ending.
- Location: app/stage/page.tsx, components/host/HostPlayer.tsx, lib/stores/playerSlice.ts
- Root Cause: Dual-layer player strategy caused invisible muted ReactPlayer logic layers to be aggressively throttled by Chromium engine, preventing onEnded events. Furthermore, simultaneous queue advancements triggered race condition dropping session control.

Fix:
- Summary: Replaced dual-layer visual iframe + hidden logic setup with single universally visible ReactPlayer to natively bypass browser throttling safely. Added atomic lock to playNext.
- Files Changed: app/stage/page.tsx, components/host/HostPlayer.tsx, lib/stores/playerSlice.ts
- Why It Works: Visual players actively rendering pixels are exempt from browser throttling. Atomic locking safely ignores redundant queue skips from distributed clients.

Prevention:
- Rule or Pattern: Always use a single player instance for both view and logic. Never rely on hidden/muted iframes for critical lifecycle events.
- Future Safeguard: Race condition checks (affecting 0 rows) should elegantly exit instead of throwing catastrophic session loss alerts.

---

Bug:
- Description: Karaoke track queue failed to auto-advance at the end of a song, looping indefinitely.
- Location: app/stage/page.tsx, components/host/HostPlayer.tsx
- Root Cause: Missing interaction with the raw YouTube IFrame API's postMessage protocol (specifically infoDelivery event). The browser heavily throttled the background ReactPlayer so it never fired native onEnded events cleanly.

Fix:
- Summary: Injected a robust global window.addEventListener('message') to capture YouTube's unthrottled raw 'infoDelivery' packets natively to detect when playerState === 0.
- Files Changed: app/stage/page.tsx, components/host/HostPlayer.tsx
- Why It Works: Bypasses the highly throttled background JS polling loops used by wrapper libraries. Reading the direct cross-origin postMessage queue securely guarantees absolute synchronicity with the visual IFrame when a song finishes naturally.

Prevention:
- Rule or Pattern: When using raw embedded visual iFrames that run heavily in the background, avoid relying on hidden parallel logic players. Instead, hook directly into the visual window's raw network broadcast queue.
- Future Safeguard: Keep the 'infoDelivery' parser globally available anywhere automated playback skipping is required.

---

Bug:

- Description: Email/password login not working — users unable to sign in as host.
- Location: `app/auth/page.tsx`
- Root Cause: Supabase email/password auth (`signInWithPassword`) was failing silently or erroring (likely unconfirmed email, no user records, or misconfigured Supabase Auth settings). No fallback mechanism existed.

Fix:

- Summary: Replaced broken email/password as the primary login with Google OAuth via Supabase's `signInWithOAuth` provider. Email/password retained as a hidden collapsible fallback. Added `/app/auth/callback/route.ts` to handle the post-OAuth code exchange and redirect to `/host`.
- Files Changed: `app/auth/page.tsx`, `app/auth/callback/route.ts` (new)
- Why It Works: Supabase natively supports Google as an OAuth provider. `signInWithOAuth({ provider: 'google' })` redirects the browser to Google's consent screen. After consent, Google redirects to the configured callback URL (`/auth/callback`). The callback route exchanges the one-time `code` for a full Supabase session via `exchangeCodeForSession`, then sends the user to `/host`.

Prevention:

- Rule or Pattern: For new apps, prefer social OAuth over email/password — it eliminates email confirmation friction and broken SMTP configs.
- Future Safeguard: Always create an explicit `/auth/callback` route when using Supabase OAuth. The redirect URL must be whitelisted in both Supabase Dashboard → Auth → URL Configuration AND Google Cloud Console → OAuth 2.0 → Authorized Redirect URIs.

---

Bug:

- Description: Auth callback redirecting to `localhost:3000/host` instead of the production URL.
- Location: `app/auth/callback/route.ts`
- Root Cause: Used `new URL(request.url).origin` which can resolve to the internal server address (localhost:3000) in proxy environments like Vercel, rather than the public-facing domain.

Fix:

- Summary: Implemented header-based origin detection.
- Files Changed: `app/auth/callback/route.ts`
- Why It Works: By reading `request.headers.get('host')` and `x-forwarded-proto`, we can reconstruct the exact URL the user is actually visiting, ensuring redirects point back to the correct production domain.

Prevention:

- Rule or Pattern: In server-side redirects (Next.js Edge/Node routes), always determine the origin using headers (`host` and `x-forwarded-proto`) rather than relying on the request's internal URL object when behind a proxy.
- Future Safeguard: Use a utility function for robust origin detection across all server-side redirect logic.

---

Bug:

- Description: OAuth callback redirecting to `/auth?error=oauth_failed#access_token=...` after successful Google login.
- Location: `app/auth/page.tsx`, `components/auth/AuthModal.tsx`
- Root Cause: Supabase OAuth was using the Implicit Flow (default for `@supabase/supabase-js`), which places the authentication tokens in the URL hash fragment (`#access_token=...`). The `redirectTo` parameter was set to an API route (`/auth/callback`), which cannot read URL hash fragments. Since the API route didn't find a `?code=` query parameter, it failed and redirected back to `/auth` with an error.

Fix:

- Summary: Changed OAuth `redirectTo` to point directly to the client-side `/host` page.
- Files Changed: `app/auth/page.tsx`, `components/auth/AuthModal.tsx`
- Why It Works: Bypassing the server-side callback route entirely allows the Supabase client initialized on the `/host` page to capture the `#access_token` from the URL, automatically save the session to `localStorage`, and authenticate the user without needing server-side PKCE code exchange.

Prevention:

- Rule or Pattern: When using `@supabase/supabase-js` without `@supabase/ssr` (client-side only authentication), never set the `redirectTo` URL to a server-side API route. Always redirect to a client-rendered page where the Supabase client can parse the implicit flow hash fragment.
- Future Safeguard: If Server-Side auth/cookies are needed later, explicitly install `@supabase/ssr` and configure `flowType: 'pkce'`.

---

Bug:

- Description: Clicking Home redirects logged-in hosts back to the host dashboard rather than displaying the home landing page.
- Location: `app/page.tsx`
- Root Cause: A `useEffect` hook on the landing page redirected authenticated users to `/host` automatically to skip the login flow, which unintentionally hijacked explicit home link clicks when already logged in.

Fix:

- Summary: Removed the auto-redirect to `/host` inside the authentication `useEffect` block, only opening the AuthModal if the user is not authenticated.
- Files Changed: `app/page.tsx`
- Why It Works: Allows authenticated hosts to browse to and view the home grid landing page at `/` without being redirected.

Prevention:

- Rule or Pattern: Landing/Index page components should not enforce strict automatic redirects on user-initiated nav actions if hosts need to access home views.
- Future Safeguard: Guard automatic redirects using routing query parameters (e.g., `?redirect=false` or dynamic landing route design) to distinguish automatic first-load visits from explicit navigations.

---

Bug:

- Description: Pasting a YouTube video URL in the manual "Fetch & Add" input fails to add tracks.
- Location: `app/songbook/page.tsx`, `lib/stores/queueSlice.ts`
- Root Cause: 
  1. The app fetched video details by querying `/api/yt-search?q=${videoId}`. The `yt-search` library relies on scraping and search results, which is easily blocked by YouTube rate limits or returns empty lists when queried with a raw video ID.
  2. The URL extraction regex failed for YouTube Shorts or raw video IDs.
  3. Generating the `nextId` and inserting the track relied on `.single()`, which throws errors/exceptions on empty tables/query edge cases. `lib/stores/queueSlice.ts` also used `.single()` for song lookups and auto-registration, causing silent crashes.

Fix:

- Summary: Updated the manual URL fetch handler to request video details from the official YouTube API `/api/youtube` proxy endpoint first (falling back to `/api/yt-search` only as a secondary backup). Expanded the regex pattern to match Shorts/raw IDs, and refactored all database queries to avoid `.single()`, replacing them with `.limit(1)` and select arrays.
- Files Changed: `app/songbook/page.tsx`, `lib/stores/queueSlice.ts`
- Why It Works:
  - The official API bypasses scraping blocks.
  - Parsing matches raw 11-char IDs and Shorts URLs.
  - Querying and inserting without `.single()` returns arrays safely, preventing PGRST116 exceptions and silent crashes.

Prevention:

- Rule or Pattern: Use official APIs for individual resource retrieval by ID rather than relying on search scraping. Never use `.single()` in queries that can result in zero records or on insert operations.
- Future Safeguard: Always check and update store methods to be consistent with database schema access updates.
