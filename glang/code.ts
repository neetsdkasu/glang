//
// Code
// 

import { Token } from "scanner";

export enum Vtype {
    NONE            = 0,
    VOID            = 1 << 0,
    BOOLEAN         = 1 << 1,
    INTEGER         = 1 << 2,
    FLOATING_POINT  = 1 << 3,
    STRING          = 1 << 4,
    ARRAY           = 1 << 5,
    ARRAY_2D        = 2 << 5,  // === (1 << 6)
    ARRAY_3D        = 3 << 5,  // === (1 << 5) | (1 << 6)
    SUB             = 1 << 7,
    FUNC            = 1 << 8,
    REFERENCE       = 1 << 9,
    INFER           = 1 << 10,
    PRIMITIVE_TYPE  = BOOLEAN | INTEGER | FLOATING_POINT | STRING,
    NUMBER_TYPE     = INTEGER | FLOATING_POINT,
    ARRAY_TYPE      = ARRAY | ARRAY_2D | ARRAY_3D,
    BOOL_ARRAY      = BOOLEAN | ARRAY,
    BOOL_ARRAY_2D   = BOOLEAN | ARRAY_2D,
    BOOL_ARRAY_3D   = BOOLEAN | ARRAY_3D,
    INT_ARRAY       = INTEGER | ARRAY,
    INT_ARRAY_2D    = INTEGER | ARRAY_2D,
    INT_ARRAY_3D    = INTEGER | ARRAY_3D,
    FLOAT_ARRAY     = FLOATING_POINT | ARRAY,
    FLOAT_ARRAY_2D  = FLOATING_POINT | ARRAY_2D,
    FLOAT_ARRAY_3D  = FLOATING_POINT | ARRAY_3D,
    STR_ARRAY       = STRING | ARRAY,
    STR_ARRAY_2D    = STRING | ARRAY_2D,
    STR_ARRAY_3D    = STRING | ARRAY_3D,
    INFER_PRIMITIVE = INFER | PRIMITIVE_TYPE,
    INFER_NUMBER    = INFER | NUMBER_TYPE
}

export class NameInfo {
    readonly src: Token;
    readonly name: string;
    readonly vtype: Vtype;
    readonly varId: number;
    readonly blockId: number;
    readonly blockVarId: number;
    constructor(src: Token, name: string, vtype: Vtype, varId: number, blockId: number, blockVarId: number) {
        this.src = src;
        this.name = name;
        this.vtype = vtype;
        this.varId = varId;
        this.blockId = blockId;
        this.blockVarId = blockVarId;
    }
}

export enum CodeKind {
    BLOCK,
    DIM,
}

export class Code {
    readonly kind: CodeKind;
    readonly src: readonly Token[];

    constructor(kind: CodeKind, src: Token[]) {
        this.kind = kind;
        this.src = src;
    }
}

export class Block extends Code {
    readonly id: number;
    readonly body: Code[];

    constructor(src: Token[], id: number, body: Code[]) {
        super(CodeKind.BLOCK, src);
        this.id = id;
        this.body = body;
    }
}

export class Dim extends Code {
    readonly nameInfo: NameInfo;
    readonly dims: readonly number[];

    constructor(src: Token[], nameInfo: NameInfo, dims: number[]) {
        super(CodeKind.DIM, src);
        this.nameInfo = nameInfo;
        this.dims = dims;
    }
}


export default {};
