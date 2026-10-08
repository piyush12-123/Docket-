// Scaffold smoke test — verifies vitest is configured correctly
import { describe, it, expect } from 'vitest';

describe('Server scaffold', () => {
  it('vitest is configured and running', () => {
    expect(true).toBe(true);
  });
});
