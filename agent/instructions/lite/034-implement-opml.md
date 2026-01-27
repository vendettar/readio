> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Feature - OPML Import/Export

## Objective
Allow users to migrate their subscriptions from other apps.
**Dependency**: This task assumes the Subscription schema uses UUID as Primary Key (established in Instruction #006).

## 1. Create Parser (`apps/lite/src/lib/opmlParser.ts`)
- **Action**: Implement `parseOpml(xmlString)` -> `MinimalSubscription[]`.
- **Definition**: `MinimalSubscription` should be `{ title: string; xmlUrl: string }`.
- **Validation**: Define a Zod schema for the parsed result.
  ```ts
  const opmlItemSchema = z.object({
    title: z.string().default('Unknown Podcast'),
    xmlUrl: z.string().url(),
  });
  ```
 - **Recursion**: OPML can nest `<outline>` nodes. Parse recursively and collect all nodes with `xmlUrl`.

## 2. Extend Store (`apps/lite/src/store/exploreStore.ts`)
- **Action**: Add `bulkSubscribe(podcasts: MinimalSubscription[])`.
- **Implementation**:
  - Import helper: `import { createId } from '@/lib/id'`.
  - Use `db.transaction('rw', db.subscriptions, async () => { ... })`.
  - For each item, map to the new `Subscription` schema (post-UUID migration):
    ```ts
    {
      id: createId(), // PK mandated by Instruction #006
      feedUrl: item.xmlUrl,
      title: item.title,
      author: 'Imported',
      artworkUrl: '',
      providerPodcastId: undefined, // No iTunes ID yet
      addedAt: Date.now() // Timestamp (number)
    }
    ```
  - Use `db.subscriptions.bulkAdd(data)` or `bulkPut(data)`.
  - **Default**: Use `bulkPut(data)` to remain idempotent across repeated imports.
  - **Dedupe**: Before insert, skip items where `feedUrl` already exists via the unique index.

## 3. UI Integration (`apps/lite/src/routeComponents/SettingsPage.tsx`)
- **Action**: Add "Import OPML" and "Export OPML" buttons.
- **I18n**: Labels: `t('settings.importOpml')`, `t('settings.exportOpml')`.
 - **Export Format**: Export must include valid OPML with `<outline xmlUrl="...">` entries.

## 4. Verification
- **Test**: Import a sample OPML. Check that each entry has a UUID `id` and the `feedUrl` is correctly stored.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
