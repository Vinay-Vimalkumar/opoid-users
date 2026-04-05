import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Sequence,
} from "remotion";

// ── Palette ──
const BG     = "#040804";
const GREEN  = "#22c55e";
const DGREEN = "#15803d";
const WHITE  = "#ffffff";
const DIM    = "#94a3b8";
const CYAN   = "#22d3ee";

const clamp = { extrapolateRight: "clamp", extrapolateLeft: "clamp" };
const fade  = (f, s, d = 10) => interpolate(f, [s, s + d], [0, 1], clamp);
const up    = (f, s, d = 12) => interpolate(f, [s, s + d], [40, 0], clamp);
const slam  = (f, s, d = 10) => interpolate(f, [s, s + d], [1.3, 1], clamp);
const roll  = (f, s, e, target) => {
  const v = interpolate(f, [s, e], [0, target], clamp);
  return Math.round(v).toLocaleString();
};

const splitWord = (word, frame, start, color = WHITE, stagger = 3) =>
  [...word].map((ch, i) => {
    const sf = start + i * stagger;
    return (
      <span key={i} style={{
        display: "inline-block",
        opacity: interpolate(frame, [sf, sf + 8], [0, 1], clamp),
        transform: `translateY(${interpolate(frame, [sf, sf + 9], [30, 0], clamp)}px)`,
        color,
      }}>{ch === " " ? "\u00A0" : ch}</span>
    );
  });

const base = { fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", color: WHITE };

// ── Indiana map data ──
const INDIANA_OUTLINE = "M 55,5 L 250,5 L 265,45 L 268,150 L 275,280 L 270,370 L 240,440 L 180,475 L 110,465 L 55,420 L 35,340 L 25,200 L 30,80 Z";

const COUNTIES = [
  { name: "Marion",      x: 170, y: 240, pop: 977, deaths: 1842 },
  { name: "Allen",        x: 252, y: 80,  pop: 379, deaths: 614 },
  { name: "Lake",         x: 68,  y: 32,  pop: 498, deaths: 892 },
  { name: "Hamilton",     x: 182, y: 205, pop: 338, deaths: 342 },
  { name: "St. Joseph",   x: 158, y: 18,  pop: 271, deaths: 438 },
  { name: "Vanderburgh",  x: 55,  y: 430, pop: 181, deaths: 312 },
  { name: "Tippecanoe",   x: 110, y: 162, pop: 195, deaths: 198 },
  { name: "Delaware",     x: 235, y: 188, pop: 114, deaths: 142 },
  { name: "Elkhart",      x: 185, y: 22,  pop: 206, deaths: 224 },
  { name: "Wayne",        x: 272, y: 234, pop: 65,  deaths: 98 },
  { name: "Vigo",         x: 62,  y: 275, pop: 107, deaths: 156 },
  { name: "Monroe",       x: 140, y: 315, pop: 148, deaths: 132 },
  { name: "Howard",       x: 174, y: 155, pop: 82,  deaths: 112 },
  { name: "Madison",      x: 210, y: 200, pop: 129, deaths: 164 },
  { name: "Grant",        x: 215, y: 150, pop: 65,  deaths: 88 },
  { name: "Clark",        x: 205, y: 400, pop: 119, deaths: 148 },
  { name: "Floyd",        x: 195, y: 418, pop: 78,  deaths: 96 },
  { name: "Jay",          x: 268, y: 162, pop: 21,  deaths: 32 },
  { name: "Blackford",    x: 242, y: 158, pop: 12,  deaths: 18 },
  { name: "Fayette",      x: 258, y: 258, pop: 23,  deaths: 34 },
];

// ── Particle network ──
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  bx: ((Math.cos(i * 2.399963) + 1) / 2) * 1820 + 50,
  by: ((Math.sin(i * 2.399963 * 0.618) + 1) / 2) * 950 + 65,
  sx: 0.22 + (i % 5) * 0.055,
  sy: 0.17 + (i % 7) * 0.048,
  ph: i * 1.1,
  r:  1.5 + (i % 3) * 0.7,
}));

const Particles = () => {
  const f = useCurrentFrame();
  const pts = PARTICLES.map(p => ({
    x: p.bx + Math.sin(f * p.sx * 0.02 + p.ph) * 100,
    y: p.by + Math.cos(f * p.sy * 0.02 + p.ph * 0.7) * 78,
    r: p.r,
  }));
  const lines = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < 320) lines.push({ x1: pts[i].x, y1: pts[i].y, x2: pts[j].x, y2: pts[j].y, o: (1 - d / 320) * 0.27 });
    }
  return (
    <svg style={{ position: "absolute", inset: 0, width: 1920, height: 1080, zIndex: 2, pointerEvents: "none" }}>
      {lines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={GREEN} strokeWidth={0.7} opacity={l.o} />)}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={GREEN} opacity={0.5} />)}
    </svg>
  );
};

// ── Film grain ──
const FilmGrain = () => {
  const f = useCurrentFrame();
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none",
      opacity: 0.042, mixBlendMode: "overlay",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundPosition: `${(f * 37) % 256}px ${(f * 53) % 256}px`,
    }} />
  );
};

// ── Vignette ──
const Vignette = () => (
  <div style={{
    position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none",
    background: "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.72) 100%)",
  }} />
);

// ── EKG Heartbeat (persistent overlay) ──
const EKG_PATTERN = "M 0,25 L 15,25 Q 20,22 25,25 L 35,25 L 38,8 L 42,42 L 46,15 L 50,25 L 60,25 Q 65,20 70,25 L 85,25 L 100,25";
const EKG_WIDTH = 100;
const EKG_REPS = 30;

