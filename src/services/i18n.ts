
export const translations: Record<string, Record<string, string>> = {
  en: {
    "confirm_logout": "Confirm Logout",
    "cancel": "Cancel",
    "enchant_with": "ENCHANT WITH...",
    "welcome": "Welcome",
    // Add more as needed
  },
  pt: {
    "confirm_logout": "Confirmar Saída",
    "cancel": "Cancelar",
    "enchant_with": "ENCANTAR COM...",
    "welcome": "Bem-vindo",
    // Add more as needed
  },
  es: {
    "confirm_logout": "Confirmar Cierre de Sesión",
    "cancel": "Cancelar",
    "enchant_with": "ENCANTAR CON...",
    "welcome": "Bienvenido",
  },
  // Add other languages...
};

export const t = (key: string, lang: string): string => {
  return translations[lang]?.[key] || translations['en']?.[key] || key;
};
