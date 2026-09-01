import { ImageResponse } from "next/og";

export const alt = "Lista de regalos de Alina";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f8f4ef",
          color: "#352e2b",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: "64px 96px",
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            border: "2px solid #ddcec6",
            borderRadius: "999px",
            color: "#a57f72",
            display: "flex",
            fontSize: 34,
            height: 68,
            justifyContent: "center",
            marginBottom: 44,
            width: 68,
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a57f72"
            strokeWidth="1.5"
          >
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
          </svg>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 82,
            fontWeight: 500,
            letterSpacing: "-3px",
            lineHeight: 1.05,
          }}
        >
          Bienvenida, Alina
        </div>

        <div
          style={{
            color: "#796d67",
            display: "flex",
            fontSize: 28,
            fontWeight: 400,
            letterSpacing: "0.4px",
            lineHeight: 1.5,
            marginTop: 36,
            maxWidth: 760,
          }}
        >
          Un pequeño espacio creado con amor mientras esperamos tu llegada.
        </div>
      </div>
    ),
    size
  );
}
