//
// Code
// 

export enum Vtype {
    VOID            = 1 << 0,
    BOOLEAN         = 1 << 1,
    INTEGER         = 1 << 2,
    FLOATING_POINT  = 1 << 3,
    STRING          = 1 << 4,
    ARRAY           = 1 << 5,
    ARRAY_2D        = 2 << 5,  // === (1 << 6)
    ARRAY_3D        = 3 << 5,  // === (1 << 5) | (1 << 6)
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
    STR_ARRAY_3D    = STRING | ARRAY_3D
}

export enum CodeKind {
    BLOCK,
    DIM,
}

export class Code {
    #kind: CodeKind;

    constructor(kind: CodeKind) {
        this.#kind = kind;
    }

    get kind(): CodeKind {
        return this.#kind;
    }
}

export class CBlock extends Code {
    static #idCount = 0;
    static ResetIdCount() {
        CBlock.#idCount = 0;
    }

    readonly id: number;

    constructor() {
        super(CodeKind.BLOCK);
        this.id = CBlock.#idCount++;
    }

}

export class CDim extends Code {
    readonly blockId: number;
    readonly name: string;
    readonly vtype: Vtype;
    readonly dims: readonly number[];

    constructor(blockId: number, name: string, vtype: Vtype, dims: number[]) {
        super(CodeKind.DIM);
        this.blockId = blockId;
        this.name = name;
        this.vtype = vtype;
        this.dims = dims;
    }
}


export default {};
