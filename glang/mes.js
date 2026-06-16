//
// SendData
//
export function isITokenList(src) {
    return Array.isArray(src);
}
export function send(sender, sd) {
    Promise.resolve(undefined)
        .then(() => {
        sender.postMessage(sd);
    });
}
export function sendTextSrc(sender, textSrc) {
    const sd = {
        kind: "TextSrc",
        textSrc: textSrc
    };
    send(sender, sd);
}
export function sendParseError(sender, error) {
    const sd = {
        kind: "ParseError",
        msg: error.msg,
        src: error.src
    };
    send(sender, sd);
}
export function sendMessage(sender, message) {
    const sd = {
        kind: "Message",
        message: message,
    };
    send(sender, sd);
}
export function sendRuntimeError(sender, error) {
    const sd = {
        kind: "RuntimeError",
        msg: error.msg,
        src: error.src?.src ?? null
    };
    send(sender, sd);
}
export function sendGoRun(sender, stepSize) {
    const sd = {
        kind: "GoRun",
        stepSize: stepSize
    };
    send(sender, sd);
}
export default {};
