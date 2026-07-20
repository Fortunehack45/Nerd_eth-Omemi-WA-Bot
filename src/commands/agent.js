const { createAgent, listAgents, killAgent, killAllAgents, askAgent, runMultiAgentTask } = require('../services/agentService');

module.exports = {
  name: 'agent',
  alias: ['agents', 'multiagent'],
  description: 'Manage AI agents for task execution',
  usage: '!agent create <name> <role> | !agent list | !agent ask <name> <task> | !agent kill <name> | !agent killall | !agent all <task>',
  restricted: true,
  restrictedFeature: 'agent',
  execute: async (sock, msg, args, ctx) => {
    const sender = ctx.sender;
    if (!args) {
      return sock.sendMessage(sender, {
        text: '*Agent Commands:*\n'
          + '▸ `!agent create <name> <role>` - Create an agent (roles: assistant, coder, writer, researcher, terminal, general)\n'
          + '▸ `!agent list` - List all agents\n'
          + '▸ `!agent ask <name> <task>` - Ask an agent to do something\n'
          + '▸ `!agent all <task>` - Ask all agents to do something\n'
          + '▸ `!agent kill <name>` - Remove an agent\n'
          + '▸ `!agent killall` - Remove all agents',
      });
    }

    const parts = args.split(/\s+/);
    const subCmd = parts[0].toLowerCase();

    switch (subCmd) {
      case 'create': {
        const name = parts[1];
        const role = parts[2] || 'general';
        if (!name) {
          return sock.sendMessage(sender, { text: 'Usage: !agent create <name> <role>' });
        }
        const result = createAgent(name, role);
        if (result.success) {
          await sock.sendMessage(sender, {
            text: `✅ Agent "${name}" created with role "${role}".\nAsk them: !agent ask ${name} <task>`,
          });
        } else {
          await sock.sendMessage(sender, { text: `Failed: ${result.error}` });
        }
        break;
      }

      case 'list': {
        const agents = listAgents();
        if (agents.length === 0) {
          return sock.sendMessage(sender, { text: 'No agents active. Create one with !agent create <name> <role>' });
        }
        let text = '*🤖 Active Agents*\n\n';
        agents.forEach(a => {
          text += `▸ *${a.name}* (${a.role})\n`;
          text += `   Tasks: ${a.tasksCompleted} | Uptime: ${a.uptime}s\n`;
        });
        await sock.sendMessage(sender, { text });
        break;
      }

      case 'ask': {
        const name = parts[1];
        const task = parts.slice(2).join(' ');
        if (!name || !task) {
          return sock.sendMessage(sender, { text: 'Usage: !agent ask <name> <task>' });
        }
        await sock.sendPresenceUpdate('composing', sender);
        const result = await askAgent(name, task);
        if (result.success) {
          await sock.sendMessage(sender, { text: `*🤖 ${name}:*\n${result.response}` });
        } else {
          await sock.sendMessage(sender, { text: `Error: ${result.error}` });
        }
        break;
      }

      case 'all':
      case 'multi': {
        const task = parts.slice(1).join(' ');
        if (!task) {
          return sock.sendMessage(sender, { text: 'Usage: !agent all <task>' });
        }
        await sock.sendMessage(sender, { text: '🔄 Running task across all agents...' });
        const result = await runMultiAgentTask(task, []);
        if (result.success) {
          let text = '*📊 Multi-Agent Results*\n\n';
          result.results.forEach(r => {
            text += `*🤖 ${r.agent}:*\n${r.response.substring(0, 500)}\n\n`;
          });
          if (text.length > 4000) text = text.substring(0, 4000) + '\n\n...(truncated)';
          await sock.sendMessage(sender, { text });
        } else {
          await sock.sendMessage(sender, { text: `Error: ${result.error}` });
        }
        break;
      }

      case 'kill': {
        const name = parts[1];
        if (!name) return sock.sendMessage(sender, { text: 'Usage: !agent kill <name>' });
        const result = killAgent(name);
        await sock.sendMessage(sender, {
          text: result.success ? `✅ Agent "${name}" removed.` : `Error: ${result.error}`,
        });
        break;
      }

      case 'killall': {
        const result = killAllAgents();
        await sock.sendMessage(sender, { text: `✅ ${result.count} agent(s) removed.` });
        break;
      }

      default:
        await sock.sendMessage(sender, { text: `Unknown subcommand: ${subCmd}. Use !agent for help.` });
    }
  },
};
