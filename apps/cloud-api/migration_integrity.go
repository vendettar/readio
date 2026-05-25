package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io/fs"
	"math"
	"path/filepath"
	"sort"

	"github.com/pressly/goose/v3"
)

const migrationChecksumTable = "schema_migration_checksums"

type migrationChecksumRecord struct {
	Version  int64
	Filename string
	Checksum string
}

func prepareMigrationChecksumVerification(
	ctx context.Context,
	db *sql.DB,
	migrationFS fs.FS,
	migrationDir string,
) (map[int64]migrationChecksumRecord, error) {
	if err := ensureMigrationChecksumTable(ctx, db); err != nil {
		return nil, err
	}

	currentVersion, err := goose.GetDBVersionContext(ctx, db)
	if err != nil {
		return nil, fmt.Errorf("read goose migration version: %w", err)
	}

	migrations, err := goose.CollectMigrations(migrationDir, 0, math.MaxInt64)
	if err != nil {
		return nil, fmt.Errorf("collect migrations for checksum verification: %w", err)
	}

	records, err := loadMigrationChecksumRecords(ctx, db)
	if err != nil {
		return nil, err
	}
	if currentVersion > 0 && len(records) == 0 {
		return nil, fmt.Errorf("migration checksum metadata missing for existing schema version %d; recreate the database from scratch", currentVersion)
	}

	checksums, err := collectMigrationChecksums(migrationFS, migrations)
	if err != nil {
		return nil, err
	}
	if err := verifyStoredMigrationChecksums(records, checksums); err != nil {
		return nil, err
	}
	return checksums, nil
}

func ensureMigrationChecksumTable(ctx context.Context, db *sql.DB) error {
	const query = `
CREATE TABLE IF NOT EXISTS schema_migration_checksums (
  version INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  checksum TEXT NOT NULL,
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch())
);
`
	if _, err := db.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("ensure migration checksum table: %w", err)
	}
	return nil
}

func loadMigrationChecksumRecords(ctx context.Context, db *sql.DB) (map[int64]migrationChecksumRecord, error) {
	rows, err := db.QueryContext(ctx, `
SELECT version, filename, checksum
FROM schema_migration_checksums
ORDER BY version ASC
`)
	if err != nil {
		return nil, fmt.Errorf("load migration checksum records: %w", err)
	}
	defer rows.Close()

	out := make(map[int64]migrationChecksumRecord)
	for rows.Next() {
		var record migrationChecksumRecord
		if err := rows.Scan(&record.Version, &record.Filename, &record.Checksum); err != nil {
			return nil, fmt.Errorf("scan migration checksum record: %w", err)
		}
		out[record.Version] = record
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate migration checksum records: %w", err)
	}
	return out, nil
}

func collectMigrationChecksums(migrationFS fs.FS, migrations goose.Migrations) (map[int64]migrationChecksumRecord, error) {
	sort.Sort(migrations)
	out := make(map[int64]migrationChecksumRecord, len(migrations))
	for _, migration := range migrations {
		if migration == nil || migration.Source == "" {
			continue
		}
		filename := filepath.Base(migration.Source)
		body, err := fs.ReadFile(migrationFS, filepath.ToSlash(migration.Source))
		if err != nil {
			return nil, fmt.Errorf("read migration %q for checksum: %w", migration.Source, err)
		}
		sum := sha256.Sum256(body)
		out[migration.Version] = migrationChecksumRecord{
			Version:  migration.Version,
			Filename: filename,
			Checksum: hex.EncodeToString(sum[:]),
		}
	}
	return out, nil
}

func verifyStoredMigrationChecksums(
	stored map[int64]migrationChecksumRecord,
	current map[int64]migrationChecksumRecord,
) error {
	for version, record := range stored {
		got, ok := current[version]
		if !ok {
			return fmt.Errorf("stored migration checksum version %d (%s) no longer exists in embedded migrations", version, record.Filename)
		}
		if got.Filename != record.Filename {
			return fmt.Errorf("migration version %d filename mismatch: stored=%s current=%s", version, record.Filename, got.Filename)
		}
		if got.Checksum != record.Checksum {
			return fmt.Errorf("migration version %d (%s) checksum mismatch; migration file was modified after being applied", version, record.Filename)
		}
	}
	return nil
}

func syncAppliedMigrationChecksum(
	ctx context.Context,
	db *sql.DB,
	version int64,
	checksums map[int64]migrationChecksumRecord,
) error {
	record, ok := checksums[version]
	if !ok {
		return fmt.Errorf("checksum not found for applied migration version %d", version)
	}
	if _, err := db.ExecContext(ctx, `
INSERT INTO schema_migration_checksums (version, filename, checksum, updated_at_unix)
VALUES (?, ?, ?, unixepoch())
ON CONFLICT(version) DO UPDATE SET
  filename = excluded.filename,
  checksum = excluded.checksum,
  updated_at_unix = excluded.updated_at_unix
`, record.Version, record.Filename, record.Checksum); err != nil {
		return fmt.Errorf("upsert migration checksum version %d: %w", version, err)
	}
	return nil
}
