import { useRouter } from 'next/router';

const LanguageSwitcher = () => {
  const { locale, locales, asPath, push } = useRouter();

  const switchLanguage = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedLocale = e.target.value;
    push(asPath, asPath, { locale: selectedLocale });
  };

  return (
    <select value={locale} onChange={switchLanguage} className="border p-2 rounded">
      {locales?.map((loc) => (
        <option key={loc} value={loc}>
          {loc === 'en' ? 'English' : '简体中文'}
        </option>
      ))}
    </select>
  );
};

export default LanguageSwitcher;
