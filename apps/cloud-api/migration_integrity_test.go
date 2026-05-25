package main

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func openMigrationIntegrityTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "integrity.db")
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(dbPath)+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func testMigrationFS() fstest.MapFS {
	return fstest.MapFS{
		"migrations/00001_bootstrap.sql": {
			Data: []byte("-- +goose Up\nSELECT 1;\n\n-- +goose Down\nSELECT 1;\n"),
		},
		"migrations/00002_example.sql": {
			Data: []byte("-- +goose Up\nCREATE TABLE example_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\n\n-- +goose Down\nDROP TABLE example_items;\n"),
		},
	}
}

func TestRunCloudSQLiteMigrationsFSStoresChecksumsForAppliedMigrations(t *testing.T) {
	db := openMigrationIntegrityTestDB(t)
	fs := testMigrationFS()

	err := runCloudSQLiteMigrationsFS(context.Background(), db, fs, "migrations")
	require.NoError(t, err)

	var count int
	err = db.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM "+migrationChecksumTable).Scan(&count)
	require.NoError(t, err)
	require.Equal(t, 2, count)

	var version int64
	err = db.QueryRowContext(context.Background(), "SELECT MAX(version) FROM "+migrationChecksumTable).Scan(&version)
	require.NoError(t, err)
	require.Equal(t, int64(2), version)
}

func TestRunCloudSQLiteMigrationsFSFailsWhenAppliedMigrationChecksumChanges(t *testing.T) {
	db := openMigrationIntegrityTestDB(t)
	original := testMigrationFS()

	err := runCloudSQLiteMigrationsFS(context.Background(), db, original, "migrations")
	require.NoError(t, err)

	modified := testMigrationFS()
	modified["migrations/00002_example.sql"] = &fstest.MapFile{
		Data: []byte("-- +goose Up\nCREATE TABLE example_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT);\n\n-- +goose Down\nDROP TABLE example_items;\n"),
	}

	err = runCloudSQLiteMigrationsFS(context.Background(), db, modified, "migrations")
	require.Error(t, err)
	require.Contains(t, err.Error(), "checksum mismatch")
}

func TestRunCloudSQLiteMigrationsFSSyncsChecksumAfterEachSuccessfulMigration(t *testing.T) {
	db := openMigrationIntegrityTestDB(t)
	original := testMigrationFS()
	original["migrations/00003_partial_success.sql"] = &fstest.MapFile{
		Data: []byte("-- +goose Up\nCREATE TABLE partial_items (id INTEGER PRIMARY KEY);\n\n-- +goose Down\nDROP TABLE partial_items;\n"),
	}
	original["migrations/00004_fail.sql"] = &fstest.MapFile{
		Data: []byte("-- +goose Up\nTHIS IS NOT VALID SQL;\n\n-- +goose Down\nSELECT 1;\n"),
	}

	err := runCloudSQLiteMigrationsFS(context.Background(), db, original, "migrations")
	require.Error(t, err)

	var checksumCount int
	err = db.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM "+migrationChecksumTable+" WHERE version = 3").Scan(&checksumCount)
	require.NoError(t, err)
	require.Equal(t, 1, checksumCount)

	modified := testMigrationFS()
	modified["migrations/00003_partial_success.sql"] = &fstest.MapFile{
		Data: []byte("-- +goose Up\nCREATE TABLE partial_items (id INTEGER PRIMARY KEY, name TEXT);\n\n-- +goose Down\nDROP TABLE partial_items;\n"),
	}
	modified["migrations/00004_fixed.sql"] = &fstest.MapFile{
		Data: []byte("-- +goose Up\nCREATE INDEX partial_items_id_idx ON partial_items (id);\n\n-- +goose Down\nDROP INDEX partial_items_id_idx;\n"),
	}

	err = runCloudSQLiteMigrationsFS(context.Background(), db, modified, "migrations")
	require.Error(t, err)
	require.Contains(t, err.Error(), "checksum mismatch")
}

func TestPrepareMigrationChecksumVerificationFailsWhenExistingSchemaLacksMetadata(t *testing.T) {
	db := openMigrationIntegrityTestDB(t)
	fs := testMigrationFS()

	goose.SetBaseFS(fs)
	defer goose.SetBaseFS(nil)
	require.NoError(t, goose.SetDialect(cloudSQLiteMigrationDialect))
	require.NoError(t, goose.UpContext(context.Background(), db, "migrations"))

	_, err := prepareMigrationChecksumVerification(context.Background(), db, fs, "migrations")
	require.Error(t, err)
	require.Contains(t, err.Error(), "metadata missing")
}
