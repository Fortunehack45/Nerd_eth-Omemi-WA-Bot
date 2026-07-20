var fs = require('fs');
var path = require('path');

var OUTPUT_DIR = path.join(__dirname, '..', '..', 'storage', 'generated');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
}

function generateTxt(content, filename) {
  filename = filename || 'document_' + Date.now();
  var filePath = path.join(OUTPUT_DIR, sanitize(filename) + '.txt');
  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true, filePath: filePath, filename: filename + '.txt' };
}

function generateMd(content, filename) {
  filename = filename || 'document_' + Date.now();
  var filePath = path.join(OUTPUT_DIR, sanitize(filename) + '.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true, filePath: filePath, filename: filename + '.md' };
}

async function generatePdf(content, filename) {
  try {
    var PDFDocument = require('pdfkit');
    filename = filename || 'document_' + Date.now();
    var filePath = path.join(OUTPUT_DIR, sanitize(filename) + '.pdf');
    var doc = new PDFDocument({ margin: 50 });
    var stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.startsWith('# ')) {
        doc.fontSize(24).font('Helvetica-Bold');
        doc.text(line.substring(2), { underline: false });
        doc.fontSize(12).font('Helvetica');
      } else if (line.startsWith('## ')) {
        doc.fontSize(20).font('Helvetica-Bold');
        doc.text(line.substring(3));
        doc.fontSize(12).font('Helvetica');
      } else if (line.startsWith('### ')) {
        doc.fontSize(16).font('Helvetica-Bold');
        doc.text(line.substring(4));
        doc.fontSize(12).font('Helvetica');
      } else if (line.startsWith('---') || line.startsWith('***')) {
        doc.moveDown(0.5);
        doc.fontSize(10).text('─'.repeat(60));
        doc.moveDown(0.5);
      } else if (line.trim() === '') {
        doc.moveDown(0.5);
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        doc.text('  • ' + line.substring(2));
      } else if (line.match(/^\d+\.\s/)) {
        doc.text('  ' + line);
      } else {
        if (line.length > 80) {
          var wrapped = line.match(/.{1,80}/g) || [line];
          wrapped.forEach(function(w) { doc.text(w); });
        } else {
          doc.text(line);
        }
      }
    }

    doc.end();
    await new Promise(function(resolve, reject) {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    return { success: true, filePath: filePath, filename: filename + '.pdf' };
  } catch (err) {
    return { error: 'PDF generation failed: ' + err.message };
  }
}

async function generateDocx(content, filename) {
  try {
    var docx = require('docx');
    filename = filename || 'document_' + Date.now();
    var filePath = path.join(OUTPUT_DIR, sanitize(filename) + '.docx');

    var paragraphs = [];
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.startsWith('# ')) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: line.substring(2), bold: true, size: 48 })], spacing: { after: 200 } }));
      } else if (line.startsWith('## ')) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: line.substring(3), bold: true, size: 36 })], spacing: { after: 200 } }));
      } else if (line.startsWith('### ')) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: line.substring(4), bold: true, size: 28 })], spacing: { after: 200 } }));
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: '  • ' + line.substring(2), size: 24 })], spacing: { after: 100 } }));
      } else if (line.match(/^\d+\.\s/)) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: line, size: 24 })], spacing: { after: 100 } }));
      } else if (line.trim() === '') {
        paragraphs.push(new docx.Paragraph({ spacing: { after: 100 } }));
      } else if (line.startsWith('---') || line.startsWith('***')) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: '───────────────', size: 20 })], spacing: { after: 100 } }));
      } else {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun({ text: line, size: 24 })], spacing: { after: 100 } }));
      }
    }

    var doc = new docx.Document({ sections: [{ children: paragraphs }] });
    var buffer = await docx.Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath: filePath, filename: filename + '.docx' };
  } catch (err) {
    return { error: 'DOCX generation failed: ' + err.message };
  }
}

async function generateFile(type, content, filename) {
  type = type.toLowerCase();
  switch (type) {
    case 'txt':
      return generateTxt(content, filename);
    case 'md':
    case 'markdown':
      return generateMd(content, filename);
    case 'pdf':
      return await generatePdf(content, filename);
    case 'docx':
    case 'doc':
      return await generateDocx(content, filename);
    default:
      return { error: 'Unsupported format: ' + type + '. Supported: pdf, docx, md, txt' };
  }
}

module.exports = { generateFile, generateTxt, generateMd, generatePdf, generateDocx };
