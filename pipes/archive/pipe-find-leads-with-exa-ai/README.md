
### find leads with exa ai pipe

https://youtu.be/2UJMo-mkYV4

this pipe automates the process of finding potential leads based on an evolving ideal customer profile (icp). it uses screenpipe data, exa ai for company search, and openai for analysis and formatting.

#### features

- continuously updates the ideal customer profile (icp) based on user activity
- searches for potential leads using exa ai
- formats lead information using ai
- sends email notifications with potential leads
- integrates with screenpipe for data collection and notifications

#### requirements

- screenpipe installed and configured
- bun runtime
- exa ai api key
- openai api key
- gmail account for sending notifications

#### configuration

configure through screenpipe app UI or by editing the `pipe.json` file

#### development usage

1. set up the required environment variables:

```bash
export SCREENPIPE_DIR="$HOME/.screenpipe"
export PIPE_ID="pipe-find-leads-with-exa-ai"
export PIPE_FILE="pipe.ts"
export PIPE_DIR="$SCREENPIPE_DIR/pipes/pipe-find-leads-with-exa-ai"
```

2. run the pipe:

```bash
bun run $PIPE_DIR/$PIPE_FILE
```

#### how it works

1. loads the pipe configuration and initializes necessary services
2. periodically queries screenpipe for recent user activity
3. updates the ideal customer profile (icp) based on the collected data
4. searches for potential leads using exa ai based on the updated icp
5. formats lead information using ai for better readability
6. sends email notifications with potential leads and updates the icp
7. sends desktop notifications and updates the screenpipe inbox

#### customization

- adjust the `interval` in the config to change how often the pipe runs
- modify the `customPrompt` to fine-tune the icp update process
- update the `aiModel` and `aiApiUrl` to use different ai models or providers

#### notes

- ensure your gmail account is configured to allow less secure apps or use an app-specific password
- keep your api keys and email credentials secure
- the pipe creates and maintains an `icp.json` file to store the evolving ideal customer profile

