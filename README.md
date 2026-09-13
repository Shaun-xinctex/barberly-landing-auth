# Barberly Launchpad

Build a SaaS landing page + authenticated app shell for Barberly, a barber /
hair-stylist booking marketplace where customers find a stylist and book an
appointment online — and where barbers list a profile and publish their
schedule. Targeted at people who want to discover a good barber and book a
slot in a few taps. The site is barber-centric: barbers are the product. A
barber offers services (Cut / Color / Perm / Beard) at a starting price;
"styles" are not separate listings.

Design language — match this reference look closely (a clean, modern,
editorial e-commerce marketplace):
- Warm beige / cream palette on near-white backgrounds, with a dark
near-black accent for buttons.
- Serif display headlines (refined fashion-editorial serif) paired with a
clean sans-serif body (Inter or similar). Generous whitespace, rounded
cards.
- Mobile responsive, tasteful subtle fade-in animations.

The site must include:

1. A public landing page (/) with, in this order:
    - Navbar: the wordmark "Barberly" top-left; a search field; and a dark
    rounded-pill "Login" button top-right. No other nav links in v1 (no
    Styles / Barbers / Book / Contact tabs — booking and barber browsing
    arrive in later milestones, and dead in-page anchors should not appear).
    - Hero: an eyebrow label "New Look", a big serif headline "Style with
    Confident Hair", two styled-hair / barber photos split left and right of
    the headline, and a centered search bar with placeholder "Find your
    stylist or search a style", plus filter chips: All / Cut / Color / Perm /
    Beard.
    - Trust logo strip: a horizontal row of partner-salon / brand logos
    directly under the hero.
    - Feature row (exactly 4 icon + label cells) under a heading "Best booking
    experience": Verified Barbers, Instant Booking, Secure Payment,
    Top-Rated Styles.
    - "Popular" grid: a heading "Popular" and a card grid of featured barbers
    (not styles). Each card shows a barber portrait, the barber's name, shop
    / location, a row of service chips (subset of Cut / Color / Perm /
    Beard), a star rating with review count, a "from $—" starting price, and
    a small "Popular" badge. Cards are clickable blocks with a hover lift
    (destination is a placeholder for v1).
    - Footer with copyright "© 2026 Barberly".

2. Authentication using the project's own Supabase project
    (`kzzyiybvhtmcqigzrojy`, ap-southeast-2):
    - A combined Sign Up / Sign In page at /login with email + password.
    - On the Sign Up form, include a role selector as a TAB / segmented toggle
    at the top of the form with two options labeled "Customer" (role value
    customer) and "Barber" (role value shop). Default to Customer. Capture
    the choice in form state and pass it into the sign-up call's user
    metadata (options.data.role).
    - Sign Out functionality.
    - Email confirmation disabled for v1.

3. After signing in, land the user on /barbers, a simple authenticated shell:
    - A header with the Barberly wordmark on the left, and on the right: the
    greeting Hi {user.email}, then — only if the account's
    user_metadata.role === "shop" — a small rounded pill tag rendered next
    to the email reading "barber" (no tag is rendered for Customer
    accounts), then a Sign Out button.
    - Body content is role-aware:
    - Customer: 「附近的理髮師即將上線 — 下一個里程碑會加上瀏覽與預約功能。」 /
        "Barbers near you are coming soon — browse & booking arrive in the next
        milestone."
    - Barber: 「理髮師後台即將上線 — 下一個里程碑會加上個人檔案、服務項目與排班管理。」 /
        "Your barber dashboard is coming soon — profile, services & schedule
        arrive in the next milestone."

Out of scope for v1: the barber onboarding form, the barber / services /
schedule tables, the booking flow, payments, and any custom database tables
(do NOT create barbers / bookings / profiles tables yet — only use Supabase's
default auth.users; capture the chosen role in auth user metadata only). Those
come in later milestones. Stick to landing page + role-tab auth + the
role-aware /barbers placeholder shell.

## Stack

Plain **Vite + React 19 SPA** — no SSR, no server runtime. `vite build` emits a
fully static bundle to `dist/`, deployed to Vercel as a static site.

- Routing: **React Router** (`react-router-dom`), client-side only
- Styling: Tailwind CSS v4 + shadcn/ui (unchanged)
- Auth/data: Supabase JS client, browser-side (unchanged)

### Routes

| Path | Page |
| --- | --- |
| `/` | Public landing page |
| `/login` | Combined sign-in / sign-up |
| `/sign-in` | Same page, sign-in tab preselected |
| `/sign-up` | Same page, sign-up tab preselected |
| `/barbers` | Authenticated shell (redirects to `/login` when signed out) |
| `/app` | Alias — redirects to `/barbers` |
| anything else | 404 page |

Deep links such as `/barbers` are served by the SPA fallback in `vercel.json`
(every path rewrites to `/index.html`, after the static-file check), then
resolved client-side by React Router.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev      # dev server on http://localhost:8080
npm run build    # static production build -> dist/
npm run preview  # serve the built bundle locally
```

### Environment variables

The Supabase client reads these at build time. They must be set both in a
local `.env` (see `.env.example`) and in the Vercel project's Environment
Variables — a build without them fails fast at startup.

```
VITE_SUPABASE_URL              https://kzzyiybvhtmcqigzrojy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY  sb_publishable_...
VITE_SUPABASE_PROJECT_ID       kzzyiybvhtmcqigzrojy
```

`VITE_SUPABASE_PUBLISHABLE_KEY` holds Supabase's current-generation browser
key (`sb_publishable_*`), which replaces the key formerly called the anon key.
It is safe to expose: access is gated by Row Level Security.

## Deploying to Vercel

Import the repo in Vercel; `vercel.json` already pins the framework preset
(`vite`), the build command, the output directory (`dist/`) and the SPA
fallback rewrite. Add the `VITE_*` variables above under Project Settings →
Environment Variables before the first build.
