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
    Vtype[Vtype["SUB"] = 128] = "SUB";
    Vtype[Vtype["FUNC"] = 256] = "FUNC";
    Vtype[Vtype["UNKNOWN"] = 512] = "UNKNOWN";
    Vtype[Vtype["INFER"] = 1024] = "INFER";
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
    Vtype[Vtype["INFER_PRIMITIVE"] = 1054] = "INFER_PRIMITIVE";
    Vtype[Vtype["INFER_NUMBER"] = 1036] = "INFER_NUMBER";
})(Vtype || (Vtype = {}));
export class NameInfo {
    src;
    name;
    vtype;
    varId;
    blockId;
    blockVarId;
    constructor(src, name, vtype, varId, blockId, blockVarId) {
        this.src = src;
        this.name = name;
        this.vtype = vtype;
        this.varId = varId;
        this.blockId = blockId;
        this.blockVarId = blockVarId;
    }
}
export var CodeKind;
(function (CodeKind) {
    CodeKind[CodeKind["BLOCK"] = 0] = "BLOCK";
    CodeKind[CodeKind["DIM"] = 1] = "DIM";
})(CodeKind || (CodeKind = {}));
export class Code {
    kind;
    src;
    constructor(kind, src) {
        this.kind = kind;
        this.src = src;
    }
}
export class Block extends Code {
    id;
    body;
    constructor(src, id, body) {
        super(CodeKind.BLOCK, src);
        this.id = id;
        this.body = body;
    }
}
export class Dim extends Code {
    nameInfo;
    dims;
    constructor(src, nameInfo, dims) {
        super(CodeKind.DIM, src);
        this.nameInfo = nameInfo;
        this.dims = dims;
    }
}
export default {};
