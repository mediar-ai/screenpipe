"use client"

import Image from 'next/image';

export default function Header() {
  return (
    <div className="flex flex-col justify-center items-center mt-6">
      <Image
        className="w-24 h-24"
        src="/128x128.png"
        alt="screenpipe-logo"
        width={96}
        height={96}
        priority
      />
      <h1 className="font-bold text-center text-2xl">screenpipe</h1>
    </div>
  );
} 