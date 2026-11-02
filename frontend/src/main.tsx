import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 개발용 캐릭터 랩: npm run dev 에서만 /dev/character 로 열림
const CharacterLab = lazy(() => import('./dev/CharacterLab').then((m) => ({ default: m.CharacterLab })))
const isLab = import.meta.env.DEV && location.pathname.startsWith('/dev/character')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isLab ? (
      <Suspense fallback={null}>
        <CharacterLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
