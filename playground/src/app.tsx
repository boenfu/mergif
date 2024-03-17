import { Avatar, Box, Button, Card, Flex, Grid, IconButton, Slider, Table } from '@radix-ui/themes'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CursorArrowIcon,
  DownloadIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  GitHubLogoIcon,
  MoonIcon,
  PinBottomIcon,
  PinTopIcon,
  PlusIcon,
  ReloadIcon,
  SunIcon,
  TrashIcon,
} from '@radix-ui/react-icons'
import { rgbString } from '@boenfu/text-rgb'
import { useEffect, useReducer, useRef, useState } from 'react'
import { fabric } from 'fabric'
import fileDownload from 'js-file-download'

import type { GIFMergeItem, GIFMergerCanvas } from '../../src'
import { GIFMerger } from '../../src'

import { usePreferredColorScheme } from './theme-provider'

const merger = new GIFMerger()

export function App() {
  const [canvas, setCanvas] = useState<GIFMergerCanvas>()
  const editorRef = useRef<fabric.Canvas>()
  const fileRef = useRef<HTMLInputElement>(null)
  const [_, rerender] = useReducer<any>(() => ({}), {})
  const [colorScheme, setColorScheme] = usePreferredColorScheme()

  useEffect(() => {
    if (!canvas)
      return () => {}

    const editor = new fabric.Canvas('editor');

    [...merger.items].sort((itemA, itemB) => itemA.zIndex - itemB.zIndex).forEach((item) => {
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
          centeredRotation: true,
          centeredScaling: true,
        }))
      }
    })

    editor.on('object:modified', (e) => {
      const elem = e.target

      if (!elem)
        return

      const { scaleX, scaleY, angle } = elem
      const { left, top } = elem.getBoundingRect()

      merger.modify(elem.data, {
        left,
        top,
        scaleX,
        scaleY,
        angle,
      })
    })

    editor.on('selection:created', rerender)
    editor.on('selection:updated', rerender)

    editorRef.current = editor

    return () => editor.dispose()
  }, [canvas])

  return (
    <Grid>
      <Box p="4">
        <Flex justify="end" gap="3">
          <IconButton
            variant="soft"
            onClick={() => {
              window.open('https://github.com/boenfu/mergif', '_blank')
            }}
          >
            <GitHubLogoIcon />
          </IconButton>
          <IconButton
            onClick={() => {
              setColorScheme(colorScheme === 'light' ? 'dark' : 'light')
            }}
            variant="soft"
          >
            {
            colorScheme === 'light'
              ? <SunIcon />
              : <MoonIcon />
          }
          </IconButton>
        </Flex>
      </Box>
      <Box p="4">
        <Flex direction="column" gap="3" align="center">
          <Card
            size="1"
            style={{
              '--card-padding': 0,
              '--card-border-radius': 0,
            } as any}
          >
            <canvas
              id="editor"
              width={canvas?.width}
              height={canvas?.height}
              style={{ border: '1px dash ' }}
            />
          </Card>
          <Flex gap="3">
            <Button
              variant="soft"
              onClick={() => fileRef.current?.click()}
            >
              <PlusIcon />
              Add Files
            </Button>
            <input
              ref={fileRef}
              hidden
              type="file"
              multiple
              accept="image/gif"
              onChange={(event) => {
                merger.resetAll()
                Promise.all(Array.from(event.target.files!).map(item => item.arrayBuffer().then(data => ({
                  type: item.type,
                  label: item.name,
                  binary: new Uint8Array(data),
                })))).then((list) => {
                  Reflect.set(window, 'cache', list)
                  merger.once('canvasChange', setCanvas)
                  merger.append(...list)
                })
              }}
            />
            <Button
              variant="soft"
              disabled={!merger.items.length}
              onClick={() => {
                merger.generateGIF().then(gif =>
                  gif && fileDownload(gif, `${new Date().toLocaleString()}.gif`),
                )
              }}
            >
              <DownloadIcon />
              Download
            </Button>
            {
              import.meta.env.DEV
                && (
                  <Button
                    variant="classic"
                    onClick={() => {
                      const cache = Reflect.get(window, 'cache')

                      if (cache) {
                        merger.resetAll()
                        merger.once('canvasChange', setCanvas)
                        merger.append(...cache)
                      }
                    }}
                  >
                    复用
                  </Button>
                )
            }
          </Flex>
        </Flex>
      </Box>
      <Box p="4">
        <Flex direction="column" gap="3">
          <Table.Root variant="ghost">
            <Table.Body>
              {[...merger.items].sort((itemA, itemB) => itemB.zIndex - itemA.zIndex).map((item, index) => {
                const active = editorRef.current?.getActiveObject()?.data === item.id

                const requireObject = (fn: (obj: fabric.Object, editor: fabric.Canvas, item: GIFMergeItem) => void) => {
                  const editor = editorRef.current
                  const obj = editor?.getObjects().find(obj => obj.data === item.id)

                  if (obj)
                    fn(obj, editor!, item)
                }

                const requireObjectWithRerender = (fn: (obj: fabric.Object, editor: fabric.Canvas, item: GIFMergeItem) => void) => {
                  requireObject((obj, editor) => {
                    fn(obj, editor, item)
                    rerender()
                  })
                }

                return (
                  <Table.Row key={item.id} align="center">
                    <Table.RowHeaderCell>
                      <Flex gap="2" align="center">
                        <Avatar src="" fallback={index} />
                        {item.label}
                      </Flex>
                    </Table.RowHeaderCell>
                    <Table.Cell width="50%">
                      <Slider
                        style={{
                          '--accent-9': rgbString(item.label),
                        } as any}
                        defaultValue={[25, 75]}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <Flex direction="column" gap="2">
                        <Flex gap="2">
                          <IconButton
                            variant="outline"
                            color="gray"
                            onClick={() =>
                              requireObjectWithRerender((obj, editor, item) => {
                                obj.bringForward()
                                merger.changeZIndex(item.id, 1)
                                editor.discardActiveObject()
                              })}
                          >
                            <ArrowUpIcon />
                          </IconButton>
                          <IconButton
                            variant="outline"
                            color="gray"
                            onClick={() =>
                              requireObjectWithRerender((obj, editor, item) => {
                                obj.sendBackwards()
                                merger.changeZIndex(item.id, -1)
                                editor.discardActiveObject()
                              })}
                          >
                            <ArrowDownIcon />
                          </IconButton>
                          <IconButton
                            variant="outline"
                            color="gray"
                            onClick={() =>
                              requireObjectWithRerender((obj, editor, item) => {
                                obj.bringToFront()
                                merger.changeZIndex(item.id, 'top')
                                editor.discardActiveObject()
                              })}
                          >
                            <PinTopIcon />
                          </IconButton>
                          <IconButton
                            variant="outline"
                            color="gray"
                            onClick={() =>
                              requireObjectWithRerender((obj, editor, item) => {
                                obj.sendToBack()
                                merger.changeZIndex(item.id, 'bottom')
                                editor.discardActiveObject()
                              })}
                          >
                            <PinBottomIcon />
                          </IconButton>

                        </Flex>
                        <Flex gap="2">
                          <IconButton
                            variant="outline"
                            onClick={() => {
                              requireObjectWithRerender((obj, editor, item) => {
                                obj.visible = !item.visible
                                merger.modify(item.id, {
                                  visible: !item.visible,
                                })

                                if (active && item.visible)
                                  editor.discardActiveObject()

                                editor.requestRenderAll()
                              })
                            }}
                          >
                            { item.visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
                          </IconButton>

                          <IconButton
                            variant={active ? 'solid' : 'outline'}
                            disabled={!item.visible}
                            onClick={() => {
                              requireObjectWithRerender((obj, editor) => {
                                if (!active)
                                  editor.setActiveObject(obj)
                                else
                                  editor.discardActiveObject()

                                editor.requestRenderAll()
                              })
                            }}
                          >
                            <CursorArrowIcon />
                          </IconButton>

                          <IconButton
                            variant="outline"
                            color="gray"
                            onClick={() =>
                              requireObjectWithRerender((obj, editor, item) => {
                                obj.set('angle', 0)
                                obj.set('left', 0)
                                obj.set('top', 0)
                                obj.set('scaleX', 1)
                                obj.set('scaleY', 1)
                                obj.visible = true
                                editor.requestRenderAll()
                                merger.reset(item.id)
                              })}
                          >
                            <ReloadIcon />
                          </IconButton>

                          <IconButton
                            variant="outline"
                            color="red"
                            onClick={() =>
                              requireObjectWithRerender((obj, editor, item) => {
                                editor?.remove(obj)
                                merger.remove(item.id)
                              })}
                          >
                            <TrashIcon />
                          </IconButton>
                        </Flex>
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table.Root>
        </Flex>
      </Box>
    </Grid>
  )
}
