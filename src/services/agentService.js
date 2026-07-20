const config = require('../../config');
const { chatComplete } = require('./aiService');

const agents = new Map();
const agentResults = new Map();

const SYSTEM_PROMPTS = {
  assistant: 'You are a helpful WhatsApp bot assistant. Answer questions concisely and helpfully.',
  coder: 'You are a coding expert. Write clean, efficient code. Explain your reasoning briefly.',
  writer: 'You are a creative writer. Help with writing, editing, and content creation.',
  researcher: 'You are a research analyst. Provide factual, well-structured information.',
  terminal: 'You are a terminal command expert. Explain commands and their usage clearly.',
  general: 'You are a versatile AI agent that can handle any task the user asks.',
};

function createAgent(name, role = 'general') {
  if (agents.size >= config.agent.maxAgents) {
    return { success: false, error: `Max agents (${config.agent.maxAgents}) reached. Kill an agent first.` };
  }
  if (agents.has(name)) {
    return { success: false, error: `Agent "${name}" already exists.` };
  }

  const systemPrompt = SYSTEM_PROMPTS[role] || SYSTEM_PROMPTS.general;
  const agent = {
    name,
    role,
    messages: [{ role: 'system', content: systemPrompt }],
    createdAt: Date.now(),
    lastActive: Date.now(),
    taskCount: 0,
  };

  agents.set(name, agent);
  return { success: true, agent };
}

function listAgents() {
  const list = [];
  for (const [name, agent] of agents) {
    list.push({
      name: agent.name,
      role: agent.role,
      tasksCompleted: agent.taskCount,
      uptime: Math.floor((Date.now() - agent.createdAt) / 1000),
    });
  }
  return list;
}

function killAgent(name) {
  if (agents.has(name)) {
    agents.delete(name);
    return { success: true };
  }
  return { success: false, error: `Agent "${name}" not found.` };
}

function killAllAgents() {
  const count = agents.size;
  agents.clear();
  return { success: true, count };
}

async function askAgent(name, userMessage) {
  const agent = agents.get(name);
  if (!agent) {
    return { success: false, error: `Agent "${name}" not found.` };
  }

  agent.messages.push({ role: 'user', content: userMessage });
  agent.lastActive = Date.now();

  const result = await chatComplete(agent.messages);
  if (result.success) {
    agent.messages.push({ role: 'assistant', content: result.text });
    agent.taskCount++;
  }

  return { success: result.success, response: result.text };
}

async function runMultiAgentTask(task, agentNames) {
  const results = [];
  const targetAgents = agentNames.length > 0
    ? agentNames.filter(n => agents.has(n)).map(n => agents.get(n))
    : Array.from(agents.values());

  if (targetAgents.length === 0) {
    return { success: false, error: 'No agents available. Create agents first with !agent create <name> <role>' };
  }

  const promises = targetAgents.map(async (agent) => {
    const res = await askAgent(agent.name, task);
    return { agent: agent.name, response: res.response || res.error };
  });

  const resolved = await Promise.allSettled(promises);
  resolved.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(r.value);
    else results.push({ agent: targetAgents[i]?.name || 'unknown', response: 'Failed to get response' });
  });

  return { success: true, results };
}

module.exports = { createAgent, listAgents, killAgent, killAllAgents, askAgent, runMultiAgentTask };
