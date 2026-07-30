import { NextResponse } from 'next/server';
import yts from 'yt-search';

export const dynamic = 'force-dynamic';

// Falls back to the official YouTube Data API when scraping fails. yt-search
// (unofficial scraping) is free/unlimited and works fine from a residential
// IP, but YouTube commonly blocks scraping from cloud/serverless IPs (e.g.
// Vercel), so a deploy can work in local dev and still fail in production.
// The official API costs quota (100 units/search against a 10k/day default),
// which is why it's only used as a fallback rather than the primary path.
async function searchViaOfficialApi(query: string, apiKey: string) {
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&q=${encodeURIComponent(query)}&key=${apiKey}`
  );
  const searchData = await searchRes.json();
  if (searchData.error) {
    throw new Error(searchData.error.message || 'YouTube Data API search failed');
  }

  const ids = (searchData.items || []).map((item: any) => item.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const detailsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(',')}&key=${apiKey}`
  );
  const detailsData = await detailsRes.json();
  const durationById = new Map(
    (detailsData.items || []).map((item: any) => [item.id, item.contentDetails?.duration])
  );

  return searchData.items.map((item: any) => ({
    id: item.id.videoId,
    snippet: item.snippet,
    contentDetails: {
      duration: durationById.get(item.id.videoId) || 'PT0S'
    }
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  let scrapeError: any = null;

  try {
    const results = await yts(query);
    if (results.videos.length > 0) {
      const videos = results.videos.slice(0, 20).map(v => ({
        id: v.videoId,
        snippet: {
          title: v.title,
          channelTitle: v.author.name,
          thumbnails: {
            high: { url: v.image }
          },
          publishedAt: v.ago
        },
        contentDetails: {
          duration: v.timestamp // yt-search gives duration like "3:45"
        }
      }));

      return NextResponse.json({ items: videos });
    }
  } catch (error: any) {
    console.error("yt-search scrape error:", error);
    scrapeError = error;
  }

  // Scraping returned nothing or threw (commonly: blocked from this IP).
  // Fall back to the official Data API if a key is configured.
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const videos = await searchViaOfficialApi(query, apiKey);
      return NextResponse.json({ items: videos, source: 'youtube-data-api' });
    } catch (apiError: any) {
      console.error("YouTube Data API fallback error:", apiError);
      return NextResponse.json({ error: apiError.message }, { status: 502 });
    }
  }

  if (scrapeError) {
    return NextResponse.json({ error: scrapeError.message || 'YouTube search failed' }, { status: 502 });
  }

  return NextResponse.json({ items: [] });
}
