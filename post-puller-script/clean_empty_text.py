import argparse
import json
import os
import tempfile


def clean_entries(data: list[dict], empty_text: str) -> tuple[list[dict], int]:
    cleaned: list[dict] = []
    removed = 0

    for item in data:
        if isinstance(item, dict) and item.get("text") == empty_text:
            removed += 1
            continue
        cleaned.append(item)

    return cleaned, removed


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Remove entries whose "text" field equals "<p></p>".'
    )
    parser.add_argument(
        "--in",
        dest="in_path",
        default="trump_tweets.json",
        help="Input JSON file (default: trump_tweets.json)",
    )
    parser.add_argument(
        "--out",
        dest="out_path",
        default=None,
        help="Output JSON file (default: overwrite input file)",
    )
    parser.add_argument(
        "--empty-text",
        dest="empty_text",
        default="<p></p>",
        help='Text value to remove (default: "<p></p>")',
    )
    args = parser.parse_args()

    in_path = os.path.abspath(args.in_path)
    out_path = os.path.abspath(args.out_path) if args.out_path else in_path

    with open(in_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError(f"Expected a JSON array at root, got {type(data).__name__}")

    cleaned, removed = clean_entries(data, args.empty_text)

    if out_path == in_path:
        out_dir = os.path.dirname(in_path)
        fd, tmp_path = tempfile.mkstemp(prefix="._clean_", suffix=".json", dir=out_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(cleaned, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp_path, in_path)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
    else:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(cleaned, f, indent=2, ensure_ascii=False)
            f.write("\n")

    print(f"Input entries: {len(data)}")
    print(f"Removed entries where text == {args.empty_text!r}: {removed}")
    print(f"Output entries: {len(cleaned)}")
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
