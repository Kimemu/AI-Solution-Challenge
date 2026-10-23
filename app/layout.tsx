import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ORBITAL | 미래전략 인텔리전스',description:'글로벌 위성 활용 뉴스에서 투자검토·의사결정·가정과 실적까지 연결하는 미래전략 워크스페이스',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
