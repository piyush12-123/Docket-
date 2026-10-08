import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * of inactivity. A new value within the delay window resets the timer.
 *
 * @param value - The value to debounce.
 * @param delay - Idle window in milliseconds before the debounced value
 *                updates. Defaults to 300 ms.
 * @returns The debounced value.
 *
 * Requirement 9.7
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
