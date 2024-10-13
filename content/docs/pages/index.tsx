import { useRouter } from 'next/router';
import { useEffect } from 'react';

const Home = () => {
  const { locale, push } = useRouter();

  useEffect(() => {
    if (locale === 'zh') {
      push('/zh');
    } else {
      push('/en');
    }
  }, [locale, push]);

  return null;
};

export default Home;
