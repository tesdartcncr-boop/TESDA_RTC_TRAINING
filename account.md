# Seeded Accounts

These accounts are seeded by `schema.sql` and `seeds.sql` for local/testing use.

- Super Admin
  - username: superadmin
  - email: superadmin@rtc.local
  - password: SuperAdminPass123!

- Supervisor
  - username: supervisor
  - email: supervisor@rtc.local
  - password: SupervisorPass123!

- Admin
  - username: admin
  - email: admin@rtc.local
  - password: AdminPass123!

- Trainer
  - username: trainer1
  - email: trainer1@rtc.local
  - password: UserPass123!

Notes:
- Passwords are stored in the database using bcrypt (`pgcrypto`'s `crypt(..., gen_salt('bf'))`).
- To apply the seeds, run `schema.sql` (or `seeds.sql`) in your Supabase SQL editor or via psql.
- After running, you can log in using the username and password above.
- For production, change these passwords immediately and remove plaintext records.
