import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "PrepPulse — speak better, one topic a day";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The social card, generated rather than exported by hand.
 *
 * A checked-in PNG goes stale the moment the wording changes, and nobody
 * remembers to re-export it. This is drawn from the same palette as the app,
 * so the card and the product always agree.
 *
 * Deliberately plain markup: satori supports a subset of CSS, so no CSS
 * variables, no oklch, no gradients-in-text. Hex values here are the resolved
 * equivalents of --color-void / --color-ink / --color-accent.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Satori renders radial-gradient with a hard edge — a soft wash comes
          // out as a visible circle sitting on the card. A linear gradient it
          // renders correctly, and it carries the same single off-centre light
          // source the app uses.
          backgroundImage: "linear-gradient(135deg, #171225 0%, #0a0a0c 46%, #0a0a0c 100%)",
          backgroundColor: "#0a0a0c",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
            <path
              d="M6.6 4.5h18.8a2.1 2.1 0 0 1 2.1 2.1v13.2a2.1 2.1 0 0 1-2.1 2.1H12.9l-5.4 5.1a.9.9 0 0 1-1.5-.65V21.9H6.6a2.1 2.1 0 0 1-2.1-2.1V6.6a2.1 2.1 0 0 1 2.1-2.1Z"
              stroke="#b39dff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M8.6 13.2h3.1l2-5.1 3.1 10.1 2.2-6 1.5 2.6h2.9"
              stroke="#b39dff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ color: "#f5f3ef", fontSize: 30, fontWeight: 600, letterSpacing: -0.5 }}>
            PrepPulse
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              color: "#f5f3ef",
              fontSize: 82,
              fontWeight: 600,
              letterSpacing: -3.5,
              lineHeight: 1.05,
            }}
          >
            Two minutes of talking
          </span>
          <span
            style={{
              color: "#8b8b96",
              fontSize: 82,
              fontWeight: 600,
              letterSpacing: -3.5,
              lineHeight: 1.05,
            }}
          >
            changes how you sound.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {["Daily topic", "Mock interviews", "Group discussion", "Debate"].map((item) => (
            <span key={item} style={{ color: "#8b8b96", fontSize: 22 }}>
              {item}
            </span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
