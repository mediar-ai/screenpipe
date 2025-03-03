<img referrerpolicy="no-referrer-when-downgrade" src="https://static.scarf.sh/a.png?x-pxid=c3628864-a0cb-47a1-a822-2f936cff50b2" />
<p align="center">
   <a href="README.md">English</a> | <a href="README-zh_CN.md">简体中文</a> | <a href="README-ja.md">日本語</a>
</p>

<p align="center">
   <a href ="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/d3b1de26-c3c0-4c84-b9c4-b03213b97a30" alt="logo" width="200">
   </a>
</p>

<p align="center">
   <a href="https://trendshift.io/repositories/11785" target="_blank"><img src="https://trendshift.io/api/badge/repositories/11785" alt="mediar-ai%2Fscreenpipe | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</p>


<!-- ScreenPipe Title and Subtitle -->
<p align="center" style="font-family: 'Press Start 2P', monospace;">
   <h1 align="center">[ screenpipe ]</h1>
   <p align="center">AI app store powered by 24/7 desktop history</p>
   <p align="center">open source | 100% local | dev friendly | 24/7 screen, mic recording</p>
</p>

<!-- Slogan -->
<p align="center" style="font-family: monospace;">
   <code>[ recording reality, one pixel at a time ]</code>
</p>

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
   

<img width="1312" alt="Screenshot 2025-02-15 at 7 51 18 PM" src="https://github.com/user-attachments/assets/5a9f29ce-69ae-463f-b338-186b8cdb2d12" />

![image](https://github.com/user-attachments/assets/dec2e07c-b3d5-46dd-9f36-c0c26a82c9fb)



https://github.com/user-attachments/assets/628c6c01-a580-4b21-bce9-3e7b186914a4




https://github.com/user-attachments/assets/973ee8e5-5240-4d36-83fe-d38c53efe6a9






---

*news* 🔥
- [2025/02] we're throwing an [hackathon](https://www.nosu.io/hackathons/screenpipe), $12k in cash prizes, 28 Feb
- [2025/01] we're partnering with Different AI to bring you [financial automations based on your screen](https://github.com/different-ai/hypr-v0) and [drop-in replacement for granola within obsidian](https://github.com/different-ai/file-organizer-2000)
- [2024/12] pipe store stripe integration: devs build cool shit - few lines of JS and make passive income (available Reddit agent, LinkedIn agent, Timeline ...)
- [2024/11] [screenpipe is number 1 github trending repo (again)](https://x.com/louis030195/status/1859628763425931479)
- [2024/10] screenpipe has been backed by [Founders, Inc](https://f.inc/)
- [2024/09] [screenpipe is number 1 github trending repo & on hackernews!](https://x.com/louis030195/status/1840859691754344483)
- [2024/08] anyone can now [create, share, install pipes](https://docs.screenpi.pe/docs/plugins) (plugins) from the app interface based on a github repo/dir
- [2024/08] we're running bounties! contribute to screenpipe & make money, [check issues](https://github.com/mediar-ai/screenpipe/issues)
- [2024/08] we released Apple & Windows Native OCR.
- [2024/07] **we just launched the desktop app! [Download now!](https://screenpi.pe)**

---

# how it works?

- we record everything 24/7, 100% locally, uses 10% CPU, 4 GB ram, 15 gb/m
- we index it into an api
- dev build ai apps w user's full context, desktop native, nextjs, publish, monetize

<img src="./content/diagram2.png" width="800" />

<img src="https://github.com/user-attachments/assets/da5b8583-550f-4a1f-b211-058e7869bc91" width="400" />



# why?

- ai models are commoditized 
- ai is as good as its context
- the most valuable context is all contained in your screen


## get started

macos, linux:

```bash
curl -fsSL get.screenpi.pe/cli | sh
```

or on windows

```bash
iwr get.screenpi.pe/cli.ps1 | iex
```

then

```bash
screenpipe
```

make sure to allow permissions on macos (screen, mic)

- [get the desktop app](https://screenpi.pe/)
- [docs & build from source](https://docs.screenpi.pe/docs/getting-started)

## create plugins

```bash
bunx --bun @screenpipe/dev@latest pipe create
```

screenpipe has a plugin system called "pipe" which lets you create desktop app in nextjs in a sandboxed environment within our Rust code, [read more](https://docs.screenpi.pe/docs/plugins)

you can then publish these to our store and make money:

```bash
cd foo
bunx --bun @screenpipe/dev@latest pipe register --name foo [--paid --price 50] # subscription
bun run build
bunx --bun @screenpipe/dev@latest pipe publish --name foo
```

## community 

- [template to build screenpipe-powered desktop native app using Tauri](https://github.com/LorenzoBloedow/screenpipe-tauri-template-dev)
- [template to build screenpipe-powered desktop native app using Electron](https://github.com/neo773/screenpipe-electron)

## star history

![Star History Nov 24 2024](https://github.com/user-attachments/assets/c7e4de14-0771-4bbb-9a4c-7f2102a1a6cd)


## contributing

contributions are welcome! if you'd like to contribute, please read [CONTRIBUTING.md](CONTRIBUTING.md).

   <a href="https://console.algora.io/org/mediar-ai/bounties?status=completed">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dcompleted" alt="Rewarded Bounties">
   </a>
   <a href="https://console.algora.io/org/mediar-ai/bounties?status=open">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dopen" alt="Open Bounties">
   </a>
