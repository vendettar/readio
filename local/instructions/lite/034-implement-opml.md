> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

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

## 3. UI Integration (`apps/lite/src/routeComponents/SettingsPage.tsx`)
- **Action**: Add "Import OPML" and "Export OPML" buttons.
- **I18n**: Labels: `t('settings.importOpml')`, `t('settings.exportOpml')`.

## 4. Verification
- **Test**: Import a sample OPML. Check that each entry has a UUID `id` and the `feedUrl` is correctly stored.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
