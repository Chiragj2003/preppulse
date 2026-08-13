import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS ignores SVG favicons for home-screen bookmarks and needs a raster, so
 * this renders the same mark at 180px. Generated rather than checked in, for
 * the same reason as the social card: one source of truth for the geometry.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0c",
        }}
      >
        <svg width="118" height="118" viewBox="0 0 32 32" fill="none">
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
      </div>
    ),
    size,
  );
}
