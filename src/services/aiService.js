const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

// Groq SDK (free tier AI)
let Groq = null;
try { Groq = require('groq-sdk'); } catch (e) {}

// OpenAI SDK
let OpenAI = null;
try { OpenAI = require('openai'); } catch (e) {}

let aiClient = null;
let provider = 'none';
let currentModel = null;

// Runtime key overrides (admin can change via !setkey)
let runtimeKeys = {};

function initAI() {
  // 1. AgentRouter (if explicitly enabled)
  if (config.agentRouter.enabled && config.agentRouter.apiKey && config.agentRouter.apiKey !== 'ar-your-agentrouter-key') {
    if (OpenAI) {
      aiClient = new OpenAI({ apiKey: config.agentRouter.apiKey, baseURL: config.agentRouter.baseUrl });
      provider = 'agentrouter';
      currentModel = config.agentRouter.model || 'gpt-4o';
      console.log('AI Provider: AgentRouter (' + config.agentRouter.baseUrl + ')');
      return true;
    }
  }

  // 2. Groq (free, fast — default if set in .env or config)
  var groqKey = runtimeKeys.groq || config.groq?.apiKey || process.env.GROQ_API_KEY;
  if (groqKey && groqKey !== 'gsk-demo-key' && groqKey !== 'gsk-your-groq-api-key' && !groqKey.startsWith('gsk-your') && Groq) {
    aiClient = new Groq({ apiKey: groqKey });
    provider = 'groq';
    currentModel = config.groq?.model || 'llama-3.1-8b-instant';
    console.log('AI Provider: Groq (' + currentModel + ')');
    return true;
  }

  // 3. OpenAI
  var openaiKey = runtimeKeys.openai || config.openai?.apiKey;
  if (openaiKey && openaiKey !== 'sk-your-openai-api-key' && OpenAI) {
    aiClient = new OpenAI({ apiKey: openaiKey });
    provider = 'openai';
    currentModel = config.openai?.model || 'gpt-4o-mini';
    console.log('AI Provider: OpenAI (' + currentModel + ')');
    return true;
  }

  // 4. OpenRouter (free tier)
  var openrouterKey = runtimeKeys.openrouter || process.env.OPENROUTER_API_KEY;
  if (openrouterKey && openrouterKey !== 'or-demo' && OpenAI) {
    aiClient = new OpenAI({
      apiKey: openrouterKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'X-Title': 'Nerd-eth WhatsApp Bot' }
    });
    provider = 'openrouter';
    currentModel = 'meta-llama/llama-3.1-8b-instruct:free';
    console.log('AI Provider: OpenRouter (free tier)');
    return true;
  }

  // 5. Free Public AI (Unlimited, zero API keys required)
  provider = 'public-free';
  currentModel = 'pollinations-ai';
  console.log('AI Provider: Public Free AI (zero setup required)');
  return true;
}

function getProvider() { return provider; }
function getModel() { return currentModel; }

function setRuntimeKey(providerName, key) {
  runtimeKeys[providerName.toLowerCase()] = key;
  // Reinitialize with new key
  aiClient = null;
  provider = 'none';
  return initAI();
}

async function fetchFreeAI(messages) {
  try {
    var userMsg = messages[messages.length - 1]?.content || 'Hello';
    var sysMsg = messages.find(m => m.role === 'system')?.content || 'You are a helpful AI assistant.';
    
    // Primary free endpoint: Pollinations AI
    var payload = {
      messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }],
      model: 'openai'
    };
    var pResp = await axios.post('https://text.pollinations.ai/', payload, { timeout: 15000 });
    if (pResp.data && typeof pResp.data === 'string' && pResp.data.trim().length > 0 && !pResp.data.includes('Error')) {
      return { text: pResp.data.trim(), success: true };
    }
  } catch (e) {}

  // Fallback free endpoint: Pollinations GET interface
  try {
    var userText = encodeURIComponent(messages[messages.length - 1]?.content || 'Hello');
    var gResp = await axios.get('https://text.pollinations.ai/' + userText, { timeout: 15000 });
    if (gResp.data && typeof gResp.data === 'string' && gResp.data.trim().length > 0) {
      return { text: gResp.data.trim(), success: true };
    }
  } catch (e2) {}

  return { text: '⚠️ AI is currently busy. Please try again in a few seconds.', success: false };
}

async function chatComplete(messages, modelOverride) {
  // Public Free AI Fallback (No key needed)
  if (provider === 'public-free' || !aiClient) {
    return await fetchFreeAI(messages);
  }

  var model = modelOverride || currentModel;

  try {
    var textResult = null;
    if (provider === 'groq') {
      var completion = await aiClient.chat.completions.create({
        messages: messages,
        model: model,
        temperature: config.openai?.temperature || 0.7,
        max_tokens: config.openai?.maxTokens || 2048,
      });
      if (completion && Array.isArray(completion.choices) && completion.choices.length > 0) {
        textResult = completion.choices[0]?.message?.content || null;
      }
    } else {
      var completion2 = await aiClient.chat.completions.create({
        model: model,
        temperature: config.openai?.temperature || 0.7,
        max_tokens: config.openai?.maxTokens || 2000,
        messages: messages,
      });
      if (completion2 && Array.isArray(completion2.choices) && completion2.choices.length > 0) {
        textResult = completion2.choices[0]?.message?.content || null;
      }
    }

    if (textResult) {
      return { text: textResult, success: true };
    } else {
      // Fallback to free AI if SDK response was malformed
      console.warn('[AI Service] API response missing choices, falling back to free AI');
      return await fetchFreeAI(messages);
    }
  } catch (err) {
    console.warn('[AI Service Error]', err.message || err);
    // Fallback to free public AI out of the box when key is invalid, rate-limited, or expired!
    return await fetchFreeAI(messages);
  }
}

async function generateImage(prompt) {
  if (provider === 'groq') {
    return { url: null, error: 'Image generation not supported with Groq. Admin needs to set an OpenAI key: !setkey openai sk-...', success: false };
  }
  if (!aiClient) return { url: null, error: 'AI is not configured.', success: false };
  try {
    var response = await aiClient.images.generate({
      model: 'dall-e-3', prompt: prompt, n: 1, size: '1024x1024',
    });
    return { url: response.data[0]?.url, error: null, success: true };
  } catch (err) {
    return { url: null, error: err.message, success: false };
  }
}

async function listModels() {
  if (!aiClient) return { success: false, models: [], error: 'AI not configured.' };
  try {
    if (provider === 'groq') {
      var models = await aiClient.models.list();
      return { success: true, models: models.data || [], provider: 'groq' };
    }
    var models2 = await aiClient.models.list();
    return { success: true, models: models2.data || [], provider: provider };
  } catch (err) {
    return { success: false, models: [], error: err.message };
  }
}

// Test AI connectivity
async function testConnection() {
  var result = await chatComplete([{ role: 'user', content: 'Reply with only: OK' }]);
  return result;
}

module.exports = { initAI, chatComplete, generateImage, getProvider, getModel, setRuntimeKey, listModels, testConnection };
