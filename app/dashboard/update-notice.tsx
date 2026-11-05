'use client';

import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import styles from './update-notice.module.css';

const runningVersion = process.env.NEXT_PUBLIC_ZENPAY_RELEASE;
const checkInterval = 60_000;

export default function UpdateNotice() {
  const [available, setAvailable] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!runningVersion) return;
    let disposed = false;
    let activeRequest: AbortController | null = null;

    async function checkVersion() {
      if (document.visibilityState === 'hidden' || activeRequest) return;
      const request = new AbortController();
      activeRequest = request;
      const timeout = window.setTimeout(() => request.abort(), 8_000);
      try {
        const response = await fetch('/api/app-version', { cache: 'no-store', signal: request.signal });
        if (!response.ok) return;
        const { version } = await response.json() as { version?: unknown };
        if (!disposed && typeof version === 'string' && version) {
          setAvailable(version === runningVersion ? null : version);
        }
      } catch {
        // Temporary network failure. Check again on the next interval or resume.
      } finally {
        window.clearTimeout(timeout);
        activeRequest = null;
      }
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setDismissed(null);
      void checkVersion();
    }

    void checkVersion();
    const interval = window.setInterval(checkVersion, checkInterval);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', checkVersion);
    document.addEventListener('visibilitychange', checkVersion);
    return () => {
      disposed = true;
      activeRequest?.abort();
      window.clearInterval(interval);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', checkVersion);
      document.removeEventListener('visibilitychange', checkVersion);
    };
  }, []);

  if (!available || available === dismissed) return null;
  return (
    <aside className={styles.notice} aria-label="Atualização da ZenPay">
      <div className={styles.heading}>
        <span className={styles.icon}><RefreshCw size={18} aria-hidden="true"/></span>
        <div>
          <strong role="status">Atualização disponível</strong>
          <p>Uma nova versão da ZenPay está pronta.</p>
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.update} onClick={() => window.location.reload()}>Atualizar agora</button>
        <button type="button" className={styles.dismiss} onClick={() => setDismissed(available)}>Agora não</button>
      </div>
    </aside>
  );
}
