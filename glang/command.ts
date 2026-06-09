//
// Command
//

export class Prgoram {
    readonly program: Readonly<number[]>;
    readonly litStr: Readonly<string[]>;

    constructor(program: number[], litStr: string[]) {
        this.program = program;
        this.litStr = litStr;
    }

    toString(): string {
        return `Program{ size: ${this.program.length}, litStr: ${this.litStr.length} }`;
    }
}

export enum Cmd {
    NOP,           // NOP ()
    END,           // END ()
    DUP,           // DUP () [..., value1-any] => [..., value1-any, value1-any] : copy value1
    BPUSH_TRUE,    // BPUSH_TRUE () [...] => [..., true]
    BPUSH_FALSE,   // BPUSH_FALSE () [...] => [..., false]
    BNOT,          // BNOT () [..., value-boolean] => [..., not-boolean] : logical-not value
    BAND,          // BAND () [..., left-boolean, right-booloan] => [..., and-boolean] : left logical-and right
    BOR,           // BOR ()  [..., left-boolean, right-boolean] => [..., or-boolean] : left logical-or right
    BEQ,           // BEQ ()  [..., left-boolean, right-boolean] => [..., eq-boolean] : left == right
    BNE,           // BNE ()  [..., left-boolean, right-boolean] => [..., ne-boolean] : left != right
    GET_BVAR,      // GET_BVAR ( blockId, blockVarId ) [...] => [..., value-boolean] : load value from var
    SET_BVAR,      // SET_BVAR ( blockId, blockVarId ) [..., value-boolean] => [...] : store value into var
    GET_BARR1D,    // GET_BARR1D ( blockId, blockVarId ) [..., index1-integer] => [..., value-boolean] : load value from arr[index1]
    SET_BARR1D,    // SET_BARR1D ( blockId, blockVarId ) [..., value-boolean, index1-integer] => [...] : store value into arr[index1]
    GET_BARR2D,    // GET_BARR2D ( blockId, blockVarId ) [..., index1-integer, index2-integer] => [..., value-boolean] : load value from arr[index1][index2]
    SET_BARR2D,    // SET_BARR2D ( blockId, blockVarId ) [..., value-boolean, index1-integer, index2-integer] => [...] : store value into arr[index1][index2]
    GET_BARR3D,    // GET_BARR3D ( blockId, blockVarId ) [..., index1-integer, index2-integer, index3-integer] => [..., value-boolean] : load value from arr[index1][index2][index3]
    SET_BARR3D,    // SET_BARR3D ( blockId, blockVarId ) [..., value-boolean, index1-integer, index2-integer, index3-integer] => [...] : store value into arr[index1][index2][index3]
    FPUSH,         // FPUSH ( floatValue ) [...] => [..., floatValue-float]
    FADD,
    FSUB,
    FMUL,
    FDIV,
    FNEGA,
    FEQ,
    FNE,
    FLT,
    FLE,
    FGT,
    FGE,
    GET_FVAR,
    SET_FVAR,
    GET_FARR1D,
    SET_FARR1D,
    GET_FARR2D,
    SET_FARR2D,
    GET_FARR3D,
    SET_FARR3D,
    IPUSH,       // IPUSH ( intValue ) [...] => [..., intValue-integer]
    IADD,        // IADD () [..., left-integer, right-integer] => [..., add-integer] : left + right
    ISUB,        // ISUB () [..., left-integer, right-integer] => [..., sub-integer] : left - right
    IMUL,        // IMUL () [..., left-integer, right-integer] => [..., mul-integer] : left * right
    IDIV,        // IDIV () [..., left-integer, right-integer] => [..., div-integer] : left \ right
    IMOD,        // IMOD () [..., left-integer, right-integer] => [..., mod-integer] : left % right
    INEGA,       // INEGA () [..., value-integer] => [..., negatived-integer] : - value
    IASHIFTL,    // IASHIFTL () [..., left-integer, right-integer] => [..., asl-integer] : left << right (keep sign bit)
    IASHIFTR,    // IASHIFTR () [..., left-integer, right-integer] => [..., asr-integer] : left >> right (keep sign bit and copy sign bit)
    ILSHIFTL,    // ILSHIFTL () [..., left-integer, right-integer] => [..., lsl-integer] : left <<< right (as unsigned)
    ILSHIFTR,    // ILSHIFTL () [..., left-integer, right-integer] => [..., lsr-integer] : left >>> right (as unsigned)
    INOT,
    IAND,
    IOR,
    IXOR,
    IEQ,          // IEQ () [..., left-integer, right-integer] => [..., eq-boolean] : left == right
    INE,          // INE () [..., left-integer, right-integer] => [..., ne-boolean] : left != right
    ILT,          // ILT () [..., left-integer, right-integer] => [..., lt-boolean] : left <  right
    ILE,          // ILE () [..., left-integer, right-integer] => [..., le-boolean] : left <= right
    IGT,          // IGT () [..., left-integer, right-integer] => [..., gt-boolean] : left >  right
    IGE,          // IGE () [..., left-integer, right-integer] => [..., ge-boolean] : left >= right
    GET_IVAR,
    SET_IVAR,
    GET_IARR1D,
    SET_IARR1D,
    GET_IARR2D,
    SET_IARR2D,
    GET_IARR3D,
    SET_IARR3D,
    SPUSH,        // SPUSH ( strLiteralId ) [...] => [..., lit-string] : load string from literal-pool
    SCONCAT,      // SCONCAT () [..., left-string, right-string] => [..., concat-string] : left + right
    SEQ,          // SEQ () [..., left-string, right-string] => [..., eq-boolean] : left == right
    SNE,          // SNE () [..., left-string, right-string] => [..., ne-boolean] : left != right
    SLT,          // SLT () [..., left-string, right-string] => [..., lt-boolean] : left <  right
    SLE,          // SLE () [..., left-string, right-string] => [..., le-boolean] : left <= right
    SGT,          // SGT () [..., left-string, right-string] => [..., gt-boolean] : left >  right
    SGE,          // SGE () [..., left-string, right-string] => [..., ge-boolean] : left >= right
    GET_SVAR,     // GET_SVAR ( blockId, blockVarId ) => [...] => [..., value-string] : load value from var
    SET_SVAR,     // SET_SVAR ( blockId, blockVarId ) => [..., value-string] => [...] : store value into var
    GET_SARR1D,
    SET_SARR1D,
    GET_SARR2D,
    SET_SARR2D,
    GET_SARR3D,
    SET_SARR3D,
    APUSH_BARR1D,  // APUSH_BARR1D ( blockId, blockVarId ) [...] => [..., blockId-integer, blockVarId-integer]
    APUSH_BARR2D,  // APUSH_BARR2D ( blockId, blockVarId ) [...] => [..., blockId-integer, blockVarId-integer]
    APUSH_BARR3D,  // APUSH_BARR3D ( blockId, blockVarId ) [...] => [..., blockId-integer, blockVarId-integer]
    APUSH_FARR1D,
    APUSH_FARR2D,
    APUSH_FARR3D,
    APUSH_IARR1D,
    APUSH_IARR2D,
    APUSH_IARR3D,
    APUSH_SARR1D,
    APUSH_SARR2D,
    APUSH_SARR3D,
    JUMP,           // JUMP ( address )
    JUMP_IF_TRUE,   // JUMP_IF_TRUE ( address ) [..., value-boolean] => [...] : consume value. jump to address if value is true
    JUMP_IF_FALSE,  // JUMP_IF_FALSE ( address ) [..., value-boolean] => [...] : consume value. jump to address if value is false
    CALL_STDFUNC,   // CALL_STDFUNC ( stdfuncId ) [..., { arg1-any, arg2-any, ... argN-any } ] => [..., { retvalue-any } ] : call func(arg1,arg2,... argN). args or retvalue if exists
    CALL_USERFUNC,  // CALL_USERFUNC ( userfuncId ) [..., { arg1-any, arg2-any, ... argN-any } ] => [..., { retvalue-any } ] : call func(arg1,arg2,... argN). args or retvalue if exists
    INIT_BARR1D,    // INIT_BARR1D ( blockId, blockVarId, size1 ) : allocate arr[size1] and fill false
    INIT_BARR2D,    // INIT_BARR1D ( blockId, blockVarId, size1, size2 ) : allocate arr[size1][size2] and fill false
    INIT_BARR3D,    // INIT_BARR1D ( blockId, blockVarId, size1, size2, size3 ) : allocate arr[size1][size2][size3] and fill false
    INIT_FARR1D,    // INIT_FARR1D ( blockId, blockVarId, size1 ) : allocate arr[size1] and fill 0.0
    INIT_FARR2D,
    INIT_FARR3D,
    INIT_IARR1D,    // INIT_IARR1D ( blockId, blockVarId, size1 ) : allocate arr[size1] and fill 0
    INIT_IARR2D,
    INIT_IARR3D,
    INIT_SARR1D,    // INIT_SARR1D ( blockId, blockVarId, size1 ) : allocate arr[size1] and fill ""
    INIT_SARR2D,
    INIT_SARR3D,
    PUSH_BLOCK,   // PUSH_BLOCK ( blockId, blockVarCount ) : push new block to Id's blockStack and reserve var area
    POP_BLOCK,    // POP_BLOCK ( blockId ) : pop block from Id's blockStack
    RET,          // RET ()
}

export enum StdFunc {
    CBOOL_FROM_FLOAT,
    CBOOL_FROM_INTEGER,
    CBOOL_FROM_STRING,
    CFLOAT_FROM_BOOLEAN,
    CFLOAT_FROM_INTEGER,
    CFLOAT_FROM_STRING,
    CINT_FROM_BOOLEAN,
    CINT_FROM_FLOAT,
    CINT_FROM_STRING,
    CSTR_FROM_BOOLEAN,
    CSTR_FROM_FLOAT,
    CSTR_FROM_INTEGER,
    SIN,
    COS,
    TAN,
    ABS,
    SIGN,
    MIN,
    MAX,
    POW,
    SQRT,
    FLOOR,
    CEIL,
    SIZE,
    SEL,
}

export class Program {
    readonly commands: Readonly<Cmd[]>;

    constructor(commands: Cmd[]) {
        this.commands = commands;
    }
}

export default {};
