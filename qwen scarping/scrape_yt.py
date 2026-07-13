"""
YouTube Playlist Scraper
-------------------------
Extracts video titles + video IDs from a YouTube playlist and saves them to a .txt file.
Uses yt-dlp (no API key required).

Install dependency first:
    pip install yt-dlp

Usage:
    python yt_playlist_scraper.py "https://www.youtube.com/playlist?list=PLxxxxxxxx"
    python yt_playlist_scraper.py "https://www.youtube.com/playlist?list=PLxxxxxxxx" -o my_playlist.txt
"""

import argparse
import sys

from yt_dlp import YoutubeDL


def scrape_playlist(playlist_url: str, playlist_items: str | None = None) -> tuple[list[dict], int | None]:
    """
    Fetches title + video ID for videos in a playlist.
    Uses 'extract_flat' so yt-dlp only grabs metadata, not full video info
    (fast, and doesn't trigger downloads).

    playlist_items: optional range string like "101-200" to request just
    that slice (yt-dlp's --playlist-items equivalent). NOTE: due to a known,
    unresolved yt-dlp/YouTube bug, requesting a slice that starts beyond
    roughly item 100-200 often returns ZERO items, because yt-dlp still has
    to walk continuation pages from the beginning to reach it, and that walk
    is what's broken. This is a YouTube-tab pagination bug, not a flaw in
    this script. If a chunk comes back empty, that's the bug confirming
    itself — the YouTube Data API is the reliable fallback at that point.

    Returns (videos, reported_total).
    """
    ydl_opts = {
        "extract_flat": True,   # don't resolve each video fully, just listing data
        "quiet": True,          # suppress yt-dlp's normal console spam
        "skip_download": True,
        "extractor_args": {
            "youtubetab": {"skip": ["webpage"]}  # best known workaround for the pagination bug
        },
    }
    if playlist_items:
        ydl_opts["playlist_items"] = playlist_items

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(playlist_url, download=False)

    entries = info.get("entries", [])
    reported_total = info.get("playlist_count")  # YouTube's own count, if available

    videos = []
    for entry in entries:
        if entry is None:
            continue  # private/deleted videos sometimes show up as None
        videos.append({
            "id": entry.get("id"),
            "title": entry.get("title"),
        })

    return videos, reported_total


def load_existing_ids(output_path: str) -> set[str]:
    """Reads any video IDs already saved in the output file, so reruns can dedupe."""
    ids = set()
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            for line in f:
                vid = line.split(" | ", 1)[0].strip()
                if vid:
                    ids.add(vid)
    except FileNotFoundError:
        pass
    return ids


def save_to_txt(videos: list[dict], output_path: str, append: bool) -> int:
    """Writes videos to file, skipping any video ID already present. Returns count written."""
    existing_ids = load_existing_ids(output_path) if append else set()
    mode = "a" if append else "w"
    written = 0
    with open(output_path, mode, encoding="utf-8") as f:
        for v in videos:
            if v["id"] in existing_ids:
                continue  # already saved from a previous chunk/run
            f.write(f"{v['id']} | {v['title']}\n")
            existing_ids.add(v["id"])
            written += 1
    return written


def main():
    parser = argparse.ArgumentParser(description="Scrape video titles + IDs from a YouTube playlist.")
    parser.add_argument("playlist_url", help="Full YouTube playlist URL")
    parser.add_argument(
        "-o", "--output",
        default="playlist_data.txt",
        help="Output .txt file name (default: playlist_data.txt)"
    )
    parser.add_argument(
        "-i", "--items",
        default=None,
        help=(
            "Optional range to fetch, e.g. '101-200'. Use this to try chunking "
            "around the large-playlist pagination bug. Results are appended to "
            "the output file (with deduping) instead of overwriting it. "
            "Omit this flag to do a normal full-playlist fetch (overwrites file)."
        )
    )
    args = parser.parse_args()

    range_msg = f" (items {args.items})" if args.items else ""
    print(f"Fetching playlist data from: {args.playlist_url}{range_msg}")
    try:
        videos, reported_total = scrape_playlist(args.playlist_url, args.items)
    except Exception as e:
        print(f"Error: could not fetch playlist data.\n{e}")
        sys.exit(1)

    if not videos:
        if args.items:
            print(
                f"Got 0 videos for range '{args.items}'. This matches the known yt-dlp "
                f"pagination bug on large playlists — chunked ranges past a certain point "
                f"often return nothing. The YouTube Data API would be the reliable next step."
            )
        else:
            print("No videos found in this playlist (it may be private, empty, or the URL is wrong).")
        sys.exit(1)

    written = save_to_txt(videos, args.output, append=bool(args.items))
    print(f"Fetched {len(videos)} videos this run, wrote {written} new entries to '{args.output}'.")

    if reported_total:
        total_in_file = len(load_existing_ids(args.output))
        print(f"Playlist reports {reported_total} total videos. File now has {total_in_file}.")
        if total_in_file < reported_total:
            print(
                "Still short of the full playlist. Try another chunk with -i, e.g. "
                f"-i \"{total_in_file + 1}-{total_in_file + 100}\""
            )


if __name__ == "__main__":
    main()