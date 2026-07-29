import { useLogin } from '@refinedev/core';
import { useState } from 'react';

export function LoginPage() {
  const { mutate: login, isPending, error } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        login({ email, password });
      }}
      style={{ maxWidth: 320, margin: '80px auto', display: 'grid', gap: 12 }}
    >
      <h1>HeryJs Admin</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit" disabled={isPending}>
        Log in
      </button>
      {error ? <p style={{ color: 'crimson' }}>{error.message}</p> : null}
    </form>
  );
}
