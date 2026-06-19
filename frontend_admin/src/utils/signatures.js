const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const MAX_DATA_URL_LENGTH = 750000
const MAX_WIDTH = 900
const MAX_HEIGHT = 320

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = url
})

export const readSignatureFile = async (file) => {
  if (!file) return null
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Signature must be a PNG or JPEG image.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Signature image must be 5MB or smaller.')
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const scale = Math.min(MAX_WIDTH / image.width, MAX_HEIGHT / image.height, 1)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const dataUrl = canvas.toDataURL('image/png')
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error('Signature image is too large after processing. Use a smaller or simpler image.')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const fetchMySignature = async (apiBase, token) => {
  const response = await fetch(`${apiBase}/api/signatures/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const data = await response.json()
  return data?.data || null
}

export const saveMySignature = async (apiBase, token, imageData, fileName) => {
  const response = await fetch(`${apiBase}/api/signatures/me`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image_data: imageData, file_name: fileName || 'signature.png' }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to save signature')
  }
  const data = await response.json()
  return data?.data || null
}

export const lookupSignatures = async (apiBase, token, userIds) => {
  const response = await fetch(`${apiBase}/api/signatures/lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_ids: userIds }),
  })
  if (!response.ok) return {}
  const data = await response.json()
  return data?.data || {}
}
