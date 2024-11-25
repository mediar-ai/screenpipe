### pipe-email-daily-log

<img width="988" alt="Screenshot 2024-09-25 at 17 56 00" src="https://github.com/user-attachments/assets/f9d604af-b098-4f93-b923-b2fc455a6172">



https://github.com/user-attachments/assets/a81963c9-54ee-4587-aac1-2eba0df4a5fc



llama3.2 looks at your screen 24/7 and send you emails summarizing your activity or action items (e.g. follow up on this lead, or anything, you can customise the prompt and windows/tabs/apps being used as prompt)

#### quick setup

1. run ollama:
   ```
   ollama run llama3.2:3b-instruct-q4_K_M
   ```

2. [create app specific password](https://support.google.com/accounts/answer/185833?hl=en) in your google account that will be used to send yourself emails

3. configure pipe in the app ui, save, enable, restart screenpipe recording (you can config to either receive a mail a day or several every x hours)

<img width="1312" alt="Screenshot 2024-09-25 at 18 16 54" src="https://github.com/user-attachments/assets/9669b2f1-c67d-4055-9e03-067c67fb51f8">

boom!

wanna tweak it? check `pipe.ts`.

can be used through CLI also, you can tweak the `pipe.json` to your needs (`$HOME/.screenpipe/pipes/pipe-email-daily-log/pipe.json`)



