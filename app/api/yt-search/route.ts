import { NextResponse } from 'next/server';
import yts from 'yt-search';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    const results = await yts(query);
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
  } catch (error: any) {
    console.error("yt-search error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
