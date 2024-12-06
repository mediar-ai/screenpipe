import { KeywordCloud } from "@/components/keyword-cloud";
import Image from "next/image";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start justify-center">
        <Image
          className="dark:invert text-center"
          src="https://screenpi.pe/1024x1024.png"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <KeywordCloud />
        <span className="text-sm text-gray-500">
          these are the top keywords from the last 24 hours appearing in your
          screen and audio transcript
        </span>
      </main>
    </div>
  );
}
