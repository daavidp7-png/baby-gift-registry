import "server-only";

import { Resend } from "resend";
import type { Language } from "../i18n/translations";

const FROM =
  "Alina · Lista de regalos <regalos@alinaperezurrutia.com>";
const GIFTS_URL = "https://alinaperezurrutia.com/gifts";
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type EmailKind = "reservation" | "purchase" | "bulk purchase";

type EmailContent = {
  subject: string;
  heading: string;
  paragraphs: string[];
  giftNames?: string[];
  closingParagraph?: string;
  cta: string;
  ctaUrl: string;
  information: {
    heading: string;
    paragraphs: string[];
  };
  shipping: {
    heading: string;
    introduction: string;
    labels: [string, string, string, string];
  };
  footer: string;
};

type ConfirmationInput = {
  to: string;
  giftName: string;
  language: Language;
  idempotencyKey: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function renderHtml(content: EmailContent) {
  const giftList = content.giftNames?.length
    ? `<ul style="margin:22px 0 24px;padding-left:22px;color:#433936;font-size:16px;line-height:1.75;">${content.giftNames
        .map((giftName) => `<li>${escapeHtml(giftName)}</li>`)
        .join("")}</ul>`
    : "";
  const heading = content.heading
    .split("\n")
    .map(escapeHtml)
    .join("<br>");
  const addressRows = [
    [content.shipping.labels[0], "Burgweg 4"],
    [content.shipping.labels[1], "Merlischachen"],
    [content.shipping.labels[2], "6402"],
    [content.shipping.labels[3], "Suiza"],
  ]
    .map(
      ([label, value], index) => `
              <tr>
                <td style="width:42%;padding:9px 10px 9px 0;${index > 0 ? "border-top:1px solid #eadfd9;" : ""}color:#665853;font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(label)}</td>
                <td style="padding:9px 0;${index > 0 ? "border-top:1px solid #eadfd9;" : ""}color:#433936;font-size:13px;vertical-align:top;">${escapeHtml(value)}</td>
              </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="${content.cta === "Volver a la lista" ? "es" : "en"}">
  <body style="margin:0;padding:0;background:#f5efeb;color:#433936;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5efeb;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border:1px solid #e4d7d0;border-radius:22px;background:#fffdfa;">
            <tr>
              <td style="padding:42px 34px 36px;">
        <p style="margin:0 0 22px;text-align:center;color:#a46f63;font-size:11px;font-weight:700;letter-spacing:2.3px;text-transform:uppercase;">ALINA · LISTA DE REGALOS</p>
        <h1 style="margin:0;color:#3e3431;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.25;font-weight:400;text-align:center;">${heading}</h1>
        <p aria-hidden="true" style="margin:18px 0 28px;text-align:center;color:#c18d83;font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:4px;">──── &nbsp;♡&nbsp; ────</p>
        ${content.paragraphs
          .map(
            (paragraph) =>
              `<p style="margin:0 0 18px;color:#514542;font-size:16px;line-height:1.7;">${escapeHtml(paragraph)}</p>`
          )
          .join("")}
        ${giftList}
        ${
          content.closingParagraph
            ? `<p style="margin:0 0 18px;color:#514542;font-size:16px;line-height:1.7;">${escapeHtml(content.closingParagraph)}</p>`
            : ""
        }
        <p style="margin:30px 0 34px;text-align:center;">
          <a href="${content.ctaUrl}" style="display:inline-block;border-radius:10px;background:#a96f64;color:#ffffff;padding:14px 30px;font-size:15px;font-weight:700;text-decoration:none;">${escapeHtml(content.cta)}</a>
        </p>
        <div style="margin:0 0 16px;border:1px solid #e8dbd4;border-radius:15px;background:#faf5f1;padding:22px;">
          <h2 style="margin:0 0 13px;color:#8e6259;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(content.information.heading)}</h2>
          ${content.information.paragraphs
            .map(
              (paragraph) =>
                `<p style="margin:0 0 10px;color:#6f625d;font-size:13px;line-height:1.65;">${escapeHtml(paragraph)}</p>`
            )
            .join("")}
        </div>
        <div style="margin:0;border:1px solid #e8dbd4;border-radius:15px;background:#faf5f1;padding:22px;">
          <h2 style="margin:0 0 10px;color:#8e6259;font-size:14px;line-height:1.4;font-weight:700;">♡&nbsp; ${escapeHtml(content.shipping.heading)}</h2>
          <p style="margin:0 0 13px;color:#6f625d;font-size:13px;line-height:1.65;">${escapeHtml(content.shipping.introduction)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">${addressRows}
          </table>
        </div>
        <p aria-hidden="true" style="margin:34px 0 12px;text-align:center;color:#c49a91;font-size:12px;letter-spacing:8px;">♡ ♡ ♡</p>
        <p style="margin:0;text-align:center;color:#8c7e78;font-size:12px;line-height:1.65;">${escapeHtml(content.footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(content: EmailContent) {
  const giftList = content.giftNames?.length
    ? `\n${content.giftNames.map((giftName) => `• ${giftName}`).join("\n")}\n`
    : "";

  return [
    content.heading,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    giftList,
    content.closingParagraph ?? "",
    `${content.cta}: ${content.ctaUrl}`,
    "",
    content.information.heading,
    "",
    ...content.information.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    content.shipping.heading,
    "",
    content.shipping.introduction,
    "",
    `${content.shipping.labels[0]}: Burgweg 4`,
    `${content.shipping.labels[1]}: Merlischachen`,
    `${content.shipping.labels[2]}: 6402`,
    `${content.shipping.labels[3]}: Suiza`,
    "",
    content.footer,
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
}

async function safeSendEmail(
  kind: EmailKind,
  to: string,
  content: EmailContent,
  idempotencyKey: string
) {
  if (!resend) {
    console.warn(
      `Skipped ${kind} confirmation email because RESEND_API_KEY is not configured`
    );
    return;
  }

  try {
    const { error } = await resend.emails.send(
      {
        from: FROM,
        to,
        subject: content.subject,
        html: renderHtml(content),
        text: renderText(content),
      },
      { idempotencyKey }
    );

    if (error) {
      console.error(`Failed to send ${kind} confirmation email`);
    }
  } catch {
    console.error(`Failed to send ${kind} confirmation email`);
  }
}

function footer(language: Language) {
  return language === "en"
    ? "Alina is still growing and getting ready to arrive. For now, her little hands are far too busy to answer emails, so there’s no need to reply to this message."
    : "Alina todavía está creciendo y preparándose para llegar. De momento, tiene las manos demasiado ocupadas para responder a los correos, así que no hace falta que respondas a este mensaje.";
}

function shippingInformation(language: Language) {
  return language === "en"
    ? {
        heading: "Would you like to send us the gift?",
        introduction:
          "If you'd like to send the gift directly to us:",
        labels: ["Street", "City", "Postal code", "Country"] as [
          string,
          string,
          string,
          string,
        ],
      }
    : {
        heading: "¿Quieres enviarnos el regalo?",
        introduction:
          "Si prefieres enviarnos el regalo directamente:",
        labels: ["Calle", "Ciudad", "Código postal", "País"] as [
          string,
          string,
          string,
          string,
        ],
      };
}

function reservationInformation(language: Language) {
  return language === "en"
    ? {
        heading: "How does the gift list work?",
        paragraphs: [
          "Purchases are not made through our website.",
          "You can use “View gift” to visit the store we have indicated, or buy it wherever you prefer.",
          "By marking it as purchased, you help us keep the list up to date and avoid duplicate gifts.",
        ],
      }
    : {
        heading: "¿Cómo funciona la lista?",
        paragraphs: [
          "La compra no se realiza a través de nuestra página.",
          "Puedes usar “Ver regalo” para ir a la tienda que hemos indicado o comprarlo donde tú prefieras.",
          "Al marcarlo como comprado, nos ayudas a mantener la lista actualizada y evitar regalos duplicados.",
        ],
      };
}

function purchaseInformation(language: Language) {
  return language === "en"
    ? {
        heading: "About our gift list",
        paragraphs: [
          "Purchases are not made through our website.",
          "The gift list simply helps us keep everything up to date and avoid duplicate gifts.",
        ],
      }
    : {
        heading: "Sobre nuestra lista de regalos",
        paragraphs: [
          "La compra no se realiza a través de nuestra página.",
          "La lista únicamente nos ayuda a mantener los regalos actualizados y evitar regalos duplicados.",
        ],
      };
}

export function sendReservationConfirmation({
  to,
  giftName,
  language,
  idempotencyKey,
}: ConfirmationInput) {
  const content: EmailContent =
    language === "en"
      ? {
          subject: "You reserved a gift for Alina 🎁",
          heading: "You reserved a gift\nfor Alina 🎁",
          paragraphs: [
            `You reserved “${giftName}”.`,
            "Thank you for helping us prepare for Alina’s arrival.",
            "Once you have bought it, return to the gift list and mark it as purchased using this same email address.",
          ],
          cta: "Back to the gift list",
          ctaUrl: GIFTS_URL,
          information: reservationInformation(language),
          shipping: shippingInformation(language),
          footer: footer(language),
        }
      : {
          subject: "Has reservado un regalo para Alina 🎁",
          heading: "Has reservado un regalo\npara Alina 🎁",
          paragraphs: [
            `Has reservado “${giftName}”.`,
            "Gracias por ayudarnos a preparar la llegada de Alina.",
            "Cuando lo hayas comprado, vuelve a la lista y márcalo como comprado usando este mismo correo electrónico.",
          ],
          cta: "Volver a la lista",
          ctaUrl: GIFTS_URL,
          information: reservationInformation(language),
          shipping: shippingInformation(language),
          footer: footer(language),
        };

  return safeSendEmail(
    "reservation",
    to,
    content,
    `reservation-confirmation-${idempotencyKey}`
  );
}

export function sendPurchaseConfirmation({
  to,
  giftName,
  language,
  idempotencyKey,
}: ConfirmationInput) {
  const content: EmailContent =
    language === "en"
      ? {
          subject: "Thank you for your gift for Alina! 💛",
          heading: "Thank you for your gift\nfor Alina! 💛",
          paragraphs: [
            `We have registered “${giftName}” as purchased.`,
            "We are so happy to share this moment with you.",
          ],
          cta: "Back to the gift list",
          ctaUrl: GIFTS_URL,
          information: purchaseInformation(language),
          shipping: shippingInformation(language),
          footer: footer(language),
        }
      : {
          subject: "¡Gracias por tu regalo para Alina! 💛",
          heading: "¡Gracias por tu regalo\npara Alina! 💛",
          paragraphs: [
            `Hemos registrado “${giftName}” como comprado.`,
            "Nos hace muchísima ilusión compartir este momento contigo.",
          ],
          cta: "Volver a la lista",
          ctaUrl: GIFTS_URL,
          information: purchaseInformation(language),
          shipping: shippingInformation(language),
          footer: footer(language),
        };

  return safeSendEmail(
    "purchase",
    to,
    content,
    `purchase-confirmation-${idempotencyKey}`
  );
}

export function sendBulkPurchaseConfirmation({
  to,
  giftNames,
  language,
  idempotencyKey,
}: {
  to: string;
  giftNames: string[];
  language: Language;
  idempotencyKey: string;
}) {
  if (giftNames.length === 0) return Promise.resolve();

  if (giftNames.length === 1) {
    const giftName = giftNames[0];
    const content: EmailContent =
      language === "en"
        ? {
            subject: "Thank you for your gift for Alina! 💛",
            heading: "Thank you for your gift\nfor Alina! 💛",
            paragraphs: [
              `We have registered “${giftName}” as purchased.`,
              "We are so happy to share this moment with you.",
            ],
            cta: "Back to the gift list",
            ctaUrl: GIFTS_URL,
            information: purchaseInformation(language),
            shipping: shippingInformation(language),
            footer: footer(language),
          }
        : {
            subject: "¡Gracias por tu regalo para Alina! 💛",
            heading: "¡Gracias por tu regalo\npara Alina! 💛",
            paragraphs: [
              `Hemos registrado “${giftName}” como comprado.`,
              "Nos hace muchísima ilusión compartir este momento contigo.",
            ],
            cta: "Volver a la lista",
            ctaUrl: GIFTS_URL,
            information: purchaseInformation(language),
            shipping: shippingInformation(language),
            footer: footer(language),
          };

    return safeSendEmail(
      "bulk purchase",
      to,
      content,
      `bulk-purchase-confirmation-${idempotencyKey}`
    );
  }

  const content: EmailContent =
    language === "en"
      ? {
          subject: "Thank you for your gifts for Alina! 💛",
          heading: "Thank you for your gifts\nfor Alina! 💛",
          paragraphs: [
            "We have registered the following gifts as purchased:",
          ],
          giftNames,
          closingParagraph: "We are so happy to share this moment with you.",
          cta: "Back to the gift list",
          ctaUrl: GIFTS_URL,
          information: purchaseInformation(language),
          shipping: shippingInformation(language),
          footer: footer(language),
        }
      : {
          subject: "¡Gracias por tus regalos para Alina! 💛",
          heading: "¡Gracias por tus regalos\npara Alina! 💛",
          paragraphs: [
            "Hemos registrado los siguientes regalos como comprados:",
          ],
          giftNames,
          closingParagraph:
            "Nos hace muchísima ilusión compartir este momento contigo.",
          cta: "Volver a la lista",
          ctaUrl: GIFTS_URL,
          information: purchaseInformation(language),
          shipping: shippingInformation(language),
          footer: footer(language),
        };

  return safeSendEmail(
    "bulk purchase",
    to,
    content,
    `bulk-purchase-confirmation-${idempotencyKey}`
  );
}
