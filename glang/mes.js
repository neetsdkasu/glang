//
// SendData
//
export function isITokenList(src) {
    return Array.isArray(src);
}
export function send(sender, sd) {
    sender.postMessage(sd);
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
export function sendGoRun(sender, stepSize, cin) {
    const sd = {
        kind: "GoRun",
        stepSize: stepSize,
        cin: cin
    };
    send(sender, sd);
}
export function sendRequestCanvas(sender) {
    const sd = {
        kind: "TransferCanvas",
        canvas: null
    };
    send(sender, sd);
}
export function sendRequestEventOfPointer(sender) {
    const sd = {
        kind: "EventOfPointer",
        state: null
    };
    send(sender, sd);
}
export function sendEventOfPointer(sender, state) {
    const sd = {
        kind: "EventOfPointer",
        state: state
    };
    send(sender, sd);
}
export function sendTransferCanvas(sender, canvas) {
    const sd = {
        kind: "TransferCanvas",
        canvas: canvas
    };
    sender.postMessage(sd, [canvas]);
}
export default {};
