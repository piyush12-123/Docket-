import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock authStore so we can control token state
vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

// Mock axios to intercept calls without hitting network
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

describe('apiClient', () => {
  let requestInterceptor: (config: Record<string, unknown>) => Record<string, unknown>;
  let responseSuccessInterceptor: (response: unknown) => unknown;
  let responseErrorInterceptor: (error: unknown) => unknown;

  const mockRequestInterceptorsUse = vi.fn();
  const mockResponseInterceptorsUse = vi.fn();

  const mockAxiosInstance = {
    interceptors: {
      request: { use: mockRequestInterceptorsUse },
      response: { use: mockResponseInterceptorsUse },
    },
  };

  beforeEach(async () => {
    vi.resetModules();

    // Setup axios.create mock to return our controlled instance
    const axiosMod = await import('axios');
    vi.mocked(axiosMod.default.create).mockReturnValue(mockAxiosInstance as never);

    mockRequestInterceptorsUse.mockClear();
    mockResponseInterceptorsUse.mockClear();

    // Import apiClient fresh (triggers interceptor registration)
    await import('./apiClient');

    // Capture the registered interceptors
    requestInterceptor = mockRequestInterceptorsUse.mock.calls[0][0] as typeof requestInterceptor;
    [responseSuccessInterceptor, responseErrorInterceptor] = mockResponseInterceptorsUse.mock.calls[0] as [typeof responseSuccessInterceptor, typeof responseErrorInterceptor];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request interceptor', () => {
    it('attaches Authorization header when token is present', async () => {
      const { useAuthStore } = await import('@/store/authStore');
      vi.mocked(useAuthStore.getState).mockReturnValue({ token: 'test-token-123' } as never);

      const config = { headers: {} };
      const result = requestInterceptor(config as never);

      expect((result as { headers: { Authorization?: string } }).headers.Authorization).toBe('Bearer test-token-123');
    });

    it('does not attach Authorization header when token is null', async () => {
      const { useAuthStore } = await import('@/store/authStore');
      vi.mocked(useAuthStore.getState).mockReturnValue({ token: null } as never);

      const config = { headers: {} };
      const result = requestInterceptor(config as never);

      expect((result as { headers: { Authorization?: string } }).headers.Authorization).toBeUndefined();
    });
  });

  describe('response interceptor', () => {
    it('passes through successful responses unchanged', () => {
      const mockResponse = { status: 200, data: { ok: true } };
      const result = responseSuccessInterceptor(mockResponse);
      expect(result).toBe(mockResponse);
    });

    it('calls logout on HTTP 401 response', async () => {
      const { useAuthStore } = await import('@/store/authStore');
      const mockLogout = vi.fn();
      vi.mocked(useAuthStore.getState).mockReturnValue({ logout: mockLogout, token: 'abc' } as never);

      const axiosMod = await import('axios');
      vi.spyOn(axiosMod.default, 'isAxiosError').mockReturnValue(true);

      const error = { response: { status: 401 } };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it('does not call logout on non-401 errors', async () => {
      const { useAuthStore } = await import('@/store/authStore');
      const mockLogout = vi.fn();
      vi.mocked(useAuthStore.getState).mockReturnValue({ logout: mockLogout, token: 'abc' } as never);

      const axiosMod = await import('axios');
      vi.spyOn(axiosMod.default, 'isAxiosError').mockReturnValue(true);

      const error = { response: { status: 403 } };

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('does not call logout on non-Axios errors', async () => {
      const { useAuthStore } = await import('@/store/authStore');
      const mockLogout = vi.fn();
      vi.mocked(useAuthStore.getState).mockReturnValue({ logout: mockLogout, token: 'abc' } as never);

      const axiosMod = await import('axios');
      vi.spyOn(axiosMod.default, 'isAxiosError').mockReturnValue(false);

      const error = new Error('Network Error');

      await expect(responseErrorInterceptor(error)).rejects.toBe(error);
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });
});
