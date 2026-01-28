import { z } from 'zod'
import { warn } from './logger'

export const opmlItemSchema = z.object({
  title: z.string().default('Unknown Podcast'),
  xmlUrl: z.string().url(),
})

export type MinimalSubscription = z.infer<typeof opmlItemSchema>

const escapeXmlAttr = (value: string) =>
  value.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case '"':
        return '&quot;'
      case "'":
        return '&apos;'
      default:
        return c
    }
  })

/**
 * Parses an OPML XML string and extracts podcast subscriptions.
 * Supports nested structures by recursively scanning all <outline> nodes.
 */
export function parseOpml(xmlString: string): MinimalSubscription[] {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml')

  // Check for parsing errors
  const parserError = xmlDoc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    throw new Error('Failed to parse OPML: Invalid XML')
  }

  const subscriptions: MinimalSubscription[] = []
  const outlines = xmlDoc.getElementsByTagName('outline')

  for (let i = 0; i < outlines.length; i++) {
    const outline = outlines[i]
    const xmlUrl = outline.getAttribute('xmlUrl')
    const title = outline.getAttribute('title') || outline.getAttribute('text') || 'Unknown Podcast'

    if (xmlUrl) {
      try {
        const validated = opmlItemSchema.parse({ title, xmlUrl })
        subscriptions.push(validated)
      } catch (err) {
        // Skip invalid items
        warn(`[OPML] Skipping invalid entry: ${title} (${xmlUrl})`, err)
      }
    }
  }

  return subscriptions
}

/**
 * Generates an OPML XML string from a list of subscriptions.
 */
export function generateOpml(subscriptions: { title: string; feedUrl: string }[]): string {
  const dateStr = new Date().toUTCString()

  const outlines = subscriptions
    .map((sub) => {
      const title = escapeXmlAttr(sub.title)
      const feedUrl = escapeXmlAttr(sub.feedUrl)
      return `    <outline type="rss" text="${title}" title="${title}" xmlUrl="${feedUrl}" />`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Readio Subscriptions</title>
    <dateCreated>${dateStr}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`
}
