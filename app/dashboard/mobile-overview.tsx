import { ArrowRight, ChevronRight, Layers3, PlusSquare, ShoppingBag } from 'lucide-react';
import { date, labels, money } from '../../lib/client';
import styles from './mobile.module.css';

export type RecentSale = {
  id: string;
  product_name: string;
  amount: number;
  status: string;
  created_at: string;
};

type OverviewProps = {
  name?: string;
  period: string;
  revenue: number;
  paid: number;
  pending: number;
  sales: RecentSale[];
  loading: boolean;
  onPeriodChange: (period: string) => void;
  onNewProduct: () => void;
  onSales: () => void;
  onProducts: () => void;
  onSale: (sale: RecentSale) => void;
};

function PixBanner({ onProducts }: Pick<OverviewProps, 'onProducts'>) {
  return (
    <section className={styles.banner} aria-labelledby="mobile-pix-title">
      <div>
        <h2 id="mobile-pix-title">Checkout Pix</h2>
        <p>Venda e entregue automaticamente.</p>
        <button type="button" onClick={onProducts}>Ver produtos <ArrowRight size={15} aria-hidden /></button>
      </div>
      <svg className={styles.ticket} viewBox="0 0 106 82" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="zen-ticket-fill" x1="15" y1="7" x2="85" y2="78" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9cb6ef" stopOpacity=".7"/><stop offset="1" stopColor="#1264ed" stopOpacity=".45"/>
          </linearGradient>
        </defs>
        <rect x="20" y="24" width="71" height="49" rx="9" fill="#254983" stroke="#3c72ba" transform="rotate(8 20 24)"/>
        <g transform="rotate(-7 49 43)">
          <path d="M19 15h62a8 8 0 0 1 8 8v35a8 8 0 0 1-8 8H19a8 8 0 0 1-8-8V49a8 8 0 0 0 0-16V23a8 8 0 0 1 8-8Z" fill="url(#zen-ticket-fill)" stroke="#a5cbff"/>
          <path d="m50 25 11 11-11 11-11-11 11-11Z" stroke="#c0e4ff" strokeWidth="4" strokeLinejoin="round"/>
          <path d="M34 55h34m-34 5h19" stroke="#78bfff" strokeWidth="2" strokeLinecap="round"/>
        </g>
        <circle cx="88" cy="19" r="15" fill="#075df0" stroke="#69c6ff"/>
        <path d="m81 19 5 5 9-10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </section>
  );
}

function RecentActivity({ sales, loading, onSales, onSale }: Pick<OverviewProps, 'sales' | 'loading' | 'onSales' | 'onSale'>) {
  return (
    <section className={styles.activity} aria-labelledby="mobile-activity-title">
      <div className={styles.activityHeading}>
        <h2 id="mobile-activity-title">Atividade recente</h2>
        <button type="button" onClick={onSales}>Ver tudo <ChevronRight size={15} aria-hidden /></button>
      </div>
      {sales.length ? (
        <ul className={styles.activityList}>
          {sales.slice(0, 3).map(sale => (
            <li key={sale.id}>
              <button className={styles.sale} type="button" onClick={() => onSale(sale)}>
                <span className={styles.saleIcon}><ShoppingBag size={19} aria-hidden /></span>
                <span className={styles.saleDescription}><strong>{sale.product_name}</strong><time dateTime={sale.created_at}>{date(sale.created_at)}</time></span>
                <span className={styles.saleAmount}>
                  <strong>{money(sale.amount)}</strong>
                  <span className={styles.badge} data-status={sale.status}>
                    {sale.status === 'paid' ? 'Pago' : sale.status === 'pending' ? 'Pendente' : labels[sale.status] || sale.status}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className={styles.empty} role="status">{loading ? 'Carregando atividade…' : 'Nenhuma venda registrada neste período.'}</p>}
    </section>
  );
}

export default function MobileOverview(props: OverviewProps) {
  const { name, period, revenue, paid, pending, loading, onPeriodChange, onNewProduct, onSales } = props;
  return (
    <div className={styles.overview} aria-busy={loading}>
      <div className={styles.greeting}>
        <h1>{name ? `Olá, ${name.split(' ')[0]}!` : 'Olá!'}</h1>
        <p>Visão geral da loja</p>
      </div>
      <section aria-labelledby="mobile-revenue-label" className={styles.summary}>
        <h2 id="mobile-revenue-label">Vendas aprovadas</h2>
        <div className={styles.balance}>
          <strong>{loading ? '—' : money(revenue)}</strong>
          <select aria-label="Período das vendas" value={period} onChange={event => onPeriodChange(event.target.value)}>
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="3650">Todo o período</option>
          </select>
        </div>
        <div className={styles.counters}>
          <span>{loading ? '—' : paid} {paid === 1 ? 'venda paga' : 'vendas pagas'}</span>
          <span>{loading ? '—' : pending} {pending === 1 ? 'Pix pendente' : 'Pix pendentes'}</span>
        </div>
      </section>
      <div className={styles.actions}>
        <button type="button" onClick={onNewProduct}><PlusSquare size={19} aria-hidden />Novo produto</button>
        <button type="button" onClick={onSales}><Layers3 size={19} aria-hidden />Ver vendas</button>
      </div>
      <PixBanner onProducts={props.onProducts}/>
      <RecentActivity {...props}/>
    </div>
  );
}
