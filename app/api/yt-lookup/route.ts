import { NextResponse } from 'next/server';
import { fetchYouTubeOEmbed, isValidVideoId } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

// Looks up a single video's title/channel/thumbnail for the "paste a link"
// add flow. Uses keyless oEmbed - see lib/youtube.ts.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') || '';

  if (!isValidVideoId(id)) {
    return NextResponse.json({ error: 'Invalid YouTube video ID.' }, { status: 400 });
  }

  const result = await fetchYouTubeOEmbed(id);

  if (result.status === 'ok') {
    return NextResponse.json({ video: result.video });
  }
  if (result.status === 'unavailable') {
    return NextResponse.json(
      { error: "This video can't be played here - it may be private, removed, or have embedding disabled." },
      { status: 404 }
    );
  }
  console.error('yt-lookup error:', result.message);
  return NextResponse.json({ error: 'Could not reach YouTube. Please try again.' }, { status: 502 });
}
