import type { Language } from "./translations";

export const englishCategoryTranslations: Record<string, string> = {
  "Baño y aseo": "Bath & Care",
  "Carrito y Paseo": "Strollers & Outings",
  Coche: "Car Travel",
  Comedor: "Feeding",
  Habitación: "Nursery",
  Juego: "Toys",
  Linería: "Linens",
  Regalos: "Gifts",
  "Ropita bebe": "Baby Clothes",
};

export const catalanCategoryTranslations: Record<string, string> = {
  "Baño y aseo": "Bany i higiene",
  "Carrito y Paseo": "Cotxet i passeig",
  Coche: "Cotxe",
  Comedor: "Alimentació",
  Habitación: "Habitació",
  Juego: "Joc",
  Linería: "Roba de llit i tèxtils",
  Regalos: "Regals",
  "Ropita bebe": "Roba de nadó",
};

export function getLocalizedCategory(
  category: string,
  language: Language
): string {
  if (language === "ca") {
    return catalanCategoryTranslations[category] ?? category;
  }
  if (language === "en") {
    return englishCategoryTranslations[category] ?? category;
  }
  return category;
}

export function getCategorySearchLabels(category: string): string[] {
  return Array.from(
    new Set(
      [
        category,
        catalanCategoryTranslations[category],
        englishCategoryTranslations[category],
      ].filter((label): label is string => Boolean(label))
    )
  );
}
