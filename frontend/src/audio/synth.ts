// 녹음 파일이 없을 때 쓰는 임시 합성음들 (Web Audio)

export function makeNoiseBuffer(ctx: AudioContext, seconds = 4) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function noiseSource(ctx: AudioContext, noise: AudioBuffer, loop = false) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = loop
  return src
}

/** 끊임없이 깔리는 낮은 바다 소리 */
export function startWaveBed(ctx: AudioContext, noise: AudioBuffer, dest: AudioNode) {
  const src = noiseSource(ctx, noise, true)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 380
  const g = ctx.createGain()
  g.gain.value = 0.35
  // 아주 느리게 숨 쉬듯 커졌다 작아짐
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 0.12
  lfo.connect(lfoGain).connect(g.gain)
  src.connect(lp).connect(g).connect(dest)
  src.start(0, Math.random() * noise.duration)
  lfo.start()
}

/** 파도 한 번 밀려왔다 빠지는 소리 */
export function waveSwell(ctx: AudioContext, noise: AudioBuffer, dest: AudioNode) {
  const t = ctx.currentTime
  const src = noiseSource(ctx, noise, true)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.6
  bp.frequency.setValueAtTime(500, t)
  bp.frequency.linearRampToValueAtTime(1300, t + 2)
  bp.frequency.linearRampToValueAtTime(700, t + 5.5)
  const g = ctx.createGain()
  const peak = 0.12 + Math.random() * 0.1
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + 2)
  g.gain.linearRampToValueAtTime(peak * 0.6, t + 3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 6)
  const pan = ctx.createStereoPanner()
  pan.pan.value = Math.random() * 1.2 - 0.6
  src.connect(bp).connect(g).connect(pan).connect(dest)
  src.start(t, Math.random() * noise.duration)
  src.stop(t + 6.2)
}

/** 숨비소리 "호오이~" (휘파람 같은 날숨) */
export function sumbi(ctx: AudioContext, noise: AudioBuffer, dest: AudioNode, pitch = 1) {
  const t = ctx.currentTime
  const end = t + 1.45
  const f = (hz: number) => hz * pitch

  const glide = (param: AudioParam, mul: number) => {
    param.setValueAtTime(f(1000) * mul, t)
    param.linearRampToValueAtTime(f(1480) * mul, t + 0.22)
    param.linearRampToValueAtTime(f(1360) * mul, t + 0.85)
    param.exponentialRampToValueAtTime(f(900) * mul, t + 1.35)
  }
  const envelope = (param: AudioParam, peak: number) => {
    param.setValueAtTime(0.0001, t)
    param.linearRampToValueAtTime(peak, t + 0.08)
    param.linearRampToValueAtTime(peak * 0.8, t + 0.9)
    param.exponentialRampToValueAtTime(0.0001, end)
  }

  // 떨림
  const vib = ctx.createOscillator()
  vib.frequency.value = 5.5
  const vibAmt = ctx.createGain()
  vibAmt.gain.value = 16 * pitch

  // 기본음 + 약한 배음
  for (const [mul, peak] of [
    [1, 0.22],
    [2, 0.03],
  ] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    glide(osc.frequency, mul)
    vib.connect(vibAmt).connect(osc.frequency)
    const g = ctx.createGain()
    envelope(g.gain, peak)
    osc.connect(g).connect(dest)
    osc.start(t)
    osc.stop(end + 0.05)
  }

  // 바람 섞인 숨소리
  const n = noiseSource(ctx, noise)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 2.5
  glide(bp.frequency, 1)
  const ng = ctx.createGain()
  envelope(ng.gain, 0.16)
  n.connect(bp).connect(ng).connect(dest)
  n.start(t, Math.random() * 2)
  n.stop(end + 0.05)

  vib.start(t)
  vib.stop(end + 0.05)
}

/** 입수할 때 첨벙 */
export function splash(ctx: AudioContext, noise: AudioBuffer, dest: AudioNode) {
  const t = ctx.currentTime
  const n = noiseSource(ctx, noise)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.8
  bp.frequency.setValueAtTime(2200, t)
  bp.frequency.exponentialRampToValueAtTime(400, t + 0.5)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.45, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65)
  n.connect(bp).connect(g).connect(dest)
  n.start(t, Math.random() * 2)
  n.stop(t + 0.7)

  const thump = ctx.createOscillator()
  thump.frequency.setValueAtTime(140, t)
  thump.frequency.exponentialRampToValueAtTime(55, t + 0.25)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.25, t)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
  thump.connect(tg).connect(dest)
  thump.start(t)
  thump.stop(t + 0.32)
}

/** 해산물을 땄을 때 "뽁" + 작은 종소리 */
export function harvest(ctx: AudioContext, dest: AudioNode) {
  const t = ctx.currentTime
  const pop = ctx.createOscillator()
  pop.frequency.setValueAtTime(720, t)
  pop.frequency.exponentialRampToValueAtTime(330, t + 0.12)
  const pg = ctx.createGain()
  pg.gain.setValueAtTime(0.3, t)
  pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
  pop.connect(pg).connect(dest)
  pop.start(t)
  pop.stop(t + 0.18)
  chime(ctx, dest, t + 0.06)
}

export function chime(ctx: AudioContext, dest: AudioNode, at = ctx.currentTime) {
  for (const [hz, delay] of [
    [1568, 0],
    [2093, 0.07],
  ] as const) {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = hz
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at + delay)
    g.gain.linearRampToValueAtTime(0.07, at + delay + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, at + delay + 0.5)
    o.connect(g).connect(dest)
    o.start(at + delay)
    o.stop(at + delay + 0.55)
  }
}

/** 물속 기포 "뽀글" */
export function bubble(ctx: AudioContext, dest: AudioNode) {
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  const base = 260 + Math.random() * 200
  o.frequency.setValueAtTime(base, t)
  o.frequency.exponentialRampToValueAtTime(base * 3.2, t + 0.07)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.05, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + 0.1)
}

/** 숨이 부족할 때 두근두근 */
export function heartbeat(ctx: AudioContext, dest: AudioNode) {
  const t = ctx.currentTime
  for (const delay of [0, 0.22]) {
    const o = ctx.createOscillator()
    o.frequency.value = 58
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + delay)
    g.gain.linearRampToValueAtTime(0.28, t + delay + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.16)
    o.connect(g).connect(dest)
    o.start(t + delay)
    o.stop(t + delay + 0.18)
  }
}
