//
// SendData
//

import * as parser from "./parser.js";
import * as runner from "./runner.js";
import { IToken }  from "./scanner.js";

export function isITokenList(src: IToken | Readonly<IToken[]> | null): src is Readonly<IToken[]> {
    return Array.isArray(src);
}

export interface TextSrc {
    kind: "TextSrc";
    textSrc: string;
}

export interface ParseError {
    kind: "ParseError";
    msg: string;
    src: IToken | Readonly<IToken[]> | null;
}

export interface RuntimeError {
    kind: "RuntimeError";
    msg: string;
    src: IToken | Readonly<IToken[]> | null;
}

export interface Message {
    kind: "Message";
    message: string;
}

export interface Ready  {
    kind: "Ready";
}

export interface GoRun {
    kind: "GoRun";
    stepSize: number;
    cin: string;
}

export interface Finished {
    kind: "Finished";
}

export interface Stop {
    kind: "Stop";
}

export interface WriteCerr {
    kind: "WriteCerr";
    text: string;
}

export interface TransferCanvas {
    kind: "TransferCanvas";
    canvas: OffscreenCanvas | null;
}

export type SendData  = TextSrc | ParseError | Message | Ready | GoRun | Finished | RuntimeError | Stop | WriteCerr | TransferCanvas;

export interface Sender {
    postMessage(message: any): void;
}

export interface SenderWithTransfer {
    postMessage(message: any, transfer?: Transferable[]): void;
}

export function send(sender: Sender, sd: SendData): void {
    Promise.resolve(undefined)
    .then( () => {
        sender.postMessage(sd);
    });
}

export function sendTextSrc(sender: Sender, textSrc: string): void {
    const sd: TextSrc = {
        kind: "TextSrc",
        textSrc: textSrc
    };
    send(sender, sd);
}

export function sendParseError(sender: Sender, error: parser.ParserError): void {
    const sd: ParseError = {
        kind: "ParseError",
        msg: error.msg,
        src: error.src
    };
    send(sender, sd);
}

export function sendMessage(sender: Sender, message: string): void {
    const sd: Message = {
        kind: "Message",
        message: message,
    };
    send(sender, sd);
}

export function sendRuntimeError(sender: Sender, error: runner.RuntimeError): void {
    const sd: RuntimeError = {
        kind: "RuntimeError",
        msg: error.msg,
        src: error.src?.src ?? null
    };
    send(sender, sd);
}

export function sendGoRun(sender: Sender, stepSize: number, cin: string): void {
    const sd: GoRun = {
        kind: "GoRun",
        stepSize: stepSize,
        cin: cin
    };
    send(sender, sd);
}

export function sendRequestCanvas(sender: Sender): void {
    const sd: TransferCanvas = {
        kind: "TransferCanvas",
        canvas: null
    };
    sender.postMessage(sd);
}

export function sendTransferCanvas(sender: SenderWithTransfer, canvas: OffscreenCanvas): void {
    const sd: TransferCanvas = {
        kind: "TransferCanvas",
        canvas: canvas
    };
    sender.postMessage(sd, [canvas]);
}

export default {};
