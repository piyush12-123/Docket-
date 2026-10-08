import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import * as authApi from '@/api/authApi';
import axios from 'axios';

/**
 * Register page — Requirement 3.2
 *
 * - Client-side validation: name non-empty, valid email format, password ≥ 8 chars.
 * - Inline per-field error messages shown on submit (or on blur for email format).
 * - Calls `authApi.register`, then stores the token + user via `authStore.login()`.
 * - Redirects to `/dashboard` on success.
 * - Displays a global error banner for server-returned errors.
 * - Redirects already-authenticated users away to `/dashboard`.
 */

// Simple RFC 5322-ish email regex sufficient for client-side UX validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

export default function Register() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect already-authenticated users (Requirement 3.2)
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  /** Run all client-side validation and return whether the form is valid. */
  const validate = (): boolean => {
    const errors: FieldErrors = {};

    if (!name.trim()) {
      errors.name = 'Name is required.';
    }

    if (!email.trim()) {
      errors.email = 'Email is required.';
    } else if (!EMAIL_RE.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const { token, user } = await authApi.register(
        name.trim(),
        email.trim(),
        password,
      );
      login(token, user);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const serverMsg = axios.isAxiosError(err)
        ? (err.response?.data?.error || err.response?.data?.message)
        : null;
      if (serverMsg) {
        setServerError(serverMsg as string);
      } else {
        setServerError('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Create an account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start your personal document vault
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-border bg-card p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Global server error banner */}
            {serverError && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {serverError}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-foreground"
              >
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearFieldError('name');
                }}
                placeholder="Jane Smith"
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                aria-invalid={!!fieldErrors.name}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition ${
                  fieldErrors.name
                    ? 'border-destructive focus:ring-destructive'
                    : 'border-input'
                }`}
              />
              {fieldErrors.name && (
                <p
                  id="name-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {fieldErrors.name}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError('email');
                }}
                placeholder="you@example.com"
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                aria-invalid={!!fieldErrors.email}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition ${
                  fieldErrors.email
                    ? 'border-destructive focus:ring-destructive'
                    : 'border-input'
                }`}
              />
              {fieldErrors.email && (
                <p
                  id="email-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFieldError('password');
                }}
                placeholder="At least 8 characters"
                aria-describedby={
                  fieldErrors.password ? 'password-error' : undefined
                }
                aria-invalid={!!fieldErrors.password}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition ${
                  fieldErrors.password
                    ? 'border-destructive focus:ring-destructive'
                    : 'border-input'
                }`}
              />
              {fieldErrors.password && (
                <p
                  id="password-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        {/* Switch to Login */}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
