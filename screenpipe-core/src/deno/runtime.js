const { core } = Deno;
const { ops } = core;

function argsToMessage(...args) {
    return args.map((arg) => JSON.stringify(arg)).join(" ");
}

const console = {
    log: (...args) => {
        core.print(`[js][info]: ${argsToMessage(...args)}\n`, false);
    },
    error: (...args) => {
        core.print(`[js][error]: ${argsToMessage(...args)}\n`, true);
    },
};

const pipe = {
    readFile: (path) => {
        return ops.op_read_file(path);
    },
    writeFile: (path, contents) => {
        return ops.op_write_file(path, contents);
    },
    removeFile: (path) => {
        return ops.op_remove_file(path);
    },
    get: async (url) => {
        const response = await ops.op_fetch_get(url);
        return JSON.parse(response);
    },
    post: async (url, body) => {
        const response = await ops.op_fetch_post(url, body);
        return JSON.parse(response);
    },
};

globalThis.setTimeout = (callback, delay) => {
    ops.op_set_timeout(delay).then(callback);
};
globalThis.console = console;
globalThis.pipe = pipe;