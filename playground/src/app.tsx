import { Avatar, Box, Button, Card, Flex, Grid, IconButton, Slider, Table, Text, TextField } from '@radix-ui/themes'
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
import { useEffect, useId, useReducer, useRef, useState } from 'react'
import { fabric } from 'fabric'
import fileDownload from 'js-file-download'

import type { GIFMergeItem, GIFMergerCanvas } from '../../src'
import { GIFMerger } from '../../src'

import { usePreferredColorScheme } from './theme-provider'

const merger = new GIFMerger()

export function App() {
  const editorId = useId()
  const [canvas, setCanvas] = useState<GIFMergerCanvas>()
  const editorRef = useRef<fabric.Canvas>()
  const thumbnailRef = useRef<Record<number, any>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const [_, rerender] = useReducer<any>(() => ({}), {})
  const [colorScheme, setColorScheme] = usePreferredColorScheme()

  const [totalDuration, setTotalDuration] = useState(0)

  const canvasReady = Boolean(canvas)

  useEffect(() => {
    merger.on('durationChange', setTotalDuration)
    return () =>
      void merger.off('durationChange', setTotalDuration)
  }, [])

  useEffect(() => {
    if (!canvasReady)
      return

    const editor = new fabric.Canvas(editorId)

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

    return () => void editor.dispose()
  }, [canvasReady, editorId])

  useEffect(() => {
    if (!canvasReady)
      return

    const handler = (items: GIFMergeItem[]) => {
      const editor = editorRef.current

      if (!editor)
        return

      const existedSet = new Set(editor.getObjects().map(item => item.data));

      [...items].sort((itemA, itemB) => itemA.zIndex - itemB.zIndex).forEach((item) => {
        if (existedSet.has(item.id))
          return

        const itemCanvas = document.createElement('canvas')
        itemCanvas.width = item.width
        itemCanvas.height = item.height

        const frame = merger.getFirstFrame(item.id)

        if (frame) {
          itemCanvas.getContext('2d')?.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0)
          thumbnailRef.current[item.id] = itemCanvas.toDataURL()

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

      rerender()
    }

    handler(merger.items)

    merger.on('itemsCreated', handler)
    merger.on('canvasUpdate', (canvas) => {
      setCanvas(canvas)
      editorRef.current?.setDimensions(canvas).requestRenderAll()
    })

    return () => void merger.off('itemsCreated', handler)
  }, [canvasReady])

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
              id={editorId}
              width={canvas?.width}
              height={canvas?.height}
              style={{ border: '1px dash ' }}
            />
          </Card>
          <Flex gap="3" align="center">
            <Flex gap="2" p="2" align="center">
              <TextField.Input
                disabled={!canvasReady}
                type="number"
                size="2"
                style={{ width: 64 }}
                placeholder="width"
                min={0}
                max={1024}
                step={1}
                key={`w:${merger.canvas?.width}`}
                defaultValue={merger.canvas?.width}
                onBlur={(e) => {
                  merger.updateCanvas({
                    width: Number(e.target.value) || merger.canvas?.width || 100,
                    height: merger.canvas?.height ?? 0,
                  })
                }}
              />
              <Text as="label">x</Text>
              <TextField.Input
                disabled={!canvasReady}
                type="number"
                size="2"
                style={{ width: 64 }}
                placeholder="height"
                min={0}
                max={1024}
                step={1}
                key={`h:${merger.canvas?.width}`}
                defaultValue={merger.canvas?.height}
                onBlur={(e) => {
                  merger.updateCanvas({
                    width: merger.canvas?.width ?? 0,
                    height: Number(e.target.value) || merger.canvas?.height || 100,
                  })
                }}
              />
            </Flex>
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
                Promise.all(Array.from(event.target.files!).map(item => item.arrayBuffer().then(data => ({
                  type: item.type,
                  label: item.name,
                  binary: new Uint8Array(data),
                })))).then((list) => {
                  if (import.meta.env.DEV)
                    Reflect.set(window, 'cache', list)

                  merger.once('canvasCreated', setCanvas)
                  merger.append(...list)
                  rerender()
                })
              }}
            />
            <Button
              variant="soft"
              disabled={!merger.items.filter(item => item.visible).length}
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
              (import.meta.env.DEV && localStorage.getItem('DEV'))
              && (
                <Button
                  variant="classic"
                  onClick={() => {
                    const cache = Reflect.get(window, 'cache')

                    if (cache) {
                      merger.resetAll()
                      merger.once('canvasCreated', setCanvas)
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
                        <Avatar src={thumbnailRef.current[item.id]} fallback={index} />
                        {item.label}
                      </Flex>
                    </Table.RowHeaderCell>
                    <Table.Cell width="50%">
                      <Slider
                        style={{
                          '--accent-9': rgbString(item.label),
                        } as any}
                        min={0}
                        max={totalDuration}
                        key={`${item.start},${item.duration}`}
                        step={1}
                        defaultValue={[item.start, item.start + item.duration]}
                        onValueCommit={([start, end]) => {
                          merger.modify(item.id, {
                            start,
                            duration: end - start,
                          })
                          rerender()
                        }}
                      />
                      <Flex gap="2" p="2" align="center">
                        <Text as="label">Start:</Text>
                        <TextField.Input
                          type="number"
                          size="1"
                          placeholder="ms"
                          step={10}
                          key={`s:${item.start}`}
                          defaultValue={item.start * 10}
                          onBlur={(e) => {
                            merger.modify(item.id, {
                              start: Math.round(Number(e.target.value) / 10),
                            })
                            rerender()
                          }}
                        />
                        <Text as="label">Duration:</Text>
                        <TextField.Input
                          type="number"
                          size="1"
                          placeholder="ms"
                          step={10}
                          key={`d:${item.duration}`}
                          defaultValue={item.duration * 10}
                          onBlur={(e) => {
                            merger.modify(item.id, {
                              duration: Math.round(Number(e.target.value) / 10),
                            })
                            rerender()
                          }}
                        />
                      </Flex>
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
