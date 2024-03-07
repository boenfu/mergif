import type { Matrix } from 'transformation-matrix'
import {
  applyToPoint,
  compose,
  inverse,
  rotate,
  rotateDEG,
  scale,
  smoothMatrix,
  translate,
} from 'transformation-matrix'

const INIT_MATRIX = {
  a: 1,
  c: 0,
  e: 0,
  b: 0,
  d: 1,
  f: 0,
}

export class Frame {
  get data() {
    return this._data
  }

  get width() {
    return this._width
  }

  get height() {
    return this._height
  }

  private _matrix: Matrix = INIT_MATRIX

  constructor(
    private _data: Uint8ClampedArray,
    private _width: number,
    private _height: number,
  ) {}

  scale(sx: number, sy?: number): Frame {
    this._matrix = compose(this._matrix, scale(sx, sy, this._width / 2, this._height / 2))
    return this
  }

  rotate(angle: number): Frame {
    this._matrix = compose(this._matrix, rotate(angle, this._width / 2, this._height / 2))
    return this
  }

  rotateDEG(angle: number): Frame {
    this._matrix = compose(this._matrix, rotateDEG(angle, this._width / 2, this._height / 2))
    return this
  }

  translate(tx: number, ty?: number): Frame {
    this._matrix = compose(this._matrix, translate(tx, ty))
    return this
  }

  apply(): Frame {
    const { _matrix, width, height } = this

    const matrix = smoothMatrix(_matrix)

    const [x00, y00] = applyToPoint(matrix, [0, 0])
    const [x01, y01] = applyToPoint(matrix, [0, height])
    const [x10, y10] = applyToPoint(matrix, [width, 0])
    const [x11, y11] = applyToPoint(matrix, [width, height])

    const newX = Math.min(x00, x01, x10, x11)
    const newY = Math.min(y00, y01, y10, y11)
    const newWidth = Math.round(Math.max(x00, x01, x10, x11) - Math.min(x00, x01, x10, x11))
    const newHeight = Math.round(Math.max(y00, y01, y10, y11) - Math.min(y00, y01, y10, y11))

    const inverseMatrix = smoothMatrix(inverse(matrix))

    const data: number[] = []

    for (let row = 0; row < newHeight; row++) {
      for (let col = 0; col < newWidth; col++) {
        const x = newX + col
        const y = newY + row

        const [i, j] = applyToPoint(inverseMatrix, [x, y])

        const ix = Math.floor(i)
        const iy = Math.floor(j)

        // 权重
        const u = i - ix
        const v = j - iy

        const u1 = 1 - u
        const v1 = 1 - v

        const rgba00 = getRGBA(this, iy + 0, ix + 0)
        const rgba01 = getRGBA(this, iy + 0, ix + 1)
        const rgba10 = getRGBA(this, iy + 1, ix + 0)
        const rgba11 = getRGBA(this, iy + 1, ix + 1)

        for (let i = 0; i <= 3; i += 1) {
          const a = (rgba00[i] * u1) + (rgba01[i] * u)
          const b = (rgba10[i] * u1) + (rgba11[i] * u)
          const c = (a * v1) + (b * v)

          // 向下取整
          data.push(Math.floor(c))
        }
      }
    }

    this._data = Uint8ClampedArray.from(data)
    this._width = newWidth
    this._height = newHeight
    this._matrix = INIT_MATRIX

    return this
  }

  static fromImageData(data: ImageData): Frame {
    return new Frame(data.data, data.width, data.height)
  }

  static fromFrameRGBA(
    data: Uint8ClampedArray,
    width: number,
    height: number = Math.floor(data.length / 4 / width),
  ) {
    return new Frame(data, width, height)
  }
}

function getRGBA({ data, width, height }: Omit<ImageData, 'colorSpace'>, row: number, col: number) {
  // 边界值处理
  row = Math.max(0, Math.min(row, height - 1))
  col = Math.max(0, Math.min(col, width - 1))

  const offset = ((row * width) + col) * 4

  return [
    data[offset + 0],
    data[offset + 1],
    data[offset + 2],
    data[offset + 3],
  ]
}
