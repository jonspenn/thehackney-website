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
    title: z.string(),
    description: z.string(),
    weddingDate: z.coerce.date(),
    pubDate: z.coerce.date(),

    // Couple + credits
    couple: z.string(),
    photographer: z.string().optional(),
    photographerUrl: z.string().url().optional(),
    guestCount: z.number().optional(),
    season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),

    // YouTube film (optional). Rendered as a lite-facade on the post page - thumbnail + play button only,
    // iframe loads on click so it costs nothing on page load (no YouTube JS, no 3rd-party cookies).
    youtubeFilmId: z.string().optional(),

    // Hero image - optional so couples without processed photos can still ship as narration-only.
    // Card + template handle missing image gracefully.
    image: z.string().optional(),
    imageAlt: z.string().optional(),

    // Gallery - optional array of images. Absent = narration-only post.
    gallery: z
      .array(
        z.object({
          src: z.string(),
          alt: z.string(),
        })
      )
      .optional(),

    // Lifecycle
    draft: z.boolean().default(false),
  }),
});

export const collections = { journal, realWeddings };
