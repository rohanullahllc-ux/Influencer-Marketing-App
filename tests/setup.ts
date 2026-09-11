// Global Vitest setup: points every test at the dedicated rdv_test
// database (never rdv_dev — see docs/ENVIRONMENT.md) and provides a
// truncate-all helper tests use in beforeEach to keep tests independent.
process.env.DATABASE_URL ??= "postgres://rdv_app:rdv_dev_password@127.0.0.1:5432/rdv_test";
process.env.SYSTEM_DATABASE_URL ??= "postgres://rdv_system:rdv_system_dev_password@127.0.0.1:5432/rdv_test";
process.env.CREDENTIALS_MASTER_KEY ??= "test-only-master-key-not-for-prod";
process.env.LOG_LEVEL ??= "silent";
