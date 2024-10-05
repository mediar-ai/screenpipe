<p align="center">
   <a href ="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/d3b1de26-c3c0-4c84-b9c4-b03213b97a30" alt="logo" width="200">
   </a>
</p>

<pre align="center">
   ___  ___ _ __ ___  ___ _ __  _ __ (_)_ __   ___ 
  / __|/ __| '__/ _ \/ _ \ '_ \| '_ \| | '_ \ / _ \
  \__ \ (__| | |  __/  __/ | | | |_) | | |_) |  __/
  |___/\___|_|  \___|\___|_| |_| .__/|_| .__/ \___|
                               |_|     |_|         
</pre>

<p align="center">
    <a href="https://screenpi.pe" target="_blank">
        <img src="https://img.shields.io/badge/Download%20The-Desktop%20App-blue?style=for-the-badge" alt="Download the Desktop App">
    </a>
</p>

<p align="center">
    <a href="https://www.youtube.com/@mediar_ai" target="_blank">
       <img alt="YouTube Channel Subscribers" src="https://img.shields.io/youtube/channel/subscribers/UCwjkpAsb70_mENKvy7hT5bw">
    </a>
</p>


<p align="center">
    <a href="https://discord.gg/dU9EBuw7Uq">
        <img src="https://img.shields.io/discord/823813159592001537?color=5865F2&logo=discord&logoColor=white&style=flat-square" alt="Join us on Discord">
    </a>
   <a href="https://twitter.com/screen_pipe"><img alt="X account" src="https://img.shields.io/twitter/url/https/twitter.com/diffuserslib.svg?style=social&label=Follow%20%40screen_pipe"></a>
   <a href="https://console.algora.io/org/mediar-ai/bounties?status=completed">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dcompleted" alt="Rewarded Bounties">
   </a>
   <a href="https://console.algora.io/org/mediar-ai/bounties?status=open">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dopen" alt="Open Bounties">
   </a>
</p>

<p align="center">
  <a href ="https://cal.com/louis030195/screenpipe">
    <img alt="Let's chat" src="https://cal.com/book-with-cal-dark.svg" />
  </a>
    


<p align="center">
   <a href ="https://screenpi.pe">
       <img alt="demo" src="https://github.com/user-attachments/assets/39d27adc-e17e-4ca5-89c5-faf45a3ea20f" width="800" />
   </a>
</p>

---

*Latest News* 🔥
- [2024/09] [screenpipe is number 1 github trending repo & on hackernews!](https://x.com/louis030195/status/1840859691754344483)
- [2024/09] 150 users run screenpipe 24/7!
- [2024/09] Released a v0 of our [documentation](https://docs.screenpi.pe/)
- [2024/08] Anyone can now [create, share, install pipes](https://youtu.be/iCqHgZgQHyA?si=DjKJir7HfZoQKItK) (plugins) from the app interface based on a github repo/dir
- [2024/08] We're running bounties! Contribute to screenpipe & make money, [check issues](https://github.com/mediar-ai/screenpipe/issues)
- [2024/08] Audio input & output now works perfect on Windows, Linux, MacOS (<15.0). We also support multi monitor capture and defaulting STT to Whisper Distil large v3
- [2024/08] We released video embedding. AI gives you links to your video recording in the chat!
- [2024/08] We released the pipe store! Create, share, use plugins that get you the most out of your data in less than 30s, even if you are not technical.
- [2024/08] We released Apple & Windows Native OCR.
- [2024/08] **The Linux desktop app is here!**.
- [2024/07] **The Windows desktop app is here! [Get it now!](https://screenpi.pe)**.
- [2024/07] 🎁 Screenpipe won Friends (the AI necklace) hackathon at AGI House (integrations soon)
- [2024/07] **We just launched the desktop app! [Download now!](https://screenpi.pe)**

---

# 24/7 Screen & Audio Capture

Library to build personalized AI powered by what you've seen, said, or heard. Works with Ollama. Alternative to Rewind.ai. Open. Secure. You own your data. Rust.  
We are shipping daily, make suggestions, post bugs, [give feedback](mailto:louis@screenpi.pe?subject=Screenpipe%20Feedback&body=I'd%20like%20to%20use%20Screenpipe%20for%20...%0D%0A%0D%0AI%20cannot%20because%20of%20...%0D%0A%0D%0AWe%20can%20also%20have%20a%20call,%20book%20at%20https://cal.com/louis030195/screenpipe).

![diagram](./content/diagram2.png)

# Why?

Building a reliable stream of audio and screenshot data, where a user simply clicks a button and the script runs in the background 24/7, collecting and extracting data from screen and audio input/output, can be frustrating. 

There are numerous use cases that can be built on top of this layer. To simplify life for other developers, we decided to solve this non-trivial problem. It's still in its early stages, but it works end-to-end. We're working on this full-time and would love to hear your feedback and suggestions.

## Get started

There are multiple ways to install screenpipe:
- as a CLI for technical users
- as a [paid desktop app](https://screenpi.pe/onboarding) with 1 year updates, priority support, and priority features
- as a free forever desktop app (but you need to build it yourself). We're 100% OSS.
- get the desktop app 1 year license by sending a PR ([example](https://github.com/mediar-ai/screenpipe/issues/120#issuecomment-2275043418)) or [sharing about screenpipe online](https://screenpi.pe/onboarding/free-community)
- as a Rust or WASM library - check this [websocket](https://github.com/mediar-ai/screenpipe/blob/main/screenpipe-vision/examples/websocket.rs) to stream frames + OCR to your app
- [as a business](https://cal.com/louis030195/screenpipe-for-businesses) 

[**👉 install screenpipe now**](https://docs.screenpi.pe/docs/getting-started)

## usage

screenpipe has a plugin system called "pipe" which lets you run code in a sandboxed environment within the Rust code, [get started](https://docs.screenpi.pe/docs/plugins)

## examples

[check examples](https://docs.screenpi.pe/docs/examples)

## star history

![GitHub Star History (10)](https://github.com/user-attachments/assets/5d5c9672-d2d3-4e4c-8734-a7e0c2fee246)


## Contributing

Contributions are welcome! If you'd like to contribute, please read [CONTRIBUTING.md](CONTRIBUTING.md).

   <a href="https://console.algora.io/org/mediar-ai/bounties?status=completed">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dcompleted" alt="Rewarded Bounties">
   </a>
   <a href="https://console.algora.io/org/mediar-ai/bounties?status=open">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dopen" alt="Open Bounties">
   </a>
