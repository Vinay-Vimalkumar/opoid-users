import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Sequence,
} from "remotion";

// ── Palette ──
const BG = "#020617";
const RED = "#ef4444";
const GREEN = "#22c55e";
const ORANGE = "#f97316";
const CYAN = "#22d3ee";
const WHITE = "#ffffff";
const DIM = "#94a3b8";
const PURPLE = "#a855f7";

const clamp = { extrapolateRight: "clamp" as const, extrapolateLeft: "clamp" as const };
const fade = (f: number, s: number, d = 10) => interpolate(f, [s, s + d], [0, 1], clamp);
const up = (f: number, s: number, d = 12) => interpolate(f, [s, s + d], [40, 0], clamp);
const slam = (f: number, s: number, d = 10) => interpolate(f, [s, s + d], [1.3, 1], clamp);
const roll = (f: number, s: number, e: number, target: number) => {
  const v = interpolate(f, [s, e], [0, target], clamp);
  return Math.round(v).toLocaleString();
};

const base: React.CSSProperties = {
  fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
  color: WHITE,
};

// ── Subtle grid ──
const Grid: React.FC<{ opacity?: number }> = ({ opacity = 0.04 }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 1,
      backgroundImage: `linear-gradient(rgba(148,163,184,${opacity}) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,${opacity}) 1px,transparent 1px)`,
      backgroundSize: "80px 80px",
    }}
  />
);

// ── Vignette ──
const Vignette: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      zIndex: 5,
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 100%)",
    }}
  />
);

// ── Center glow ──
const Glow: React.FC<{ opacity?: number; color?: string; size?: number }> = ({
  opacity = 1,
  color = ORANGE,
  size = 700,
}) => (
  <div
    style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%,-50%)",
      width: size,
      height: size * 0.58,
      background: `radial-gradient(ellipse,${color}28 0%,transparent 65%)`,
      opacity,
      pointerEvents: "none",
    }}
  />
);

// ── Top accent line ──
const TopLine: React.FC<{ color?: string }> = ({ color = ORANGE }) => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      zIndex: 20,
      background: `linear-gradient(90deg,transparent,${color} 25%,${color} 75%,transparent)`,
    }}
  />
);

// ── Scan lines ──
const ScanLines: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 10,
      backgroundImage:
        "repeating-linear-gradient(0deg,rgba(0,0,0,0.08) 0px,rgba(0,0,0,0.08) 1px,transparent 1px,transparent 4px)",
    }}
  />
);

