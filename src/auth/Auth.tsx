import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import type { User } from '../lib/types';
import './auth.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function Auth({ onLogin }: { onLogin: (user: User) => void }) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const googleButton = useRef<HTMLDivElement>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { const result = await api<{ user: User }>(register ? 'auth.register' : 'auth.login', { email: email.trim(), password, ...(register ? { name: name.trim() } : {}) }); onLogin(result.user); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in. Please try again.'); }
    finally { setBusy(false); }
  }
  async function googleCredential(credential: string) {
    setError(''); setBusy(true);
    try { const result = await api<{ user: User }>('auth.google', { credential }); onLogin(result.user); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in with Google.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    const render = () => {
      const google = (window as any).google;
      if (cancelled || !google?.accounts?.id || !googleButton.current) return;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential: string }) => void googleCredential(response.credential),
      });
      googleButton.current.innerHTML = '';
      google.accounts.id.renderButton(googleButton.current, { type: 'standard', theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
    };
    const existing = document.getElementById('google-identity-services') as HTMLScriptElement | null;
    if (existing) { render(); return () => { cancelled = true; }; }
    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, []);
  return <main className="auth-shell">
    <section className="auth-story">
      <a className="auth-brand" href="/" aria-label="CanvasLab home"><span className="auth-brand-mark"><i /><i /><i /><i /></span>CanvasLab<span className="auth-brand-dot">.</span></a>
      <div className="auth-story-copy"><span className="auth-eyebrow"><Sparkles size={15} /> A little space. A lot of possibility.</span><h1>Good things<br />start with<br /><em>an idea.</em></h1><p>Bring your team, your big questions, and your<br className="auth-desktop-break" /> messy first drafts. Make something together.</p></div>
      <div className="auth-canvas-art" aria-hidden="true"><div className="auth-art-label">THE NEXT BIG THING</div><svg viewBox="0 0 420 200"><path d="M105 90 C165 90 145 45 208 50" fill="none" stroke="#5d56b2" strokeWidth="2" strokeDasharray="5 5" /><path d="M237 70 C250 138 265 160 338 145" fill="none" stroke="#5d56b2" strokeWidth="2" /><path d="M332 139 L342 145 L334 151" fill="none" stroke="#5d56b2" strokeWidth="2" /></svg><div className="auth-note auth-note-one">What if<br />we tried…<span>✳</span></div><div className="auth-note auth-note-two">Think big.<br />Start small.</div><div className="auth-note auth-note-three">Make it<br />happen. <Check size={23} /></div><div className="auth-art-cursor">↖ <span>You, together</span></div></div>
      <div className="auth-story-footer"><span className="auth-footer-avatars"><i>Y</i><i>A</i><i>M</i></span><span>A shared canvas for every kind of team.</span></div>
    </section>
    <section className="auth-form-side"><div className="auth-form-wrap"><div className="auth-form-emblem">✳</div><h2>{register ? 'Make room for ideas.' : 'Welcome back.'}</h2><p className="auth-form-subtitle">{register ? 'Your next great collaboration starts here.' : 'Your team and your ideas are right here.'}</p>
      {GOOGLE_CLIENT_ID && <><div ref={googleButton} className="auth-google-button" /><div className="auth-divider"><span>or</span></div></>}
      <form onSubmit={submit}>
      {register && <label>Full name<input autoComplete="name" required value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={80} /></label>}
      <label>Email address<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label>
      <label>Password<div className="auth-password"><input type={visible ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={8} maxLength={1024} required value={password} onChange={e => setPassword(e.target.value)} placeholder={register ? 'At least 8 characters' : 'Enter your password'} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spin" size={19} /> : <>{register ? 'Create your account' : 'Sign in'}<ArrowRight size={18} /></>}</button>
    </form><p className="auth-switch">{register ? 'Already have an account?' : 'New to CanvasLab?'} <button disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Sign in' : 'Create an account'}</button></p><p className="auth-private"><Check size={14} /> Your work stays private until you share it.</p></div><footer className="auth-bottom">CanvasLab · A space to think together</footer></section>
  </main>;
}
