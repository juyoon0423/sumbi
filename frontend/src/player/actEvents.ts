import { Vector3 } from 'three'
import { audio } from '../audio/AudioEngine'
import type { ItemType } from '../config'
import type { ActEvent } from '../haenyeo/acts'
import { bulteokFx } from '../world/bulteok/bulteokFx'

/** 손질 중 소리·대야로 던지기. volume: 내 해녀 1, 다른 해녀는 거리만큼 작게 */
export function onActEvent(ev: ActEvent, volume: number, item: ItemType | null, from: Vector3, yaw: number, mine: boolean) {
  switch (ev) {
    case 'tap':
      audio.playTap(volume)
      break
    case 'pop':
      audio.playPop(volume)
      break
    case 'crack':
      audio.playCrack(volume)
      break
    case 'munch':
      audio.playMunch(volume)
      break
    case 'toss': {
      bulteokFx.tosses.push({
        from: new Vector3(Math.sin(yaw) * 0.3, 0.15, Math.cos(yaw) * 0.3).add(from),
        item: item ?? 'conch',
        mine,
      })
      break
    }
  }
}
