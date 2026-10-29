import english from '../locales/en.json';
import type { ComponentStyle } from '../data/componentStyles';
import type { PropertySchema } from '../types';

const translations: Record<string, string> = english;
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s_-]+/g, '');
const searchTerms = (query: string) => query.trim().split(/\s+/).map(normalize).filter(Boolean);

export interface SearchTextPart { text: string; matched: boolean }

export function highlightPanelSearch(text: string, query: string): SearchTextPart[] {
  const terms = searchTerms(query);
  if (!terms.length || !text) return [{ text, matched: false }];
  let normalized = '';
  const positions: { start: number; end: number }[] = [];
  // Keep offsets into the original text when normalization expands characters,
  // and keep combining marks with their preceding character.
  for (const match of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const value = normalize(match[0]);
    normalized += value;
    for (let index = 0; index < value.length; index += 1) positions.push({ start: match.index!, end: match.index! + match[0].length });
  }
  const ranges: { start: number; end: number }[] = [];
  for (const term of terms) {
    let offset = normalized.indexOf(term);
    while (offset !== -1) {
      ranges.push({ start: positions[offset].start, end: positions[offset + term.length - 1].end });
      offset = normalized.indexOf(term, offset + 1);
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const parts: SearchTextPart[] = [];
  let offset = 0;
  for (const range of merged) {
    if (range.start > offset) parts.push({ text: text.slice(offset, range.start), matched: false });
    parts.push({ text: text.slice(range.start, range.end), matched: true });
    offset = range.end;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), matched: false });
  return parts;
}

export function matchesPanelSearch(query: string, values: unknown[]): boolean {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const text = values.map((value) => {
    const source = String(value ?? '');
    const base = source.replace(/ \d+$/, '');
    return `${source} ${translations[source] || translations[base] || ''}`;
  }).map(normalize).join(' ');
  return terms.every((term) => text.includes(term));
}

export function filterComponentStyles(styles: ComponentStyle[], query: string): ComponentStyle[] {
  return styles.filter((style) => matchesPanelSearch(query, [style.name, style.id,
    ...Object.entries(style.props).flatMap(([key, value]) => [key, typeof value === 'string' ? value : '']),
  ]));
}

export function filterPropertySchemas(schemas: PropertySchema[], query: string): PropertySchema[] {
  return schemas.filter((schema) => matchesPanelSearch(query, [schema.label, schema.key, schema.description, schema.help]));
}
