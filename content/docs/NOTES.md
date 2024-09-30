
# Notes

## Troubleshooting / Product FAQ

Any other issue? [Will solve your problem in less than 15 min](https://cal.com/louis030195/screenpipe) or [mail me](mailto:louis@screenpi.pe)

  <details>
  <summary>Frames not recorded</summary>

  Try a different monitor. `screenpipe --list-monitors` and `screenpipe --monitor-id <monitor id>`

  </details>

  <details>

  <summary>Library not loaded</summary>

  >dyld[60479]: Library not loaded: screenpipe-vision/lib/libscreenpipe_arm64.dylib
  Referenced from: <805CE854-929E-36F6-AC66-9CEBA7A073BC> /Applications/screenpipe.app/Contents/MacOS/screenpipe
  Reason: tried: '/Users/louisbeaumont/.wasmedge/lib/libscreenpipe_arm64.dylib' (no such file), 'screenpipe-vision/lib/libscreenpipe_arm64.dylib' (no such file), '/System/Volumes/Preboot/Cryptexes/OSscreenpipe-vision/lib/libscreenpipe_arm64.dylib' (no such file), 'screenpipe-vision/lib/libscreenpipe_arm64.dylib' (no such file)
Abort trap: 6
>

  i'll investigate this issue now, in the meantime you can do this:

  ```
  brew tap mediar-ai/screenpipe https://github.com/mediar-ai/screenpipe.git
  brew install screenpipe
  ```


  and then

  ```
  cd
  screenpipe --ocr-engine apple-native
  ```

  </details>

  <details>

  <summary>WindowsCoreError HRESULT</summary>

  Sometimes this happen when computer goes to sleep for long. Just restart. We're going to make it fix itself automatically soon.

  </details>

  <details>

  <summary>Permission error in Windows</summary>

  If you run into this error in your CMD terminal using CLI you should run the terminal as administrator (right click on the icon)

  </details>

  <details>

  <summary>`TESSDATA_PREFIX` error</summary>

  This can happen on Windows.

  - Type "environment" in the search bar of Windows, and click environment variables.
  - Click "new" (the first one).
  - The key will be `TESSDATA_PREFIX` and the value will be the path you installed screenpipe (default is `C:\Users\<your username>\AppData\Local\screenpipe`)

  You can also try our experimental Windows OCR engine by adding `--ocr-engine windows-native` which should solve the above problem too

  </details>

  <details>

  <summary>Windows Defender</summary>

  Windows can sometimes delete screenpipe app, detected as a virus, this is obviously not a virus, and the code is here, open, you can check.

  You can solve this by going to your Defender settings and classify screenpipe as authorized.

  </details>

  <details>

  <summary>Windows Defender SmartScreen</summary>

  Windows will ask you this because we didn't sign the app yet. Be reassured, it's open source and secure, we have nothing to hide, press run anyway:

  ![image](https://github.com/user-attachments/assets/8e43d2e4-e178-4d3e-8210-712326d59c97)

  </details>

  <details>
  <summary>I can't install screenpipe</summary>

  Make sure to press control + right click on the `.dmg` file and press open

  <img width="372" alt="Screenshot 2024-07-24 at 16 07 22" src="https://github.com/user-attachments/assets/1b077f0f-0b90-4d40-b61d-ba11c8a8285c">

  Then drag the app to your application folder
  <img width="772" alt="Screenshot 2024-07-24 at 16 07 26" src="https://github.com/user-attachments/assets/452bf468-75b9-41e4-b068-7ac28f4f84be">

  Then again press control + right click on the app in applications and press open YOU NEED TO DO IT TWICE HERE
  <img width="1032" alt="Screenshot 2024-07-24 at 16 07 41" src="https://github.com/user-attachments/assets/3fe31dca-82d5-4edb-9116-62f12624edbd">
  Again you need to do it twice to open it, this won't ask it again in the future


</details>

<details>
  <summary>I can't open files</summary>

  Sometimes the file is still being written to, so wait a bit and try again.

</details>

<details>
  <summary>All files are 10 KB</summary>

  Some audio files might be small, like when there is no sound at all.
</details>

<details>
  <summary>MacOS Audio does not work</summary>

  Make sure to enable permissions in settings.
  <img width="827" alt="Screenshot 2024-07-24 at 16 08 51" src="https://github.com/user-attachments/assets/799c0834-8d35-476b-80f8-67f94342b891">

  Still does not work? Remove and re-enable the permission: click on screenpipe and click the minus "-" icon:

![Screenshot 2024-07-30 at 14 41 33](https://github.com/user-attachments/assets/3b67bd52-c9a1-4fb0-a4be-3e7713c54ebd)

  Then restart screenpipe and the dialog of permission should pop again and enable it, restarting screenpipe

</details>

<details>
  <summary>MacOS Screen capture does not work</summary>

   Make sure to enable permissions in settings.
  <img width="827" alt="Screenshot 2024-07-24 at 16 08 51" src="https://github.com/user-attachments/assets/799c0834-8d35-476b-80f8-67f94342b891">

  Still does not work? Remove and re-enable the permission: click on screenpipe and click the minus "-" icon:

![Screenshot 2024-07-30 at 14 41 33](https://github.com/user-attachments/assets/3b67bd52-c9a1-4fb0-a4be-3e7713c54ebd)

  Then restart screenpipe and the dialog of permission should pop again and enable it, restarting screenpipe

</details>

<details>
  <summary>Where are the files?</summary>

    Windows: Using the CLI, your data should be in C:\Users\YOUR_USER\.screenpipe
    MacOs/Linux: Using the CLI, your data should be in ~/.screenpipe

    Windows: Using the app, you can find the data in C:\Users\AppData\Local\screenpipe
    MacOS: Using the app, you can find the data in ~/Library/Application Support/screenpipe
    Linux: Using the app, you can find the data in ~/.config/screenpipe

</details>

<details>
  <summary>How can I interpret my data more intuitively?</summary>

  We recommend using [TablePlus](https://tableplus.com/) to open the SQLite database located alongside the data.
</details>