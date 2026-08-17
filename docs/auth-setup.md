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

## 2. Custom SMTP — required before templates can be edited

**Do this before section 3.** Since 3 June 2026, Supabase free-tier projects
created after that date cannot edit auth email templates while using Supabase's
built-in email sender. The template body is read-only and there is no error
message explaining why — it simply will not accept keystrokes. Configuring your
own SMTP unlocks editing on any plan.

The built-in sender is also capped at **2 emails per hour across the whole
project**, and will only deliver to addresses on the project's team. Both limits
disappear once custom SMTP is on.

### Gmail as the SMTP provider

Gmail rejects your normal account password here. It needs an *App Password*,
which only exists once 2-Step Verification is enabled.

1. <https://myaccount.google.com/security> → turn on **2-Step Verification**
2. <https://myaccount.google.com/apppasswords> → app name `Supabase TubePulse`
   → **Create**
3. Copy the 16 characters and **strip the spaces**. Google shows it once.

Then Supabase dashboard → **Authentication → Emails → SMTP Settings**:

| Field | Value |
| --- | --- |
| Enable custom SMTP | on |
| Sender email address | your Gmail address |
| Sender name | `TubePulse` |
| Host | `smtp.gmail.com` |
| Port number | `587` — **not 465** |
| Minimum interval per user | `10` (the default `60` throttles testing) |
| Username | your Gmail address |
| Password | the 16-character App Password, no spaces |

Use **587**, not 465. Port 465 is implicit TLS, which Supabase's auth service
handles badly, and free (non-Workspace) Gmail accounts are reported not to work
on it at all. The symptom is a generic `Error sending confirmation email` with
no detail — the API returns the same unhelpful string. 587 uses STARTTLS and
works.

The App Password goes in this dashboard field only. It is not an env var and
must never enter this repo. Google shows it once; if you lose it, delete it and
make another.

When email fails, the real reason is in the dashboard under **Logs → Auth
Logs**, not in the browser and not in the API response.

Free Gmail allows roughly 500 messages a day, which is ample for development.
[Resend](https://resend.com) is the usual choice for production.

---

## 3. Switch the confirmation email from a link to a 6-digit code

By default Supabase emails a **link**. This app asks for a **code**, because a
code works when the email opens on your phone but you signed up on your laptop.

Supabase dashboard → **Authentication → Emails → Templates → Confirm signup**.

If the body will not let you type, section 2 has not been done.

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

Also on **Authentication → Sign In / Providers → Email**:

- *Confirm email* must be switched **on**. If it is off, accounts are created
  already-confirmed and the code screen never appears.
- **Email OTP Length** must equal `OTP_LENGTH` in `src/lib/auth/otp.ts`
  (currently **6**). Supabase generates the code and this app only validates it,
  so if the dashboard says 8 the form is a digit short, the code can never be
  entered, and the error blames the code rather than the mismatch. Changing one
  side means changing the other.

---

## 3b. The password-reset template

Password reset uses a code too, for the same reason sign-up does. That needs a
SECOND template edited, and it is easy to miss because sign-up will already be
working.

Supabase dashboard -> **Authentication -> Emails -> Templates -> Reset Password**:

```html
<h2>Reset your TubePulse password</h2>
<p>Enter this code to choose a new one:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700">{{ .Token }}</p>
<p>The code expires in one hour. If you didn't ask for this, ignore this email.</p>
```

Without it the reset email arrives as a link and the code boxes at
`/login/reset` have nothing to accept — the exact failure mode section 3
describes for sign-up.

The code is verified with `type: "recovery"`, not `"email"`. They are different
token types and do not verify each other.

---

## 4. Google sign-in

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

- Site URL: `http://localhost:3111` while developing — this must match `APP_URL`
  in `.env.local`. The port is pinned by the `dev` script in `package.json`, so
  it is the same on every machine.
- Redirect URLs: add both
  ```
  http://localhost:3111/auth/callback
  https://your-production-domain.com/auth/callback
  ```

The app's own callback (`/auth/callback`) exchanges Google's code for a session
server-side. That route already exists; it needs no configuration.

---

## Applying the database migrations

One command prints every migration in the right order:

```bash
npm.cmd run db:sql --silent | Set-Clipboard  # Windows PowerShell
npm run db:sql                               # or just print it and copy manually
```

Paste the whole block into the Supabase dashboard **SQL editor** and run it once.

It covers:

1. `0001_init.sql` — channels, videos, jobs, ideas, RLS
2. `0002_projects.sql` — projects, profiles, the sign-up trigger

Running it a second time will error, which is correct — migrations are history,
not a script you re-run.

Migration 0002 creates the trigger that writes a `profiles` row whenever anyone
signs up, by email or by Google. Without it accounts still work, but display
names are never stored.

To check the migrations landed without opening the dashboard, query any table
through the REST API with the service-role key — `404` means the table does not
exist, `200` means it does.

---

## Checking it worked

1. Open `/login`, switch to **Create account**, use a real Gmail address
2. You land on `/login/verify` and a 6-digit code arrives
3. Enter it — you should land on `/projects`
4. Sign out, then **Continue with Google** — you should land on `/projects`
   without a code, because Google has already verified the address

If step 2 delivers a link rather than a code, section 3 above has not been done.
If section 3 would not let you edit the template, section 2 has not been done.
