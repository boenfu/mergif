import type { Frame as FrameInfo, GifBinary } from 'omggif'
import { GifReader, GifWriter } from 'omggif'
import EventEmitter from 'eventemitter3'

import { Frame } from './frame'

export interface GIFMergeItem {
  // MIME type image/gif
  type: string
  id: number
  label?: string
  binary: GifBinary
  left: number
  top: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  angle: number
  zIndex: number
  /**
   * @unit 10 ms
   */
  offsetTime: number
  /**
   * @unit 10 ms
   */
  totalTime: number
  /**
   * 自身播放完成后是否循环
   * true: 循环
   * false: 停在最后一帧
   */
  loop: boolean
  reader: GifReader
}

export interface GIFMergerEvents {
  change: (items: GIFMergeItem[]) => void
  canvasChange: (canvas: GIFMergerCanvas) => void
}

export interface GIFMergerCanvas {
  width: number
  height: number
}

export class GIFMerger extends EventEmitter<GIFMergerEvents> {
  private _currentId = 0
  private get idGenerator() { return this._currentId++ }

  private _itemsMap: Map<number, GIFMergeItem> = new Map()
  get items() { return [...this._itemsMap.values()] }

  canvas: GIFMergerCanvas | undefined

  constructor(gifList?: (Pick<GIFMergeItem, 'type' | 'binary'> & Partial<GIFMergeItem>)[]) {
    super()

    if (gifList)
      this.append(...gifList)

    this.handleCanvasCreate()
  }

  append(...gifList: (Pick<GIFMergeItem, 'type' | 'binary'> & Partial<GIFMergeItem>)[]) {
    if (!gifList.length)
      return

    const startZIndex = Math.max(...this.items.map(({ zIndex }) => zIndex), 0)

    for (const { binary, ...item } of gifList) {
      const id = this.idGenerator
      const reader = new GifReader(binary)

      this._itemsMap.set(id, {
        id,
        binary,
        left: 0,
        top: 0,
        width: reader.width,
        height: reader.width,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        zIndex: startZIndex + 1,
        reader,
        offsetTime: 0,
        totalTime: reader.numFrames() * reader.frameInfo(0).delay,
        loop: false,
        ...item,
      })
    }

    this.emit('change', this.items)
  }

  remove(id: number) {
    if (!this._itemsMap.has(id))
      return

    this._itemsMap.delete(id)
    this.emit('change', this.items)
  }

  reset() {
    this._itemsMap.clear()
    this.canvas = undefined
    this.emit('change', this.items)
  }

  modify(id: number, data: Partial<GIFMergeItem>) {
    if (!this._itemsMap.has(id))
      return

    this._itemsMap.set(id, { ...this._itemsMap.get(id)!, ...data })
    this.emit('change', this.items)
  }

  getFirstFrame(id: number): FrameInfo & { data: Uint8ClampedArray } | undefined {
    const reader = this._itemsMap.get(id)?.reader

    if (!reader)
      return

    const frameData = new Uint8ClampedArray(reader.width * reader.height * 4)
    reader.decodeAndBlitFrameRGBA(0, frameData)

    return { ...reader.frameInfo(0), data: frameData }
  }

  async generateGIF(): Promise<Uint8ClampedArray | undefined> {
    const canvas = this.canvas

    if (!canvas)
      return

    const { width, height } = canvas
    const items = this.items.sort((itemA, itemB) => itemA.zIndex - itemB.zIndex)

    const imageData: number[] = []
    const gf = new GifWriter(imageData, width, height, {})

    // 取最晚结束的作为总时间
    const totalTime = Math.max(...items.map(item => item.offsetTime + item.totalTime))
    // 取最小的延迟作为新图片延迟
    const delayTime = Math.min(...items.map(item => item.reader.frameInfo(0).delay))

    const disposalSet = new Set(items.map(item => item.reader.frameInfo(0).disposal))
    const isSameDisposal = disposalSet.size === 1
    const disposal = isSameDisposal ? [...disposalSet][0] : 2

    let currentTime = 0

    const lastFrameMap = new Map<number, Frame>()

    while (currentTime <= totalTime) {
      let source = Frame.fromRectangle(width, height)

      let transparent!: number | null

      for (const { id, reader, left, top, scaleX, scaleY, angle, binary, loop, offsetTime } of items) {
        if (currentTime < offsetTime)
          continue

        let frameIndex = Math.round((currentTime - offsetTime) / reader.frameInfo(0).delay)

        if (loop)
          frameIndex = frameIndex % reader.numFrames()
        else
          frameIndex = Math.min(frameIndex, reader.numFrames() - 1)

        const { disposal, palette_offset, transparent_index } = reader.frameInfo(frameIndex)

        if (typeof transparent === 'undefined')
          transparent = transparent_index

        // TODO(boen): interlaced

        const transparentOffset = (palette_offset ?? 0) + (transparent_index ?? 0) * 3
        const transparentColor = [
          binary[transparentOffset],
          binary[transparentOffset + 1],
          binary[transparentOffset + 2],
        ]

        const frameData = new Uint8ClampedArray(reader.width * reader.height * 4)
        reader.decodeAndBlitFrameRGBA(frameIndex, frameData)

        const frame = Frame
          .fromFrameRGBA(frameData, reader.width, reader.height)
          .exec((frame) => {
            if (isSameDisposal || disposal !== 1)
              return frame

            if (lastFrameMap.has(id)) {
              frame = lastFrameMap.get(id)!.merge(frame, {
                transparent: transparentColor,
              })
            }

            lastFrameMap.set(id, frame.clone())

            return frame
          })
          .scale(scaleX, scaleY)
          .rotateDEG(angle)
          .apply()

        source = source.merge(frame, {
          x: left,
          y: top,
          transparent: transparentColor,
        })
      }

      const indexed_pixels: number[] = []
      const pam = new Map<number, number>()

      for (let index = 0; index <= source.data.length; index += 1) {
        const color
        = (source.data[index * 4] << 16)
        | (source.data[index * 4 + 1] << 8)
        | source.data[index * 4 + 2]

        if (!pam.has(color))
          pam.set(color, pam.size)

        indexed_pixels.push(pam.get(color)!)
      }

      gf.addFrame(0, 0, source.width, source.height, indexed_pixels, {
        delay: delayTime,
        transparent: transparent ?? undefined,
        disposal,
        palette: [...pam.keys()].concat(Array(256).fill(0)).slice(0, 256),
      })

      currentTime += delayTime
    }

    return Uint8ClampedArray.from(imageData)
  }

  private handleCanvasCreate() {
    this.on('change', (items) => {
      if (this.canvas || !items.length)
        return

      let maxWidth = 0
      let maxHeight = 0

      for (const item of items) {
        maxWidth = Math.max(maxWidth, item.reader.width)
        maxHeight = Math.max(maxHeight, item.reader.height)
      }

      this.canvas = {
        width: maxWidth,
        height: maxHeight,
      }

      this.emit('canvasChange', this.canvas)
    })
  }
}
