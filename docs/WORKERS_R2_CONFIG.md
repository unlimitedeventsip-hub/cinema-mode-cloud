# Cinema Mode on Cloudflare Workers

This project is deployed to a **Workers** `.workers.dev` domain, not to the separate **Pages** platform. The existing `functions/api/*` files are Pages Function modules. They are now explicitly routed in `src/worker.js` so that POST uploads can work on Workers.

## GitHub-connected Cloudflare Workers Builds

- **Root directory:** `/` (repository root).
- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Build variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are PUBLIC values compiled into the browser bundle.
- **Runtime variables** (Worker Settings > Variables and Secrets, not only Settings > Builds): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and a **secret** `TICKET_SECRET` (at least 32 characters).
- **R2 binding** (Worker Settings > Bindings): `CINEMA_BUCKET` -> private R2 bucket named `cinema-films`. Create the bucket before binding it.

Do not put secret values into GitHub. Never expose a Supabase service_role or secret key to the frontend.

`wrangler.jsonc` configures the Worker entry point `src/worker.js`, static Vite assets in `dist`, and sends `/api/*` routes to Worker code first.

## Health endpoint

After a fresh build and deployment, visit:

`https://cinema-mode-cloud.unlimited-events-ip.workers.dev/api/health`

Expected JSON response:

`{"service":"Cinema Mode API","ready":true,"checks":{"storage":true,"authConfig":true,"ticketSecret":true}}`

If any check is false, configure the associated **runtime** binding or variable and redeploy.

The frontend uses chunked upload in approximately 12 MiB segments, so a 4+ GB movie is uploaded over many requests. Files are stored in R2, not Supabase. MKV/H.265/HDR playback is not guaranteed in browsers; for playback without conversion, use a compatible local video player via HDMI.

Note: configure R2 and runtime bindings carefully before relying on uploads. The /api/health endpoint checks binding presence, not permission to write a full movie.
