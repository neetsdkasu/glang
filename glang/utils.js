//
// utils
//
export function callToString(v) {
    if (v) {
        if (v["toString"]) {
            if (typeof v["toString"] === "function") {
                return v.toString();
            }
        }
    }
    return v;
}
export default {};
