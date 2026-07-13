"""
Playlist Duplicate Checker
----------------------------
Scans a playlist data .txt file (format: "VIDEO_ID | Title") for duplicates
and optionally removes them.

Checks two kinds of duplicates:
  1. EXACT duplicates -- same video ID appears more than once (safe to auto-remove)
  2. POSSIBLE duplicates -- different video ID, but same/very similar title
     (e.g. a re-upload or live version -- reported only, not auto-deleted,
     since these need a human judgment call)

Usage:
    python check_duplicates.py playlist_data.txt
    python check_duplicates.py playlist_data.txt --delete
    python check_duplicates.py playlist_data.txt --delete --no-backup
"""

import argparse
import shutil
import sys
from collections import defaultdict


def load_entries(file_path: str) -> list[tuple[str, str]]:
    """Returns list of (video_id, title) tuples in file order."""
    entries = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line.strip():
                continue
            if " | " not in line:
                continue  # skip malformed lines
            video_id, title = line.split(" | ", 1)
            entries.append((video_id.strip(), title.strip()))
    return entries


def find_exact_duplicates(entries: list[tuple[str, str]]) -> dict[str, list[int]]:
    """Groups line indices by video ID, returns only IDs that appear more than once."""
    by_id = defaultdict(list)
    for i, (video_id, _) in enumerate(entries):
        by_id[video_id].append(i)
    return {vid: lines for vid, lines in by_id.items() if len(lines) > 1}


def find_title_duplicates(entries: list[tuple[str, str]]) -> dict[str, list[int]]:
    """Groups line indices by normalized title (lowercased, stripped), returns titles appearing more than once."""
    by_title = defaultdict(list)
    for i, (_, title) in enumerate(entries):
        normalized = title.lower().strip()
        by_title[normalized].append(i)
    return {title: lines for title, lines in by_title.items() if len(lines) > 1}


def dedupe_by_id(entries: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Keeps only the first occurrence of each video ID, preserving order."""
    seen = set()
    result = []
    for video_id, title in entries:
        if video_id in seen:
            continue
        seen.add(video_id)
        result.append((video_id, title))
    return result


def main():
    parser = argparse.ArgumentParser(description="Find and optionally remove duplicates in a playlist data file.")
    parser.add_argument("file", help="Path to the playlist data .txt file")
    parser.add_argument("--delete", action="store_true", help="Remove exact (same video ID) duplicates and overwrite the file")
    parser.add_argument("--no-backup", action="store_true", help="Skip creating a .bak backup before deleting (not recommended)")
    args = parser.parse_args()

    try:
        entries = load_entries(args.file)
    except FileNotFoundError:
        print(f"Error: file not found: {args.file}")
        sys.exit(1)

    print(f"Loaded {len(entries)} entries from '{args.file}'.\n")

    exact_dupes = find_exact_duplicates(entries)
    title_dupes = find_title_duplicates(entries)

    # --- Report exact duplicates (same video ID) ---
    if exact_dupes:
        total_extra = sum(len(lines) - 1 for lines in exact_dupes.values())
        print(f"EXACT duplicates (same video ID): {len(exact_dupes)} ID(s), {total_extra} extra line(s)")
        for video_id, lines in exact_dupes.items():
            title = entries[lines[0]][1]
            line_numbers = [str(i + 1) for i in lines]
            print(f"  - {video_id} | {title}  (lines: {', '.join(line_numbers)})")
        print()
    else:
        print("No exact duplicates (same video ID) found.\n")

    # --- Report possible duplicates (same title, different ID) ---
    if title_dupes:
        print(f"POSSIBLE duplicates (same title, different video ID): {len(title_dupes)} title(s)")
        print("  (these are NOT auto-deleted -- review manually, could be re-uploads/live versions)")
        for title, lines in title_dupes.items():
            # only show if these lines aren't already covered by exact-ID dupes reported above
            ids_here = {entries[i][0] for i in lines}
            if len(ids_here) > 1:
                line_numbers = [str(i + 1) for i in lines]
                print(f"  - \"{entries[lines[0]][1]}\"  (lines: {', '.join(line_numbers)}, IDs: {', '.join(ids_here)})")
        print()
    else:
        print("No possible title duplicates found.\n")

    # --- Delete if requested ---
    if args.delete:
        if not exact_dupes:
            print("Nothing to delete -- no exact duplicates found.")
            return

        if not args.no_backup:
            backup_path = args.file + ".bak"
            shutil.copy2(args.file, backup_path)
            print(f"Backup saved to '{backup_path}'.")

        cleaned = dedupe_by_id(entries)
        with open(args.file, "w", encoding="utf-8") as f:
            for video_id, title in cleaned:
                f.write(f"{video_id} | {title}\n")

        removed = len(entries) - len(cleaned)
        print(f"Removed {removed} duplicate line(s). File now has {len(cleaned)} entries.")
    elif exact_dupes:
        print("Run again with --delete to remove exact duplicates (a backup will be made automatically).")


if __name__ == "__main__":
    main()