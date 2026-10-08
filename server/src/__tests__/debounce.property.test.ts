import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fc, test } from '@fast-check/vitest';

function debounce<T>(fn: (val: T) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (val: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(val), delay);
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test.prop([fc.array(fc.string(), { minLength: 2, maxLength: 10 })])(
  'Property 23 — debounce fires only once with last value',
  (values) => {
    const callback = vi.fn();
    const debounced = debounce(callback, 300);

    for (const val of values) {
      debounced(val);
      vi.advanceTimersByTime(50); // advance less than delay between each call
    }

    // Before delay has fully passed, callback should not have fired
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300); // now the last debounce fires

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(values[values.length - 1]);
  }
);
