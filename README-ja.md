<p align="center">
   <a href="README.md">English</a> | <a href="README-zh_CN.md">简体中文</a> | 日本語
</p>

<p align="center">
   <a href="https://screenpi.pe">
      <img src="https://github.com/user-attachments/assets/d3b1de26-c3c0-4c84-b9c4-b03213b97a30" alt="ロゴ" width="200">
   </a>
</p>

<p align="center" style="font-family: 'Press Start 2P', monospace;">
   <h1 align="center">[ screenpipe ]</h1>
   <p align="center">AIアプリを構築、配布、収益化するためのライブラリ＆プラットフォーム（Rewind、Granolaなどと同様）</p>
   <p align="center">オープンソース | 100% ローカル | 開発者フレンドリー | 24/7画面、マイク、キーボードの記録と制御</p>
</p>

<p align="center" style="font-family: monospace;">
   <code>[ ピクセル単位で現実を記録する ]</code>
</p>

<p align="center">
    <a href="https://screenpi.pe" target="_blank">
        <img src="https://img.shields.io/badge/Download%20The-Desktop%20App-blue?style=for-the-badge" alt="デスクトップアプリをダウンロード">
    </a>
</p>

<p align="center">
    <a href="https://www.youtube.com/@mediar_ai" target="_blank">
       <img alt="YouTubeチャンネル登録者数" src="https://img.shields.io/youtube/channel/subscribers/UCwjkpAsb70_mENKvy7hT5bw">
    </a>
</p>

<p align="center">
    <a href="https://discord.gg/dU9EBuw7Uq">
        <img src="https://img.shields.io/discord/823813159592001537?color=5865F2&logo=discord&logoColor=white&style=flat-square" alt="Discordに参加">
    </a>
   <a href="https://twitter.com/screen_pipe"><img alt="Xアカウント" src="https://img.shields.io/twitter/url/https/twitter.com/diffuserslib.svg?style=social&label=Follow%20%40screen_pipe"></a>
   <a href="https://console.algora.io/org/mediar-ai/bounties?status=completed">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dcompleted" alt="報酬付きバウンティ">
   </a>
   <a href="https://console.algora.io/org/mediar-ai/bounties?status=open">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dopen" alt="オープンバウンティ">
   </a>
</p>

<p align="center">
   <img width="1312" alt="スクリーンショット1" src="https://github.com/user-attachments/assets/26b2986d-01aa-43de-acf0-375a72752894" />
   <img width="1312" alt="スクリーンショット2" src="https://github.com/user-attachments/assets/0da6e948-4fa2-48ab-b18c-d8fbd1246261" />
   <img width="1142" alt="スクリーンショット3" src="https://github.com/user-attachments/assets/5b6f7015-b522-4894-a0d7-d91d648895f5" />
   <img width="1312" alt="スクリーンショット4" src="https://github.com/user-attachments/assets/08f1d8bd-803e-4cc5-8b8f-ad33bfebfd7e" />
</p>

---

*ニュース* 🔥
- [2025/01] Different AIと提携し、[画面に基づく金融自動化](https://github.com/different-ai/hypr-v0)と[Obsidian内のGranola代替](https://github.com/different-ai/file-organizer-2000)を提供
- [2024/12] パイプストアにStripe連携: 開発者は数行のJSで収益化（Reddit、LinkedIn、タイムラインエージェントなど）
- [2024/11] [GitHubトレンド1位に再び選出](https://x.com/louis030195/status/1859628763425931479)
- [2024/10] [Founders, Inc.](https://f.inc/)から支援を受ける
- [2024/09] [GitHubトレンド1位、Hacker Newsに掲載！](https://x.com/louis030195/status/1840859691754344483)
- [2024/08] アプリインターフェースからGitHubリポジトリ/ディレクトリに基づいて[パイプの作成、共有、インストール](https://docs.screenpi.pe/docs/plugins)が可能に
- [2024/08] バウンティプログラム開始！ScreenPipeに貢献して収益を得られます。[課題を確認](https://github.com/mediar-ai/screenpipe/issues)
- [2024/08] Apple & Windows ネイティブOCRをリリース
- [2024/07] 🎁 AGI Houseのハッカソンでスクリーンパイプが受賞（近日統合予定）
- [2024/07] **デスクトップアプリをリリース！ [今すぐダウンロード！](https://screenpi.pe)**

---

# どうやって動くの？

- 24時間365日、100%ローカルで記録（CPU使用率10%、メモリ4GB、月15GB）
- APIで索引化
- 開発者はユーザーの完全なコンテキストを持つAIアプリをデスクトップネイティブ、Next.js環境で構築、公開、収益化

<img src="./content/diagram2.png" width="800" />

<img src="https://github.com/user-attachments/assets/da5b8583-550f-4a1f-b211-058e7869bc91" width="400" />

# なぜ必要なの？

1. コンテキストは知能の暗黒物質
2. 記録していない1秒1秒がAGIにとって欠落したコンテキスト

## 始め方

macOS、Linux:

```bash
curl -fsSL raw.githubusercontent.com/mediar-ai/screenpipe/main/install.sh | sh
```

Windowsの場合

```bash
irm https://raw.githubusercontent.com/mediar-ai/screenpipe/main/install.ps1 | iex
```

その後

```bash
screenpipe
```

macOSでは画面とマイクの許可を必ず設定してください

- [デスクトップアプリをダウンロード](https://screenpi.pe/)
- [ドキュメント & ソースからビルド](https://docs.screenpi.pe/docs/getting-started)

## プラグインの作成

```bash
bunx @screenpipe/create-pipe@latest
```

ScreenPipeには「パイプ」と呼ばれるプラグインシステムがあり、Rustコード内のサンドボックス環境でNext.jsデスクトップアプリを作成できます。[詳細はこちら](https://docs.screenpi.pe/docs/plugins)

## スター履歴

![スター履歴 2024年11月](https://github.com/user-attachments/assets/c7e4de14-0771-4bbb-9a4c-7f2102a1a6cd)

## コントリビューション

貢献を歓迎します！貢献したい方は [CONTRIBUTING.md](CONTRIBUTING.md) をお読みください。

   <a href="https://console.algora.io/org/mediar-ai/bounties?status=completed">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dcompleted" alt="報酬付きバウンティ">
   </a>
   <a href="https://console.algora.io/org/mediar-ai/bounties?status=open">
       <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fconsole.algora.io%2Fapi%2Fshields%2Fmediar-ai%2Fbounties%3Fstatus%3Dopen" alt="オープンバウンティ">
   </a>