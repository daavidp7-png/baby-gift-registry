import type { Language } from "../i18n/translations";

export type LocalizedDescriptionFields = {
  Description?: string;
  "Description CA"?: string;
  "Description EN"?: string;
};

export function getLocalizedGiftDescription(
  fields: LocalizedDescriptionFields,
  language: Language
) {
  if (language === "es") return fields.Description;

  const translatedDescription =
    language === "ca" ? fields["Description CA"] : fields["Description EN"];

  return translatedDescription?.trim()
    ? translatedDescription
    : fields.Description;
}
