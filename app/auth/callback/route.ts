import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    
    // Get the actual host and protocol from headers (crucial for Vercel/proxies).
    // The literal fallback only kicks in if the request somehow has no Host
    // header at all - Cloudflare (offkeykaraoke.party) is primary, Vercel is
    // the backup, so that's the fallback's priority order too.
    const host = request.headers.get('host') || 'offkeykaraoke.party';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const origin = `${protocol}://${host}`;

    if (code) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            return NextResponse.redirect(`${origin}/host`);
        }
    }

    // If something went wrong, send back to auth with an error hint
    return NextResponse.redirect(`${origin}/auth?error=oauth_failed`);
}
