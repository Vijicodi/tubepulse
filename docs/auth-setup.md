# Auth setup

Three things live in the Supabase and Google dashboards rather than in this
repo. The code is finished and waiting for all three.

---

## 1. The two keys (required)

Supabase dashboard → **Project Settings → API**. Copy two values into
`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Then restart `npm run dev`. Until these exist the login page shows a setup
notice instead of the form.

> **Never put real values in `.env.example`.** That file is committed to a
> public repository. `.env.local` is gitignored and is the only place secrets go.

---

## 2. Switch the confirmation email from a link to a 6-digit code

By default Supabase emails a **link**. This app asks for a **code**, because a
code works when the email opens on your phone but you signed up on your laptop.

Supabase dashboard → **Authentication → Emails → Confirm signup**.

Replace the template body with something that uses `{{ .Token }}` instead of
`{{ .ConfirmationURL }}`:

```html
<h2>Confirm your TubePulse account</h2>
<p>Enter this code to finish signing in:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700">{{ .Token }}</p>
<p>The code expires in one hour. If you didn't sign up, ignore this email.</p>
```

`{{ .Token }}` is the 6-digit code. This is the single change that makes the
verify screen work — without it the email still arrives, but it contains a link
and the code box will have nothing to accept.

Also check **Authentication → Providers → Email** has *Confirm email* switched
**on**. If it is off, accounts are created already-confirmed and the code screen
never appears.

---

## 3. Google sign-in

Two halves. Do them in this order.

### Google Cloud

1. <https://console.cloud.google.com> → create or pick a project
2. **APIs & Services → OAuth consent screen** → External → fill in app name and
   your email → add yourself under *Test users* while it is unpublished
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorised redirect URI — this must be your *Supabase* callback, not this
     app's:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
4. Copy the **Client ID** and **Client secret**

### Supabase

**Authentication → Providers → Google** → enable → paste the client ID and
secret → save.

Then **Authentication → URL Configuration**:

- Site URL: `http://localhost:3111` while developing
- Redirect URLs: add both
  ```
  http://localhost:3111/auth/callback
  https://your-production-domain.com/auth/callback
  ```

The app's own callback (`/auth/callback`) exchanges Google's code for a session
server-side. That route already exists; it needs no configuration.

---

## Applying the database migrations

Paste each file into the Supabase dashboard **SQL editor** and run it, in order:

1. `supabase/migrations/0001_init.sql` — channels, videos, jobs, ideas, RLS
2. `supabase/migrations/0002_projects.sql` — projects, profiles, the sign-up
   trigger

Migration 0002 creates the trigger that writes a `profiles` row whenever anyone
signs up, by email or by Google. Without it accounts still work, but display
names are never stored.

---

## Checking it worked

1. Open `/login`, switch to **Create account**, use a real Gmail address
2. You land on `/login/verify` and a 6-digit code arrives
3. Enter it — you should land on `/projects`
4. Sign out, then **Continue with Google** — you should land on `/projects`
   without a code, because Google has already verified the address

If step 2 delivers a link rather than a code, section 2 above has not been done.
