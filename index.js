const { startClient } = require('./src/client');
const { loadCommands } = require('./src/handlers/commandHandler');
const { handleMessage } = require('./src/handlers/messageHandler');
const { handleStatus } = require('./src/handlers/statusHandler');
const { initAI } = require('./src/services/aiService');
const { startScheduler } = require('./src/services/schedulerService');
const { startOnboarding } = require('./src/services/onboardingService');
const { startServer, setConnected, setDisconnected, logMessage, logCommand } = require('./server');
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
console.log('Anti-Ban: ' + (config.antiBan.enabled ? '✅ Active (human typing, rate limits, browser rotation)' : '❌ Disabled'));
console.log('AgentRouter: ' + (config.agentRouter.enabled ? '✅ ' + config.agentRouter.baseUrl : '❌ Disabled'));
console.log('Access Control: ' + (config.access.enabled ? '✅ Active' : '❌ Disabled'));
console.log('View-Once Saver: ' + (config.viewOnce.enabled ? '✅ Notify: ' + config.viewOnce.notifyAdmin : '❌ Disabled'));
console.log('Scheduler: ✅ Active');
console.log('Dashboard: ✅ Port ' + (process.env.DASHBOARD_PORT || 3000));

function providerName() {
  const p = require('./src/services/aiService').getProvider();
  return p === 'agentrouter' ? 'AgentRouter' : p === 'openai' ? 'OpenAI' : 'None';
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
