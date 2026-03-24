# Readio Docs App (`apps/docs`)

This package hosts the Readio documentation site (Next.js + Fumadocs).

## Commands

Run from the repository root:

```bash
pnpm -C apps/docs dev
pnpm -C apps/docs lint
pnpm -C apps/docs typecheck
```

## Key Routes

| Route | Description |
| --- | --- |
| `app/[lang]/(home)` | Locale-scoped landing pages. |
| `app/[lang]/docs/[[...slug]]` | Locale-scoped docs pages. |
| `app/[lang]/llms.mdx/docs/[[...slug]]/route.ts` | Locale-scoped Markdown export route for docs pages. |
| `app/[lang]/llms-full.txt/route.ts` | Locale-scoped full-text export route for AI tooling. |
| `app/[lang]/og/docs/[...slug]/route.tsx` | Locale-scoped Open Graph image route for docs pages. |
| `app/api/search/route.ts` | Docs search API endpoint. |

## Structure Notes

- `lib/source.ts`: content-source loader and metadata wiring.
- `source.config.ts`: MDX/source generation config.
