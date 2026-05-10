const N8N_WEBHOOK_HEADER_NAME = 'N8N_WEBHOOK_TOKEN'

export function getN8nWebhookHeaders() {
  const token = process.env.N8N_WEBHOOK_TOKEN

  if (!token) {
    return {}
  }

  // n8n Header Auth expects this exact incoming header name.
  return {
    [N8N_WEBHOOK_HEADER_NAME]: token,
  }
}
