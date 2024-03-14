import { useEffect, useRef, useState } from 'react'
import { fabric } from 'fabric'
import fileDownload from 'js-file-download'

import type { GIFMergerCanvas } from '../../src'
import { GIFMerger } from '../../src'

const merger = new GIFMerger();

(window as any).merger = merger

export function App() {
  const [canvas, setCanvas] = useState<GIFMergerCanvas>()
  const editorRef = useRef<fabric.Canvas>()

  useEffect(() => {
    if (!canvas)
      return () => {}

    const editor = new fabric.Canvas('editor')

    merger.items.forEach((item) => {
      const itemCanvas = document.createElement('canvas')
      itemCanvas.width = item.width
      itemCanvas.height = item.height

      const frame = merger.getFirstFrame(item.id)

      if (frame) {
        itemCanvas.getContext('2d')?.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0)
        editor.add(new fabric.Image(itemCanvas, {
          data: item.id,
          name: item.label,
          left: item.left,
          top: item.top,
          width: item.width,
          height: item.height,
          angle: item.angle,
        }))
      }
    })

    editor.on('object:modified', (e) => {
      const elem = e.target

      if (!elem)
        return

      const { left, top, scaleX, scaleY, angle } = elem

      merger.modify(elem.data, {
        left,
        top,
        scaleX,
        scaleY,
        angle,
      })
    })

    editorRef.current = editor

    return () => editor.dispose()
  }, [canvas])

  return (
    <div>

      <section>
        <canvas
          id="editor"
          width={canvas?.width}
          height={canvas?.height}
          style={{ border: '1px solid #333' }}
        />
      </section>
      <section>
        <input
          type="file"
          multiple
          accept="image/gif"
          onChange={(event) => {
            merger.reset()
            Promise.all(Array.from(event.target.files!).map(item => item.arrayBuffer().then(data => ({
              type: item.type,
              label: item.name,
              binary: new Uint8Array(data),
            })))).then((list) => {
              merger.once('canvasChange', setCanvas)
              merger.append(...list)
            })
          }}
        />
      </section>
      <button onClick={() => {
        merger.generateGIF().then(gif =>
          gif && fileDownload(gif, `${new Date().toLocaleString()}.gif`),
        )
      }}
      >
        生成
      </button>
    </div>
  )
}
