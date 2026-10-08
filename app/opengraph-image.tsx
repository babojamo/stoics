import { ImageResponse } from "next/og";

export const alt = "Gwingarcia, featured member of the Stoics Flyff Universe guild";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const guildDescription = "Stoics is a Flyff Universe guild built around teamwork, memorable dungeon runs, and a transparent loot system that gives every member a fair share.";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        color: "white",
        background: "linear-gradient(135deg, #11121d 0%, #211d3f 58%, #10111b 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: "radial-gradient(circle at 78% 38%, rgba(112, 221, 236, 0.28), transparent 34%), radial-gradient(circle at 16% 15%, rgba(125, 105, 236, 0.34), transparent 32%)",
        }}
      />
      <div
        style={{
          zIndex: 2,
          width: "62%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 0 58px 72px",
        }}
      >
        <div style={{ display: "flex", color: "#e2c577", fontSize: 20, fontWeight: 800, letterSpacing: 5 }}>STOICS GUILD</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 25, fontSize: 62, lineHeight: 1.02, fontWeight: 800, letterSpacing: -2 }}>
          <span>Run as one.</span>
          <span style={{ color: "#afa3ff" }}>Share every reward.</span>
        </div>
        <div style={{ display: "flex", width: 650, marginTop: 30, color: "#d4d1df", fontSize: 23, lineHeight: 1.48 }}>{guildDescription}</div>
      </div>
      <img
        src="https://stoics.lokwensio.com/characters/gwingarcia-seraph-og.png"
        alt=""
        width="500"
        height="630"
        style={{ position: "absolute", zIndex: 1, right: -10, bottom: 0, width: 500, height: 630, objectFit: "contain", objectPosition: "center bottom" }}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          right: 38,
          bottom: 30,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          padding: "10px 14px",
          borderRadius: 12,
          background: "rgba(13, 14, 24, 0.72)",
        }}
      >
        <span style={{ color: "#e2c577", fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>FEATURED MEMBER</span>
        <strong style={{ marginTop: 3, fontSize: 24 }}>Gwingarcia</strong>
        <span style={{ color: "#d4d1df", fontSize: 14 }}>Guild Leader - Seraph</span>
      </div>
    </div>,
    size,
  );
}
