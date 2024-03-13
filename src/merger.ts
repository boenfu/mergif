import type { Frame as FrameInfo, GifBinary } from 'omggif'
import { GifReader, GifWriter } from 'omggif'
import EventEmitter from 'eventemitter3'
import fileDownload from 'js-file-download'

import { Frame } from '../src/frame'

export interface GIFMergeItem {
  // MIME type image/gif|jpeg
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

  async generateGIF() {
    const canvas = this.canvas
    if (!canvas)
      return

    const { width, height } = canvas
    const items = this.items.sort((itemA, itemB) => itemA.zIndex - itemB.zIndex)

    const buf: number[] = []
    const gf = new GifWriter(buf, width, height, {})

    for (let frameIndex = 0; frameIndex < 10; frameIndex++) {
      let source = Frame.fromRectangle(width, height)

      for (const { reader, left, top, scaleX, scaleY, angle, binary } of items) {
        const frameData = new Uint8ClampedArray(reader.width * reader.height * 4)
        const { palette_offset, transparent_index } = reader.frameInfo(frameIndex)

        const transparentOffset = (palette_offset ?? 0) + (transparent_index ?? 0) * 3

        const transparentColor = [
          binary[transparentOffset],
          binary[transparentOffset + 1],
          binary[transparentOffset + 2],
        ]

        reader.decodeAndBlitFrameRGBA(frameIndex, frameData)

        const frame = Frame.fromFrameRGBA(frameData, reader.width, reader.height).scale(scaleX, scaleY).rotateDEG(angle).apply()

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
        delay: 10,
        transparent: 0,
        palette: [...pam.keys()].concat(Array(256).fill(0)).slice(0, 256),
      })
    }

    fileDownload(Uint8ClampedArray.from(buf), 'test.gif')
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
