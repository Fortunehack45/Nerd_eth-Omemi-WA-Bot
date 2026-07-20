var { generateFile } = require('../services/fileGenService');
var path = require('path');
var fs = require('fs');

var HELP = '*📄 File Generator*\n\nGenerate text files in various formats: PDF, DOCX, Markdown, or plain text.\n\n*Usage:* `!generate <format> <content>`\n\n*Formats:*\n  ▸ `pdf`   — Professional PDF document\n  ▸ `docx`  — Word document\n  ▸ `md`    — Markdown file\n  ▸ `txt`   — Plain text file\n\n*Flags:*\n  `--name, -n`  Custom filename (without extension)\n  `--send, -s`  Send the file immediately (default: yes)\n\n*Pro Tips for better output:*\n  • Use `# Title` for headings in PDF/DOCX/MD\n  • Use `## Subtitle` for subheadings\n  • Use `- item` or `* item` for bullet lists\n  • Use `1. item` for numbered lists\n  • Use `---` for horizontal separators\n  • Leave blank lines between sections\n\n*Examples:*\n  `!generate md # My Notes\\n\\n- First item\\n- Second item`\n  `!generate pdf # Project Report\\n\\nThis is the introduction.`\n  `!generate txt Hello World`\n  `!generate docx # Document Title\\n\\nBody text here. --name MyDoc`';

module.exports = {
  name: 'generate',
  alias: ['gen', 'file', 'createfile', 'make'],
  description: 'Generate files: PDF, DOCX, Markdown, or plain text',
  usage: '!generate <pdf|docx|md|txt> <content> [--name filename]',
  execute: async (sock, msg, args, ctx) => {
    var sender = ctx.sender;

    if (!args || args === '--help' || args === '-h') {
      return sock.sendMessage(sender, { text: HELP });
    }

    var parsed = require('../utils/helpers').parseFlags(args);
    var format = parsed.positional[0] && parsed.positional[0].toLowerCase();
    var content = parsed.positional.slice(1).join(' ');
    var flags = parsed.flags;
    var filename = flags.name || flags.n || '';
    var shouldSend = flags.send !== 'false' && flags.s !== 'false';

    if (!format || !['pdf', 'docx', 'md', 'txt', 'doc', 'markdown'].includes(format)) {
      return sock.sendMessage(sender, { text: 'Invalid format. Use: pdf, docx, md, or txt.\n\n' + HELP });
    }

    if (!content) {
      return sock.sendMessage(sender, { text: 'Please provide content for the file.\n\n*Usage:* `!generate ' + format + ' <content>`\n\n*Example:* `!generate md # Hello World\\n\\nThis is my document.`' });
    }

    content = content.replace(/\\n/g, '\n');
    var fmt = format === 'doc' ? 'docx' : format === 'markdown' ? 'md' : format;

    await sock.sendMessage(sender, { text: '📄 Generating ' + fmt.toUpperCase() + ' file...' });
    await sock.sendPresenceUpdate('composing', sender);

    var result = await generateFile(fmt, content, filename);
    if (result.error) {
      return sock.sendMessage(sender, { text: 'Error: ' + result.error + '\n\nTip: For PDF/DOCX, make sure content has proper formatting.' });
    }

    if (shouldSend) {
      try {
        var buffer = fs.readFileSync(result.filePath);
        var msgOptions = { document: buffer, fileName: result.filename, mimetype: getMimeType(fmt) };
        await sock.sendMessage(sender, msgOptions);
        try { fs.unlinkSync(result.filePath); } catch (e) {}
      } catch (err) {
        await sock.sendMessage(sender, { text: 'File saved but failed to send: ' + err.message + '\nPath: ' + result.filePath });
      }
    } else {
      await sock.sendMessage(sender, { text: '✅ File saved!\n*Path:* ' + result.filePath + '\n*Filename:* ' + result.filename + '\n*Size:* ' + (fs.statSync(result.filePath).size / 1024).toFixed(1) + ' KB' });
    }
  },
};

function getMimeType(fmt) {
  var map = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', md: 'text/markdown', txt: 'text/plain' };
  return map[fmt] || 'application/octet-stream';
}
