'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Package, X } from 'lucide-react';
import { api, copy, money } from '../../lib/client';
import styles from './product-onboarding.module.css';

const steps = ['Produto', 'Preço', 'Entrega', 'Revisão'];
const titles = ['O que você vai vender?', 'Quanto custa seu produto?', 'Como seu cliente recebe?', 'Tudo pronto para criar?'];
const initial = { name: '', description: '', cover_url: '', price: '', delivery_url: '', delivery_text: '', active: true };
const maxFileSize = 3 * 1024 * 1024;

function cents(value: string) {
  return /^\d+(?:[,.]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.replace(',', '.')) * 100) : 0;
}

function isHttps(value: string) {
  if (!value) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

type Props = {
  sellerId?: string;
  connected: boolean;
  sandbox: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export default function ProductOnboarding({ sellerId, connected, sandbox, onClose, onCreated }: Props) {
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [missingFile, setMissingFile] = useState(false);
  const [result, setResult] = useState<{ url: string; active: boolean }>();
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<'checkout' | 'delivery'>('checkout');
  const hydratedKey = useRef('');
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const draftKey = sellerId ? `zenpay:product-draft:${sellerId}` : '';

  useEffect(() => {
    if (!draftKey) return;
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored) {
        const data = JSON.parse(stored);
        setDraft({ ...initial, ...data.draft });
        setStep(data.hadFile && data.step === 3 ? 2 : data.step);
        setMissingFile(!!data.hadFile);
        setSaved(true);
      }
    } catch { setSaved(false); }
    hydratedKey.current = draftKey;
  }, [draftKey]);

  useEffect(() => { heading.current?.focus(); }, [step, result]);

  function persist(nextDraft: typeof initial, nextStep: number, hadFile = !!file || missingFile) {
    if (!draftKey || hydratedKey.current !== draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ draft: nextDraft, step: nextStep, hadFile }));
      setSaved(true);
    } catch { setSaved(false); }
  }

  function update<K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setError('');
    persist(next, step);
  }

  function go(next: number) {
    setStep(next);
    setPreview(next === 2 ? 'delivery' : 'checkout');
    setError('');
    persist(draft, next);
    window.scrollTo(0, 0);
  }

  function validate(index: number) {
    if (index === 0) {
      if (draft.name.trim().length < 2) return 'Digite um nome com pelo menos dois caracteres.';
      if (!isHttps(draft.cover_url.trim())) return 'Use um link HTTPS para a capa.';
    }
    if (index === 1 && (cents(draft.price) < 1 || cents(draft.price) > 10_000_000)) {
      return 'Digite um preço de R$ 0,01 a R$ 100.000,00 com até duas casas decimais.';
    }
    if (index === 2) {
      if (missingFile) return 'Reanexe o arquivo ou confirme que deseja continuar sem ele.';
      if (!isHttps(draft.delivery_url.trim())) return 'Use um link HTTPS para a entrega.';
      if (!draft.delivery_url.trim() && !draft.delivery_text.trim() && !file) return 'Adicione um link, instruções ou um arquivo para a entrega.';
    }
    return '';
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !sellerId) return;
    for (let index = 0; index <= Math.min(step, 2); index++) {
      const message = validate(index);
      if (message) {
        if (index !== step) go(index);
        setError(message);
        return;
      }
    }
    if (step < 3) { go(step + 1); return; }

    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const fileData = file ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        reader.readAsDataURL(file);
      }) : undefined;
      const active = draft.active && connected;
      const { id } = await api('products', 'POST', {
        ...draft, name: draft.name.trim(), price: cents(draft.price), active,
        cover_url: draft.cover_url.trim(), delivery_url: draft.delivery_url.trim(),
        delivery_text: draft.delivery_text.trim(), file_name: file?.name, file_data: fileData,
      });
      setResult({ url: new URL('/c/' + id, window.location.origin).href, active });
      try { localStorage.removeItem(draftKey); } catch { /* Storage may be unavailable. */ }
      onCreated();
      window.scrollTo(0, 0);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (result) return <main className={styles.page}><section className={styles.success}>
    <span className={styles.badge}><Check size={24}/></span>
    <h1 ref={heading} tabIndex={-1}>{result.active ? 'Seu checkout está pronto!' : 'Produto criado e pausado'}</h1>
    <p>{result.active ? 'Copie o link e compartilhe com seus clientes.' : 'Você pode ativá-lo depois em Produtos, com a integração conectada.'}</p>
    <input aria-label="Link do checkout" readOnly value={result.url} onFocus={e => e.currentTarget.select()}/>
    <div className={styles.actions}>
      <button className="button primary" onClick={async () => {
        try { await copy(result.url); setCopied(true); }
        catch { setError('Selecione e copie o endereço acima.'); }
      }}><Copy size={16}/>{copied ? 'Link copiado' : 'Copiar link'}</button>
      {result.active && <a className="button" href={result.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Abrir checkout</a>}
      <button className="button" onClick={onClose}>Ir para produtos</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section></main>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className="brand"><span className="brandmark">Z</span>zenpay<span className="branddot">.</span></span>
      <button className="button" type="button" onClick={onClose} disabled={busy}><X size={16}/>Sair</button>
    </header>
    <progress className={styles.progress} value={step + 1} max={4} aria-label="Progresso da criação"/>
    <ol className={styles.steps} aria-label="Etapas de criação">
      {steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}>
        <span>{index < step ? <Check size={15}/> : index + 1}</span>{label}
      </li>)}
    </ol>
    <div className={styles.layout}>
      <form className={styles.card} onSubmit={submit} noValidate>
        <div key={step} className={styles.intro}>
          <small>ETAPA {step + 1} DE {steps.length}</small>
          <h1 ref={heading} tabIndex={-1}>{titles[step]}</h1>
        </div>
        <fieldset key={step} disabled={busy || !sellerId} className={styles.fields}>
          {step === 0 && <>
            <label>Nome do produto<input required maxLength={160} value={draft.name} onChange={e => update('name', e.target.value)} placeholder="Ex.: Kit de templates para Instagram"/></label>
            <label>Descrição <small>Opcional</small><textarea rows={4} maxLength={3000} value={draft.description} onChange={e => update('description', e.target.value)} placeholder="Conte o que o comprador vai receber."/></label>
            <label>Link da capa <small>Opcional</small><input type="url" maxLength={2000} value={draft.cover_url} onChange={e => update('cover_url', e.target.value)} placeholder="https://"/></label>
          </>}
          {step === 1 && <>
            <label>Preço em reais<input required inputMode="decimal" maxLength={12} value={draft.price} onChange={e => update('price', e.target.value)} placeholder="29,90"/></label>
            <div className={styles.note}><strong>{connected ? (sandbox ? 'PaggOne em modo de teste' : 'PaggOne conectada') : 'PaggOne ainda não conectada'}</strong>
              <p>{connected ? 'O checkout usa Pix para receber os pagamentos.' : 'Você pode criar o produto pausado e ativá-lo depois de conectar a integração nas configurações.'}</p></div>
          </>}
          {step === 2 && <>
            <p>Adicione pelo menos uma opção. A entrega aparece depois que o Pix é confirmado.</p>
            <label>Link de entrega<input type="url" maxLength={2000} value={draft.delivery_url} onChange={e => update('delivery_url', e.target.value)} placeholder="https://"/></label>
            <label>Instruções<textarea rows={4} maxLength={10000} value={draft.delivery_text} onChange={e => update('delivery_text', e.target.value)} placeholder="Explique como acessar o conteúdo."/></label>
            <label>Arquivo de até 3 MB<input type="file" onChange={e => {
              const selected = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!selected) return;
              if (!selected.size || selected.size > maxFileSize || selected.name.length > 180 || /\.(html?|svg|js|exe|bat|cmd)$/i.test(selected.name)) {
                setError('Selecione um arquivo válido de até 3 MB, como PDF, ZIP ou imagem.'); return;
              }
              setFile(selected);
              setMissingFile(false);
              persist(draft, step, true);
              setError('');
            }}/></label>
            {missingFile && <div className={styles.note}><p>O arquivo anterior precisa ser anexado novamente.</p><button type="button" className="text-button" onClick={() => { setMissingFile(false); persist(draft, step, false); }}>Continuar sem o arquivo anterior</button></div>}
            {file && <div className={styles.review}><span>{file.name}</span><button type="button" className="text-button" onClick={() => { setFile(null); persist(draft, step, false); }}>Remover</button></div>}
          </>}
          {step === 3 && <>
            {[
              ['Produto', draft.name],
              ['Preço', money(cents(draft.price))],
              ['Entrega', [draft.delivery_url.trim() && 'Link', draft.delivery_text.trim() && 'Instruções', file?.name].filter(Boolean).join(' · ')],
            ].map(([label, value], index) => <div className={styles.review} key={label}><div><strong>{label}</strong><p>{value}</p></div><button type="button" className="text-button" onClick={() => go(index)} aria-label={`Editar ${label.toLowerCase()}`}>Editar</button></div>)}
            <label>Status do checkout<select value={draft.active && connected ? 'active' : 'paused'} disabled={!connected} onChange={e => update('active', e.target.value === 'active')}><option value="active">Ativo</option><option value="paused">Pausado</option></select></label>
          </>}
        </fieldset>
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className={styles.actions}>
          {step > 0 && <button className="button" type="button" disabled={busy} onClick={() => go(step - 1)}><ArrowLeft size={16}/>Voltar</button>}
          <button className="button primary" disabled={busy || !sellerId} type="submit">{busy ? 'Criando produto…' : step === 3 ? 'Criar produto' : 'Continuar'}{!busy && <ArrowRight size={16}/>}</button>
        </div>
        <small className={styles.draft} role="status">{saved ? 'Rascunho salvo neste dispositivo.' : 'O rascunho é salvo neste dispositivo quando disponível.'}{file && ' Reanexe o arquivo se sair.'}</small>
      </form>
      <aside className={styles.card} aria-label="Prévia para o comprador">
        <div className={styles.previewControls} aria-label="Escolher prévia">
          <button type="button" aria-pressed={preview === 'checkout'} onClick={() => setPreview('checkout')}>Checkout</button>
          <button type="button" aria-pressed={preview === 'delivery'} onClick={() => setPreview('delivery')}>Pós-pagamento</button>
        </div>
        <div key={preview} className={styles.preview}>
          <small>PRÉVIA SIMULADA</small>
          {preview === 'checkout' ? <>
            <div className={styles.cover}>{isHttps(draft.cover_url.trim()) && draft.cover_url.trim() ? <img src={draft.cover_url.trim()} alt="Capa do produto" referrerPolicy="no-referrer"/> : <Package size={32}/>}</div>
            <h2>{draft.name.trim() || 'Seu produto'}</h2>
            {draft.description.trim() && <p>{draft.description}</p>}
            <strong>{money(cents(draft.price))}</strong>
            <span className={styles.pix}>Pagar com Pix</span>
          </> : <>
            <span className={styles.badge}><Check size={24}/></span>
            <h2>Pagamento confirmado</h2>
            <p>{draft.delivery_text.trim() || 'As instruções de entrega aparecerão aqui.'}</p>
            {draft.delivery_url.trim() && <span className={styles.pix}>Acessar produto</span>}
            {file && <p>Baixar {file.name}</p>}
          </>}
        </div>
      </aside>
    </div>
  </main>;
}
