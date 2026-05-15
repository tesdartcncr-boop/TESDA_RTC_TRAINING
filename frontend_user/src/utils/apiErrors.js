export function normalizeApiError(error, fallbackMessage = 'Something went wrong. Please try again.') {
  const status = error?.response?.status
  const detail = typeof error?.response?.data?.detail === 'string'
    ? error.response.data.detail
    : null

  if (error?.code === 'ECONNABORTED') {
    return {
      kind: 'network',
      shouldToast: true,
      message: 'The request timed out. Please try again.',
    }
  }

  if (!error?.response) {
    return {
      kind: 'network',
      shouldToast: true,
      message: 'Unable to connect to the server. Please check your connection and try again.',
    }
  }

  if (status === 429) {
    return {
      kind: 'rate_limit',
      shouldToast: true,
      message: 'Too many attempts. Please wait a moment and try again.',
    }
  }

  if (status >= 500) {
    return {
      kind: 'server',
      shouldToast: true,
      message: detail || 'The service is temporarily unavailable. Please try again in a moment.',
    }
  }

  return {
    kind: 'form',
    shouldToast: false,
    message: detail || fallbackMessage,
  }
}
