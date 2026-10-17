/**
 * What an online product database knows about a barcode (never a price).
 * Plain data: sent from the server to the browser as JSON.
 */
export interface CatalogEntry {
  barcode: string;
  /** Ready-to-use product name, e.g. "Coca-Cola Original 330 ml". */
  name: string;
  brand: string | null;
  quantity: string | null;
  /** Front photo on the database's image host, or null. */
  imageUrl: string | null;
  /** Where the data comes from – shown in the app as attribution (ODbL / CC BY-SA). */
  source: { name: string; url: string };
}
