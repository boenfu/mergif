import type { Frame as FrameInfo, GifBinary } from 'omggif'
import { GifReader, GifWriter } from 'omggif'
import EventEmitter from 'eventemitter3'

import { Frame } from './frame'
import { breakable } from './@utils'

export interface GIFMergeItem {
  // MIME type image/gif
  type: string
  id: number
  label: string
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
  start: number
  /**
   * @unit 10 ms
   */
  duration: number
  /**
   * 自身播放完成后是否循环
   * true: 循环
   * false: 停在最后一帧
   */
  loop: boolean
  reader: GifReader
  visible: boolean
}

export interface GIFMergerEvents {
  change: (items: GIFMergeItem[]) => void
  itemsCreated: (items: GIFMergeItem[]) => void
  canvasCreated: (canvas: GIFMergerCanvas) => void
  canvasUpdate: (canvas: GIFMergerCanvas) => void
  durationChange: (duration: number) => void
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

  private _duration = 0
  get duration() { return this._duration }

  canvas: GIFMergerCanvas | undefined

  constructor(gifList?: (Pick<GIFMergeItem, 'type' | 'binary'> & Partial<GIFMergeItem>)[]) {
    super()

    if (gifList)
      this.append(...gifList)

    this.handleCanvasCreate()
    this.handleDuration()
  }

  append(...gifList: (Pick<GIFMergeItem, 'type' | 'binary'> & Partial<GIFMergeItem>)[]) {
    if (!gifList.length)
      return

    const startZIndex = Math.max(...this.items.map(({ zIndex }) => zIndex), 0)

    let zIndex = startZIndex + 1

    const items: GIFMergeItem[] = []

    for (const { binary, ...item } of gifList) {
      const id = this.idGenerator
      const reader = new GifReader(binary)

      this._itemsMap.set(id, {
        id,
        label: '',
        binary,
        left: 0,
        top: 0,
        width: reader.width,
        height: reader.width,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        zIndex: zIndex++,
        reader,
        start: 0,
        duration: countDuration(reader),
        loop: false,
        visible: true,
        ...item,
      })

      items.push(this._itemsMap.get(id)!)
    }

    this.emit('itemsCreated', items)
    this.emit('change', this.items)
  }

  remove(id: number) {
    if (!this._itemsMap.has(id))
      return

    this._itemsMap.delete(id)
    this.emit('change', this.items)
  }

  modify(id: number, data: Partial<GIFMergeItem>) {
    if (!this._itemsMap.has(id))
      return

    this._itemsMap.set(id, { ...this._itemsMap.get(id)!, ...data })
    this.emit('change', this.items)
  }

  reset(id: number) {
    const item = this._itemsMap.get(id)

    if (!item)
      return

    const reader = item.reader

    this.modify(id, {
      id,
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      start: 0,
      duration: countDuration(reader),
      visible: true,
    })
  }

  resetAll() {
    this._itemsMap.clear()
    this.canvas = undefined
    this.emit('change', this.items)
  }

