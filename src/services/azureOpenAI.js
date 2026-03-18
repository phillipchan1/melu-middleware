const OpenAI = require('openai');

let client;

function getAzureOpenAIClient() {
  if (client) return client;

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

  if (!apiKey || !endpoint || !deployment) {
    throw new Error('Missing Azure OpenAI config. Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT.');
  }

  const baseUrl = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}`;

  client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
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

function isAzureConfigured() {
  return !!(
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_DEPLOYMENT
  );
}

async function createJsonCompletion(messages, temperature = 0.5) {
  if (!isAzureConfigured()) {
    throw new Error(
      'Azure OpenAI not configured. Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT in .env',
    );
  }
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const azure = getAzureOpenAIClient();
  const response = await azure.chat.completions.create({
    model: deployment,
    temperature,
    response_format: { type: 'json_object' },
    messages,
  });
  return response.choices?.[0]?.message?.content || '{}';
}

module.exports = {
  createPersonalizationResponse,
  createJsonCompletion,
  isAzureConfigured,
};
