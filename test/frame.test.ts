import { expect, it } from 'vitest'

import { Frame } from '../src/frame'

it('test', () => {
  const frame = Frame.fromFrameRGBA(Uint8ClampedArray.from([10, 10, 10, 10, 20, 20, 20, 20, 30, 30, 30, 30, 40, 40, 40, 40]), 2).scale(2).rotateDEG(0).apply()

  expect(frame).toBeInstanceOf(
    Frame,
  )

  expect(frame.data).toEqual(Uint8ClampedArray.from ([10, 10, 10, 10, 12, 12, 12, 12, 17, 17, 17, 17, 20, 20, 20, 20, 15, 15, 15, 15, 17, 17, 17, 17, 22, 22, 22, 22, 25, 25, 25, 25, 25, 25, 25, 25, 27, 27, 27, 27, 32, 32, 32, 32, 35, 35, 35, 35, 30, 30, 30, 30, 32, 32, 32, 32, 37, 37, 37, 37, 40, 40, 40, 40]))
})
