import { defineCollection, z } from 'astro:content';

const journal = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    updatedDate: z.date().optional(),
    category: z.enum(['Heritage', 'Weddings', 'Local Guide', 'Events', 'Food & Drink']),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    author: z.string().default('The Hackney'),
    draft: z.boolean().default(false),
  }),
});

// Real Weddings - ported from Shopify blog, separate from journal.
// See PRD: sales & marketing/website/pages/wedding/prd-t1-real-weddings.md
const realWeddings = defineCollection({
  type: 'content',
  schema: z.object({
    // Post metadata
    title: z.string(), // "Couple Name - A Sentence About Their Day", title case, under 65 chars, no em dashes
    description: z.string(), // 120-155 chars, reads as a sentence about this couple's wedding
    weddingDate: z.coerce.date(), // Actual wedding date (not publish date)
    pubDate: z.coerce.date(), // Original Shopify publish date preserves content-age signals on redirect

    // Couple + credits
    couple: z.string(), // "FirstName & FirstName"
    photographer: z.string().optional(),
    photographerUrl: z.string().url().optional(),
    guestCount: z.number().optional(),
    season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(), // Populated but not surfaced in v1

    // Hero image (renders on listing card + individual post hero)
    image: z.string(), // Path to WebP, under 150KB
    imageAlt: z.string(),

    // Gallery - ordered; drives alternating full-width / two-up layout in template
    gallery: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string(),
        })
      )
      .min(1),

    // Lifecycle
    draft: z.boolean().default(false),
  }),
});

export const collections = { journal, realWeddings };
