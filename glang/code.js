//
// Code
// 
export var Vtype;
(function (Vtype) {
    Vtype[Vtype["VOID"] = 1] = "VOID";
    Vtype[Vtype["BOOLEAN"] = 2] = "BOOLEAN";
    Vtype[Vtype["INTEGER"] = 4] = "INTEGER";
    Vtype[Vtype["FLOATING_POINT"] = 8] = "FLOATING_POINT";
    Vtype[Vtype["STRING"] = 16] = "STRING";
    Vtype[Vtype["ARRAY"] = 32] = "ARRAY";
    Vtype[Vtype["ARRAY_2D"] = 64] = "ARRAY_2D";
    Vtype[Vtype["ARRAY_3D"] = 96] = "ARRAY_3D";
    Vtype[Vtype["PRIMITIVE_TYPE"] = 30] = "PRIMITIVE_TYPE";
    Vtype[Vtype["NUMBER_TYPE"] = 12] = "NUMBER_TYPE";
    Vtype[Vtype["ARRAY_TYPE"] = 96] = "ARRAY_TYPE";
    Vtype[Vtype["BOOL_ARRAY"] = 34] = "BOOL_ARRAY";
    Vtype[Vtype["BOOL_ARRAY_2D"] = 66] = "BOOL_ARRAY_2D";
    Vtype[Vtype["BOOL_ARRAY_3D"] = 98] = "BOOL_ARRAY_3D";
    Vtype[Vtype["INT_ARRAY"] = 36] = "INT_ARRAY";
    Vtype[Vtype["INT_ARRAY_2D"] = 68] = "INT_ARRAY_2D";
    Vtype[Vtype["INT_ARRAY_3D"] = 100] = "INT_ARRAY_3D";
    Vtype[Vtype["FLOAT_ARRAY"] = 40] = "FLOAT_ARRAY";
    Vtype[Vtype["FLOAT_ARRAY_2D"] = 72] = "FLOAT_ARRAY_2D";
    Vtype[Vtype["FLOAT_ARRAY_3D"] = 104] = "FLOAT_ARRAY_3D";
    Vtype[Vtype["STR_ARRAY"] = 48] = "STR_ARRAY";
    Vtype[Vtype["STR_ARRAY_2D"] = 80] = "STR_ARRAY_2D";
    Vtype[Vtype["STR_ARRAY_3D"] = 112] = "STR_ARRAY_3D";
})(Vtype || (Vtype = {}));
export var CodeKind;
(function (CodeKind) {
    CodeKind[CodeKind["BLOCK"] = 0] = "BLOCK";
    CodeKind[CodeKind["DIM"] = 1] = "DIM";
})(CodeKind || (CodeKind = {}));
export class Code {
    #kind;
    constructor(kind) {
        this.#kind = kind;
    }
    get kind() {
        return this.#kind;
    }
}
export class CBlock extends Code {
    static #idCount = 0;
    static ResetIdCount() {
        CBlock.#idCount = 0;
    }
    #id;
    constructor() {
        super(CodeKind.BLOCK);
        this.#id = CBlock.#idCount++;
    }
    get id() {
        return this.#id;
    }
}
export class CDim extends Code {
    #blockId;
    #name;
    #vtype;
    #dims;
    constructor(blockId, name, vtype, dims) {
        super(CodeKind.DIM);
        this.#blockId = blockId;
        this.#name = name;
        this.#vtype = vtype;
        this.#dims = dims;
    }
    get blockId() {
        return this.#blockId;
    }
    get name() {
        return this.#name;
    }
    get vtype() {
        return this.#vtype;
    }
    get dims() {
        return this.#dims;
    }
}
export default {};
