require('dotenv').config();

module.exports = {
  botName: process.env.BOT_NAME || 'Nerd-eth',
  ownerNumber: process.env.OWNER_NUMBER || '',
  prefix: process.env.PREFIX || '!',
  dashboardPassword: process.env.DASHBOARD_PASSWORD || 'Omemi',

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 2000,
  },

  // Groq — free AI provider (https://console.groq.com)
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  },

  download: {
    path: process.env.DOWNLOAD_PATH || './storage',
    maxSize: parseInt(process.env.MAX_FILE_SIZE) || 100,
  },

  status: {
    autoView: process.env.AUTO_VIEW_STATUS !== 'false',
    autoLike: process.env.AUTO_LIKE_STATUS !== 'false',
  },

  agent: {
    maxAgents: parseInt(process.env.MAX_AGENTS) || 5,
    timeout: parseInt(process.env.AGENT_TIMEOUT) || 300000,
  },

  antiBan: {
    enabled: process.env.ANTI_BAN_ENABLED !== 'false',
    alwaysOnline: process.env.ALWAYS_ONLINE !== 'false',
    maxMessagesPerChat: parseInt(process.env.MAX_MESSAGES_PER_CHAT) || 20,
    maxBroadcastPerHour: parseInt(process.env.MAX_BROADCAST_PER_HOUR) || 2,
    statusIntervalMin: parseInt(process.env.STATUS_INTERVAL_MIN) || 180,
    humanTyping: process.env.HUMAN_TYPING !== 'false',
    randomDelays: process.env.RANDOM_DELAYS !== 'false',
    safeMode: process.env.SAFE_MODE !== 'false',
  },

  agentRouter: {
    enabled: process.env.AGENT_ROUTER_ENABLED === 'true',
    apiKey: process.env.AGENT_ROUTER_API_KEY || '',
    baseUrl: process.env.AGENT_ROUTER_BASE_URL || 'https://agentrouter.org/v1',
    model: process.env.AGENT_ROUTER_MODEL || 'gpt-4o',
  },

  // Brave Search API (free: https://api.search.brave.com)
  braveSearch: {
    apiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    enabled: !!(process.env.BRAVE_SEARCH_API_KEY),
  },

  // OMDB API (free: https://www.omdbapi.com — free key included)
  omdb: {
    apiKey: process.env.OMDB_API_KEY || 'trilogy',
  },

  memory: {
    enabled: process.env.MEMORY_ENABLED !== 'false',
    maxHistory: parseInt(process.env.MEMORY_MAX_HISTORY) || 100,
    autoLearn: process.env.MEMORY_AUTO_LEARN !== 'false',
  },

  viewOnce: {
    enabled: process.env.VIEW_ONCE_ENABLED !== 'false',
    notifyAdmin: process.env.VIEW_ONCE_NOTIFY_ADMIN !== 'false',
  },

  access: {
    enabled: process.env.ACCESS_ENABLED !== 'false',
    defaultFeatures: (process.env.ACCESS_DEFAULT_FEATURES || 'ai,agent,imagine,download,movie,music,search').split(',').map(function(n) { return n.trim(); }).filter(Boolean),
  },

  admins: (process.env.OWNER_NUMBER || '').split(',').map(function(n) { return n.trim().replace(/[^0-9]/g, ''); }).filter(Boolean),
};
