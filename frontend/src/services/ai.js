import apiClient from './api';

/**
 * Fetch AI provider configuration settings (Admin Only)
 */
export async function getAiSettingsApi() {
  const response = await apiClient.get('/api/settings/ai');
  return response.data;
}

/**
 * Update AI provider configuration settings (Admin Only)
 * @param {Object} payload { provider, model, api_key, enabled }
 */
export async function updateAiSettingsApi(payload) {
  const response = await apiClient.put('/api/settings/ai', payload);
  return response.data;
}

/**
 * Delete / clear saved AI API key (Admin Only)
 */
export async function deleteAiKeyApi() {
  const response = await apiClient.delete('/api/settings/ai/key');
  return response.data;
}

/**
 * Send messages history to AI Assistant endpoint
 * @param {Array<{role: string, content: string}>} messages
 */
export async function sendChatMessageApi(messages) {
  const response = await apiClient.post('/api/assistant/chat', { messages }, { timeout: 35000 });
  return response.data;
}
