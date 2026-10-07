# Animation Patterns Reference

Use this reference when generating presentations. Match animations to the intended feeling.

## Effect-to-Feeling Guide

| Feeling                    | Animations                                                  | Visual Cues                                                        |
|----------------------------|-------------------------------------------------------------|--------------------------------------------------------------------|
| **Dramatic / Cinematic**   | Slow fade-ins (1-1.5s), large scale transitions (0.9→1)     | Dark backgrounds, spotlight effects, full-bleed images             |
| **Techy / Futuristic**     | Neon glow (box-shadow), glitch/scramble text, grid reveals  | Particle systems, grid patterns, monospace accents, cyan/magenta   |
| **Playful / Friendly**     | Bouncy easing (spring physics), floating/bobbing            | Rounded corners, pastel/bright colors, hand-drawn elements         |
| **Professional / Corporate** | Subtle fast animations (200-300ms), clean slides           | Navy/slate/charcoal, precise spacing, data visualization focus     |
| **Calm / Minimal**         | Very slow subtle motion, gentle fades                       | High whitespace, muted palette, serif typography, generous padding |
| **Editorial / Magazine**   | Staggered text reveals, image-text interplay                | Strong type hierarchy, pull quotes, grid-breaking layouts          |

## Entrance Animations

```css
/* Fade + Slide Up — most versatile, works everywhere */
.reveal {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.6s var(--ease-out-expo),
                transform 0.6s var(--ease-out-expo);
}
.visible .reveal {
    opacity: 1;
    transform: translateY(0);
}

/* Scale In — great for cards, images, feature grids */
.reveal-scale {
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.6s, transform 0.6s var(--ease-out-expo);
}
.visible .reveal-scale {
    opacity: 1;
    transform: scale(1);
}

/* Slide from Left — for split layouts, timelines */
.reveal-left {
    opacity: 0;
    transform: translateX(-50px);
    transition: opacity 0.6s, transform 0.6s var(--ease-out-expo);
}
.visible .reveal-left {
    opacity: 1;
    transform: translateX(0);
}

/* Slide from Right — for alternating content */
.reveal-right {
    opacity: 0;
    transform: translateX(50px);
    transition: opacity 0.6s, transform 0.6s var(--ease-out-expo);
}
.visible .reveal-right {
    opacity: 1;
    transform: translateX(0);
}

/* Blur In — elegant, works well for titles and quotes */
.reveal-blur {
    opacity: 0;
    filter: blur(10px);
    transition: opacity 0.8s, filter 0.8s var(--ease-out-expo);
}
.visible .reveal-blur {
    opacity: 1;
    filter: blur(0);
}

/* Clip Reveal — dramatic, reveals from one edge */
.reveal-clip {
    clip-path: inset(0 100% 0 0);
    transition: clip-path 0.8s var(--ease-out-expo);
}
.visible .reveal-clip {
    clip-path: inset(0 0 0 0);
}

/* Counter / Number Animation (JS-driven) */
/* Use for metric highlight slides with large numbers */
```

## Stagger Patterns

```css
/* Sequential children — each child delayed slightly more */
.reveal:nth-child(1) { transition-delay: 0.1s; }
.reveal:nth-child(2) { transition-delay: 0.2s; }
.reveal:nth-child(3) { transition-delay: 0.3s; }
.reveal:nth-child(4) { transition-delay: 0.4s; }
.reveal:nth-child(5) { transition-delay: 0.5s; }
.reveal:nth-child(6) { transition-delay: 0.6s; }

/* Grid stagger — for feature grids, use CSS custom property */
.grid-item {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s ease, transform 0.5s ease;
    transition-delay: calc(var(--i, 0) * 0.1s);
}
.visible .grid-item {
    opacity: 1;
    transform: translateY(0);
}
/* Set --i on each: style="--i: 0", style="--i: 1", etc. */
```

## Background Effects

```css
/* Gradient Mesh — layered radial gradients for depth */
.gradient-mesh {
    background:
        radial-gradient(ellipse at 20% 80%, rgba(120, 0, 255, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(0, 255, 200, 0.2) 0%, transparent 50%),
        var(--bg-primary);
}

/* Noise Texture — inline SVG for grain effect */
.noise-overlay::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 1;
}

/* Grid Pattern — subtle structural lines */
.grid-bg {
    background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 50px 50px;
}

/* Dot Pattern — more subtle than grid */
.dot-bg {
    background-image: radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px);
    background-size: 24px 24px;
}

/* Spotlight / Vignette */
.vignette {
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%);
}
```

## Interactive Effects

```javascript
/* 3D Tilt on Hover — adds depth to cards/panels */
document.querySelectorAll('.tilt-card').forEach(el => {
    el.style.transformStyle = 'preserve-3d';
    el.style.transition = 'transform 0.3s ease';
    el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(1000px) rotateY(${x*10}deg) rotateX(${-y*10}deg)`;
    });
    el.addEventListener('mouseleave', () => {
        el.style.transform = 'perspective(1000px) rotateY(0) rotateX(0)';
    });
});

/* Counter Animation — for metric slides */
function animateCounter(el, target, duration = 2000) {
    const start = performance.now();
    const update = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(target * eased).toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

/* Typewriter Effect — for Terminal Green or code reveals */
function typewriter(el, speed = 50) {
    const text = el.textContent;
    el.textContent = '';
    el.style.visibility = 'visible';
    let i = 0;
    const type = () => {
        if (i < text.length) {
            el.textContent += text[i++];
            setTimeout(type, speed);
        }
    };
    type();
}
```

## Particle System (Canvas-based)

For Neon Cyber and other techy themes:

```javascript
/* Lightweight particle background — keep count low (30-50) for performance */
class ParticleBackground {
    constructor(canvas, color = '#00ffcc', count = 40) {
        this.ctx = canvas.getContext('2d');
        this.particles = Array.from({length: count}, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            r: Math.random() * 2 + 1
        }));
        this.color = color;
        this.resize(canvas);
        this.animate();
    }
    resize(canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    animate() {
        const {ctx, particles, color} = this;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > ctx.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > ctx.canvas.height) p.vy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.6;
            ctx.fill();
        });
        // Draw connections
        for (let i = 0; i < particles.length; i++) {
            for (let j = i+1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 150) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = color;
                    ctx.globalAlpha = 0.1 * (1 - dist/150);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(() => this.animate());
    }
}
```

## Troubleshooting

| Problem                    | Fix                                                                  |
|----------------------------|----------------------------------------------------------------------|
| Fonts not loading          | Check Google Fonts / Fontshare URL; ensure names match in CSS        |
| Animations not triggering  | Verify IntersectionObserver is running; check `.visible` class       |
| Scroll snap not working    | `scroll-snap-type: y mandatory` on `html`; `.slide` needs `scroll-snap-align: start` |
| Mobile issues              | Disable heavy effects at 768px breakpoint; test touch events         |
| Performance issues         | Use `will-change` sparingly; prefer `transform`/`opacity` animations |
| Content overflowing slide  | Check `overflow: hidden` on `.slide`; reduce content or split slides |
| Images too large           | Add `max-height: min(50vh, 400px)` and `object-fit: contain`        |
