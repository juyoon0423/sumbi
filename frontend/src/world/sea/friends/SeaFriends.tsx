import { useQuality } from '../../../lib/quality'
import { BottomCritters, Jellyfish, Starfish } from './Bottom'
import { Octopuses, Squids } from './Cephalopods'
import { DamselSchool, Followers } from './DamselSchool'
import { FRIENDS } from './friendsConfig'
import { Turtle } from './Turtle'
import { friendsDebug, pickSpots } from './lifeUtil'

// 바다 친구들: 잠수하면 바다가 살아 있다고 느끼게 (잡거나 딸 수는 없고, 다가가면 반응만).
// 물속 생물은 카메라가 물속일 때만 보이고 계산함.

const SCHOOL_SPOTS = pickSpots(17, 3, { maxY: -6, radius: 22, gap: 12 }).map((s) => ({ x: s.x, z: s.z, y: s.y + 2.6 }))

export function SeaFriends() {
  const level = useQuality((s) => s.level)
  const c = FRIENDS[level]
  return (
    <group name="sea-friends">
      {SCHOOL_SPOTS.slice(0, c.schools).map((a, i) => (
        <DamselSchool key={`${level}-${i}`} anchor={a} n={c.damsel} seed={i} />
      ))}
      <Followers key={`f-${level}`} n={c.followers} />
      <Squids n={c.squid} />
      <Octopuses n={c.octopus} />
      <Starfish key={`s-${level}`} n={c.starfish} />
      <BottomCritters crabs={c.crabs} hermits={c.hermits} />
      <Jellyfish n={c.jelly} />
      <Turtle />
    </group>
  )
}

/** 캡처·확인용 (개발 모드에서 window.__sumbi.friends) */
export const schoolSpots = SCHOOL_SPOTS
export { friendsDebug }
