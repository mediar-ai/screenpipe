"use client"

export default function Header() {
  return (
    <div className="flex flex-col justify-center items-center mt-6">
       <img
        className="w-24 h-24"
        src="/128x128.png"
        alt="screenpipe-logo"
      />
      <h1 className="font-bold text-center text-2xl">Screenpipe</h1>
    </div>
  );
}
