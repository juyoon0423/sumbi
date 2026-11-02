import type { Customization } from '../haenyeo/customize'
import { useCustomize } from '../store/customizeStore'
import type { HelloMessage, LookInfo, NickParts } from './protocol'
import { loadToken } from './WsNetClient'

export const nickParts = (c: Customization): NickParts => ({ adj: c.adj, noun: c.noun })
export const lookInfo = (c: Customization): LookInfo => ({ towel: c.towel, tewak: c.tewak, cheek: c.cheek })

/** 접속 인사: 지금 꾸민 모습과 닉네임을 함께 보냄 */
export function buildHello(): HelloMessage {
  const c = useCustomize.getState().custom
  const mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const token = loadToken()
  return { t: 'hello', v: 1, ...(token ? { token } : {}), device: mobile ? 'mobile' : 'pc', nick: nickParts(c), look: lookInfo(c) }
}
