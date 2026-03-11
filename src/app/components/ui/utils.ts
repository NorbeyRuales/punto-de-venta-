// Utilidad para combinar clases Tailwind de forma segura.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  // Une clases condicionales y resuelve conflictos de Tailwind.
  return twMerge(clsx(inputs));
}
