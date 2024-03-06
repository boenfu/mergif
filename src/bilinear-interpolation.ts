export function bilinearInterpolation(
  imgData: ImageData,
  targetSize: {
    width: number
    height: number
  },
): ImageData {
  const { width, height } = imgData

  // 处理入参
  const targetWidth = Math.floor(targetSize.width)
  const targetHeight = Math.floor(targetSize.height)

  // 缩放比
  const scaleW = width / targetWidth
  const scaleH = height / targetHeight

  const targetData = new Uint8ClampedArray(targetWidth * targetHeight * 4)

  for (let col = 0; col < targetWidth; col += 1) {
    for (let row = 0; row < targetHeight; row += 1) {
      // 中心对齐的目标像素在源上的位置
      const x = Math.min(width - 1, (col + 0.5) * (scaleW) - 0.5)
      const y = Math.min(height - 1, (row + 0.5) * (scaleH) - 0.5)

      const ix = Math.floor(x)
      const iy = Math.floor(y)

      // 权重
      const u = x - ix
      const v = y - iy

      const u1 = 1 - u
      const v1 = 1 - v

      const offset = ((row * targetWidth) + col) * 4

      const rgba00 = getRGBA(imgData, iy + 0, ix + 0)
      const rgba01 = getRGBA(imgData, iy + 0, ix + 1)
      const rgba10 = getRGBA(imgData, iy + 1, ix + 0)
      const rgba11 = getRGBA(imgData, iy + 1, ix + 1)

      for (let i = 0; i <= 3; i += 1) {
        const a = (rgba00[i] * u1) + (rgba01[i] * u)
        const b = (rgba10[i] * u1) + (rgba11[i] * u)
        const c = (a * v1) + (b * v)

        // 向下取整
        targetData[offset + i] = Math.floor(c)
      }
    }
  }

  return {
    colorSpace: imgData.colorSpace,
    width: targetWidth,
    height: targetHeight,
    data: targetData,
  }
}

function getRGBA({ data, width, height }: ImageData, row: number, col: number) {
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