const Heartbeat = () => {
  const f = useCurrentFrame();
  const scrollX = (f * 2.8) % EKG_WIDTH;
  const pulse = 0.6 + 0.15 * Math.sin(f * 0.12);
  return (
    <div style={{
      position: "absolute", bottom: 50, left: 0, right: 0, height: 50,
      zIndex: 30, pointerEvents: "none", overflow: "hidden", opacity: pulse * 0.35,
    }}>
      <svg width={EKG_WIDTH * EKG_REPS} height="50" viewBox={`0 0 ${EKG_WIDTH * EKG_REPS} 50`}
        style={{ transform: `translateX(${-scrollX}px)` }}
      >
        {Array.from({ length: EKG_REPS }, (_, i) => (
          <path key={i} d={EKG_PATTERN} fill="none" stroke={GREEN} strokeWidth="1.5"
            transform={`translate(${i * EKG_WIDTH}, 0)`}
            opacity={0.7}
          />
        ))}
      </svg>
    </div>
  );
};

// ── Data ticker ──
const TX = [
  "Marion County · 977K pop · 42.1 deaths/100K",
  "Allen County · 379K pop · 31.8 deaths/100K",
  "Lake County · 498K pop · 38.2 deaths/100K",
  "Hamilton County · 338K pop · 14.2 deaths/100K",
  "St. Joseph · 271K pop · 29.6 deaths/100K",
  "CDC WONDER · Drug Poisoning Mortality 2003-2021",
].join("   ·   ");
const TX5 = (TX + "   ·   ").repeat(5);

const Ticker = () => {
  const f = useCurrentFrame();
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 40,
      background: "rgba(2,4,2,0.95)", borderTop: `1px solid rgba(34,197,94,0.3)`,
      display: "flex", alignItems: "center", zIndex: 40, overflow: "hidden",
    }}>
      <span style={{ fontSize: 12, fontWeight: 900, color: GREEN, letterSpacing: "0.14em", padding: "0 16px", flexShrink: 0, borderRight: `1px solid rgba(34,197,94,0.35)` }}>
        LIVE
      </span>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          transform: `translateX(${-(f * 3)}px)`,
          whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 14, color: DIM, letterSpacing: "0.025em",
        }}>{TX5}</div>
      </div>
    </div>
  );
};

// ── Laser streaks ──
const STREAKS = [
  { s: 55,   d: 24, y: 0.27, c: GREEN },
  { s: 165,  d: 20, y: 0.61, c: GREEN },
  { s: 310,  d: 22, y: 0.18, c: WHITE },
  { s: 460,  d: 20, y: 0.74, c: GREEN },
  { s: 600,  d: 18, y: 0.44, c: GREEN },
  { s: 780,  d: 22, y: 0.55, c: WHITE },
  { s: 960,  d: 20, y: 0.33, c: GREEN },
  { s: 1110, d: 18, y: 0.68, c: GREEN },
  { s: 1270, d: 22, y: 0.22, c: WHITE },
  { s: 1430, d: 20, y: 0.49, c: GREEN },
  { s: 1560, d: 18, y: 0.82, c: GREEN },
];

