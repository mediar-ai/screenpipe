### llama3.2 linear task commenter

are you the kind of engineer who hates product management and considers it bullshit?

no worries, llama3.2 got you covered.

this pipe will automate your PM work by adding comments to linear tasks based on your screen activity or meeting audio using screenpipe and llama3.2 ai.

(please avoid watching netflix (or something else ;)) during work hours or it will be written in linear :))

#### quick setup through app ui

1. run ollama:
   ```
   ollama run nemotron-mini:4b-instruct-q4_K_M
   ```

2. set up linear:
   - get your linear api key from https://linear.app/settings/api
   
3. configure pipe in the app ui:
   - set your linear api key
   - adjust interval and other settings as needed
   - save and enable the pipe
   - restart screenpipe recording

boom! it'll add comments to your linear tasks based on your work every 5 minutes (or your set interval).

wanna tweak it? check `pipe.ts` to adjust the ai prompt or modify the comment generation logic.

#### cli usage

```
screenpipe download https://github.com/mediar-ai/screenpipe/edit/main/examples/typescript/pipe-llama32-comment-linear-while-you-work
screenpipe enable pipe-llama32-comment-linear-while-you-work
screenpipe 
```


