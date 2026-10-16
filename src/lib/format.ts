import { config } from './config';

export function formatPrice(amount: number, currency: string, locale: string = config.locale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function formatTime(date: Date, locale: string = config.locale): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(date);
}

export function formatDateTime(iso: string, locale: string = config.locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/** Page that prints labels for the given barcodes. */
export function labelPrintUrl(barcodes: string | string[]): string {
  const list = Array.isArray(barcodes) ? barcodes : [barcodes];
  return `/barcodes?barcodes=${encodeURIComponent(list.join(','))}&print=1`;
}
