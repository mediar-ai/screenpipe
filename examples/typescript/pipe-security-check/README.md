
send a notification to the user when exposed to a security risk on your screen

```bash
ollama run mistral-nemo
```

```bash
curl -X POST "http://localhost:3030/pipes/download"      -H "Content-Type: application/json"      -d '{"url": "$(pwd)/examples/typescript/pipe-security-check"}'

curl -X POST "http://localhost:3030/pipes/enable"      -H "Content-Type: application/json"      -d '{"pipe_id": "pipe-security-check"}'
```

or

```bash
./target/release/screenpipe pipe download $(pwd)/examples/typescript/pipe-security-check

./target/release/screenpipe pipe enable pipe-security-check
```



