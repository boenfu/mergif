import type { Matrix } from 'transformation-matrix'
import {
  applyToPoint,
  compose,
  flipX,
  flipY,
  inverse,
  rotate,
  rotateDEG,
  scale,
  smoothMatrix,
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
    private _data: number[],
    private _width: number,
    private _height: number,
  ) {}

  scale(sx: number, sy?: number): Frame {
    this._matrix = compose(this._matrix, scale(sx, sy, this._width / 2, this._height / 2))
    return this
  }

  flipX(): Frame {
    this._matrix = compose(this._matrix, flipX())
    return this
  }

  flipY(): Frame {
    this._matrix = compose(this._matrix, flipY())
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

  apply(): Frame {
    const { _matrix, width, height } = this

    if (this._matrix === INIT_MATRIX)
      return this

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

        // 最近邻插值
        data.push(...getRGBA(this, Math.round(j), Math.round(i)))
      }
    }

    this._data = data
    this._width = newWidth
    this._height = newHeight
    this._matrix = INIT_MATRIX

    return this
  }

  clone(): Frame {
    return Frame.clone(this)
  }

  merge(frame: Frame, params: {
    x?: number
    y?: number
    isTransparent?: (rgba: number[]) => boolean
  } = {}): Frame {
    return Frame.merge({ frame: this }, { frame, ...params })
  }

  exec(fn: (_this: Frame) => void | Frame): Frame {
    return fn(this) || this
  }

  static fromImageData(data: ImageData): Frame {
    return new Frame([...data.data], data.width, data.height)
  }

  static fromFrameRGBA(
    data: Uint8ClampedArray | number[],
    width: number,
    height: number = Math.floor(data.length / 4 / width),
  ) {
    return new Frame([...data], width, height)
  }

  static fromRectangle(width: number, height: number, fill: number | [number, number, number] = 0) {
    const size = width * height
    const data: number[] = []

    const color = Array.isArray(fill) ? fill : [fill, fill, fill]

    for (let i = 0; i < size; i += 1)
      data.push(...color, 255)

    return new Frame(data, width, height)
  }

  static clone(
    frame: Frame,
  ) {
    frame = frame.apply()
    return new Frame([...frame.data], frame.width, frame.height)
  }

  static merge(...[source, ...frames]: [{
    frame: Frame
  }, ...{
    frame: Frame
    x?: number
    y?: number
    isTransparent?: (rgba: number[]) => boolean
  }[]]) {
    const { width: sourceWidth, height: sourceHeight, data: _sourceData } = source.frame.apply()
    const sourceData = [..._sourceData]

    for (let { frame, x = 0, y = 0, isTransparent } of frames) {
      x = Math.round(x)
      y = Math.round(y)

      const { width, height, data } = frame.apply()

      const offset = (y * sourceWidth + x)

      const rw = Math.min(x + width, sourceWidth) - x
      const rh = Math.min(y + height, sourceHeight) - y

      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < rw; i++) {
          const index = (offset + j * sourceWidth + i) * 4
          const rgba = getRGBA({ width, height, data }, j, i)

          if (isTransparent?.(rgba))
            continue

          sourceData[index] = rgba[0]
          sourceData[index + 1] = rgba[1]
          sourceData[index + 2] = rgba[2]
          sourceData[index + 3] = rgba[3]
        }
      }
    }

    return new Frame(sourceData, sourceWidth, sourceHeight)
  }
}

function getRGBA({ data, width, height }: {
  data: number[]
  width: number
  height: number
}, row: number, col: number) {
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
