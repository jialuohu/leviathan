import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Let Redux Toolkit's ~10ms notify timer (used by recharts) fire before jsdom teardown.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 50)));
