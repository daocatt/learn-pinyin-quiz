import { useEffect, useRef } from 'react'

/**
 * A one-shot confetti burst, fired from both bottom corners like a party
 * popper. Rendered as a fixed, click-through canvas over the whole viewport.
 *
 * `trigger` is a counter: bump it to fire. 0 means "not yet".
 */

const COLORS = ['#0b6b41', '#74d990', '#ffd166', '#ff9f68', '#8ecae6', '#ffffff']

/** How long a burst stays on screen, in ms. */
const DURATION = 3000
const FADE = 900
const PER_BURST = 90
/** Tuned so the streamers arc up past the middle of the card, not just the floor. */
const GRAVITY = 1000
const SPEED_MIN = 950
const SPEED_VARIANCE = 550

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  spin: number
  color: string
}

export function Confetti({ trigger }: { trigger: number }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const frame = useRef(0)

  useEffect(() => {
    if (trigger === 0) return
    const node = canvas.current
    const ctx = node?.getContext('2d')
    if (!node || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = node.clientWidth
    const height = node.clientHeight
    node.width = Math.round(width * dpr)
    node.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const particles: Particle[] = []
    const burst = (x: number, y: number, angle: number) => {
      for (let i = 0; i < PER_BURST; i++) {
        const spread = angle + (Math.random() - 0.5) * 0.7
        const speed = SPEED_MIN + Math.random() * SPEED_VARIANCE
        particles.push({
          x,
          y,
          vx: Math.cos(spread) * speed,
          vy: Math.sin(spread) * speed,
          w: 6 + Math.random() * 7,
          h: 9 + Math.random() * 9,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 14,
          color: COLORS[i % COLORS.length],
        })
      }
    }
    // Aimed up and inwards, so the streamers cross the middle of the screen.
    burst(-10, height + 10, -Math.PI / 3.1)
    burst(width + 10, height + 10, -Math.PI + Math.PI / 3.1)

    const start = performance.now()
    let last = start

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const elapsed = now - start
      const alpha = elapsed > DURATION - FADE ? Math.max(0, (DURATION - elapsed) / FADE) : 1

      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        p.vy += GRAVITY * dt
        p.vx *= 1 - 1.4 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.spin * dt
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }

      if (elapsed < DURATION) frame.current = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, width, height)
    }
    frame.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame.current)
      ctx.clearRect(0, 0, width, height)
    }
  }, [trigger])

  return <canvas ref={canvas} className="confetti" aria-hidden="true" />
}
