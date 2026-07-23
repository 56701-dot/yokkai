# Admin Account

Do not hard-code an admin password in frontend files.

## Create the admin user

Open:

`Supabase Dashboard > Authentication > Users > Add user > Create new user`

Use your own email and a strong password. Example values for local testing:

```text
Email: admin@fitquest.local
Username: admin
Password: choose-your-own-strong-password
```

If Supabase does not accept `.local` emails in your project settings, use a real email address.

## Make the user admin

After creating the user, open `supabase/make-admin.sql`.

Change this value:

```sql
lower('admin@example.com')
```

For example:

```sql
lower('admin@fitquest.local')
```

Run the SQL in:

`Supabase Dashboard > SQL Editor`

Then log out and log back in. The profile card should show `Admin`.
