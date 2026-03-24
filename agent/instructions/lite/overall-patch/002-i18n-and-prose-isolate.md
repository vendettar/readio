# Instruction B: i18n Hardcoded Strings + prose-isolate Whitelist (Blocking)

## Scope
- `apps/lite/src/components/ui/**`
- `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
- `apps/lite/src/index.css`
- Docs: `apps/docs/content/docs/general/design-system/index.mdx`

## Must Fix
1) **i18n hardcoded strings**
- `dialog.tsx`: sr-only "Close".
- `command.tsx`: "Search", "Search for podcasts and files".
- Add keys to i18n and update all language files.

2) **prose-isolate whitelist**
- Add `.prose-isolate` to Global CSS whitelist in design system doc.
- No deep selectors or `!important` additions.

## Acceptance
- Language switch updates these texts.
- `rg -n "sr-only\\\">Close<|Search for podcasts and files" apps/lite/src/components/ui` → 0 lines.
