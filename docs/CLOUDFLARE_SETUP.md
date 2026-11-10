# Cinema Mode — Cloudflare Workers Builds

This Vite project needs two public Supabase values **at build time**:

- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<publishable-key>`

Configure them in Cloudflare **Workers & Pages → cinema-mode-cloud → Settings → Builds → Variables and secrets** for the production build. Then trigger a **fresh build** (retry build or push a commit), because Vite replaces `import.meta.env.VITE_*` when it compiles JavaScript. A runtime-only variable change cannot update an already generated `dist/` bundle.

Runtime bindings/secrets for the Cloudflare API must be configured separately for the production Worker, if not already inherited:

- `SUPABASE_URL` — same project root URL (no `/rest/v1/` suffix)
- `SUPABASE_ANON_KEY` — publishable key
- `TICKET_SECRET` — long random secret, **never** commit
- `CINEMA_BUCKET` — private R2 bucket binding

Build command: `npm run build`. Deploy using the existing Cloudflare Workers integration configuration. Never commit production secrets or video files into the repository.
