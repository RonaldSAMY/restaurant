'use client';

import { LoginRequestSchema } from '@restaurant/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { login, type ApiError } from '../../../lib/api';

/** Maps a failed login to its message, by `code` only. */
export function describeLoginError(error: ApiError): string {
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
    case 'VALIDATION_FAILED':
      return 'Email or password is incorrect.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/** Email + password form that logs staff in and opens `/kitchen`. */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  /** Validates the fields, logs in, and opens the board on success. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(
        describeLoginError({ code: 'VALIDATION_FAILED', message: 'Invalid' }),
      );
      return;
    }
    setPending(true);
    setError('');
    const result = await login(parsed.data);
    if (result.ok) {
      router.replace('/kitchen');
      return;
    }
    setPending(false);
    setError(describeLoginError(result.error));
  }

  return (
    <form className="login" onSubmit={(event) => void submit(event)}>
      <label htmlFor="staff-email">Email</label>
      <input
        id="staff-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <label htmlFor="staff-password">Password</label>
      <input
        id="staff-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <p role="alert" className="error">
        {error}
      </p>
      <button type="submit" disabled={pending}>
        Log in
      </button>
    </form>
  );
}
