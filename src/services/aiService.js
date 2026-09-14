const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');
const { formatForWhatsApp } = require('../utils/whatsappFormatter');

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
let preferredProvider = process.env.AI_PROVIDER || null;

function initAI(targetProvider) {
  if (targetProvider) {
    preferredProvider = targetProvider.toLowerCase().trim();
  }

  function tryAgentRouter() {
    var key = runtimeKeys.agentrouter || config.agentRouter?.apiKey || process.env.AGENT_ROUTER_API_KEY;
    if (key && key !== 'ar-your-agentrouter-key' && !key.startsWith('ar-your') && OpenAI) {
      try {
        aiClient = new OpenAI({
          apiKey: key,
          baseURL: config.agentRouter?.baseUrl || 'https://agentrouter.org/v1'
        });
        provider = 'agentrouter';
        currentModel = config.agentRouter?.model || 'gpt-4o';
        console.log('AI Provider: AgentRouter (' + config.agentRouter?.baseUrl + ')');
        return true;
      } catch (e) {}
    }
    return false;
  }

  function tryGroq() {
    var key = runtimeKeys.groq || config.groq?.apiKey || process.env.GROQ_API_KEY;
    if (key && key !== 'gsk-demo-key' && key !== 'gsk-your-groq-api-key' && !key.startsWith('gsk-your') && Groq) {
      try {
        aiClient = new Groq({ apiKey: key });
        provider = 'groq';
        currentModel = process.env.GROQ_MODEL || config.groq?.model || 'openai/gpt-oss-20b';
        console.log('AI Provider: Groq (' + currentModel + ')');
        return true;
      } catch (e) {}
    }
    return false;
  }

  function tryOpenAI() {
    var key = runtimeKeys.openai || config.openai?.apiKey || process.env.OPENAI_API_KEY;
    if (key && key !== 'sk-your-openai-api-key' && !key.startsWith('sk-your') && OpenAI) {
      try {
        aiClient = new OpenAI({ apiKey: key });
        provider = 'openai';
        currentModel = config.openai?.model || 'gpt-4o-mini';
        console.log('AI Provider: OpenAI (' + currentModel + ')');
        return true;
      } catch (e) {}
    }
    return false;
  }

  function tryOpenRouter() {
    var key = runtimeKeys.openrouter || process.env.OPENROUTER_API_KEY;
    if (key && key !== 'or-demo' && !key.startsWith('or-your') && OpenAI) {
      try {
        aiClient = new OpenAI({
          apiKey: key,
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: { 'X-Title': 'Nerd WhatsApp Bot' }
        });
        provider = 'openrouter';
        currentModel = 'meta-llama/llama-3.1-8b-instruct:free';
        console.log('AI Provider: OpenRouter (free tier)');
        return true;
      } catch (e) {}
    }
    return false;
  }

  function tryPublicFree() {
    aiClient = null;
    provider = 'public-free';
    currentModel = 'pollinations-ai';
    console.log('AI Provider: Public Free AI (zero setup required)');
    return true;
  }

  // 1. If a preferred provider was requested, try that first
  if (preferredProvider === 'groq' && tryGroq()) return true;
  if (preferredProvider === 'openai' && tryOpenAI()) return true;
  if (preferredProvider === 'openrouter' && tryOpenRouter()) return true;
  if (preferredProvider === 'agentrouter' && tryAgentRouter()) return true;
  if (preferredProvider === 'public-free') return tryPublicFree();

  // 2. Default cascade order: AgentRouter (if enabled) -> Groq -> OpenAI -> OpenRouter -> AgentRouter -> Public Free
  if (config.agentRouter?.enabled && tryAgentRouter()) return true;
  if (tryGroq()) return true;
  if (tryOpenAI()) return true;
  if (tryOpenRouter()) return true;
  if (tryAgentRouter()) return true;

  // 3. Fallback to public free
  return tryPublicFree();
}

function getProvider() { return provider; }
function getModel() { return currentModel; }

function setRuntimeKey(providerName, key) {
  var prov = (providerName || '').toLowerCase().trim();
  runtimeKeys[prov] = key;
  preferredProvider = prov;
  process.env.AI_PROVIDER = prov;

  if (prov === 'groq' && config.groq) config.groq.apiKey = key;
  if (prov === 'openai' && config.openai) config.openai.apiKey = key;
  if (prov === 'agentrouter' && config.agentRouter) {
    config.agentRouter.apiKey = key;
    config.agentRouter.enabled = true;
  }
  if (prov === 'brave' && config.braveSearch) {
    config.braveSearch.apiKey = key;
    config.braveSearch.enabled = true;
    return true;
  }

  aiClient = null;
  provider = 'none';
  return initAI(prov);
}

function switchProvider(targetProvider) {
  var target = (targetProvider || '').toLowerCase().trim();
  var ok = initAI(target);
  if (ok && (provider === target || (target === 'public-free' && provider === 'public-free'))) {
    preferredProvider = target;
    process.env.AI_PROVIDER = target;
    return true;
  }
  return false;
}