// ═══════════════════════════════════════════════════════
// SCENE 1 — COLD OPEN (0-4s, 120f)
// Black screen, white text, emotional gut-punch
// ═══════════════════════════════════════════════════════
const ColdOpen: React.FC = () => {
  const f = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: fade(f, 10, 20),
          transform: `translateY(${up(f, 10, 20)}px)`,
          fontSize: 32,
          color: DIM,
          textAlign: "center",
          lineHeight: 1.6,
          maxWidth: 900,
          letterSpacing: "0.02em",
        }}
      >
        In 2015, a small county in Indiana
        <br />
        became ground zero for one of the worst
        <br />
        HIV outbreaks in American history.
      </div>

      <div
        style={{
          opacity: fade(f, 70, 15),
          transform: `translateY(${up(f, 70, 15)}px)`,
          fontSize: 24,
          color: "rgba(148,163,184,0.5)",
          marginTop: 40,
          letterSpacing: "0.05em",
        }}
      >
        It was fueled by opioids. And it was preventable.
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 2 — THE CRISIS BUILDS (4-12s, 240f)
// Year counter ticking up, death toll rising
// ═══════════════════════════════════════════════════════
const CrisisBuilds: React.FC = () => {
  const f = useCurrentFrame();

  // Year counter: 2003 → 2015
  const year = Math.round(interpolate(f, [10, 180], [2003, 2015], clamp));
  const deaths = Math.round(interpolate(f, [10, 180], [0, 2500], clamp));

  const events = [
    { year: 2003, text: "OxyContin prescriptions peak nationally" },
    { year: 2008, text: "Pill mills spread across rural Indiana" },
    { year: 2011, text: "Heroin replaces prescription pills" },
    { year: 2013, text: "Scott County OUD rates surge" },
    { year: 2015, text: "215 HIV cases. The outbreak hits." },
  ];

  const activeEvent = [...events].reverse().find((e) => year >= e.year);
  const isOutbreak = year >= 2015;

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TopLine color={isOutbreak ? RED : ORANGE} />
      <Grid opacity={0.03} />
      <Vignette />
      <Glow
        opacity={isOutbreak ? 0.8 : 0.4}
        color={isOutbreak ? RED : ORANGE}
        size={1000}
      />

      {/* Year display */}
      <div
        style={{
          fontSize: 200,
          fontWeight: 900,
          letterSpacing: "-0.05em",
          lineHeight: 0.85,
          color: isOutbreak ? RED : WHITE,
          textShadow: isOutbreak
            ? `0 0 80px ${RED}80`
            : "none",
          transition: "color 0.3s",
        }}
      >
        {year}
      </div>

      {/* Death counter */}
      <div
        style={{
          opacity: fade(f, 20, 15),
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginTop: 24,
        }}
      >
        <span
          style={{
            fontSize: 64,
            fontWeight: 900,
            fontFamily: "monospace",
            color: RED,
          }}
        >
          {deaths.toLocaleString()}
        </span>
        <span style={{ fontSize: 22, color: DIM }}>
          Indiana residents lost to opioids
        </span>
      </div>

      {/* Event ticker */}
      {activeEvent && (
        <div
          style={{
            opacity: fade(f, 30, 10),
            marginTop: 48,
            padding: "16px 40px",
            borderLeft: `3px solid ${isOutbreak ? RED : ORANGE}`,
            background: isOutbreak
              ? "rgba(239,68,68,0.06)"
              : "rgba(249,115,22,0.06)",
          }}
        >
          <span
            style={{
              fontSize: 22,
              color: isOutbreak ? RED : ORANGE,
              fontWeight: 800,
              marginRight: 16,
              fontFamily: "monospace",
            }}
          >
            {activeEvent.year}
          </span>
          <span style={{ fontSize: 22, color: DIM }}>{activeEvent.text}</span>
        </div>
      )}

      {/* HIV flash at the end */}
      {isOutbreak && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: RED,
            opacity: interpolate(f, [178, 182, 190], [0, 0.15, 0], clamp),
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 3 — THE QUESTION (12-16s, 120f)
// "What if we could go back?"
// ═══════════════════════════════════════════════════════
const TheQuestion: React.FC = () => {
  const f = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity: fade(f, 10, 20),
          transform: `scale(${slam(f, 10, 20)})`,
          fontSize: 72,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        What if we could
        <br />
        <span style={{ color: GREEN }}>go back?</span>
      </div>

      <div
        style={{
          opacity: fade(f, 60, 15),
          transform: `translateY(${up(f, 60, 15)}px)`,
          fontSize: 28,
          color: DIM,
          marginTop: 32,
          textAlign: "center",
          maxWidth: 700,
          lineHeight: 1.5,
        }}
      >
        What if policymakers had a simulator that showed them
        <br />
        exactly which interventions would save the most lives?
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 4 — MORPHEUS REVEAL (16-22s, 180f)
// Logo + tagline + tech badges
// ═══════════════════════════════════════════════════════
const MorpheusReveal: React.FC = () => {
  const f = useCurrentFrame();
  const glow = 0.5 + 0.28 * Math.sin(f * 0.1);

  const badges = [
    "7-Compartment SIR Model",
    "19 Years CDC Data",
    "XGBoost Optimization",
    "9.26M Simulations",
    "RL Policy Agent",
    "GPU-Accelerated",
  ];

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TopLine />
      <Grid />
      <Vignette />
      <Glow opacity={glow} size={1200} />

      {/* Crescent logo */}
      <div
        style={{
          opacity: fade(f, 0, 14),
          transform: `scale(${slam(f, 0, 14)})`,
          marginBottom: 12,
        }}
      >
        <svg width="100" height="100" viewBox="0 0 120 120" fill="none">
          <defs>
            <linearGradient
              id="moonReveal"
              x1="20"
              y1="10"
              x2="100"
              y2="90"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor={PURPLE} />
              <stop offset="1" stopColor={ORANGE} />
            </linearGradient>
          </defs>
          <circle cx="60" cy="50" r="32" fill="url(#moonReveal)" opacity="0.95" />
          <circle cx="72" cy="44" r="28" fill={BG} />
          <circle cx="88" cy="32" r="5" fill={ORANGE} opacity="0.9" />
          <circle cx="80" cy="24" r="3" fill={PURPLE} opacity="0.7" />
        </svg>
      </div>

      {/* Title */}
      <div
        style={{
          opacity: fade(f, 5, 14),
          transform: `scale(${slam(f, 5, 14)})`,
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontSize: 140,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 0.9,
            background: `linear-gradient(90deg, ${ORANGE}, ${PURPLE})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          MORPHEUS
        </span>
      </div>

      {/* Tagline */}
      <div
        style={{
          opacity: fade(f, 40, 12),
          transform: `translateY(${up(f, 40, 12)}px)`,
          fontSize: 30,
          color: DIM,
          textAlign: "center",
          maxWidth: 820,
          lineHeight: 1.45,
          marginBottom: 40,
        }}
      >
        The opioid policy simulator Indiana never had.
        <br />
        <span style={{ color: ORANGE, fontWeight: 700 }}>
          Find the interventions that save the most lives per dollar.
        </span>
      </div>

      {/* Tech badges */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1000,
        }}
      >
        {badges.map((badge, i) => (
          <div
            key={badge}
            style={{
              opacity: fade(f, 80 + i * 8, 10),
              transform: `translateY(${up(f, 80 + i * 8, 10)}px)`,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "10px 22px",
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 4,
              color: DIM,
            }}
          >
            {badge}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 5 — THE ANSWER (22-30s, 240f)
// Scott County counterfactual — the rewind moment
// ═══════════════════════════════════════════════════════
const TheAnswer: React.FC = () => {
  const f = useCurrentFrame();

  // Phase 1: Show actual deaths (0-80)
  // Phase 2: "Rewind" effect (80-120)
  // Phase 3: Show intervention result (120-240)
  const isRewind = f >= 80 && f < 120;
  const isAfter = f >= 120;

  const actualDeaths = roll(f, 10, 60, 188);
  const interventionDeaths = roll(f, 130, 180, 100);
  const livesSaved = roll(f, 140, 200, 88);
  const pctReduction = Math.round(
    interpolate(f, [140, 200], [0, 47], clamp)
  );

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TopLine color={isAfter ? GREEN : RED} />
      <Grid opacity={0.03} />
      <Vignette />
      <Glow
        opacity={0.5}
        color={isAfter ? GREEN : RED}
        size={1000}
      />

      {/* Rewind flash */}
      {isRewind && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: WHITE,
            opacity: interpolate(f, [80, 85, 100, 120], [0, 0.5, 0.1, 0], clamp),
            zIndex: 50,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Before state */}
      {!isAfter && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              opacity: fade(f, 0, 8),
              fontSize: 16,
              fontWeight: 800,
              color: RED,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Scott County — Without Intervention
          </div>
          <div
            style={{
              opacity: fade(f, 10, 15),
              fontSize: 120,
              fontWeight: 900,
              color: RED,
              lineHeight: 1,
              textShadow: `0 0 60px ${RED}40`,
            }}
          >
            {actualDeaths}
          </div>
          <div
            style={{
              opacity: fade(f, 20, 10),
              fontSize: 24,
              color: DIM,
              marginTop: 12,
            }}
          >
            overdose deaths during the crisis
          </div>
        </div>
      )}

      {/* After state — with intervention */}
      {isAfter && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              opacity: fade(f, 125, 10),
              fontSize: 16,
              fontWeight: 800,
              color: GREEN,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Scott County — With Morpheus
          </div>
          <div
            style={{
              opacity: fade(f, 130, 15),
              transform: `scale(${slam(f, 130, 12)})`,
              fontSize: 120,
              fontWeight: 900,
              color: GREEN,
              lineHeight: 1,
              textShadow: `0 0 60px ${GREEN}40`,
            }}
          >
            {interventionDeaths}
          </div>
          <div
            style={{
              opacity: fade(f, 140, 10),
              fontSize: 24,
              color: DIM,
              marginTop: 12,
            }}
          >
            deaths with naloxone + treatment deployed in 2013
          </div>

          {/* Lives saved callout */}
          <div
            style={{
              opacity: fade(f, 160, 14),
              transform: `scale(${slam(f, 160, 12)})`,
              marginTop: 48,
              display: "inline-flex",
              alignItems: "center",
              gap: 20,
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.25)",
              borderRadius: 16,
              padding: "20px 48px",
            }}
          >
            <span
              style={{
                fontSize: 72,
                fontWeight: 900,
                color: "#facc15",
                fontFamily: "monospace",
              }}
            >
              {pctReduction}%
            </span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: WHITE }}>
                of deaths prevented
              </div>
              <div style={{ fontSize: 18, color: DIM, marginTop: 4 }}>
                {livesSaved} lives saved in Scott County alone
              </div>
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 6 — STATEWIDE IMPACT (30-38s, 240f)
// "Now scale that across all of Indiana"
// ═══════════════════════════════════════════════════════
const StatewideImpact: React.FC = () => {
  const f = useCurrentFrame();

  const stats = [
    {
      val: roll(f, 40, 120, 5146),
      label: "LIVES SAVEABLE",
      sub: "If Indiana had acted in 2016",
      color: GREEN,
    },
    {
      val: "20",
      label: "COUNTIES MODELED",
      sub: "Urban to rural, each calibrated",
      color: ORANGE,
    },
    {
      val: roll(f, 60, 130, 9260000),
      label: "SCENARIOS SIMULATED",
      sub: "GPU-accelerated Monte Carlo",
      color: CYAN,
    },
  ];

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TopLine />
      <Grid />
      <Vignette />
      <Glow opacity={0.4} size={1200} />

      <div
        style={{
          opacity: fade(f, 0, 12),
          fontSize: 56,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.15,
          marginBottom: 56,
        }}
      >
        Now scale that across
        <br />
        <span style={{ color: ORANGE }}>all of Indiana.</span>
      </div>

      <div style={{ display: "flex", gap: 40 }}>
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{
              opacity: fade(f, 30 + i * 20, 14),
              transform: `translateY(${up(f, 30 + i * 20, 14)}px)`,
              textAlign: "center",
              minWidth: 300,
              borderTop: `3px solid ${s.color}`,
              paddingTop: 28,
              background: `${s.color}08`,
            }}
          >
            <div
              style={{
                fontSize: 72,
                fontWeight: 900,
                color: s.color,
                fontFamily: "monospace",
                lineHeight: 1,
              }}
            >
              {s.val}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: WHITE,
                letterSpacing: "0.14em",
                marginTop: 12,
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                fontSize: 16,
                color: DIM,
                marginTop: 8,
              }}
            >
              {s.sub}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 7 — TECH DEEP DIVE (38-48s, 300f)
// Pipeline visualization
// ═══════════════════════════════════════════════════════
const TechPipeline: React.FC = () => {
  const f = useCurrentFrame();

  const steps = [
    {
      n: "01",
      color: ORANGE,
      title: "Real CDC Data",
      desc: "207K rows, 2003-2025 mortality data",
    },
    {
      n: "02",
      color: PURPLE,
      title: "Model Calibration",
      desc: "Differential evolution, R\u00B2 = 0.71",
    },
    {
      n: "03",
      color: GREEN,
      title: "GPU Simulation",
      desc: "9.26M scenarios on NVIDIA H100",
    },
    {
      n: "04",
      color: CYAN,
      title: "ML Optimization",
      desc: "XGBoost + gradient portfolio",
    },
    {
      n: "05",
      color: ORANGE,
      title: "RL Policy Agent",
      desc: "PPO learns temporal strategies",
    },
    {
      n: "06",
      color: GREEN,
      title: "Interactive UI",
      desc: "Real-time slider-driven simulations",
    },
  ];

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 60px",
      }}
    >
      <TopLine />
      <Grid opacity={0.03} />
      <Vignette />

      <div
        style={{
          opacity: fade(f, 0, 10),
          fontSize: 16,
          fontWeight: 800,
          color: ORANGE,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Under the Hood
      </div>

      <div
        style={{
          opacity: fade(f, 8, 12),
          fontSize: 52,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.15,
          marginBottom: 48,
        }}
      >
        Six-stage pipeline.{" "}
        <span style={{ color: ORANGE }}>One goal.</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
          width: "100%",
          maxWidth: 1400,
        }}
      >
        {steps.map((s, i) => (
          <div
            key={s.n}
            style={{
              opacity: fade(f, 40 + i * 25, 14),
              transform: `translateY(${up(f, 40 + i * 25, 14)}px)`,
              background: `${s.color}0a`,
              borderTop: `3px solid ${s.color}`,
              padding: "24px 28px",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 16,
                fontSize: 48,
                fontWeight: 900,
                opacity: 0.06,
                color: s.color,
              }}
            >
              {s.n}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: s.color,
                letterSpacing: "0.1em",
                marginBottom: 6,
              }}
            >
              STEP {s.n}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                marginBottom: 8,
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: 18, color: DIM, lineHeight: 1.5 }}>
              {s.desc}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// SCENE 8 — CTA (48-60s, 360f)
// Final emotional close
// ═══════════════════════════════════════════════════════
const FinalCTA: React.FC = () => {
  const f = useCurrentFrame();
  const glow = 0.55 + 0.38 * Math.sin(f * 0.1);
  const btnPulse = 1 + 0.02 * Math.sin(f * 0.2);

  return (
    <AbsoluteFill
      style={{
        ...base,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TopLine />
      <Grid opacity={0.05} />
      <Vignette />
      <Glow opacity={glow} size={1400} />

      {/* Crescent logo */}
      <div
        style={{
          opacity: fade(f, 0, 14),
          transform: `scale(${slam(f, 0, 14)})`,
          marginBottom: 8,
        }}
      >
        <svg width="80" height="80" viewBox="0 0 120 120" fill="none">
          <defs>
            <linearGradient
              id="moonCTA"
              x1="20"
              y1="10"
              x2="100"
              y2="90"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor={PURPLE} />
              <stop offset="1" stopColor={ORANGE} />
            </linearGradient>
          </defs>
          <circle cx="60" cy="50" r="32" fill="url(#moonCTA)" opacity="0.95" />
          <circle cx="72" cy="44" r="28" fill={BG} />
          <circle cx="88" cy="32" r="5" fill={ORANGE} opacity="0.9" />
        </svg>
      </div>

      <div
        style={{
          opacity: fade(f, 5, 12),
          transform: `scale(${slam(f, 5, 12)})`,
          marginBottom: 24,
        }}
      >
        <span
          style={{
            fontSize: 110,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 0.9,
            background: `linear-gradient(90deg, ${ORANGE}, ${PURPLE})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          MORPHEUS
        </span>
      </div>

      <div
        style={{
          opacity: fade(f, 20, 12),
          fontSize: 52,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.15,
          marginBottom: 16,
        }}
      >
        Find the policy that
        <br />
        <span style={{ color: GREEN }}>saves the most lives.</span>
      </div>

      <div
        style={{
          opacity: fade(f, 40, 10),
          fontSize: 22,
          color: DIM,
          marginBottom: 36,
        }}
      >
        Indiana Opioid Policy Simulator &middot; Catapult Hackathon 2026
      </div>

      <div
        style={{
          opacity: fade(f, 60, 12),
          transform: `scale(${slam(f, 60, 10) * btnPulse})`,
          background: `linear-gradient(135deg, ${ORANGE}, ${PURPLE})`,
          color: WHITE,
          padding: "20px 56px",
          fontSize: 22,
          fontWeight: 800,
          borderRadius: 8,
          letterSpacing: "0.04em",
          marginBottom: 48,
          boxShadow: `0 0 40px ${ORANGE}44`,
        }}
      >
        Let us show you how it works &#8594;
      </div>

      {/* Stat bar at bottom */}
      <div
        style={{
          opacity: fade(f, 90, 14),
          display: "flex",
          gap: 48,
        }}
      >
        {[
          { val: "5,146", label: "Lives Saveable", color: GREEN },
          { val: "20", label: "Counties", color: ORANGE },
          { val: "9.26M", label: "Simulations", color: CYAN },
          { val: "R\u00B2=0.71", label: "Model Fit", color: PURPLE },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              opacity: fade(f, 95 + i * 6, 8),
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: s.color,
                fontFamily: "monospace",
              }}
            >
              {s.val}
            </div>
            <div
              style={{
                fontSize: 12,
                color: DIM,
                marginTop: 4,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// ROOT COMPOSITION — 60 seconds at 30fps = 1800 frames
// ═══════════════════════════════════════════════════════
export const DemoVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    <Sequence from={0} durationInFrames={120}>
      <ColdOpen />
    </Sequence>
    <Sequence from={120} durationInFrames={240}>
      <CrisisBuilds />
    </Sequence>
    <Sequence from={360} durationInFrames={120}>
      <TheQuestion />
    </Sequence>
    <Sequence from={480} durationInFrames={180}>
      <MorpheusReveal />
    </Sequence>
    <Sequence from={660} durationInFrames={240}>
      <TheAnswer />
    </Sequence>
    <Sequence from={900} durationInFrames={240}>
      <StatewideImpact />
    </Sequence>
    <Sequence from={1140} durationInFrames={300}>
      <TechPipeline />
    </Sequence>
    <Sequence from={1440} durationInFrames={360}>
      <FinalCTA />
    </Sequence>
    <ScanLines />
  </AbsoluteFill>
);
