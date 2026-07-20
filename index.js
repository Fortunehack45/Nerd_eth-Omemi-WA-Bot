const { startClient } = require('./src/client');
const { loadCommands } = require('./src/handlers/commandHandler');
const { handleMessage } = require('./src/handlers/messageHandler');
const { handleStatus } = require('./src/handlers/statusHandler');
const { initAI } = require('./src/services/aiService');
const { startScheduler } = require('./src/services/schedulerService');
const { startOnboarding } = require('./src/services/onboardingService');
const { startServer, setConnected, setDisconnected, logMessage, logCommand, getDashboardUrl } = require('./server');
const config = require('./config');

console.log(`
╔══════════════════════════════════╗
║     🤖 ${(config.botName || 'Nerd-eth').padEnd(20)} ║
║     WhatsApp Multi-Purpose Bot   ║
╚══════════════════════════════════╝
`);

console.log('Bot Name: ' + config.botName);
console.log('Prefix: ' + config.prefix);
console.log('AI: ' + (initAI() ? '✅ ' + providerName() : '❌ Not configured'));
console.log('User Memory: ' + (config.memory.enabled ? '✅ Auto-Learn: ' + config.memory.autoLearn : '❌'));
console.log('Auto-View Status: ' + (config.status.autoView ? '✅' : '❌'));
console.log('Auto-Like Status: ' + (config.status.autoLike ? '✅' : '❌'));
console.log('Max Agents: ' + config.agent.maxAgents);
console.log('Always Online: ' + (config.antiBan.alwaysOnline ? '✅' : '❌'));
console.log('Anti-Ban: ' + (config.antiBan.enabled ? '✅ Active (human typing, rate limits)' : '❌ Disabled'));
console.log('AgentRouter: ' + (config.agentRouter.enabled ? '✅ ' + config.agentRouter.baseUrl : '❌ Disabled'));
console.log('Brave Search: ' + (config.braveSearch?.enabled ? '✅ Active' : '⚠️ Not configured (using DuckDuckGo)'));
console.log('Access Control: ' + (config.access.enabled ? '✅ Active' : '❌ Disabled'));
console.log('View-Once Saver: ' + (config.viewOnce.enabled ? '✅ Notify: ' + config.viewOnce.notifyAdmin : '❌ Disabled'));
console.log('Scheduler: ✅ Active');
console.log('Admin Self-Commands: ✅ Active (send commands to yourself)');
console.log('Admin Dashboard: 👉 ' + getDashboardUrl());

function providerName() {
  const aiSvc = require('./src/services/aiService');
  const p = aiSvc.getProvider();
  const m = aiSvc.getModel();
  if (p === 'groq') return 'Groq (' + (m || 'llama-3.1-8b-instant') + ')';
  if (p === 'openai') return 'OpenAI (' + (m || 'gpt-4o-mini') + ')';
  if (p === 'agentrouter') return 'AgentRouter';
  if (p === 'openrouter') return 'OpenRouter';
  return 'None — Set GROQ_API_KEY in .env';
}

loadCommands();
startServer();

console.log('');
console.log('Starting WhatsApp client...');
console.log('');

startClient(handleMessage, handleStatus, function(sock) {
  setConnected(sock);
  startScheduler(sock);
  setTimeout(function() { startOnboarding(sock); }, 5000);
}).catch(function(err) {
  console.error('Failed to start client:', err);
  process.exit(1);
});
