import { describe, it, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';

// The exact same filter logic used in DocumentsLibrary.tsx:
function applyFilters(
  docs: Array<{ documentType: string; tags: string[] }>,
  activeFilters: Set<string>
) {
  if (activeFilters.size === 0) return docs;
  return docs.filter((doc) => {
    for (const filter of activeFilters) {
      if (filter.startsWith('type:') && doc.documentType === filter.slice(5)) return true;
      if (filter.startsWith('tag:') && doc.tags.includes(filter.slice(4))) return true;
    }
    return false;
  });
}

const docArb = fc.record({
  documentType: fc.constantFrom('id', 'certificate', 'contract', 'invoice', 'insurance', 'warranty', 'other'),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
});

test.prop([fc.array(docArb, { maxLength: 20 })])(
  'Property 17a — empty filters returns all docs',
  (docs) => {
    const result = applyFilters(docs, new Set());
    expect(result.length).toBe(docs.length);
  }
);

test.prop([
  fc.array(docArb, { minLength: 1, maxLength: 20 }),
  fc.constantFrom('id', 'certificate', 'contract', 'invoice', 'insurance', 'warranty', 'other'),
])(
  'Property 17b — type filter only returns docs of that type',
  (docs, filterType) => {
    const result = applyFilters(docs, new Set([`type:${filterType}`]));
    for (const doc of result) {
      expect(doc.documentType).toBe(filterType);
    }
    expect(result.length).toBeLessThanOrEqual(docs.length);
  }
);

test.prop([fc.array(docArb, { minLength: 1, maxLength: 20 }), fc.string({ minLength: 1, maxLength: 10 })])(
  'Property 17c — tag filter only returns docs with that tag',
  (docs, filterTag) => {
    const result = applyFilters(docs, new Set([`tag:${filterTag}`]));
    for (const doc of result) {
      expect(doc.tags).toContain(filterTag);
    }
  }
);
