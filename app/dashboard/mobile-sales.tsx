import { Download, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { date, labels, money } from '../../lib/client';
import type { RecentSale } from './mobile-overview';
import styles from './sales.module.css';

const periods = [['today', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']] as const;
const statuses = [
  ['all', 'Todos os status'], ['paid', 'Aprovados'], ['pending', 'Aguardando Pix'],
  ['expired', 'Expirados'], ['refunded', 'Reembolsados'], ['creation_failed', 'Pix não gerado'],
  ['verification_required', 'Verificar operação'],
] as const;

export type DashboardSale = RecentSale & {
  paid_at?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
};

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' });

export function salesWindow(period: string, now = new Date()) {
  const today = dayFormat.format(now);
  const days = period === 'today' ? 1 : Number(period);
  const start = new Date(today + 'T00:00:00Z');
  start.setUTCDate(start.getUTCDate() - days + 1);
  const first = start.toISOString().slice(0, 10);
  return {
    includes(value: string) {
      const timestamp = new Date(value);
      if (!Number.isFinite(timestamp.getTime())) return false;
      const day = dayFormat.format(timestamp);
      return day >= first && day <= today;
    },
    buckets: Array.from({ length: period === 'today' ? 24 : Math.min(days, 30) }, (_, i) => {
      if (period === 'today') {
        const hour = String(i).padStart(2, '0');
        return { key: hour, label: hour + 'h' };
      }
      const day = new Date(start);
      day.setUTCDate(day.getUTCDate() + i);
      const key = day.toISOString().slice(0, 10);
      return { key, label: key.slice(8, 10) + '/' + key.slice(5, 7) };
    }),
  };
}

function RevenueChart({ period, paid }: { period: string; paid: DashboardSale[] }) {
  const today = period === 'today';
  const { buckets } = salesWindow(period);
  const totals = new Map<string, number>();
  for (const sale of paid) {
    const timestamp = new Date(sale.paid_at || sale.created_at);
    const key = today ? hourFormat.format(timestamp) : dayFormat.format(timestamp);
    totals.set(key, (totals.get(key) ?? 0) + sale.amount);
  }
  let running = 0;
  const points = buckets.map(bucket => {
    running += totals.get(bucket.key) ?? 0;
    return { ...bucket, value: running };
  });
  const ceiling = Math.max(100, Math.ceil(running / 400) * 400);
  const x = (index: number) => 63 + index / Math.max(1, points.length - 1) * 263;
  const y = (value: number) => 104 - value / ceiling * 87;
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const ticks = [...new Set([0, Math.round((points.length - 1) / 3), Math.round((points.length - 1) * 2 / 3), points.length - 1])];
  return (
    <section className={styles.section} aria-labelledby="mobile-sales-chart">
      <h2 id="mobile-sales-chart">{today ? 'Receita ao longo do dia' : 'Receita ao longo do período'}</h2>
      <div className={styles.card}>
        <svg className={styles.chart} viewBox="0 0 338 133" role="img" aria-label={`Receita acumulada: ${money(running)} no período`}>
          <defs><linearGradient id="mobile-sales-area" x2="0" y2="1"><stop stopColor="#1264ff" stopOpacity=".22"/><stop offset="1" stopColor="#1264ff" stopOpacity=".025"/></linearGradient></defs>
          {[0, 1, 2, 3, 4].map(step => {
            const value = ceiling * step / 4;
            return <g key={step}><line x1="63" x2="326" y1={y(value)} y2={y(value)} stroke="#e2e6f1"/><text x="55" y={y(value) + 3} textAnchor="end">{money(value)}</text></g>;
          })}
          <polygon points={`63,104 ${line} 326,104`} fill="url(#mobile-sales-area)"/>
          <polyline points={line} fill="none" stroke="#1460f5" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
          <circle cx="326" cy={y(running)} r="3.5" fill="#1460f5"/>
          {ticks.map(index => <text key={index} x={x(index)} y="124" textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{points[index]?.label}</text>)}
        </svg>
        {!paid.length && <p className={styles.note}>Nenhuma venda aprovada neste período.</p>}
      </div>
    </section>
  );
}

type Props = {
  period: string;
  paid: DashboardSale[];
  pendingCount: number;
  transactions: DashboardSale[];
  query: string;
  filter: string;
  loading: boolean;
  onPeriod: (value: string) => void;
  onQuery: (value: string) => void;
  onFilter: (value: string) => void;
  onSale: (sale: DashboardSale) => void;
  onRefresh: () => void;
  onExport: () => void;
};

export default function MobileSales(props: Props) {
  const { period, paid, pendingCount, transactions, query, filter, loading, onPeriod, onQuery, onFilter, onSale, onRefresh, onExport } = props;
  const revenue = paid.reduce((total, sale) => total + sale.amount, 0);
  return (
    <div className={styles.screen} aria-busy={loading}>
      <header className={styles.heading}>
        <h1>Vendas</h1>
        <p>Acompanhe seus resultados</p>
      </header>
      <div className={styles.periods} role="group" aria-label="Período das vendas">
        {periods.map(([value, label]) => <button type="button" key={value} aria-pressed={period === value} onClick={() => onPeriod(value)}>{label}</button>)}
      </div>
      <section className={styles.card} aria-labelledby="mobile-approved-revenue">
        <h2 id="mobile-approved-revenue" className={styles.revenueLabel}>Receita aprovada</h2>
        <strong className={styles.revenue}>{loading ? '—' : money(revenue)}</strong>
        <div className={styles.counts}>
          <span>{paid.length} {paid.length === 1 ? 'venda paga' : 'vendas pagas'}</span>
          <span>{pendingCount} {pendingCount === 1 ? 'Pix pendente' : 'Pix pendentes'}</span>
        </div>
      </section>
      <RevenueChart period={period} paid={paid}/>
      <section className={styles.section} aria-labelledby="mobile-transactions">
        <div className={styles.sectionHeading}>
          <h2 id="mobile-transactions">Transações</h2>
          <div className={styles.tools}>
            <button type="button" onClick={onRefresh} disabled={loading} aria-label="Atualizar vendas"><RefreshCw size={16} aria-hidden/></button>
            <button type="button" onClick={onExport} aria-label="Exportar vendas"><Download size={16} aria-hidden/></button>
          </div>
        </div>
        <details className={styles.filters}>
          <summary><SlidersHorizontal size={16} aria-hidden/>Filtrar{filter !== 'all' || query ? ' · ativo' : ''}</summary>
          <div className={styles.filterFields}>
            <label><Search size={15} aria-hidden/><input aria-label="Buscar vendas" placeholder="Produto, cliente ou pedido" value={query} onChange={event => onQuery(event.target.value)}/></label>
            <select aria-label="Status da venda" value={filter} onChange={event => onFilter(event.target.value)}>
              {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </details>
        {transactions.length ? (
          <ul className={styles.transactions}>
            {transactions.map(sale => (
              <li key={sale.id}><button type="button" onClick={() => onSale(sale)}>
                <span className={styles.transactionCopy}><strong>{sale.product_name}</strong><span>{money(sale.amount)} <span aria-hidden>·</span> <time dateTime={sale.created_at}>{date(sale.created_at)}</time></span></span>
                <span className={styles.badge} data-status={sale.status}>{sale.status === 'paid' ? 'Pago' : sale.status === 'pending' ? 'Pendente' : labels[sale.status] || sale.status}</span>
              </button></li>
            ))}
          </ul>
        ) : <p className={styles.note} role="status">{loading ? 'Carregando vendas…' : 'Nenhuma transação encontrada.'}</p>}
      </section>
    </div>
  );
}
