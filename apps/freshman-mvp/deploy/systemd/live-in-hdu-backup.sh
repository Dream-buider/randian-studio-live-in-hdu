#!/usr/bin/env bash
set -euo pipefail

app_dir=/srv/live-in-hdu/apps/freshman-mvp
database="$app_dir/runtime/live-in-hdu.db"
backup_dir=/srv/live-in-hdu/backups/daily
retain=30
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_dir/live-in-hdu-$stamp.db"

install -d -m 700 "$backup_dir"
sqlite3 "$database" ".backup '$backup'"
chmod 600 "$backup"

integrity=$(sqlite3 "$backup" 'PRAGMA integrity_check;')
if [ "$integrity" != ok ]; then
  rm -f "$backup"
  echo "SQLite backup integrity check failed: $integrity" >&2
  exit 1
fi

sha256sum "$backup" > "$backup.sha256"
chmod 600 "$backup.sha256"
sha256sum -c "$backup.sha256"

mapfile -t expired < <(
  find "$backup_dir" -maxdepth 1 -type f -name 'live-in-hdu-*.db' -printf '%T@ %p\n' \
    | sort -nr \
    | tail -n +$((retain + 1)) \
    | cut -d' ' -f2-
)
for old_backup in "${expired[@]}"; do
  rm -f -- "$old_backup" "$old_backup.sha256"
done

printf 'backup=%s integrity=ok retained=%s\n' "$backup" "$retain"

