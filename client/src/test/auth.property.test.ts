/**
 * Property-based tests for client authentication behaviour.
 *
 * Property 8 — Client attaches Bearer token to every outbound authenticated request.
 * Property 9 — Unauthenticated access to protected routes redirects to /login.
 *
 * Testing framework: @fast-check/vitest
 */

import { describe, expect, beforeEach } from 'vitest';
import { fc, test as fcTest } from '@fast-check/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

import { useAuthStore } from '@/store/authStore';
import ProtectedRoute from '@/components/ProtectedRoute';

// ---------------------------------------------------------------------------
// Property 8 — Bearer token is attached to every outbound authenticated request
// Feature: docket, Property 8
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe('Property 8: Client attaches Bearer token to every outbound authenticated request', () => {
  fcTest.prop(
    [fc.string({ minLength: 1 })],
    { numRuns: 100 },
  )('for any non-empty token, Authorization header equals Bearer <token>', async (token) => {
    useAuthStore.getState().login(token, { name: 'Test', email: 'test@example.com' });

    const axios = (await import('axios')).default;
    const apiClient = (await import('@/api/apiClient')).default;

    // Install a one-shot adapter that captures the config and returns a mock response
    const capturedConfigs: Array<Record<string, unknown>> = [];
    const originalAdapter = (axios.defaults as { adapter?: unknown }).adapter;

    (apiClient.defaults as any).adapter = async (config: any) => {
      capturedConfigs.push(config);
      return {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    try {
      await apiClient.get('/test-endpoint');
    } catch {
      // ignore
    }

    apiClient.defaults.adapter = originalAdapter as typeof apiClient.defaults.adapter;

    expect(capturedConfigs).toHaveLength(1);
    const sentHeaders = capturedConfigs[0].headers as Record<string, string>;
    expect(sentHeaders['Authorization']).toBe(`Bearer ${token}`);
  });
});

// ---------------------------------------------------------------------------
// Property 9 — Unauthenticated access to protected routes redirects to /login
// Feature: docket, Property 9
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe('Property 9: Unauthenticated access to protected routes redirects to /login', () => {
  beforeEach(() => {
    // Ensure no token is present before each test run
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });
  });

  // Property 9
  // Feature: docket, Property 9
  fcTest.prop(
    [fc.constantFrom('/dashboard', '/documents', '/notifications', '/settings')],
    { numRuns: 100 },
  )('navigating to a protected route while unauthenticated renders login-page', (route) => {
    // Ensure the store is unauthenticated for this iteration
    useAuthStore.setState({ token: null, user: null, isAuthenticated: false });

    const { unmount } = render(
      React.createElement(
        MemoryRouter,
        { initialEntries: [route] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: route,
            element: React.createElement(ProtectedRoute),
          }),
          React.createElement(Route, {
            path: '/login',
            element: React.createElement('div', null, 'login-page'),
          }),
        ),
      ),
    );

    // Redirect must have happened — login-page is visible
    expect(screen.getByText('login-page')).toBeTruthy();
    // Protected content must NOT be visible
    expect(screen.queryByText('protected-content')).toBeNull();

    unmount();
  });
});
