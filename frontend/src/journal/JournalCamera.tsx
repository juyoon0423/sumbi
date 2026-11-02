import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { player } from '../player/runtime'
import { bulteokFrontYaw } from '../world/bulteok/seatWalk'
import { setShooter } from './capture'

const cam = new PerspectiveCamera(38, 1, 0.1, 6000)
const look = new Vector3()

/** Canvas 안에 두면 사진 찍기를 등록 */
export function JournalCamera() {
  const { gl, scene } = useThree()
  useEffect(() => {
    setShooter((out) => {
      const src = gl.domElement
      // 화면 비율과 상관없이 사진 비율로 찍음 (세로 휴대폰 화면에서도 같은 구도): 캔버스 전체에 사진 비율로 그린 뒤 그대로 옮겨 담음
      cam.aspect = out.width / out.height
      // 해녀 앞쪽 비스듬히, 조금 위에서 (얼굴과 뒤 풍경이 같이 보이게).
      // 불턱에선 공동 대야가 앞을 가리지 않게 대야에서 먼 쪽으로
      const pos = player.pos
      const yaw = player.zone === 'bulteok' ? bulteokFrontYaw(pos.x, pos.z, player.yaw) : player.yaw + 0.42
      const dist = player.zone === 'bulteok' ? 3.1 : 3.0
      look.set(pos.x, pos.y + (player.zone === 'bulteok' ? 0.18 : 0.32), pos.z)
      cam.position.set(look.x + Math.sin(yaw) * dist, look.y + (player.zone === 'bulteok' ? 0.85 : 0.55), look.z + Math.cos(yaw) * dist)
      cam.lookAt(look)
      cam.updateProjectionMatrix()
      gl.render(scene, cam)
      out.getContext('2d')!.drawImage(src, 0, 0, src.width, src.height, 0, 0, out.width, out.height)
    })
    return () => setShooter(null)
  }, [gl, scene])
  return null
}

