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

        const offset = Math.round((j * _width + i)) * 4

        data.push(_data[offset], _data[offset + 1], _data[offset + 2], _data[offset + 3])
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
