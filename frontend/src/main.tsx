import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 없어진 기능이 남긴 브라우저 저장값 정리 (숨 고르기 → 둥둥으로 바뀜). 일지의 옛 기록에 남은 값은 그냥 무시됨
try {
  localStorage.removeItem('sumbi.breathe')
} catch {
  /* 저장소를 못 써도 괜찮음 */
}

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
