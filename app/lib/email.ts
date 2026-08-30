import "server-only";

import { Resend } from "resend";
import type { Language } from "../i18n/translations";

const FROM =
  "Alina · Lista de regalos <regalos@alinaperezurrutia.com>";
const GIFTS_URL = "https://alinaperezurrutia.com/gifts";
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type EmailKind =
  | "reservation"
  | "bulk reservation"
  | "purchase"
  | "bulk purchase";

type EmailContent = {
  subject: string;
  heading: string;
  paragraphs: string[];
  giftListHeading?: string;
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

function renderHtml(content: EmailContent, language: Language) {
  const brandedHeader =
    language === "ca" ? "ALINA · LLISTA DE REGALS" : "ALINA · LISTA DE REGALOS";
  const giftListHeading = content.giftListHeading
    ? `<h2 style="margin:22px 0 8px;color:#8e6259;font-size:13px;line-height:1.4;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">${escapeHtml(content.giftListHeading)}</h2>`
    : "";
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
<html lang="${language}">
  <body style="margin:0;padding:0;background:#f5efeb;color:#433936;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5efeb;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border:1px solid #e4d7d0;border-radius:22px;background:#fffdfa;">
            <tr>
              <td style="padding:42px 34px 36px;">
        <p style="margin:0 0 22px;text-align:center;color:#a46f63;font-size:11px;font-weight:700;letter-spacing:2.3px;text-transform:uppercase;">${brandedHeader}</p>
        <h1 style="margin:0;color:#3e3431;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.25;font-weight:400;text-align:center;">${heading}</h1>
        <p aria-hidden="true" style="margin:18px 0 28px;text-align:center;color:#c18d83;font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:4px;">──── &nbsp;♡&nbsp; ────</p>
        ${content.paragraphs
          .map(
            (paragraph) =>
              `<p style="margin:0 0 18px;color:#514542;font-size:16px;line-height:1.7;">${escapeHtml(paragraph)}</p>`
          )
          .join("")}
        ${giftListHeading}
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
    content.giftListHeading ?? "",
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
  idempotencyKey: string,
  language: Language
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
        html: renderHtml(content, language),
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
  if (language === "en") {
    return "I’m busy growing and perfecting my little kicks. I’ll leave replying to emails for later. ♡";
  }
  if (language === "ca") {
    return "Estic ocupada creixent i perfeccionant les meves puntadetes. Això de contestar correus ho deixaré per més endavant. ♡";
  }
  return "Estoy ocupada creciendo y perfeccionando mis pataditas. Lo de contestar emails lo dejaré para más adelante. ♡";
}

function shippingInformation(language: Language) {
  if (language === "en") {
    return {
        heading: "Would you like to send us the gift?",
        introduction:
          "If you'd like to send the gift directly to us:",
        labels: ["Street", "City", "Postal code", "Country"] as [
          string,
          string,
          string,
          string,
        ],
      };
  }
  if (language === "ca") {
    return {
      heading: "Vols enviar-nos el regal?",
      introduction: "Si prefereixes enviar-nos el regal directament:",
      labels: ["Carrer", "Ciutat", "Codi postal", "País"] as [
        string,
        string,
        string,
        string,
      ],
    };
  }
  return {
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
  if (language === "en") {
    return {
        heading: "How does the gift list work?",
        paragraphs: [
          "Purchases are not made through our website.",
          "You can use “View gift” to visit the store we have indicated, or buy it wherever you prefer.",
          "By marking it as purchased, you help us keep the list up to date and avoid duplicate gifts.",
        ],
      };
  }
  if (language === "ca") {
    return {
      heading: "Com funciona la llista?",
      paragraphs: [
        "La compra no es fa a través de la nostra pàgina.",
        "Pots utilitzar “Veure regal” per anar a la botiga que hem indicat o comprar-lo on tu prefereixis.",
        "En marcar-lo com a comprat, ens ajudes a mantenir la llista actualitzada i evitar regals duplicats.",
      ],
    };
  }
  return {
        heading: "¿Cómo funciona la lista?",
        paragraphs: [
          "La compra no se realiza a través de nuestra página.",
          "Puedes usar “Ver regalo” para ir a la tienda que hemos indicado o comprarlo donde tú prefieras.",
          "Al marcarlo como comprado, nos ayudas a mantener la lista actualizada y evitar regalos duplicados.",
        ],
      };
}

function purchaseInformation(language: Language) {
  if (language === "en") {
    return {
        heading: "About our gift list",
        paragraphs: [
          "Purchases are not made through our website.",
          "The gift list simply helps us keep everything up to date and avoid duplicate gifts.",
        ],
      };
  }
  if (language === "ca") {
    return {
      heading: "Sobre la nostra llista de regals",
      paragraphs: [
        "La compra no es fa a través de la nostra pàgina.",
        "La llista únicament ens ajuda a mantenir els regals actualitzats i evitar regals duplicats.",
      ],
    };
  }
  return {
        heading: "Sobre nuestra lista de regalos",
        paragraphs: [
          "La compra no se realiza a través de nuestra página.",
          "La lista únicamente nos ayuda a mantener los regalos actualizados y evitar regalos duplicados.",
        ],
      };
}

function reservationContent(giftNames: string[], language: Language) {
  const multiple = giftNames.length > 1;
  if (language === "en") {
    return {
      subject: multiple
        ? "You've reserved several gifts for Alina 🎁"
        : "You reserved a gift for Alina 🎁",
      heading: multiple
        ? "You've reserved several gifts\nfor Alina 🎁"
        : "You reserved a gift\nfor Alina 🎁",
      paragraphs: multiple
        ? [
            "Thank you for reserving these gifts and helping us prepare for Alina’s arrival!",
            "We've saved them for you on our list.",
          ]
        : [
            `You reserved “${giftNames[0]}”.`,
            "Thank you for reserving this gift and helping us prepare for Alina’s arrival!",
            "We've saved it for you on our list.",
            "Once you have bought it, return to the gift list and mark it as purchased using this same email address.",
          ],
      giftListHeading: multiple ? "Your reserved gifts" : undefined,
      giftNames: multiple ? giftNames : undefined,
      closingParagraph: multiple
        ? "Once you have bought them, return to the gift list and mark them as purchased using this same email address."
        : undefined,
      cta: "Back to the gift list",
      ctaUrl: GIFTS_URL,
      information: reservationInformation(language),
      shipping: shippingInformation(language),
      footer: footer(language),
    } satisfies EmailContent;
  }

  if (language === "ca") {
    return {
      subject: multiple
        ? "Has reservat diversos regals per a l’Alina 🎁"
        : "Has reservat un regal per a l’Alina 🎁",
      heading: multiple
        ? "Has reservat diversos regals\nper a l’Alina 🎁"
        : "Has reservat un regal\nper a l’Alina 🎁",
      paragraphs: multiple
        ? [
            "Gràcies per reservar aquests regals i ajudar-nos a preparar l’arribada de l’Alina!",
            "Els hem desat per a tu a la nostra llista.",
          ]
        : [
            `Has reservat “${giftNames[0]}”.`,
            "Gràcies per reservar aquest regal i ajudar-nos a preparar l’arribada de l’Alina!",
            "L’hem desat per a tu a la nostra llista.",
            "Quan l’hagis comprat, torna a la llista i marca’l com a comprat utilitzant aquesta mateixa adreça de correu electrònic.",
          ],
      giftListHeading: multiple ? "Els teus regals reservats" : undefined,
      giftNames: multiple ? giftNames : undefined,
      closingParagraph: multiple
        ? "Quan els hagis comprat, torna a la llista i marca’ls com a comprats utilitzant aquesta mateixa adreça de correu electrònic."
        : undefined,
      cta: "Tornar a la llista",
      ctaUrl: GIFTS_URL,
      information: reservationInformation(language),
      shipping: shippingInformation(language),
      footer: footer(language),
    } satisfies EmailContent;
  }

  return {
    subject: multiple
      ? "Has reservado varios regalos para Alina 🎁"
      : "Has reservado un regalo para Alina 🎁",
    heading: multiple
      ? "Has reservado varios regalos\npara Alina 🎁"
      : "Has reservado un regalo\npara Alina 🎁",
    paragraphs: multiple
      ? [
          "¡Gracias por reservar estos regalos y ayudarnos a preparar la llegada de Alina!",
          "Los hemos guardado para ti en nuestra lista.",
        ]
      : [
          `Has reservado “${giftNames[0]}”.`,
          "¡Gracias por reservar este regalo y ayudarnos a preparar la llegada de Alina!",
          "Lo hemos guardado para ti en nuestra lista.",
          "Cuando lo hayas comprado, vuelve a la lista y márcalo como comprado usando este mismo correo electrónico.",
        ],
    giftListHeading: multiple ? "Tus regalos reservados" : undefined,
    giftNames: multiple ? giftNames : undefined,
    closingParagraph: multiple
      ? "Cuando los hayas comprado, vuelve a la lista y márcalos como comprados usando este mismo correo electrónico."
      : undefined,
    cta: "Volver a la lista",
    ctaUrl: GIFTS_URL,
    information: reservationInformation(language),
    shipping: shippingInformation(language),
    footer: footer(language),
  } satisfies EmailContent;
}

export function sendReservationConfirmation({
  to,
  giftName,
  language,
  idempotencyKey,
}: ConfirmationInput) {
  const content = reservationContent([giftName], language);

  return safeSendEmail(
    "reservation",
    to,
    content,
    `reservation-confirmation-${idempotencyKey}`,
    language
  );
}

export function sendBulkReservationConfirmation({
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

  return safeSendEmail(
    "bulk reservation",
    to,
    reservationContent(giftNames, language),
    `bulk-reservation-confirmation-${idempotencyKey}`,
    language
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
      : language === "ca"
        ? {
            subject: "Gràcies pel teu regal per a l’Alina! 💛",
            heading: "Gràcies pel teu regal\nper a l’Alina! 💛",
            paragraphs: [
              `Hem registrat “${giftName}” com a comprat.`,
              "Ens fa moltíssima il·lusió compartir aquest moment amb tu.",
            ],
            cta: "Tornar a la llista",
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
    `purchase-confirmation-${idempotencyKey}`,
    language
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
        : language === "ca"
          ? {
              subject: "Gràcies pel teu regal per a l’Alina! 💛",
              heading: "Gràcies pel teu regal\nper a l’Alina! 💛",
              paragraphs: [
                `Hem registrat “${giftName}” com a comprat.`,
                "Ens fa moltíssima il·lusió compartir aquest moment amb tu.",
              ],
              cta: "Tornar a la llista",
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
      `bulk-purchase-confirmation-${idempotencyKey}`,
      language
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
      : language === "ca"
        ? {
            subject: "Gràcies pels teus regals per a l’Alina! 💛",
            heading: "Gràcies pels teus regals\nper a l’Alina! 💛",
            paragraphs: [
              "Hem registrat els regals següents com a comprats:",
            ],
            giftNames,
            closingParagraph:
              "Ens fa moltíssima il·lusió compartir aquest moment amb tu.",
            cta: "Tornar a la llista",
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
    `bulk-purchase-confirmation-${idempotencyKey}`,
    language
  );
}
