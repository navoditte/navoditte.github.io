#!/usr/bin/env python3
"""Add a book to data/books.json, pre-filled from Open Library.

    python3 scripts/add-book.py "Labyrinths" "Borges"
    python3 scripts/add-book.py "Labyrinths" --rating 5 --tags fiction,short-stories

Fills title, author, year, pages and isbn from the first Open Library match,
stamps `read` with this month, and leaves rating/tags/review for you to edit
in data/books.json. Nothing is guessed: fields Open Library doesn't know are
left out. Use --dry-run to print the entry without saving.
"""
import argparse
import datetime
import json
import pathlib
import urllib.parse
import urllib.request

DATA = pathlib.Path(__file__).resolve().parent.parent / "data" / "books.json"


def lookup(title, author):
    q = {"title": title, "limit": 1, "fields": "title,author_name,first_publish_year,number_of_pages_median,isbn"}
    if author:
        q["author"] = author
    url = "https://openlibrary.org/search.json?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": "navoditte.github.io add-book script"})
    with urllib.request.urlopen(req, timeout=15) as r:
        docs = json.load(r).get("docs", [])
    return docs[0] if docs else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("title")
    ap.add_argument("author", nargs="?", default="")
    ap.add_argument("--rating", type=float, help="0.5-5, half stars allowed")
    ap.add_argument("--read", help="YYYY-MM or YYYY-MM-DD (default: this month)")
    ap.add_argument("--tags", default="", help="comma separated")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    doc = lookup(a.title, a.author)
    entry = {"title": a.title, "author": a.author}
    if doc:
        entry["title"] = doc.get("title", a.title)
        entry["author"] = (doc.get("author_name") or [a.author])[0]
        if doc.get("first_publish_year"):
            entry["year"] = doc["first_publish_year"]
        if doc.get("number_of_pages_median"):
            entry["pages"] = doc["number_of_pages_median"]
        isbns = [i for i in doc.get("isbn", []) if len(i) == 13 and i.startswith("978")]
        if isbns:
            entry["isbn"] = isbns[0]
    else:
        print("No Open Library match; adding a bare entry.")

    entry["rating"] = a.rating if a.rating is not None else 0
    entry["read"] = a.read or datetime.date.today().strftime("%Y-%m")
    entry["tags"] = [t.strip().lower() for t in a.tags.split(",") if t.strip()]
    entry["review"] = []

    print(json.dumps(entry, indent=2, ensure_ascii=False))
    if a.dry_run:
        return
    books = json.loads(DATA.read_text()) if DATA.exists() else []
    books.append(entry)
    DATA.write_text(json.dumps(books, indent=2, ensure_ascii=False) + "\n")
    print(f"Added to {DATA.relative_to(DATA.parent.parent)} ({len(books)} books). Edit rating/tags/review there.")


if __name__ == "__main__":
    main()
