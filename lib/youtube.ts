// YouTube helpers that need no API key. Video details come from YouTube's
// public oEmbed endpoint (title, channel, thumbnail) - it has no quota and,
// unlike scraping search results, isn't blocked from cloud/serverless IPs.
// oEmbed has no CORS headers, so the browser goes through /api/yt-lookup.

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
}

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export const isValidVideoId = (id: string) => VIDEO_ID_RE.test(id);

// Accepts watch/share/embed/shorts/live links, music.youtube.com links, or a
// raw 11-character video ID.
export function extractVideoId(input: string): string | null {
  const clean = input.trim();
  if (isValidVideoId(clean)) return clean;

  const match = clean.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|live\/|[?&]v=)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export type OEmbedResult =
  | { status: 'ok'; video: YouTubeVideoInfo }
  // YouTube definitively says the video can't be embedded: it doesn't exist,
  // was removed, is private, or the uploader disabled embedding.
  | { status: 'unavailable' }
  // Network error, rate limit, 5xx... - we don't know either way.
  | { status: 'error'; message: string };

// Server-side only (see note above about CORS).
export async function fetchYouTubeOEmbed(videoId: string): Promise<OEmbedResult> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`);
    if (res.status === 400 || res.status === 401 || res.status === 404) {
      return { status: 'unavailable' };
    }
    if (!res.ok) {
      return { status: 'error', message: `YouTube responded ${res.status}` };
    }
    const data = await res.json();
    return {
      status: 'ok',
      video: {
        id: videoId,
        title: data.title || 'Untitled',
        author: data.author_name || 'Unknown',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      },
    };
  } catch (error: any) {
    return { status: 'error', message: error?.message || 'Could not reach YouTube' };
  }
}

// Client-side: look up a pasted link via our API route. Throws a
// user-readable message on failure.
export async function lookupYouTubeVideo(videoId: string): Promise<YouTubeVideoInfo> {
  const res = await fetch(`/api/yt-lookup?id=${encodeURIComponent(videoId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.video) {
    throw new Error(data.error || 'Could not fetch video details. Please try again.');
  }
  return data.video;
}
