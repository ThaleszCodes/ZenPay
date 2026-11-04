'use client';

import { useState, type FormEvent } from 'react';

async function send(path: string, payload: Record<string, string>) {
  const response = await fetch('/api/auth/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
  if (!response.ok || result.error) throw new Error(result.error?.message || result.message || 'Não foi possível concluir. Tente novamente.');
}

export function NeonLogout() {
  const [error, setError] = useState(false);
  return <><button className="profile" type="button" onClick={async () => {
    try { await send('sign-out', {}); window.location.assign('/'); }
    catch { setError(true); }
  }}>Sair da conta</button>{error && <small role="alert">Não foi possível sair. Tente novamente.</small>}</>;
}

export default function NeonLogin() {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (mode === 'verify') {
        const otp = String(data.get('otp') || '');
        if (!otp) {
          await send('email-otp/send-verification-otp', { email, type: 'email-verification' });
          setError('Código enviado. Confira sua caixa de entrada.');
          return;
        }
        await send('email-otp/verify-email', { email, otp });
      } else {
        const password = String(data.get('password'));
        await send(mode === 'register' ? 'sign-up/email' : 'sign-in/email', mode === 'register'
          ? { email, password, name: String(data.get('name')) }
          : { email, password });
      }
      window.location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }

  return <form className="neon-login" onSubmit={submit}>
    {mode === 'register' && <label>Nome<input name="name" autoComplete="name" required maxLength={100}/></label>}
    <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required/></label>
    {mode === 'verify' ? <label>Código de confirmação<input name="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="Deixe vazio para enviar o código"/></label>
      : <label>Senha<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} required/></label>}
    {error && <small role="status">{error}</small>}
    <button type="submit" className="button primary" disabled={busy}>{busy ? 'Aguarde…' : mode === 'register' ? 'Criar conta' : mode === 'verify' ? 'Enviar ou confirmar código' : 'Entrar'}</button>
    <button type="button" className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Criar conta' : 'Voltar ao login'}</button>
    {mode !== 'verify' && <button type="button" className="text-button" onClick={() => { setMode('verify'); setError(''); }}>Confirmar e-mail</button>}
  </form>;
}
