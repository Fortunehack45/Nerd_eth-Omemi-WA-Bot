const OpenAI = require('openai');
const config = require('../../config');

let openai = null;
let provider = 'none';

function initAI() {
  if (config.agentRouter.enabled && config.agentRouter.apiKey) {
    openai = new OpenAI({
      apiKey: config.agentRouter.apiKey,
      baseURL: config.agentRouter.baseUrl,
    });
    provider = 'agentrouter';
    console.log(`AI Provider: AgentRouter (${config.agentRouter.baseUrl})`);
    return true;
  }

  if (config.openai.apiKey && config.openai.apiKey !== 'sk-your-openai-api-key') {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
    provider = 'openai';
    console.log('AI Provider: OpenAI');
    return true;
  }

  console.warn('No AI API key configured. Set OPENAI_API_KEY or AGENT_ROUTER_API_KEY in .env');
  return false;
}

function getProvider() {
  return provider;
}

function switchProvider(newProvider) {
  if (newProvider === 'agentrouter' && config.agentRouter.apiKey) {
    openai = new OpenAI({
      apiKey: config.agentRouter.apiKey,
      baseURL: config.agentRouter.baseUrl,
    });
    provider = 'agentrouter';
    return true;
  }
  if (newProvider === 'openai' && config.openai.apiKey && config.openai.apiKey !== 'sk-your-openai-api-key') {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
    provider = 'openai';
    return true;
  }
  return false;
}

async function chatComplete(messages, modelOverride = null) {
  if (!openai) return { text: 'AI is not configured. Set OPENAI_API_KEY or AGENT_ROUTER_API_KEY in .env' };
  try {
    const model = modelOverride || (provider === 'agentrouter' ? config.agentRouter.model : config.openai.model);
    const completion = await openai.chat.completions.create({
      model,
      temperature: config.openai.temperature,
      max_tokens: config.openai.maxTokens,
      messages,
    });
    return { text: completion.choices[0]?.message?.content || 'No response', success: true };
  } catch (err) {
    return { text: `AI Error: ${err.message}`, success: false };
  }
}

async function generateImage(prompt) {
  if (provider === 'agentrouter') {
    return { url: null, error: 'Image generation not available via AgentRouter. Use OpenAI directly.', success: false };
  }
  if (!openai) return { url: null, error: 'AI is not configured.' };
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
    });
    return { url: response.data[0]?.url, error: null, success: true };
  } catch (err) {
    return { url: null, error: err.message, success: false };
  }
}

async function listAgentRouterModels() {
  if (provider !== 'agentrouter') {
    return { success: false, models: [], error: 'Not using AgentRouter provider.' };
  }
  try {
    const response = await openai.models.list();
    return { success: true, models: response.data };
  } catch (err) {
    return { success: false, models: [], error: err.message };
  }
}

module.exports = { initAI, chatComplete, generateImage, getProvider, switchProvider, listAgentRouterModels };