  changeZIndex(id: number, offset: number | 'top' | 'bottom') {
    const item = this._itemsMap.get(id)

    if (!item)
      return

    const originItems = [...this.items].sort((itemA, itemB) => itemA.zIndex - itemB.zIndex)
    const nextItems = [...originItems]

    let targetItemIndex!: number

    const itemIndex = originItems.findIndex(item => item.id === id)

    switch (offset) {
      case 'top':
        targetItemIndex = originItems.length - 1
        break
      case 'bottom':
        targetItemIndex = 0
        break
      default:
        targetItemIndex = Math.min(originItems.length - 1, Math.max(0, itemIndex + offset))
        break
    }

    if (itemIndex === targetItemIndex)
      return

    nextItems.splice(targetItemIndex, 0, ...nextItems.splice(itemIndex, 1))
    const originItemsIndex = originItems.map(item => item.zIndex)
    nextItems.forEach((item, index) => item.zIndex = originItemsIndex[index])

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

  updateCanvas(canvas: GIFMergerCanvas) {
    if (!this.canvas)
      return

    this.canvas = canvas
    this.emit('canvasUpdate', canvas)
  }

  async generateGIF(): Promise<Uint8ClampedArray | undefined> {
    return breakable(async (idle) => {
      const canvas = this.canvas

      if (!canvas)
        return

      const { width, height } = canvas
      const items = [...this.items]
        .sort((itemA, itemB) => itemA.zIndex - itemB.zIndex)
        .filter(item => item.visible)

      const imageData: number[] = []
      const frames: Parameters<GifWriter['addFrame']>[] = []

      // 取最晚结束的作为总时间
      const duration = Math.max(...items.map(item => item.start + item.duration))
      // 24 FPS ?
      const delayTime = 4

      let currentTime = 0

      const lastFrameMap = new Map<number, Frame>()
      const lastFrameDurationMap = new Map<number, [number, number]>() // frameIndex, delayCount>()
      const paletteMap = new Map<number, number>()

      let lastFrameIndexList: (undefined | number)[]

      while (currentTime <= duration) {
        let source = Frame.fromRectangle(width, height, [-1, -1, -1])

        const frameIndexList = items.map((item) => {
          const { id, reader, loop, start } = item
          // TODO (boen): 自定义结束处置方式
          if (currentTime < start)
            return undefined

          let [lastFrameIndex, durationCount] = lastFrameDurationMap.get(id) || [0, reader.frameInfo(0).delay]

          const totalFrames = reader.numFrames()

          let frameIndex = lastFrameIndex

          // 上一帧时间不够了，找下一帧
          if (currentTime > durationCount) {
            let restTime = currentTime - durationCount

            while (restTime > 0) {
              const nextFrameDuration = reader.frameInfo(++frameIndex % totalFrames).delay

              restTime -= nextFrameDuration
              durationCount += nextFrameDuration
            }

            lastFrameDurationMap.set(id, [frameIndex, durationCount])
          }

          if (loop)
            frameIndex = frameIndex % totalFrames
          else
            frameIndex = Math.min(frameIndex, totalFrames - 1)

          return frameIndex
        })

        currentTime += delayTime

        if (frameIndexList.every((item, index) => item === lastFrameIndexList?.[index])) {
          const lastFrameOptions = frames[frames.length - 1]?.[5]

          if (lastFrameOptions) {
            lastFrameOptions.delay! += delayTime
            continue
          }
        }
        else {
          lastFrameIndexList = frameIndexList
        }

        for (let i = 0; i < items.length; i++) {
          const frameIndex = frameIndexList[i]

          if (typeof frameIndex === 'undefined')
            continue

          const item = items[i]
          const { id, reader, left, top, scaleX, scaleY, angle } = item

          const { disposal } = reader.frameInfo(frameIndex)

          const frameData = new Uint8ClampedArray(reader.width * reader.height * 4)
          reader.decodeAndBlitFrameRGBA(frameIndex, frameData)

          source = source.merge(
            Frame
              .fromFrameRGBA(frameData, reader.width, reader.height)
              .exec((frame) => {
                const lastFrame = lastFrameMap.get(id)

                if (lastFrame) {
                  frame = lastFrame.merge(frame, {
                    isTransparent,
                  })
                }

                switch (disposal) {
                  case 1:
                    lastFrameMap.set(id, frame.clone())
                    break
                  case 2:
                    lastFrameMap.delete(id)
                    break
                  default:
                    break
                }

                return frame
              })
              .scale(scaleX, scaleY)
              .rotateDEG(angle),
            {
              x: left,
              y: top,
              isTransparent,
            },
          )

          await idle()
        }

        const indexedPixels: number[] = []

        for (let index = 0; index <= source.data.length; index += 4) {
          const color = colorNumber([
            source.data[index],
            source.data[index + 1],
            source.data[index + 2],
          ])

          if (!paletteMap.has(color))
            paletteMap.set(color, paletteMap.size)

          indexedPixels.push(paletteMap.get(color)!)
        }

        const transparentIndex = paletteMap.get(-1)

        frames.push([0, 0, source.width, source.height, indexedPixels, {
          delay: delayTime,
          transparent: transparentIndex,
          disposal: 2,
        }])

        await idle()
      }

      const palette = [
        ...paletteMap.keys(),
      ].concat(Array(256).fill(0)).slice(0, 256)

      const transparentIndex = paletteMap.get(-1)
      if (typeof transparentIndex !== 'undefined')

        palette.splice(transparentIndex, 1, 0)

      const gifWriter = new GifWriter(imageData, width, height, {
        palette,
      })

      frames.forEach(params => gifWriter.addFrame(...params))

      return Uint8ClampedArray.from(imageData.slice(0, gifWriter.end()))
    })
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

      this.emit('canvasCreated', this.canvas)
    })
  }

  private handleDuration() {
    this.on('change', (items) => {
      const duration = Math.max(this._duration, ...items.map(item => item.start + item.duration))

      if (duration !== this._duration) {
        this._duration = duration
        this.emit('durationChange', duration)
      }
    })
  }
}

function colorNumber(color: number[]): number {
  return color[0] << 16 | color[1] << 8 | color[2]
}

function countDuration(reader: GifReader): number {
  return Array(reader.numFrames()).fill(0).reduce((c, _, i) => c + reader.frameInfo(i).delay, 0)
}

function isTransparent(rgba: number[]): boolean {
  // no alpha, just 255 or 0
  return rgba[3] === 0
}
