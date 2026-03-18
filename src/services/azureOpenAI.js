const OpenAI = require('openai');

let client;

function getAzureOpenAIClient() {
  if (client) return client;

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

  if (!apiKey || !endpoint) {
    throw new Error('Missing Azure OpenAI config. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.');
  }

  client = new OpenAI({
    apiKey,
    baseURL: `${endpoint.replace(/\/$/, '')}/openai`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': apiKey },
  });

  return client;
}

async function createPersonalizationResponse(messages) {
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!deployment) {
    throw new Error('Missing AZURE_OPENAI_DEPLOYMENT environment variable.');
  }

  const azure = getAzureOpenAIClient();
  const response = await azure.chat.completions.create({
    model: deployment,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages,
  });

  return response.choices?.[0]?.message?.content || '{}';
}

module.exports = {
  createPersonalizationResponse,
};
