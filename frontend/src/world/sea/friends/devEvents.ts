import { net } from '../../../net'
import { useGame } from '../../../store/gameStore'
import { useToasts } from '../../../store/toastStore'
import { turtleControl } from './Turtle'

// 개발용: ?event=dolphin | turtle 로 바로 등장 (배포 빌드에선 이 파일을 부르지 않음)
//  - dolphin: 서버에 붙어 있으면 서버가 같은 바다 모두에게 (dev-events 가 켜진 서버만), 혼자 하는 바다면 브라우저가
//  - turtle: 다음 잠수 때 (지금 물속이면 바로)

export function callDolphins() {
  net.send({ t: 'dev', a: 'dolphin' })
}

export function callTurtle() {
  turtleControl.soon()
  useToasts.getState().push('(개발) 다음 잠수 때 바다거북이 지나가요')
}

export function installDevEvents() {
  const ev = new URLSearchParams(location.search).get('event')
  if (!ev) return
  let done = false
  useGame.subscribe((s) => {
    if (done || s.phase !== 'playing' || s.netStatus === 'connecting') return
    done = true
    window.setTimeout(() => {
      if (ev === 'dolphin') callDolphins()
      if (ev === 'turtle') callTurtle()
    }, 1500)
  })
}