const LaserStreaks = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 15, pointerEvents: "none", overflow: "hidden" }}>
      {STREAKS.map((s, i) => {
        if (f < s.s || f >= s.s + s.d) return null;
        const t = (f - s.s) / s.d;
        const op = Math.sin(t * Math.PI) * 0.52;
        return (
          <div key={i} style={{
            position: "absolute", top: `${s.y * 100}%`, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg,transparent ${Math.max(0, t * 100 - 18)}%,${s.c}cc ${t * 100}%,transparent ${Math.min(100, t * 100 + 18)}%)`,
            opacity: op,
          }} />
        );
      })}
    </div>
  );
};

// ── Camera ──
const CUT_FRAMES = [120, 360, 540, 810, 1110, 1380];
const IMPACT_FRAMES = [160, 220, 280, 1380];

const Camera = ({ children }) => {
  const f = useCurrentFrame();

  // Disable camera for CrisisScene (120-360), HowItWorks+Demo (528-1080)
  const camOff1 = interpolate(f, [108, 122, 348, 362], [1, 0, 0, 1], clamp);
  const camOff2 = interpolate(f, [528, 552, 1098, 1112], [1, 0, 0, 1], clamp);
  const camFactor = Math.min(camOff1, camOff2);

  const ambientZoom = 1.09 + 0.024 * Math.sin(f * 0.017 + 0.4);
  const panX = Math.sin(f * 0.013 + 1.2) * 15;
  const panY = Math.cos(f * 0.0095 + 0.7) * 10;
  const rot  = Math.sin(f * 0.0078 + 2.4) * 0.2;
  const tiltX = Math.sin(f * 0.011 + 0.8) * 1.7;
  const tiltY = Math.cos(f * 0.009 + 1.4) * 2.3;

  const hookPush = interpolate(f, [0, 120], [0, 0.035], clamp);
  const statPush = interpolate(f, [120, 260], [0, 0.055], clamp)
                 - interpolate(f, [320, 360], [0, 0.04], clamp);
  const ctaPush  = interpolate(f, [1380, 1480], [0, 0.08], clamp);

  const snapBack = CUT_FRAMES.reduce((v, cf) => {
    const d = f - cf;
    if (d >= -3 && d < 18)
      return v + interpolate(d, [-3, 1, 18], [0, -0.06, 0], clamp);
    return v;
  }, 0);

  const shake = IMPACT_FRAMES.reduce((acc, sf) => {
    const d = f - sf;
    if (d >= 0 && d < 9) {
      const decay = 1 - d / 9;
      return {
        x: acc.x + Math.sin(d * 4.7) * 7 * decay,
        y: acc.y + Math.cos(d * 3.9) * 4.5 * decay,
      };
    }
    return acc;
  }, { x: 0, y: 0 });

  const rawZoom    = ambientZoom + hookPush + statPush + ctaPush + snapBack;
  const zoom       = 1 + (rawZoom - 1) * camFactor;
  const finalPanX  = (panX + shake.x) * camFactor;
  const finalPanY  = (panY + shake.y) * camFactor;
  const finalRot   = rot    * camFactor;
  const finalTiltX = tiltX  * camFactor;
  const finalTiltY = tiltY  * camFactor;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", perspective: "1400px", perspectiveOrigin: "50% 50%" }}>
      <div style={{
        position: "absolute", inset: 0,
        transform: `scale(${zoom}) translate(${finalPanX}px, ${finalPanY}px) rotateZ(${finalRot}deg) rotateX(${finalTiltX}deg) rotateY(${finalTiltY}deg)`,
        transformOrigin: "50% 50%",
        willChange: "transform",
      }}>
        {children}
      </div>
    </div>
  );
};

// ── Shared atoms ──
const Grid = ({ opacity = 0.04 }) => (
  <div style={{
    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
    backgroundImage: `linear-gradient(rgba(34,197,94,${opacity}) 1px,transparent 1px),linear-gradient(90deg,rgba(34,197,94,${opacity}) 1px,transparent 1px)`,
    backgroundSize: "80px 80px",
  }} />
);

const Glow = ({ opacity = 1, color = GREEN, size = 700 }) => (
  <div style={{
    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
    width: size, height: size * 0.58,
    background: `radial-gradient(ellipse,${color}28 0%,transparent 65%)`,
    opacity, pointerEvents: "none",
  }} />
);

const TopLine = ({ color = GREEN }) => (
  <div style={{
    position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 20,
    background: `linear-gradient(90deg,transparent,${color} 25%,${color} 75%,transparent)`,
  }} />
);

const Corners = ({ color = GREEN, opacity = 0.6 }) => {
  const c = (pos) => ({ position: "absolute", width: 34, height: 34, borderColor: color, borderStyle: "solid", opacity, ...pos });
  return (
    <>
      <div style={c({ top: 28, left: 28, borderWidth: "2px 0 0 2px" })} />
      <div style={c({ top: 28, right: 28, borderWidth: "2px 2px 0 0" })} />
      <div style={c({ bottom: 68, left: 28, borderWidth: "0 0 2px 2px" })} />
      <div style={c({ bottom: 68, right: 28, borderWidth: "0 2px 2px 0" })} />
    </>
  );
};

const ScanLines = () => (
  <div style={{
    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10,
    backgroundImage: "repeating-linear-gradient(0deg,rgba(0,0,0,0.11) 0px,rgba(0,0,0,0.11) 1px,transparent 1px,transparent 4px)",
  }} />
);

const Label = ({ children, style = {} }) => (
  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "0.18em", color: GREEN, textTransform: "uppercase", ...style }}>
    {children}
  </div>
);

// ── Progress Ring ──
const ProgressRing = ({ progress, size = 90, stroke = 4, color = GREEN }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
    </svg>
  );
};

// ── Indiana Map Component (reusable) ──
const IndianaMap = ({ frame, drawProgress = 1, showPulse = false, pulseStart = 0, highlightCounty = null, scale = 1 }) => {
  const outlineLen = 1200;
  const dashOffset = outlineLen * (1 - Math.min(drawProgress, 1));

  return (
    <svg width={300 * scale} height={480 * scale} viewBox="0 0 300 480" fill="none">
      {/* State outline — draws itself */}
      <path d={INDIANA_OUTLINE} fill="rgba(34,197,94,0.04)" stroke={GREEN} strokeWidth="2"
        strokeDasharray={outlineLen} strokeDashoffset={dashOffset}
        opacity={0.8}
      />

      {/* County dots */}
      {COUNTIES.map((c, i) => {
        const pulseDelay = pulseStart + i * 6;
        const dotOpacity = drawProgress > 0.3 ? fade(frame, pulseDelay, 8) : 0;
        const isPulsing = showPulse && frame > pulseDelay && frame < pulseDelay + 40;
        const pulseScale = isPulsing ? 1 + 0.4 * Math.sin((frame - pulseDelay) * 0.5) : 1;
        const isHighlighted = highlightCounty === c.name;
        const dotR = isHighlighted ? 7 : 3.5 + (c.pop / 300);

        return (
          <g key={c.name}>
            {/* Pulse ring */}
            {isPulsing && (
              <circle cx={c.x} cy={c.y} r={dotR * pulseScale * 2.5}
                fill="none" stroke={GREEN} strokeWidth="1"
                opacity={0.3 * (1 - (frame - pulseDelay) / 40)}
              />
            )}
            {/* Glow */}
            <circle cx={c.x} cy={c.y} r={dotR * 3}
              fill={GREEN} opacity={dotOpacity * 0.08}
            />
            {/* Dot */}
            <circle cx={c.x} cy={c.y} r={dotR}
              fill={isHighlighted ? CYAN : GREEN}
              opacity={dotOpacity * 0.85}
              style={{ transform: `scale(${pulseScale})`, transformOrigin: `${c.x}px ${c.y}px` }}
            />
            {/* Label for large counties */}
            {c.pop > 250 && drawProgress > 0.6 && (
              <text x={c.x + dotR + 6} y={c.y + 4} fill={DIM} fontSize="10" fontWeight="600"
                opacity={dotOpacity * 0.7}
              >{c.name}</text>
            )}
          </g>
        );
      })}

      {/* County connections */}
      {drawProgress > 0.5 && COUNTIES.map((a, i) =>
        COUNTIES.slice(i + 1).filter(b => Math.hypot(a.x - b.x, a.y - b.y) < 80).map((b, j) => (
          <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={GREEN} strokeWidth="0.5" opacity={0.12 * Math.min(drawProgress * 2 - 1, 1)}
          />
        ))
      )}
    </svg>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 1 — HOOK  0–4s  (120f)
// ═══════════════════════════════════════════════════════
const HookScene = () => {
  const f = useCurrentFrame();
  const miniStats = [
    { label: "ANNUAL U.S. DEATHS", val: roll(f, 20, 75, 80000) },
    { label: "INDIANA DEATHS / YR", val: roll(f, 20, 75, 2500) },
    { label: "NEVER REACH TREATMENT", val: `${Math.round(interpolate(f, [20, 75], [0, 80], clamp))}%` },
  ];
  return (
    <AbsoluteFill style={{ ...base, background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
      <TopLine />
      <Grid opacity={0.07} />
      <Particles />
      <Vignette />
      <Glow opacity={fade(f, 0, 35)} size={1400} />
      <Corners opacity={0.45} />

      <div style={{ display: "flex", gap: 0, marginBottom: 60, opacity: fade(f, 18, 12) }}>
        {miniStats.map((s, i) => (
          <div key={s.label} style={{
            padding: "14px 52px", textAlign: "center",
            borderRight: i < 2 ? `1px solid rgba(34,197,94,0.2)` : "none",
          }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: GREEN, letterSpacing: "-0.02em" }}>{s.val}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: DIM, letterSpacing: "0.14em", marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 152, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 0.88, textAlign: "center" }}>
        {splitWord("EVERY YEAR", f, 0, WHITE, 3)}
      </div>
      <div style={{ fontSize: 152, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 0.88, textAlign: "center", marginTop: 8 }}>
        {splitWord("WE LOSE—", f, 10, GREEN, 4)}
      </div>

      <div style={{ opacity: fade(f, 52, 10), fontSize: 32, color: DIM, marginTop: 38, letterSpacing: "0.04em", textAlign: "center", lineHeight: 1.4 }}>
        80,000 Americans. 2,500 Residents lost to opioid usage.
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 2 — CRISIS + MAP  4–12s  (240f)
// ═══════════════════════════════════════════════════════
const CrisisScene = () => {
  const f = useCurrentFrame();
  const drawProg = interpolate(f, [10, 120], [0, 1], clamp);

  const stats = [
    { suffix: "+", target: 2500, label: "RESIDENTS LOST", sub: "Every year in Indiana", source: "CDC WONDER 2021" },
    { suffix: "%", target: 80,   label: "UNTREATED",      sub: "OUD cases never reach care", source: "SAMHSA 2023" },
    { suffix: "%", target: 47,   label: "PREVENTABLE",    sub: "Deaths stoppable with naloxone", source: "NIH NIDA 2024" },
  ];
  return (
    <AbsoluteFill style={{ ...base, background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
      <TopLine />
      <Grid />
      <Particles />
      <Vignette />
      <Glow opacity={0.65} />
      <ScanLines />
      <Corners opacity={0.35} />

      <Label style={{ marginBottom: 24, opacity: fade(f, 0, 8) }}>The Crisis Is Real</Label>

      {/* Map + Stats side by side, centered */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 80, maxWidth: 1600 }}>

        {/* Map */}
        <div style={{ opacity: fade(f, 0, 20), flexShrink: 0, position: "relative" }}>
          <IndianaMap frame={f} drawProgress={drawProg} showPulse pulseStart={80} scale={1.2} />
          <div style={{ textAlign: "center", marginTop: 12, opacity: fade(f, 100, 12) }}>
            <span style={{ fontSize: 14, color: DIM, letterSpacing: "0.12em", fontWeight: 700 }}>20 COUNTIES MODELED</span>
          </div>
        </div>

        {/* Stats */}
        <div>
          {stats.map((s, i) => {
            const numStr = `${Math.round(interpolate(f, [30 + i * 40, 130 + i * 40], [0, s.target], clamp)).toLocaleString()}${s.suffix}`;
            return (
              <div key={s.label} style={{
                opacity: fade(f, 20 + i * 35, 12),
                transform: `translateY(${up(f, 20 + i * 35, 12)}px) scale(${slam(f, 20 + i * 35, 10)})`,
                display: "flex", alignItems: "baseline", gap: 28, marginBottom: 36,
                borderLeft: `3px solid ${GREEN}`, paddingLeft: 28,
              }}>
                <div style={{ fontSize: 92, fontWeight: 900, letterSpacing: "-0.04em", color: GREEN, lineHeight: 1, minWidth: 220 }}>{numStr}</div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.15em", color: WHITE }}>{s.label}</div>
                  <div style={{ fontSize: 18, color: DIM, marginTop: 6 }}>{s.sub}</div>
                  <div style={{ fontSize: 13, color: "rgba(148,163,184,0.4)", marginTop: 6, fontStyle: "italic" }}>{s.source}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ opacity: fade(f, 190, 14), fontSize: 24, color: DIM, lineHeight: 1.45, marginTop: 28, textAlign: "center" }}>
        Policymakers are flying blind. County budgets are limited.
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 3 — MORPHEUS REVEAL  12–18s  (180f)
// ═══════════════════════════════════════════════════════
const MorpheusRevealScene = () => {
  const f = useCurrentFrame();
  const glow = 0.5 + 0.28 * Math.sin(f * 0.1);
  const quickFeats = [
    { label: "Simulation",  val: "7-compartment SIR model", c: GREEN },
    { label: "ML Engine",   val: "XGBoost · 9.25M sims",  c: CYAN  },
    { label: "Calibrated",  val: "19 years CDC data",       c: GREEN },
    { label: "Optimizer",   val: "Gradient portfolio DP",   c: CYAN  },
  ];
  return (
    <AbsoluteFill style={{ ...base, background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
      <TopLine />
      <Grid />
      <Particles />
      <Vignette />
      <Glow opacity={glow} size={1200} />
      <Corners />

      <Label style={{ marginBottom: 20, opacity: fade(f, 8, 8) }}>Introducing</Label>

      {/* Crescent moon logo */}
      <div style={{ opacity: fade(f, 0, 14), transform: `scale(${slam(f, 0, 14)})`, marginBottom: 8 }}>
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          <defs>
            <linearGradient id="moonReveal" x1="20" y1="10" x2="100" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c4b5fd" />
              <stop offset="1" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="50" r="32" fill="url(#moonReveal)" opacity="0.95" />
          <circle cx="72" cy="44" r="28" fill={BG} />
          <circle cx="88" cy="32" r="5" fill={CYAN} opacity="0.9" />
          <circle cx="80" cy="24" r="3" fill="#a78bfa" opacity="0.7" />
        </svg>
      </div>

      <div style={{ opacity: fade(f, 0, 12), transform: `scale(${slam(f, 0, 14)})`, marginBottom: 18 }}>
        <span style={{ fontSize: 148, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.9,
          background: `linear-gradient(90deg, ${GREEN}, ${CYAN})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>MORPHEUS</span>
      </div>

      <div style={{ opacity: fade(f, 38, 12), transform: `translateY(${up(f, 38, 12)}px)`, fontSize: 30, color: DIM, textAlign: "center", maxWidth: 820, lineHeight: 1.45, marginBottom: 36 }}>
        The opioid policy simulator Indiana never had — powered by epidemiology, ML, and 19 years of CDC data.
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
        {quickFeats.map((feat, i) => (
          <div key={feat.label} style={{
            opacity: fade(f, 80 + i * 16, 10),
            transform: `translateY(${up(f, 80 + i * 16, 10)}px)`,
            background: `${feat.c}0d`, borderTop: `2px solid ${feat.c}`,
            padding: "16px 28px", minWidth: 200, textAlign: "center",
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: feat.c, letterSpacing: "0.1em", marginBottom: 6 }}>{feat.label}</div>
            <div style={{ fontSize: 17, color: WHITE }}>{feat.val}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 4 — HOW IT WORKS  18–27s  (270f)
// ═══════════════════════════════════════════════════════
const HowItWorksScene = () => {
  const f = useCurrentFrame();
  const steps = [
    {
      n: "01", color: GREEN, title: "Select a County",
      bullets: ["20 Indiana counties modeled", "Population, OUD rates, socioeconomics", "Calibrated to real CDC mortality data"],
    },
    {
      n: "02", color: CYAN, title: "Tune the Levers",
      bullets: ["Naloxone access (0-100%)", "Prescribing reduction (0-100%)", "Treatment expansion (0-100%)"],
    },
    {
      n: "03", color: GREEN, title: "Get the Playbook",
      bullets: ["XGBoost finds optimal mix", "Cost per life saved calculated", "5-year projection with confidence"],
    },
  ];
  return (
    <AbsoluteFill style={{ ...base, background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 80px", paddingBottom: 40 }}>
      <TopLine />
      <Grid />
      <Particles />
      <Vignette />
      <Glow opacity={0.28} />

      <Label style={{ marginBottom: 18, opacity: fade(f, 0, 8) }}>How Morpheus Works</Label>

      <div style={{ opacity: fade(f, 8, 10), fontSize: 68, fontWeight: 900, textAlign: "center", lineHeight: 1.1, marginBottom: 44 }}>
        Three steps. <span style={{ color: GREEN }}>Data-driven policy.</span>
      </div>

      <div style={{ display: "flex", gap: 20, width: "100%" }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{
            flex: 1,
            opacity: fade(f, 52 + i * 42, 14),
            transform: `translateY(${up(f, 52 + i * 42, 14)}px)`,
            background: `${s.color}0d`, borderTop: `3px solid ${s.color}`,
            padding: "32px 32px",
          }}>
            <div style={{ fontSize: 54, fontWeight: 900, color: "rgba(255,255,255,0.5)", lineHeight: 1, marginBottom: 14 }}>{s.n}</div>
            <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 18 }}>{s.title}</div>
            {s.bullets.map((b, j) => (
              <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <span style={{ color: s.color, fontSize: 18, marginTop: 3, flexShrink: 0 }}>&#9656;</span>
                <span style={{ fontSize: 24, color: DIM, lineHeight: 1.5 }}>{b}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 5 — MOCK UI DEMO  27–36s  (270f)
// ═══════════════════════════════════════════════════════
const DemoScene = () => {
  const f = useCurrentFrame();

  // Simulated slider values that animate
  const naloxone    = interpolate(f, [60, 120],  [0, 72], clamp);
  const prescribing = interpolate(f, [80, 140],  [0, 45], clamp);
  const treatment   = interpolate(f, [100, 160], [0, 68], clamp);

  // Simulated progress ring
  const simProgress = interpolate(f, [160, 200], [0, 1], clamp);
  const simDone = f > 200;

  // Simulated timeline chart data
  const chartMonths = 60;
  const chartW = 580;
  const chartH = 200;

  const baselinePath = Array.from({ length: chartMonths }, (_, m) => {
    const deaths = 20 + m * 3.2 + Math.sin(m * 0.4) * 5;
    const x = (m / (chartMonths - 1)) * chartW;
    const y = chartH - (deaths / 220) * chartH;
    return `${m === 0 ? "M" : "L"} ${x},${y}`;
  }).join(" ");

  const interventionPath = Array.from({ length: chartMonths }, (_, m) => {
    const drawM = interpolate(f, [200, 260], [0, chartMonths], clamp);
    if (m > drawM) return null;
    const deaths = 20 + m * 1.4 + Math.sin(m * 0.3) * 3;
    const x = (m / (chartMonths - 1)) * chartW;
    const y = chartH - (deaths / 220) * chartH;
    return `${m === 0 ? "M" : "L"} ${x},${y}`;
  }).filter(Boolean).join(" ");

  // County being simulated - pulsing
  const activeCounty = f > 40 ? "Marion" : null;

  const sliders = [
    { label: "Naloxone Access", val: naloxone, color: GREEN },
    { label: "Prescribing Reduction", val: prescribing, color: CYAN },
    { label: "Treatment Expansion", val: treatment, color: GREEN },
  ];

  return (
    <AbsoluteFill style={{ ...base, background: "#030603", paddingBottom: 40 }}>
      <TopLine />
      <Grid opacity={0.03} />
      <Vignette />

      {/* App header bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 52,
        background: "rgba(0,0,0,0.6)", borderBottom: `1px solid rgba(34,197,94,0.15)`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 48px", zIndex: 20, opacity: fade(f, 0, 8),
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="28" height="28" viewBox="0 0 120 120" fill="none">
            <defs>
              <linearGradient id="navMoonDemo" x1="20" y1="10" x2="100" y2="90" gradientUnits="userSpaceOnUse">
                <stop stopColor="#c4b5fd" /><stop offset="1" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="50" r="32" fill="url(#navMoonDemo)" opacity="0.95" />
            <circle cx="72" cy="44" r="28" fill="#030603" />
            <circle cx="88" cy="32" r="5" fill={CYAN} opacity="0.9" />
          </svg>
          <span style={{ fontSize: 18, fontWeight: 900, background: `linear-gradient(90deg,${GREEN},${CYAN})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Morpheus</span>
          <span style={{ fontSize: 13, color: DIM, marginLeft: 8 }}>Map & Simulator</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: GREEN, letterSpacing: "0.1em" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, boxShadow: `0 0 7px ${GREEN}` }} />
          LIVE · 20 Counties
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: "flex", gap: 24, padding: "68px 48px 56px", height: "100%" }}>

        {/* LEFT: County map */}
        <div style={{ width: 420, flexShrink: 0, opacity: fade(f, 8, 14) }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: DIM, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>Indiana Counties</div>
          <div style={{
            background: "rgba(255,255,255,0.02)", border: `1px solid rgba(34,197,94,0.12)`,
            borderRadius: 12, padding: "20px 24px", display: "flex", justifyContent: "center",
          }}>
            <IndianaMap frame={f} drawProgress={1} showPulse pulseStart={40} highlightCounty={activeCounty} scale={1.15} />
          </div>

          {/* County selector */}
          <div style={{
            opacity: fade(f, 30, 10), marginTop: 12,
            background: "rgba(34,197,94,0.06)", border: `1px solid rgba(34,197,94,0.2)`,
            borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 14, color: DIM }}>Selected County</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: GREEN }}>Marion</span>
          </div>
        </div>

        {/* RIGHT: Controls + Chart */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Sliders */}
          <div style={{ opacity: fade(f, 20, 12) }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: DIM, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>Intervention Levers</div>
            {sliders.map((s, i) => (
              <div key={s.label} style={{
                opacity: fade(f, 40 + i * 12, 10),
                marginBottom: 16, background: "rgba(255,255,255,0.02)",
                border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 8, padding: "14px 20px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: DIM, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: s.color, fontFamily: "monospace" }}>{Math.round(s.val)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, width: `${s.val}%`, background: s.color, boxShadow: `0 0 8px ${s.color}60`, transition: "width 0.1s" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Simulate button + progress */}
          <div style={{ opacity: fade(f, 150, 8), display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <div style={{
              background: simDone ? `${GREEN}22` : GREEN, color: simDone ? GREEN : "#020617",
              padding: "12px 32px", fontSize: 15, fontWeight: 800, borderRadius: 6,
              border: simDone ? `1px solid ${GREEN}44` : "none",
            }}>
              {simDone ? "Simulation Complete" : "Running Simulation..."}
            </div>
            {!simDone && <ProgressRing progress={simProgress} size={40} stroke={3} />}
            {simDone && (
              <div style={{ opacity: fade(f, 205, 10), fontSize: 14, color: DIM }}>
                60 months · 1,000 Monte Carlo runs
              </div>
            )}
          </div>

          {/* Timeline chart */}
          <div style={{
            opacity: fade(f, 190, 14), flex: 1,
            background: "rgba(255,255,255,0.02)", border: `1px solid rgba(255,255,255,0.06)`,
            borderRadius: 12, padding: "20px 24px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: DIM, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16 }}>
              Cumulative Deaths — 5-Year Projection
            </div>
            <svg width={chartW} height={chartH + 30} viewBox={`0 0 ${chartW} ${chartH + 30}`}>
              {/* Y-axis labels */}
              {[0, 50, 100, 150, 200].map(v => (
                <g key={v}>
                  <line x1={0} y1={chartH - (v / 220) * chartH} x2={chartW} y2={chartH - (v / 220) * chartH}
                    stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                  <text x={-4} y={chartH - (v / 220) * chartH + 4} fill={DIM} fontSize="9" textAnchor="end">{v}</text>
                </g>
              ))}
              {/* Baseline */}
              <path d={baselinePath} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeDasharray="4 4" />
              <text x={chartW - 60} y={28} fill="rgba(255,255,255,0.35)" fontSize="10" fontWeight="600">Baseline</text>
              {/* Intervention line */}
              {simDone && interventionPath && (
                <>
                  <path d={interventionPath} fill="none" stroke={GREEN} strokeWidth="2.5" />
                  <text x={chartW - 90} y={chartH - 40} fill={GREEN} fontSize="10" fontWeight="700">With Morpheus</text>
                </>
              )}
              {/* X-axis */}
              {[0, 12, 24, 36, 48, 60].map(m => (
                <text key={m} x={(m / 59) * chartW} y={chartH + 18} fill={DIM} fontSize="9" textAnchor="middle">
                  {m === 0 ? "Now" : `${m}mo`}
                </text>
              ))}
            </svg>

            {/* Result stats */}
            {simDone && (
              <div style={{ display: "flex", gap: 24, marginTop: 12, opacity: fade(f, 240, 12) }}>
                {[
                  { label: "Lives Saved", val: roll(f, 240, 260, 1842), c: GREEN },
                  { label: "Cost / Life", val: `$${roll(f, 245, 260, 4200)}`, c: CYAN },
                  { label: "Deaths Prevented", val: `${Math.round(interpolate(f, [245, 260], [0, 47], clamp))}%`, c: GREEN },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: s.c }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 6 — BEFORE / AFTER  36–45s  (270f)
// ═══════════════════════════════════════════════════════
const BeforeAfterScene = () => {
  const f = useCurrentFrame();

  const dividerX = interpolate(f, [20, 60], [0, 50], clamp);
  const baselineDeaths = roll(f, 40, 140, 12480);
  const morpheusDeaths = roll(f, 70, 160, 6534);
  const livesSaved     = roll(f, 90, 180, 5146);

  // Progress ring fills up
  const ringProg = interpolate(f, [100, 180], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ ...base, background: BG, paddingBottom: 40, overflow: "hidden" }}>
      <TopLine />
      <Grid />
      <Vignette />
      <Glow opacity={0.35} />
      <Corners opacity={0.4} />

      <Label style={{ position: "absolute", top: 40, left: 0, right: 0, textAlign: "center", opacity: fade(f, 0, 8), zIndex: 20 }}>
        The Morpheus Effect
      </Label>

      {/* Split panels */}
      <div style={{ display: "flex", height: "100%", paddingTop: 90, paddingBottom: 56 }}>

        {/* LEFT: Without */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.02)",
          borderRight: `2px solid ${GREEN}40`,
          opacity: fade(f, 10, 14),
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DIM, letterSpacing: "0.18em", marginBottom: 24, opacity: 0.7 }}>WITHOUT MORPHEUS</div>

          <div style={{ fontSize: 96, fontWeight: 900, color: "rgba(255,255,255,0.5)", lineHeight: 1, marginBottom: 8 }}>
            {baselineDeaths}
          </div>
          <div style={{ fontSize: 20, color: DIM, marginBottom: 32 }}>projected deaths (5yr, 20 counties)</div>

          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "Naloxone", val: "0%" },
              { label: "Treatment", val: "0%" },
              { label: "Rx Reduction", val: "0%" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", opacity: fade(f, 60, 10) }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "rgba(255,255,255,0.3)" }}>{s.val}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ opacity: fade(f, 100, 12), marginTop: 32, fontSize: 16, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
            No intervention. No optimization. No change.
          </div>
        </div>

        {/* RIGHT: With Morpheus */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: `rgba(34,197,94,0.03)`,
          opacity: fade(f, 30, 14),
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: GREEN, letterSpacing: "0.18em", marginBottom: 24 }}>WITH MORPHEUS</div>

          <div style={{ fontSize: 96, fontWeight: 900, color: GREEN, lineHeight: 1, marginBottom: 8 }}>
            {morpheusDeaths}
          </div>
          <div style={{ fontSize: 20, color: DIM, marginBottom: 32 }}>projected deaths (5yr, optimized)</div>

          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "Naloxone", val: "72%" },
              { label: "Treatment", val: "68%" },
              { label: "Rx Reduction", val: "45%" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", opacity: fade(f, 80, 10) }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: GREEN }}>{s.val}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Lives saved callout */}
          <div style={{
            opacity: fade(f, 140, 14), transform: `scale(${slam(f, 140, 12)})`,
            marginTop: 32, display: "flex", alignItems: "center", gap: 20,
            background: `${GREEN}0d`, border: `1px solid ${GREEN}33`,
            borderRadius: 12, padding: "16px 32px",
          }}>
            <ProgressRing progress={ringProg} size={56} stroke={4} />
            <div>
              <div style={{ fontSize: 36, fontWeight: 900, color: GREEN }}>{livesSaved}</div>
              <div style={{ fontSize: 13, color: DIM }}>lives saved across Indiana</div>
            </div>
          </div>
        </div>
      </div>

      {/* Center divider animation */}
      <div style={{
        position: "absolute", top: 90, bottom: 56,
        left: `${dividerX}%`, width: 2,
        background: `linear-gradient(180deg, transparent, ${GREEN}, transparent)`,
        zIndex: 20, opacity: fade(f, 15, 10),
      }} />
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 7 — CTA  45–54s  (270f)
// ═══════════════════════════════════════════════════════
const CTAScene = () => {
  const f = useCurrentFrame();
  const glow     = 0.55 + 0.38 * Math.sin(f * 0.13);
  const btnPulse = 1 + 0.024 * Math.sin(f * 0.2);
  const techStack = ["CDC Data 2003-2021", "SIR Model (R\u00B2=0.71)", "XGBoost", "Monte Carlo", "LSTM Forecast", "Gradient Optimizer", "20 Counties"];
  return (
    <AbsoluteFill style={{ ...base, background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
      <TopLine />
      <Grid opacity={0.07} />
      <Particles />
      <Vignette />
      <Glow opacity={glow} size={1500} />
      <Corners opacity={fade(f, 6, 12)} />

      <Label style={{ marginBottom: 16, opacity: fade(f, 0, 8) }}>Catapult Hackathon 2026</Label>

      <div style={{ opacity: fade(f, 0, 12), transform: `scale(${slam(f, 0, 12)})`, marginBottom: 4 }}>
        <svg width="80" height="80" viewBox="0 0 120 120" fill="none">
          <defs>
            <linearGradient id="moonCTA2" x1="20" y1="10" x2="100" y2="90" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c4b5fd" />
              <stop offset="1" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="50" r="32" fill="url(#moonCTA2)" opacity="0.95" />
          <circle cx="72" cy="44" r="28" fill={BG} />
          <circle cx="88" cy="32" r="5" fill={CYAN} opacity="0.9" />
        </svg>
      </div>

      <div style={{ opacity: fade(f, 0, 10), transform: `scale(${slam(f, 0, 12)})`, marginBottom: 20 }}>
        <span style={{ fontSize: 110, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.9,
          background: `linear-gradient(90deg, ${GREEN}, ${CYAN})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>MORPHEUS</span>
      </div>

      <div style={{ opacity: fade(f, 14, 10), transform: `translateY(${up(f, 14, 12)}px)`, fontSize: 56, fontWeight: 900, textAlign: "center", lineHeight: 1.1, maxWidth: 1000, marginBottom: 16 }}>
        Find the policy that<br /><span style={{ color: GREEN }}>saves the most lives.</span>
      </div>

      <div style={{ opacity: fade(f, 30, 10), fontSize: 22, color: DIM, textAlign: "center", marginBottom: 32 }}>
        Indiana Opioid Policy Simulator · Built for real decisions
      </div>

      <div style={{
        opacity: fade(f, 46, 10),
        transform: `scale(${slam(f, 46, 10) * btnPulse})`,
        background: GREEN, color: "#020617",
        padding: "20px 56px", fontSize: 22, fontWeight: 800, borderRadius: 4, letterSpacing: "0.04em",
        marginBottom: 36,
        boxShadow: `0 0 40px ${GREEN}55`,
      }}>
        Open Simulator &#8594;
      </div>

      <div style={{ opacity: fade(f, 66, 12), display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", maxWidth: 900 }}>
        {techStack.map((t, i) => (
          <div key={t} style={{
            opacity: fade(f, 70 + i * 5, 8),
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
            padding: "7px 18px", fontSize: 15, fontWeight: 600, borderRadius: 3, color: DIM,
          }}>{t}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// GLITCH OVERLAY
// ═══════════════════════════════════════════════════════
const GLITCH_CUT_FRAMES = [120, 360, 540, 810, 1110, 1380];
const GLITCH_DUR = 9;

const GlitchOverlay = () => {
  const f = useCurrentFrame();
  const T = GLITCH_CUT_FRAMES.find(t => f >= t - 2 && f < t + GLITCH_DUR - 2);
  if (T === undefined) return null;
  const tf        = f - (T - 2);
  const intensity = interpolate(tf, [0, 2, GLITCH_DUR], [0, 1, 0], clamp);
  const bar       = (seed) => Math.sin(f * seed) * 0.5 + 0.5;
  const shift     = intensity * 18;
  const bars = [
    { top: bar(127.3) * 88, h: 2 + bar(53.7) * 8,  col: `rgba(34,197,94,${0.7 * intensity})` },
    { top: bar(89.7)  * 88, h: 1 + bar(211.1) * 5, col: `rgba(255,255,255,${0.5 * intensity})` },
    { top: bar(213.1) * 88, h: 3 + bar(73.9) * 6,  col: `rgba(34,210,238,${0.45 * intensity})` },
    { top: bar(61.9)  * 88, h: 1 + bar(139.3) * 4, col: `rgba(255,255,255,${0.35 * intensity})` },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 200, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: `rgba(34,197,94,${0.18 * intensity})`, transform: `translateX(${-shift * 1.1}px) skewX(${intensity * 0.3}deg)`, mixBlendMode: "screen" }} />
      <div style={{ position: "absolute", inset: 0, background: `rgba(34,210,238,${0.14 * intensity})`, transform: `translateX(${shift * 0.85}px) skewX(${-intensity * 0.2}deg)`, mixBlendMode: "screen" }} />
      {bars.map((b, i) => (
        <div key={i} style={{ position: "absolute", top: `${b.top}%`, left: 0, right: 0, height: b.h, background: b.col, transform: `translateX(${(bar(b.top * 7.3) - 0.5) * shift * 3}px)` }} />
      ))}
      <div style={{ position: "absolute", inset: 0, background: "white", opacity: interpolate(tf, [1, 2, 4], [0, 0.35, 0], clamp) }} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// ROOT — 1620 frames = 54s at 30fps
// ═══════════════════════════════════════════════════════
export const MorpheusIntro = () => (
  <AbsoluteFill style={{ background: BG }}>
    <Camera>
      <Sequence from={0}    durationInFrames={120}><HookScene /></Sequence>
      <Sequence from={120}  durationInFrames={240}><CrisisScene /></Sequence>
      <Sequence from={360}  durationInFrames={180}><MorpheusRevealScene /></Sequence>
      <Sequence from={540}  durationInFrames={270}><HowItWorksScene /></Sequence>
      <Sequence from={810}  durationInFrames={300}><DemoScene /></Sequence>
      <Sequence from={1110} durationInFrames={270}><BeforeAfterScene /></Sequence>
      <Sequence from={1380} durationInFrames={240}><CTAScene /></Sequence>
    </Camera>

    {/* Global overlays */}
    <FilmGrain />
    <Heartbeat />
    <LaserStreaks />
    <Ticker />
    <GlitchOverlay />
  </AbsoluteFill>
);
