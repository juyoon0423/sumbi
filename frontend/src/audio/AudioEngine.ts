import { useSettings, type Channel, type Volumes } from '../store/settingsStore'
import * as synth from './synth'

// 소리 파일 교체 방법: frontend/public/sounds/ 에 아래 이름으로 파일을 넣으면 합성음 대신 재생된다.
// (자세한 내용은 public/sounds/README.md)
const FILES = {
  sumbi: ['/sounds/sumbi.mp3', '/sounds/sumbi-2.mp3', '/sounds/sumbi-3.mp3'],
  waves: ['/sounds/waves.mp3'],
  splash: ['/sounds/splash.mp3'],
  harvest: ['/sounds/harvest.mp3'],
} as const

type FileKey = keyof typeof FILES

interface SumbiOptions {
  /** 0이면 내 숨비소리, 클수록 멀리서 들리는 소리 */
  distance?: number
  /** -1(왼쪽) ~ 1(오른쪽) */
  pan?: number
  /** 사람마다 다른 음높이 (1 = 기본) */
  pitch?: number
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private channels = {} as Record<Channel, GainNode>
  private underwaterFilter!: BiquadFilterNode
  private files: Partial<Record<FileKey, AudioBuffer[]>> = {}
  private noise!: AudioBuffer

  /** 사용자 클릭 안에서 호출해야 함 (브라우저 자동재생 정책) */
  async start() {
    if (this.ctx) {
      await this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    this.noise = synth.makeNoiseBuffer(ctx)

    this.underwaterFilter = ctx.createBiquadFilter()
    this.underwaterFilter.type = 'lowpass'
    this.underwaterFilter.frequency.value = 20000
    this.underwaterFilter.connect(ctx.destination)

    for (const ch of ['waves', 'sumbi', 'sfx'] as Channel[]) {
      const g = ctx.createGain()
      g.connect(this.underwaterFilter)
      this.channels[ch] = g
    }
    this.applyVolumes(useSettings.getState().volumes)
    useSettings.subscribe((s) => this.applyVolumes(s.volumes))

    await this.loadFiles()
    this.startWaves()
  }

  private applyVolumes(v: Volumes) {
    if (!this.ctx) return
    for (const ch of Object.keys(v) as Channel[]) {
      this.channels[ch].gain.setTargetAtTime(v[ch], this.ctx.currentTime, 0.05)
    }
  }

  private async loadFiles() {
    const ctx = this.ctx!
    await Promise.all(
      (Object.keys(FILES) as FileKey[]).map(async (key) => {
        const loaded: AudioBuffer[] = []
        for (const url of FILES[key]) {
          const buf = await tryLoad(ctx, url)
          if (buf) loaded.push(buf)
        }
        if (loaded.length) this.files[key] = loaded
      }),
    )
  }

  private pickFile(key: FileKey) {
    const list = this.files[key]
    return list ? list[Math.floor(Math.random() * list.length)] : null
  }

  private playBuffer(buf: AudioBuffer, dest: AudioNode, opts: { rate?: number; gain?: number; loop?: boolean } = {}) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = opts.loop ?? false
    src.playbackRate.value = opts.rate ?? 1
    const g = ctx.createGain()
    g.gain.value = opts.gain ?? 1
    src.connect(g).connect(dest)
    src.start()
    return src
  }

  // ── 파도 ──
  private startWaves() {
    const ctx = this.ctx!
    const file = this.pickFile('waves')
    if (file) {
      this.playBuffer(file, this.channels.waves, { loop: true })
      return
    }
    synth.startWaveBed(ctx, this.noise, this.channels.waves)
    const swell = () => {
      if (!this.ctx) return
      synth.waveSwell(ctx, this.noise, this.channels.waves)
      window.setTimeout(swell, 4500 + Math.random() * 4500)
    }
    swell()
  }

  /** 물속에 들어가면 모든 소리를 먹먹하게 */
  setUnderwater(under: boolean) {
    if (!this.ctx) return
    this.underwaterFilter.frequency.setTargetAtTime(under ? 650 : 20000, this.ctx.currentTime, 0.15)
  }

  // ── 숨비소리 ──
  playSumbi({ distance = 0, pan = 0, pitch = 1 }: SumbiOptions = {}) {
    const ctx = this.ctx
    if (!ctx) return
    // 거리 감쇠 + 멀수록 고음이 약해짐
    const gain = 1 / (1 + distance / 8)
    const out = ctx.createGain()
    out.gain.value = gain
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = distance > 0 ? Math.max(1800, 9000 - distance * 120) : 20000
    out.connect(air).connect(panner).connect(this.channels.sumbi)

    const file = this.pickFile('sumbi')
    if (file) this.playBuffer(file, out, { rate: pitch })
    else synth.sumbi(ctx, this.noise, out, pitch)
  }

  // ── 효과음 ──
  playSplash() {
    if (!this.ctx) return
    const file = this.pickFile('splash')
    if (file) this.playBuffer(file, this.channels.sfx)
    else synth.splash(this.ctx, this.noise, this.channels.sfx)
  }

  playHarvest() {
    if (!this.ctx) return
    const file = this.pickFile('harvest')
    if (file) this.playBuffer(file, this.channels.sfx)
    else synth.harvest(this.ctx, this.channels.sfx)
  }

  playBubble() {
    if (this.ctx) synth.bubble(this.ctx, this.channels.sfx)
  }

  playHeartbeat() {
    if (this.ctx) synth.heartbeat(this.ctx, this.channels.sfx)
  }

  playChime() {
    if (this.ctx) synth.chime(this.ctx, this.channels.sfx)
  }
}

async function tryLoad(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url)
    // 개발 서버는 없는 파일에도 index.html을 돌려줄 수 있어서 형식도 확인
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null
    return await ctx.decodeAudioData(await res.arrayBuffer())
  } catch {
    return null
  }
}

export const audio = new AudioEngine()
