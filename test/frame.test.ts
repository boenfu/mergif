import { expect, it } from 'vitest'

import { Frame } from '../src/frame'

it('test', () => {
  const frame = Frame.fromFrameRGBA(Uint8ClampedArray.from(Array(2 * 2 * 4).fill(0)), 2).scale(2).rotateDEG(0).apply()

  expect(frame).toBeInstanceOf(
    Frame,
  )
})
