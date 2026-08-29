import type { Language } from "./translations";

export const categoryTranslations: Record<string, string> = {
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

export function getLocalizedCategory(
  category: string,
  language: Language
): string {
  return language === "en"
    ? categoryTranslations[category] ?? category
    : category;
}

export function getCategorySearchLabels(category: string): string[] {
  const englishLabel = categoryTranslations[category];
  return englishLabel ? [category, englishLabel] : [category];
}
