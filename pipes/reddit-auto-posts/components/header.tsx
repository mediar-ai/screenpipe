"use client"

export default function Header() {
  return (
    <div className="flex flex-col justify-center items-center mt-8">
       <img
        className="w-24 h-24"
        src="/128x128.png"
        alt="screenpipe-logo"
      />
      <h1 className="font-bold text-center text-2xl">screenpipe</h1>
      <h1 className='font-medium text-lg text-center mt-1'>
        get reddit posts recommendation using your screenpipe data
      </h1>
    </div>
  );
}
