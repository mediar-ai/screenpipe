const conf = () => {
    const secrets = process.env.HOME + '/secrets.json'
    console.log("fetching secrets.json from", secrets)
    return require(secrets);
}
module.exports = conf;
// ~/secrets.json: {"OPENAI_API_KEY": "sk-..."}