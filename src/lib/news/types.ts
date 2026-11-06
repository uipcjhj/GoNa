export interface RawArticle {
  url: string;
  title: string;
  sourceName: string;
  domain: string;
  publishedAt: string | null;
  publishedAtBasis: string;
  language: string | null;
  sourceCountry: string | null;
  description: string | null;
  provider: string;
  query: string;
}
