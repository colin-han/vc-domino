import { createQuoteCache } from './quote-cache';
import type { QuoteData } from '@/lib/source/eastmoney';

export const quoteCache = createQuoteCache<QuoteData>({ ttlMs: 30_000 });
