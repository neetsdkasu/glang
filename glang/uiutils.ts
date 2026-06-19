//
// UI utils
// 

const RE_REMOVE_SP = /^ {1,4}/;
const RE_NOT_SP = /[^ ]/;
const REMOVE_SP: (s: string) => string = s => s.replace(RE_REMOVE_SP, "");
const PAD_SP: (s: string) => string = s => {
    const p = s.search(RE_NOT_SP);
    if (p < 0) {
        return "    ".repeat(1+(s.length>>2));
    } else {
        return "    ".repeat(1+(p>>2)) + s.slice(p);
    }
};
export function setEnableTabIndent(el: HTMLTextAreaElement): void {
    el.addEventListener("keydown", e => {
        if (e.key === "Tab" && !e.altKey && !e.ctrlKey) {
            e.preventDefault();
            let index1;
            let index2;
            if (el.selectionStart === el.selectionEnd) {
                index2 = el.value.indexOf("\n", Math.max(0, el.selectionEnd));
                index1 = Math.max(0, el.value.lastIndexOf("\n", Math.max(0, index2-1))+1);
            } else {
                index1 = Math.max(0, el.value.lastIndexOf("\n", el.selectionStart)+1);
                index2 = el.value.indexOf("\n", Math.max(0, el.selectionEnd-1));
            }
            const lines = el.value.slice(index1, index2).split("\n").map(e.shiftKey ? REMOVE_SP : PAD_SP);
            if (lines.length === 1 && (lines[0].at(-1) ?? " ") === " ") {
                el.setRangeText(lines.join("\n"), index1, index2, "end");
            } else {
                el.setRangeText(lines.join("\n"), index1, index2, "select");
            }
        }
    });
}

export default {};
