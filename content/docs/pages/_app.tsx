import "@/styles/globals.css";
import type { AppProps } from "next/app";
// import Layout from '../components/layout';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Component {...pageProps} />
  )
};
