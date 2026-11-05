import { Check, CreditCard, Package, Zap } from 'lucide-react';
import styles from './product-onboarding.module.css';

const chapters = [
  { label: 'A primeira impressão', detail: 'Veja como a apresentação do produto chega ao comprador.', Icon: Package },
  { label: 'O momento da compra', detail: 'O preço informado aparece no checkout Pix.', Icon: CreditCard },
  { label: 'Depois do Pix', detail: 'Veja o que fica disponível após a confirmação do pagamento.', Icon: Zap },
  { label: 'Pronto para compartilhar', detail: 'Revise o produto e a entrega antes de criar o checkout.', Icon: Check },
];

export default function OnboardingScene({ step }: { step: number }) {
  const { label, detail, Icon } = chapters[step];
  return <section className={styles.scene} aria-labelledby="onboarding-chapter">
    <div className={styles.sceneDepth} aria-hidden="true">
      <span className={styles.sceneOrbit}/>
      <span className={styles.sceneEmblem}><Icon size={28} strokeWidth={1.5}/></span>
    </div>
    <div key={step} className={styles.sceneCopy}>
      <small>CAPÍTULO 0{step + 1}</small>
      <h2 id="onboarding-chapter">{label}</h2>
      <p>{detail}</p>
    </div>
  </section>;
}
