import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint'); // e.g. 'search' or 'videos'
  
  if (!endpoint) {
    return NextResponse.json({ error: { message: "Missing endpoint parameter" } }, { status: 400 });
  }

  // Build the target YouTube API URL
  const targetUrl = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  
  // Forward all query parameters (except 'endpoint' and 'key')
  searchParams.forEach((value, key) => {
    if (key !== 'endpoint' && key !== 'key') {
      targetUrl.searchParams.append(key, value);
    }
  });

  // Attach the secure Server-Side API Key
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  if (!apiKey) {
      return NextResponse.json({ error: { message: "YouTube API key not configured on server." } }, { status: 500 });
  }
  
  targetUrl.searchParams.append('key', apiKey);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    console.error("Server-side YouTube API proxy error:", error);
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
}
