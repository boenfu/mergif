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

  private _matrixes: Matrix = INIT_MATRIX

  constructor(
    private _data: Uint8ClampedArray,
    private _width: number,
    private _height: number,
  ) {}

  scale(sx: number, sy?: number): Frame {
    this._matrixes = compose(this._matrixes, scale(sx, sy, this._width / 2, this._height / 2))
    return this
  }

  rotate(angle: number): Frame {
    this._matrixes = compose(this._matrixes, rotate(angle, this._width / 2, this._height / 2))
    return this
  }

  rotateDEG(angle: number): Frame {
    this._matrixes = compose(this._matrixes, rotateDEG(angle, this._width / 2, this._height / 2))
    return this
  }

  translate(tx: number, ty?: number): Frame {
    this._matrixes = compose(this._matrixes, translate(tx, ty))
    return this
  }

  apply(): Frame {
    const { _matrixes, _data, _width, _height } = this

    const [x00, y00] = applyToPoint(smoothMatrix(_matrixes), [0, 0])
    const [x01, y01] = applyToPoint(smoothMatrix(_matrixes), [0, _height])
    const [x10, y10] = applyToPoint(smoothMatrix(_matrixes), [_width, 0])
    const [x11, y11] = applyToPoint(smoothMatrix(_matrixes), [_width, _height])

    const nw = Math.round(Math.max(x00, x01, x10, x11) - Math.min(x00, x01, x10, x11))
    const nh = Math.round(Math.max(y00, y01, y10, y11) - Math.min(y00, y01, y10, y11))

    const data: number[] = []

    for (let x = 0; x < nw; x++) {
      for (let y = 0; y < nh; y++) {
        const [i, j] = applyToPoint(smoothMatrix(inverse(_matrixes)), [x, y])

        const ix = Math.floor(i)
        const iy = Math.floor(j)

        // 权重
        const u = i - ix
        const v = j - iy

        const u1 = 1 - u
        const v1 = 1 - v

        const offset = ((x * _width) + y) * 4

        const rgba00 = getRGBA(this, iy + 0, ix + 0)
        const rgba01 = getRGBA(this, iy + 0, ix + 1)
        const rgba10 = getRGBA(this, iy + 1, ix + 0)
        const rgba11 = getRGBA(this, iy + 1, ix + 1)

        for (let i = 0; i <= 3; i += 1) {
          const a = (rgba00[i] * u1) + (rgba01[i] * u)
          const b = (rgba10[i] * u1) + (rgba11[i] * u)
          const c = (a * v1) + (b * v)

          // 向下取整
          data[offset + i] = Math.floor(c)
        }
      }
    }

    this._data = Uint8ClampedArray.from(data)
    this._width = nw
    this._height = nh

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
