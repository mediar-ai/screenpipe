import { useState, useEffect } from 'react';
import { platform } from '@tauri-apps/plugin-os';

const usePlatform = () => {
  const [os, setOs] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const osPlatform = await platform();
      setOs(osPlatform);
    })();
  }, []);

  return os;
};

export default usePlatform;