async function fetchFreeAI(messages) {
  var userMsg = messages[messages.length - 1]?.content || 'Hello';
  var sysMsg = messages.find(m => m.role === 'system')?.content || 'You are Nerd, a helpful, intelligent WhatsApp AI assistant.';

  // Pollinations Free AI POST (Fast, no paid model tag to avoid budget blocks)
  try {
    var payload = {
      messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }]
    };
    var polResp = await axios.post('https://text.pollinations.ai/', payload, {
      timeout: 3500,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (polResp.data && typeof polResp.data === 'string' && polResp.data.trim().length > 0 && !polResp.data.includes('budget') && !polResp.data.includes('402') && !polResp.data.includes('Error')) {
      return { text: formatForWhatsApp(polResp.data.trim()), success: true };
    }
  } catch (e) {}

  return {
    text: '🤖 *Nerd AI Engine*\n\nTo chat with AI at lightning speed (< 0.5s), please connect a free Groq API key:\n\n1️⃣ Get your free key (takes 30 seconds, 100% free, no credit card required):\n👉 https://console.groq.com/keys\n\n2️⃣ Reply in this chat with:\n👉 `!setkey groq <your_key>`\n\n_Or set `GROQ_API_KEY=gsk_...` in your `.env` file._\n_Groq provides 14,400 free requests/day with Llama-3.1!_',
    success: false
  };
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
      var candidateModels = [
        model,
        'openai/gpt-oss-20b',
        'groq/compound-mini',
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant'
      ];
      candidateModels = candidateModels.filter(function(v, i, a) { return a.indexOf(v) === i; });

      var lastGroqErr = null;
      for (var mi = 0; mi < candidateModels.length; mi++) {
        var mTarget = candidateModels[mi];
        try {
          var completion = await aiClient.chat.completions.create({
            messages: messages,
            model: mTarget,
            temperature: config.openai?.temperature || 0.7,
            max_tokens: config.openai?.maxTokens || 2048,
          });
          if (completion && Array.isArray(completion.choices) && completion.choices.length > 0) {
            textResult = completion.choices[0]?.message?.content || null;
            if (textResult) {
              currentModel = mTarget;
              break;
            }
          }
        } catch (groqErr) {
          lastGroqErr = groqErr;
          if (groqErr.message && (groqErr.message.includes('model_not_found') || groqErr.status === 404)) {
            continue;
          }
          throw groqErr;
        }
      }
      if (!textResult && lastGroqErr) {
        throw lastGroqErr;
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
      return { text: formatForWhatsApp(textResult), success: true };
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
  if (provider === 'openai' && aiClient) {
    try {
      var response = await aiClient.images.generate({
        model: 'dall-e-3', prompt: prompt, n: 1, size: '1024x1024',
      });
      if (response.data && response.data[0]?.url) {
        return { url: response.data[0].url, error: null, success: true };
      }
    } catch (err) {
      console.warn('[AI Image] OpenAI failed, falling back to free generator:', err.message);
    }
  }

  // Fast free high-quality image generation fallback (zero API key required)
  try {
    var freeUrl = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?nologo=true&width=1024&height=1024';
    return { url: freeUrl, error: null, success: true };
  } catch (err2) {
    return { url: null, error: err2.message, success: false };
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

// Direct test of AI connectivity
async function testConnection() {
  if (provider === 'public-free') {
    return { success: true, text: 'Public Free AI is active (no API key required).' };
  }
  if (!aiClient) {
    return { success: false, text: 'No AI client initialized. Run `!setkey groq <key>` or `!setkey openai <key>`.' };
  }
  try {
    var textResult = null;
    if (provider === 'groq') {
      var candidateModels = [
        currentModel || 'openai/gpt-oss-20b',
        'openai/gpt-oss-20b',
        'groq/compound-mini',
        'qwen/qwen3.8-27b',
        'llama-3.1-8b-instant'
      ];
      candidateModels = candidateModels.filter(function(v, i, a) { return a.indexOf(v) === i; });

      var lastErr = null;
      for (var mi = 0; mi < candidateModels.length; mi++) {
        var mTarget = candidateModels[mi];
        try {
          var completion = await aiClient.chat.completions.create({
            messages: [{ role: 'user', content: 'Say "Nerd AI online"' }],
            model: mTarget,
            max_tokens: 20,
          });
          textResult = completion?.choices?.[0]?.message?.content || 'OK';
          currentModel = mTarget;
          break;
        } catch (groqErr) {
          lastErr = groqErr;
          if (groqErr.message && (groqErr.message.includes('model_not_found') || groqErr.status === 404)) {
            continue;
          }
          throw groqErr;
        }
      }
      if (!textResult && lastErr) throw lastErr;
    } else {
      var completion2 = await aiClient.chat.completions.create({
        messages: [{ role: 'user', content: 'Say "Nerd AI online"' }],
        model: currentModel || 'gpt-4o-mini',
        max_tokens: 20,
      });
      textResult = completion2?.choices?.[0]?.message?.content || 'OK';
    }
    return { success: true, text: textResult.trim() };
  } catch (err) {
    return { success: false, text: err.message || 'API connection failed' };
  }
}

module.exports = {
  initAI,
  chatComplete,
  generateImage,
  getProvider,
  getModel,
  setRuntimeKey,
  switchProvider,
  listModels,
  listAgentRouterModels: listModels,
  testConnection,
  formatForWhatsApp,
};
