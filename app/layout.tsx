import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ZenPay — Venda simples. Entrega automática.',description:'Seu espaço para vender produtos digitais com Pix e entrega automática.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
