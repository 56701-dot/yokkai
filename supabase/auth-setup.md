# Fit Quest Supabase Auth Setup

## 1. Add the anon key

Open `js/supabase-config.js` and replace `YOUR_SUPABASE_ANON_KEY` with the anon public key from:

`Supabase Dashboard > Project Settings > API > Project API keys > anon public`

The project URL is already set to:

`https://ebxigzirajlgtphdzble.supabase.co`

## 2. Run the database schema

Open `supabase/schema.sql`, copy the whole file, then run it in:

`Supabase Dashboard > SQL Editor`

This creates `public.profiles`, enables RLS, and creates a profile automatically when a user signs up.

It also adds username support:

- `profiles.username` is unique.
- Usernames must be 3-24 characters.
- Allowed characters are lowercase letters, numbers, and underscore.
- The app can log in with either email or username.

## 3. Enable email login

Go to:

`Authentication > Providers > Email`

Enable Email provider. For early testing, you can disable email confirmation. For production, keep confirmation enabled.

## 4. Enable Google login

Go to:

`Authentication > Providers > Google`

Enable Google and add your Google OAuth Client ID and Client Secret.

In Google Cloud Console, add this Authorized redirect URI:

`https://ebxigzirajlgtphdzble.supabase.co/auth/v1/callback`

## 5. Add app URLs in Supabase

Go to:

`Authentication > URL Configuration`

Set Site URL to the local URL you use while testing, for example:

`http://localhost:5500`

Add Redirect URLs:

`http://localhost:5500`

`http://localhost:5500/`

## 6. Open the app through localhost

From the project folder, run:

```powershell
node local-server.js
```

Then open:

`http://localhost:5500`

Do not use `file://` for Google login because OAuth redirects need an allowed HTTP URL.

## 7. Make an admin account

First, create the account through the app or in:

`Supabase Dashboard > Authentication > Users`

Then open `supabase/make-admin.sql`, replace `admin@example.com` or `admin` with the account you want, and run it in:

`Supabase Dashboard > SQL Editor`

After that, log out and log back in. The profile area should show `Admin`.
