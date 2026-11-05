import { BarChart3, Grid2X2, Home, Layers3, Settings2, Wallet } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import styles from './mobile.module.css';

export type DashboardTab = 'home' | 'sales' | 'products' | 'finance' | 'more';

const tabs = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'sales', label: 'Vendas', icon: BarChart3 },
  { id: 'products', label: 'Produtos', icon: Layers3 },
  { id: 'more', label: 'Mais', icon: Grid2X2 },
] as const;

export function MobileHeader({ name, onProfile, onHome }: { name?: string; onProfile: () => void; onHome: () => void }) {
  const initials = name?.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'Z';
  return (
    <header className={styles.header}>
      <button type="button" className={styles.brand} onClick={onHome} aria-label="ZenPay, início">
        <svg viewBox="0 0 36 28" width="25" height="21" aria-hidden="true"><path fill="currentColor" d="M9 0h27L17 20h13l-8 8H0L19 8H1Z"/></svg>
        <span>ZenPay</span>
      </button>
      <button type="button" className={styles.avatar} onClick={onProfile} aria-label="Abrir menu da conta">{initials}</button>
    </header>
  );
}

export function MobileNavigation({ tab, onChange }: { tab: DashboardTab; onChange: (tab: DashboardTab) => void }) {
  const activeTab = tab === 'finance' ? 'more' : tab;
  const activeIndex = tabs.findIndex(item => item.id === activeTab);
  return (
    <nav className={styles.navigation} aria-label="Navegação do painel">
      <span className={styles.navigationTrack} aria-hidden="true"><span style={{ '--active-tab': activeIndex } as CSSProperties}/></span>
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = id === activeTab;
        return <button key={id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onChange(id)}><Icon size={20} aria-hidden /><span>{label}</span></button>;
      })}
    </nav>
  );
}

export function MobileMore({ onFinance, onSettings, children }: { onFinance: () => void; onSettings: () => void; children: ReactNode }) {
  return (
    <section className={styles.more} aria-labelledby="mobile-more-title">
      <h1 id="mobile-more-title">Mais</h1>
      <button type="button" onClick={onFinance}><Wallet size={20} aria-hidden /> Financeiro</button>
      <button type="button" onClick={onSettings}><Settings2 size={20} aria-hidden /> Configurações</button>
      {children}
    </section>
  );
}
