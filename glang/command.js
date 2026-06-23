//
// Command
//
import { Token } from "./scanner.js";
export class Source {
    addr;
    src;
    constructor(addr, src) {
        this.addr = addr;
        this.src = src;
    }
    toString() {
        if (this.src instanceof Token) {
            return `Source{ addr: ${this.addr}, src: ${this.src} }`;
        }
        else {
            return `Source{ addr: ${this.addr}, src: ${Token.lineToString(this.src)} }`;
        }
    }
}
export class Program {
    program;
    litStrPool;
    totalBlockCount;
    sourceMap;
    constructor(program, litStrPool, totalBlockCount, sourceMap) {
        this.program = program;
        this.litStrPool = litStrPool;
        this.totalBlockCount = totalBlockCount;
        this.sourceMap = sourceMap;
    }
    toString() {
        return `Program{ size: ${this.program.length}, litStrPool: ${this.litStrPool.length}, totalBlockCount: ${this.totalBlockCount}, sourceMap: ${this.sourceMap.length} }`;
    }
}
export var Cmd;
(function (Cmd) {
    Cmd[Cmd["NOP"] = 0] = "NOP";
    Cmd[Cmd["END"] = 1] = "END";
    Cmd[Cmd["POP"] = 2] = "POP";
    Cmd[Cmd["DUP"] = 3] = "DUP";
    Cmd[Cmd["DUPN"] = 4] = "DUPN";
    Cmd[Cmd["SWAP"] = 5] = "SWAP";
    Cmd[Cmd["BPUSH_TRUE"] = 6] = "BPUSH_TRUE";
    Cmd[Cmd["BPUSH_FALSE"] = 7] = "BPUSH_FALSE";
    Cmd[Cmd["BNOT"] = 8] = "BNOT";
    Cmd[Cmd["BAND"] = 9] = "BAND";
    Cmd[Cmd["BOR"] = 10] = "BOR";
    Cmd[Cmd["BEQ"] = 11] = "BEQ";
    Cmd[Cmd["BNE"] = 12] = "BNE";
    Cmd[Cmd["GET_BVAR"] = 13] = "GET_BVAR";
    Cmd[Cmd["SET_BVAR"] = 14] = "SET_BVAR";
    Cmd[Cmd["GET_BARR1D"] = 15] = "GET_BARR1D";
    Cmd[Cmd["SET_BARR1D"] = 16] = "SET_BARR1D";
    Cmd[Cmd["GET_BARR2D"] = 17] = "GET_BARR2D";
    Cmd[Cmd["SET_BARR2D"] = 18] = "SET_BARR2D";
    Cmd[Cmd["GET_BARR3D"] = 19] = "GET_BARR3D";
    Cmd[Cmd["SET_BARR3D"] = 20] = "SET_BARR3D";
    Cmd[Cmd["FPUSH"] = 21] = "FPUSH";
    Cmd[Cmd["FADD"] = 22] = "FADD";
    Cmd[Cmd["FSUB"] = 23] = "FSUB";
    Cmd[Cmd["FMUL"] = 24] = "FMUL";
    Cmd[Cmd["FDIV"] = 25] = "FDIV";
    Cmd[Cmd["FNEGA"] = 26] = "FNEGA";
    Cmd[Cmd["FEQ"] = 27] = "FEQ";
    Cmd[Cmd["FNE"] = 28] = "FNE";
    Cmd[Cmd["FLT"] = 29] = "FLT";
    Cmd[Cmd["FLE"] = 30] = "FLE";
    Cmd[Cmd["FGT"] = 31] = "FGT";
    Cmd[Cmd["FGE"] = 32] = "FGE";
    Cmd[Cmd["GET_FVAR"] = 33] = "GET_FVAR";
    Cmd[Cmd["SET_FVAR"] = 34] = "SET_FVAR";
    Cmd[Cmd["GET_FARR1D"] = 35] = "GET_FARR1D";
    Cmd[Cmd["SET_FARR1D"] = 36] = "SET_FARR1D";
    Cmd[Cmd["GET_FARR2D"] = 37] = "GET_FARR2D";
    Cmd[Cmd["SET_FARR2D"] = 38] = "SET_FARR2D";
    Cmd[Cmd["GET_FARR3D"] = 39] = "GET_FARR3D";
    Cmd[Cmd["SET_FARR3D"] = 40] = "SET_FARR3D";
    Cmd[Cmd["IPUSH"] = 41] = "IPUSH";
    Cmd[Cmd["IADD"] = 42] = "IADD";
    Cmd[Cmd["ISUB"] = 43] = "ISUB";
    Cmd[Cmd["IMUL"] = 44] = "IMUL";
    Cmd[Cmd["IDIV"] = 45] = "IDIV";
    Cmd[Cmd["IREM"] = 46] = "IREM";
    Cmd[Cmd["INEGA"] = 47] = "INEGA";
    Cmd[Cmd["IASHIFTL"] = 48] = "IASHIFTL";
    Cmd[Cmd["IASHIFTR"] = 49] = "IASHIFTR";
    Cmd[Cmd["ILSHIFTL"] = 50] = "ILSHIFTL";
    Cmd[Cmd["ILSHIFTR"] = 51] = "ILSHIFTR";
    Cmd[Cmd["INOT"] = 52] = "INOT";
    Cmd[Cmd["IAND"] = 53] = "IAND";
    Cmd[Cmd["IOR"] = 54] = "IOR";
    Cmd[Cmd["IXOR"] = 55] = "IXOR";
    Cmd[Cmd["IEQ"] = 56] = "IEQ";
    Cmd[Cmd["INE"] = 57] = "INE";
    Cmd[Cmd["ILT"] = 58] = "ILT";
    Cmd[Cmd["ILE"] = 59] = "ILE";
    Cmd[Cmd["IGT"] = 60] = "IGT";
    Cmd[Cmd["IGE"] = 61] = "IGE";
    Cmd[Cmd["GET_IVAR"] = 62] = "GET_IVAR";
    Cmd[Cmd["SET_IVAR"] = 63] = "SET_IVAR";
    Cmd[Cmd["GET_IARR1D"] = 64] = "GET_IARR1D";
    Cmd[Cmd["SET_IARR1D"] = 65] = "SET_IARR1D";
    Cmd[Cmd["GET_IARR2D"] = 66] = "GET_IARR2D";
    Cmd[Cmd["SET_IARR2D"] = 67] = "SET_IARR2D";
    Cmd[Cmd["GET_IARR3D"] = 68] = "GET_IARR3D";
    Cmd[Cmd["SET_IARR3D"] = 69] = "SET_IARR3D";
    Cmd[Cmd["SPUSH"] = 70] = "SPUSH";
    Cmd[Cmd["SCONCAT"] = 71] = "SCONCAT";
    Cmd[Cmd["SEQ"] = 72] = "SEQ";
    Cmd[Cmd["SNE"] = 73] = "SNE";
    Cmd[Cmd["SLT"] = 74] = "SLT";
    Cmd[Cmd["SLE"] = 75] = "SLE";
    Cmd[Cmd["SGT"] = 76] = "SGT";
    Cmd[Cmd["SGE"] = 77] = "SGE";
    Cmd[Cmd["GET_SVAR"] = 78] = "GET_SVAR";
    Cmd[Cmd["SET_SVAR"] = 79] = "SET_SVAR";
    Cmd[Cmd["GET_SARR1D"] = 80] = "GET_SARR1D";
    Cmd[Cmd["SET_SARR1D"] = 81] = "SET_SARR1D";
    Cmd[Cmd["GET_SARR2D"] = 82] = "GET_SARR2D";
    Cmd[Cmd["SET_SARR2D"] = 83] = "SET_SARR2D";
    Cmd[Cmd["GET_SARR3D"] = 84] = "GET_SARR3D";
    Cmd[Cmd["SET_SARR3D"] = 85] = "SET_SARR3D";
    Cmd[Cmd["APUSH_BARR1D"] = 86] = "APUSH_BARR1D";
    Cmd[Cmd["APUSH_BARR2D"] = 87] = "APUSH_BARR2D";
    Cmd[Cmd["APUSH_BARR3D"] = 88] = "APUSH_BARR3D";
    Cmd[Cmd["APUSH_FARR1D"] = 89] = "APUSH_FARR1D";
    Cmd[Cmd["APUSH_FARR2D"] = 90] = "APUSH_FARR2D";
    Cmd[Cmd["APUSH_FARR3D"] = 91] = "APUSH_FARR3D";
    Cmd[Cmd["APUSH_IARR1D"] = 92] = "APUSH_IARR1D";
    Cmd[Cmd["APUSH_IARR2D"] = 93] = "APUSH_IARR2D";
    Cmd[Cmd["APUSH_IARR3D"] = 94] = "APUSH_IARR3D";
    Cmd[Cmd["APUSH_SARR1D"] = 95] = "APUSH_SARR1D";
    Cmd[Cmd["APUSH_SARR2D"] = 96] = "APUSH_SARR2D";
    Cmd[Cmd["APUSH_SARR3D"] = 97] = "APUSH_SARR3D";
    Cmd[Cmd["INIT_BARR1D"] = 98] = "INIT_BARR1D";
    Cmd[Cmd["INIT_BARR2D"] = 99] = "INIT_BARR2D";
    Cmd[Cmd["INIT_BARR3D"] = 100] = "INIT_BARR3D";
    Cmd[Cmd["INIT_FARR1D"] = 101] = "INIT_FARR1D";
    Cmd[Cmd["INIT_FARR2D"] = 102] = "INIT_FARR2D";
    Cmd[Cmd["INIT_FARR3D"] = 103] = "INIT_FARR3D";
    Cmd[Cmd["INIT_IARR1D"] = 104] = "INIT_IARR1D";
    Cmd[Cmd["INIT_IARR2D"] = 105] = "INIT_IARR2D";
    Cmd[Cmd["INIT_IARR3D"] = 106] = "INIT_IARR3D";
    Cmd[Cmd["INIT_SARR1D"] = 107] = "INIT_SARR1D";
    Cmd[Cmd["INIT_SARR2D"] = 108] = "INIT_SARR2D";
    Cmd[Cmd["INIT_SARR3D"] = 109] = "INIT_SARR3D";
    Cmd[Cmd["JUMP"] = 110] = "JUMP";
    Cmd[Cmd["JUMP_IF_TRUE"] = 111] = "JUMP_IF_TRUE";
    Cmd[Cmd["JUMP_IF_FALSE"] = 112] = "JUMP_IF_FALSE";
    Cmd[Cmd["CALL_STDFUNC"] = 113] = "CALL_STDFUNC";
    Cmd[Cmd["CALL_USERFUNC"] = 114] = "CALL_USERFUNC";
    Cmd[Cmd["RET"] = 115] = "RET";
    Cmd[Cmd["PUSH_BLOCK"] = 116] = "PUSH_BLOCK";
    Cmd[Cmd["POP_BLOCK"] = 117] = "POP_BLOCK";
    Cmd[Cmd["PRINT"] = 118] = "PRINT";
    Cmd[Cmd["DRAW_LINE"] = 119] = "DRAW_LINE";
    Cmd[Cmd["SET_COLOR"] = 120] = "SET_COLOR";
    Cmd[Cmd["RANDOMIZE_TIME"] = 121] = "RANDOMIZE_TIME";
    Cmd[Cmd["RANDOMIZE_SEED"] = 122] = "RANDOMIZE_SEED";
    Cmd[Cmd["REQ_POINTER_EV"] = 123] = "REQ_POINTER_EV";
    Cmd[Cmd["GET_POINTER_EV"] = 124] = "GET_POINTER_EV";
    Cmd[Cmd["FLUSH"] = 125] = "FLUSH";
    Cmd[Cmd["TRANSFER"] = 126] = "TRANSFER";
    Cmd[Cmd["AWAIT"] = 127] = "AWAIT"; // AWAIT ( waitTime ) [...] => [...]
})(Cmd || (Cmd = {}));
export var StdFunc;
(function (StdFunc) {
    StdFunc[StdFunc["CBOOL_FROM_BOOLEAN"] = 0] = "CBOOL_FROM_BOOLEAN";
    StdFunc[StdFunc["CBOOL_FROM_FLOAT"] = 1] = "CBOOL_FROM_FLOAT";
    StdFunc[StdFunc["CBOOL_FROM_INTEGER"] = 2] = "CBOOL_FROM_INTEGER";
    StdFunc[StdFunc["CBOOL_FROM_STRING"] = 3] = "CBOOL_FROM_STRING";
    StdFunc[StdFunc["CFLOAT_FROM_BOOLEAN"] = 4] = "CFLOAT_FROM_BOOLEAN";
    StdFunc[StdFunc["CFLOAT_FROM_FLOAT"] = 5] = "CFLOAT_FROM_FLOAT";
    StdFunc[StdFunc["CFLOAT_FROM_INTEGER"] = 6] = "CFLOAT_FROM_INTEGER";
    StdFunc[StdFunc["CFLOAT_FROM_STRING"] = 7] = "CFLOAT_FROM_STRING";
    StdFunc[StdFunc["CINT_FROM_BOOLEAN"] = 8] = "CINT_FROM_BOOLEAN";
    StdFunc[StdFunc["CINT_FROM_FLOAT"] = 9] = "CINT_FROM_FLOAT";
    StdFunc[StdFunc["CINT_FROM_INTEGER"] = 10] = "CINT_FROM_INTEGER";
    StdFunc[StdFunc["CINT_FROM_STRING"] = 11] = "CINT_FROM_STRING";
    StdFunc[StdFunc["CSTR_FROM_BOOLEAN"] = 12] = "CSTR_FROM_BOOLEAN";
    StdFunc[StdFunc["CSTR_FROM_FLOAT"] = 13] = "CSTR_FROM_FLOAT";
    StdFunc[StdFunc["CSTR_FROM_INTEGER"] = 14] = "CSTR_FROM_INTEGER";
    StdFunc[StdFunc["CSTR_FROM_STRING"] = 15] = "CSTR_FROM_STRING";
    StdFunc[StdFunc["SIN"] = 16] = "SIN";
    StdFunc[StdFunc["COS"] = 17] = "COS";
    StdFunc[StdFunc["TAN"] = 18] = "TAN";
    StdFunc[StdFunc["ABS_FLOAT"] = 19] = "ABS_FLOAT";
    StdFunc[StdFunc["ABS_INTGER"] = 20] = "ABS_INTGER";
    StdFunc[StdFunc["SIGN_FLOAT"] = 21] = "SIGN_FLOAT";
    StdFunc[StdFunc["SIGN_INTEGER"] = 22] = "SIGN_INTEGER";
    StdFunc[StdFunc["MIN_FLOAT"] = 23] = "MIN_FLOAT";
    StdFunc[StdFunc["MIN_INTEGER"] = 24] = "MIN_INTEGER";
    StdFunc[StdFunc["MAX_FLOAT"] = 25] = "MAX_FLOAT";
    StdFunc[StdFunc["MAX_INTEGER"] = 26] = "MAX_INTEGER";
    StdFunc[StdFunc["POW"] = 27] = "POW";
    StdFunc[StdFunc["SQRT"] = 28] = "SQRT";
    StdFunc[StdFunc["FLOOR"] = 29] = "FLOOR";
    StdFunc[StdFunc["CEIL"] = 30] = "CEIL";
    StdFunc[StdFunc["SIZE_BARR1D"] = 31] = "SIZE_BARR1D";
    StdFunc[StdFunc["SIZE_BARR2D"] = 32] = "SIZE_BARR2D";
    StdFunc[StdFunc["SIZE_BARR3D"] = 33] = "SIZE_BARR3D";
    StdFunc[StdFunc["SIZE_FARR1D"] = 34] = "SIZE_FARR1D";
    StdFunc[StdFunc["SIZE_FARR2D"] = 35] = "SIZE_FARR2D";
    StdFunc[StdFunc["SIZE_FARR3D"] = 36] = "SIZE_FARR3D";
    StdFunc[StdFunc["SIZE_IARR1D"] = 37] = "SIZE_IARR1D";
    StdFunc[StdFunc["SIZE_IARR2D"] = 38] = "SIZE_IARR2D";
    StdFunc[StdFunc["SIZE_IARR3D"] = 39] = "SIZE_IARR3D";
    StdFunc[StdFunc["SIZE_SARR1D"] = 40] = "SIZE_SARR1D";
    StdFunc[StdFunc["SIZE_SARR2D"] = 41] = "SIZE_SARR2D";
    StdFunc[StdFunc["SIZE_SARR3D"] = 42] = "SIZE_SARR3D";
    StdFunc[StdFunc["SEL_BOOLEAN"] = 43] = "SEL_BOOLEAN";
    StdFunc[StdFunc["SEL_FLOAT"] = 44] = "SEL_FLOAT";
    StdFunc[StdFunc["SEL_INTEGER"] = 45] = "SEL_INTEGER";
    StdFunc[StdFunc["SEL_STRING"] = 46] = "SEL_STRING";
    StdFunc[StdFunc["RANDOM"] = 47] = "RANDOM";
    StdFunc[StdFunc["LOG"] = 48] = "LOG";
    StdFunc[StdFunc["LOG2"] = 49] = "LOG2";
    StdFunc[StdFunc["LOG10"] = 50] = "LOG10";
    StdFunc[StdFunc["WIDTH"] = 51] = "WIDTH";
    StdFunc[StdFunc["HEIGHT"] = 52] = "HEIGHT";
})(StdFunc || (StdFunc = {}));
export default {};
