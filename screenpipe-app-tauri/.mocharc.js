module.exports = {
  spec: [
    "./e2e/terminator-e2e/**/*.spec.js"
  ],
  timeout: 150000,
  require: [
    "./e2e/terminator-e2e/mocha.global.js"
  ],
  reporter: "spec",
};
