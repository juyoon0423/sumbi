import type { NetClient } from './NetClient'
import { OfflineNetClient } from './OfflineNetClient'

// 3단계에서 WsNetClient로 교체 (접속 실패 시 OfflineNetClient로 대체)
export const net: NetClient = new OfflineNetClient({ simulateOthers: import.meta.env.DEV })

// 개발용: 브라우저 콘솔에서 상태 확인 (window.__sumbi)
if (import.meta.env.DEV) {
  void Promise.all([
    import('../player/runtime'),
    import('../world/sea/seafood/seafoodState'),
    import('../player/input'),
  ]).then(
    ([rt, sf, inp]) => {
      ;(window as unknown as Record<string, unknown>).__sumbi = { player: rt.player, seafood: sf.seafood, input: inp }
    },
  )
}
