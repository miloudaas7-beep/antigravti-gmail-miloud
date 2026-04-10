"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { dictionaries, Language } from "./dictionaries";

type LanguageContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  // Type-safe dict accessor 
  t: (namespace: keyof typeof dictionaries["en"], key: string) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("app_lang") as Language;
    if (stored && dictionaries[stored]) {
      setLangState(stored);
      document.documentElement.dir = stored === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = stored;
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("app_lang", newLang);
    document.documentElement.dir = newLang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = newLang;
  };

  const t = (namespace: keyof typeof dictionaries["en"], key: string) => {
    const dict = dictionaries[lang] || dictionaries["en"];
    const ns = dict[namespace] as any;
    return ns?.[key] || (dictionaries["en"][namespace] as any)?.[key] || key;
  };

  if (!mounted) {
      // Prevent hydration mismatch by rendering a hidden layout or just returning children with default context
      return (
          <LanguageContext.Provider value={{ lang: "en", setLang, t }}>
            {children}
          </LanguageContext.Provider>
      );
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      <div dir={lang === "ar" ? "rtl" : "ltr"}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
