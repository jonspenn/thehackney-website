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

export const collections = { journal };
