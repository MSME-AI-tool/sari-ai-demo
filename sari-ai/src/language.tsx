import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type Language = 'en' | 'fil';
type Translate = (english: string, filipino: string) => string;
const LanguageContext = createContext({
  language: 'en' as Language,
  setLanguage: (_language: Language) => {},
  t: ((english: string) => english) as Translate,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem('sari-language') === 'fil' ? 'fil' : 'en'; }
    catch { return 'en'; }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem('sari-language', language); } catch { /* Storage can be disabled. */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t: (en, fil) => language === 'fil' ? fil : en }}>
    {children}
  </LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

export const expenseLabels: Record<string, string> = {
  Transport: 'Pamasahe', Supplies: 'Mga suplay', Utilities: 'Mga bayarin', Rent: 'Upa', Wages: 'Sahod', Other: 'Iba pa',
};

export function localError(t: Translate, error: unknown) {
  if (!(error instanceof Error)) return t('Something went wrong. Try again.', 'May aberya. Subukan muli.');
  const message = error.message;
  const rules: [RegExp, string][] = [
    [/already exists/, 'May item nang may ganitong pangalan.'],
    [/Payment exceeds/, 'Mas mataas ang bayad kaysa sa natitirang utang.'],
    [/already recorded/, 'Mas mababa ang bagong kabuuan kaysa sa naitalang mga bayad.'],
    [/later physical count/, 'May mas bagong aktuwal na bilang. Suriin muna ang history ng item.'],
    [/sale has changed/, 'Nagbago na ang tala. Buksan muli ang pinakabagong detalye ng benta.'],
    [/Change a quantity/, 'Baguhin muna ang bilang o item.'],
    [/Only .* are available/, 'Kulang ang stock. Suriin ang natitira at baguhin ang dami.'],
    [/exact product name/, 'Gamitin ang eksaktong pangalan sa Stock.'],
    [/one line per product/, 'Gumamit ng isang linya para sa bawat item.'],
    [/choose today|valid date/i, 'Pumili ng wastong petsa na hindi lalampas sa ngayon.'],
    [/valid product photo/, 'Pumili ng wastong litrato ng item.'],
  ];
  return t(message, rules.find(([pattern]) => pattern.test(message))?.[1] ??
    'Hindi natuloy ang kahilingan. Suriin ang mga detalye at subukan muli.');
}

export function LanguageSelect() {
  const { language, setLanguage, t } = useLanguage();
  return <label className="language-control"><span className="sr-only">{t('Language', 'Wika')}</span>
    <select value={language} onChange={event => setLanguage(event.target.value === 'fil' ? 'fil' : 'en')}>
      <option value="en">English</option><option value="fil">Filipino</option>
    </select>
  </label>;
}
