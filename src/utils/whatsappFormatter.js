/**
 * whatsappFormatter.js
 * Comprehensive formatting engine for WhatsApp:
 * 1. Converts LaTeX math expressions into clean, elegant Unicode typography (Meta AI style).
 * 2. Formats Markdown tables into aligned monospace box tables or mobile cards.
 * 3. Polishes Markdown headers, bullet points, and spacing for native WhatsApp reading.
 */

// ─── Unicode Mapping Tables ──────────────────────────────────────────────────

const SUPERSCRIPT_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ',
  'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ',
  'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ',
  't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ',
  'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴷ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ',
  'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'T': 'ᵀ', 'U': 'ᵁ', 'W': 'ᵂ',
};

const SUBSCRIPT_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ',
  'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ',
  's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ',
};

const GREEK_MAP = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\Delta': 'Δ',
  '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
  '\\theta': 'θ', '\\Theta': 'Θ', '\\vartheta': 'ϑ', '\\iota': 'ι',
  '\\kappa': 'κ', '\\lambda': 'λ', '\\Lambda': 'Λ', '\\mu': 'μ',
  '\\nu': 'ν', '\\xi': 'ξ', '\\Xi': 'Ξ', '\\pi': 'π', '\\Pi': 'Π',
  '\\rho': 'ρ', '\\sigma': 'σ', '\\Sigma': 'Σ', '\\tau': 'τ',
  '\\upsilon': 'υ', '\\phi': 'φ', '\\Phi': 'Φ', '\\varphi': 'ϕ',
  '\\chi': 'χ', '\\psi': 'ψ', '\\Psi': 'Ψ', '\\omega': 'ω', '\\Omega': 'Ω',
};

const SYMBOL_MAP = {
  '\\to': '→', '\\rightarrow': '→', '\\longrightarrow': '→',
  '\\leftarrow': '←', '\\longleftarrow': '←',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔',
  '\\leftrightarrow': '↔', '\\mapsto': '↦',
  '\\cdot': '·', '\\times': '×', '\\div': '÷',
  '\\pm': '±', '\\mp': '∓',
  '\\neq': '≠', '\\ne': '≠',
  '\\approx': '≈', '\\sim': '~', '\\equiv': '≡', '\\cong': '≅',
  '\\leq': '≤', '\\le': '≤',
  '\\geq': '≥', '\\ge': '≥',
  '\\ll': '≪', '\\gg': '≫',
  '\\infty': '∞',
  '\\in': '∈', '\\notin': '∉', '\\ni': '∋',
  '\\subset': '⊂', '\\subseteq': '⊆',
  '\\supset': '⊃', '\\supseteq': '⊇',
  '\\cup': '∪', '\\cap': '∩',
  '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄',
  '\\emptyset': '∅', '\\empty': '∅',
  '\\nabla': '∇', '\\partial': '∂',
  '\\circ': '°', '\\degree': '°',
  '\\dots': '…', '\\ldots': '…', '\\cdots': '⋯', '\\ddots': '⋱', '\\vdots': '⋮',
  '\\prime': '′',
  '\\angle': '∠', '\\perp': '⊥',
  '\\hbar': 'ħ',
};

function toSuperscript(str) {
  return str.split('').map(ch => SUPERSCRIPT_MAP[ch] || ch).join('');
}

function toSubscript(str) {
  return str.split('').map(ch => SUBSCRIPT_MAP[ch] || ch).join('');
}

// ─── Balanced Brace Parser for \frac{A}{B}, \sqrt{A}, etc. ──────────────────

function parseBalancedBrace(str, startIndex) {
  if (startIndex >= str.length || str[startIndex] !== '{') return null;
  var depth = 0;
  for (var i = startIndex; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        return { content: str.slice(startIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}

// ─── LaTeX to Clean Unicode Converter ────────────────────────────────────────

function cleanLatexMath(rawMath) {
  if (!rawMath) return '';
  var s = rawMath.trim();

  // Strip outer delimiters if present
  s = s.replace(/^\\\[\s*/, '').replace(/\s*\\\]$/, '');
  s = s.replace(/^\$\$\s*/, '').replace(/\s*\$\$$/, '');
  s = s.replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '');
  s = s.replace(/^\$\s*/, '').replace(/\s*\$$/, '');

  // 1. Convert text blocks: \text{...}, \mathrm{...}, \mathbf{...}, \operatorname{...}
  s = s.replace(/\\(text|mathrm|mathbf|mathit|operatorname)\{([^}]+)\}/g, ' $2 ');

  // 2. Greek Letters
  for (var greek in GREEK_MAP) {
    var gRegex = new RegExp(greek.replace('\\', '\\\\') + '(?![a-zA-Z])', 'g');
    s = s.replace(gRegex, GREEK_MAP[greek]);
  }

  // 3. Mathematical Symbols
  for (var sym in SYMBOL_MAP) {
    var sRegex = new RegExp(sym.replace('\\', '\\\\') + '(?![a-zA-Z])', 'g');
    s = s.replace(sRegex, SYMBOL_MAP[sym]);
  }

  // 4. Fractions: \frac{A}{B}, \dfrac{A}{B}, \tfrac{A}{B}
  var fracRegex = /\\(frac|dfrac|tfrac)\s*\{/;
  var safetyLimit = 50;
  while (fracRegex.test(s) && safetyLimit > 0) {
    safetyLimit--;
    var match = s.match(fracRegex);
    if (!match) break;
    var startNum = match.index + match[0].length - 1;
    var numParsed = parseBalancedBrace(s, startNum);
    if (!numParsed) break;
    var afterNumIdx = numParsed.endIndex + 1;
    // skip optional whitespace between braces
    while (afterNumIdx < s.length && /\s/.test(s[afterNumIdx])) afterNumIdx++;
    var denParsed = parseBalancedBrace(s, afterNumIdx);
    if (!denParsed) break;

    var numText = cleanLatexMath(numParsed.content).trim();
    var denText = cleanLatexMath(denParsed.content).trim();

    // Pretty fraction formatting
    var formattedFrac = '';
    var isSimpleNum = /^[a-zA-Z0-9α-ωΑ-Ω·\s]+$/.test(numText) && numText.length <= 8;
    var isSimpleDen = /^[a-zA-Z0-9α-ωΑ-Ω·\s]+$/.test(denText) && denText.length <= 8;

    // Standard differentials: d/dx, df/dx, d²y/dx²
    if (numText === 'd' && denText === 'dx') {
      formattedFrac = 'd/dx';
    } else if (numText.startsWith('d') && denText.startsWith('d') && numText.length <= 3 && denText.length <= 3) {
      formattedFrac = numText + '/' + denText;
    } else if (isSimpleNum && isSimpleDen) {
      formattedFrac = numText + ' / ' + denText;
    } else {
      var numWrap = (numText.includes('+') || numText.includes('-') || numText.includes(' ') || numText.includes('/')) ? ('[' + numText + ']') : numText;
      var denWrap = (denText.includes('+') || denText.includes('-') || denText.includes(' ') || denText.includes('/')) ? ('(' + denText + ')') : denText;
      formattedFrac = numWrap + ' / ' + denWrap;
    }

    s = s.slice(0, match.index) + formattedFrac + s.slice(denParsed.endIndex + 1);
  }

  // 5. Roots: \sqrt[n]{x} and \sqrt{x}
  s = s.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, function(_, root, val) {
    return toSuperscript(root) + '√(' + cleanLatexMath(val).trim() + ')';
  });
  s = s.replace(/\\sqrt\{([^}]+)\}/g, function(_, val) {
    var cleaned = cleanLatexMath(val).trim();
    return cleaned.length <= 3 ? ('√' + cleaned) : ('√(' + cleaned + ')');
  });

  // 6. Limits: \lim_{h \to 0} or \lim_{x \rightarrow a}
  s = s.replace(/\\lim_\{([^}]+)\}/g, function(_, limitExpr) {
    var cleanedExpr = cleanLatexMath(limitExpr).replace(/\\to|\\rightarrow/g, '→').trim();
    return 'lim (' + cleanedExpr + ') ';
  });
  s = s.replace(/\\lim\s*\(([^)]+)\)/g, 'lim ($1) ');

  // 7. Integrals: \int_{a}^{b} or \int_a^b or \int
  s = s.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, function(_, lower, upper) {
    var lo = cleanLatexMath(lower).trim();
    var up = cleanLatexMath(upper).trim();
    var subLo = toSubscript(lo);
    var supUp = toSuperscript(up);
    return (subLo !== lo || supUp !== up) ? ('∫' + subLo + supUp + ' ') : ('∫ (' + lo + ' to ' + up + ') ');
  });
  s = s.replace(/\\int_([a-zA-Z0-9])\^([a-zA-Z0-9])/g, function(_, lower, upper) {
    return '∫' + toSubscript(lower) + toSuperscript(upper) + ' ';
  });
  s = s.replace(/\\int_\{([^}]+)\}/g, function(_, lower) {
    return '∫' + toSubscript(cleanLatexMath(lower).trim()) + ' ';
  });
  s = s.replace(/\\iiint/g, '∭ ');
  s = s.replace(/\\iint/g, '∬ ');
  s = s.replace(/\\oint/g, '∮ ');
  s = s.replace(/\\int(?![a-zA-Z])/g, '∫ ');

  // 8. Summations and Products: \sum_{i=1}^{n}, \prod_{i=1}^{n}
  s = s.replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, function(_, lower, upper) {
    return '∑ (' + cleanLatexMath(lower).trim() + ' to ' + cleanLatexMath(upper).trim() + ') ';
  });
  s = s.replace(/\\sum_\{([^}]+)\}/g, function(_, lower) {
    return '∑ (' + cleanLatexMath(lower).trim() + ') ';
  });
  s = s.replace(/\\sum(?![a-zA-Z])/g, '∑ ');

  s = s.replace(/\\prod_\{([^}]+)\}\^\{([^}]+)\}/g, function(_, lower, upper) {
    return '∏ (' + cleanLatexMath(lower).trim() + ' to ' + cleanLatexMath(upper).trim() + ') ';
  });
  s = s.replace(/\\prod(?![a-zA-Z])/g, '∏ ');

  // 9. Superscripts: x^{n-1} or x^2 or e^{-x^2}
  s = s.replace(/\^\{([^}]+)\}/g, function(_, exp) {
    var rawExp = exp.replace(/\s+/g, '').replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\^([0-9a-z])/g, function(__, c) { return SUPERSCRIPT_MAP[c] || c; });
    var superStr = toSuperscript(rawExp);
    var canFullyConvert = rawExp.split('').every(ch => SUPERSCRIPT_MAP[ch] !== undefined);
    return canFullyConvert ? superStr : ('^(' + exp.trim() + ')');
  });
  s = s.replace(/\^([0-9a-zA-Z+\-])/g, function(_, exp) {
    return toSuperscript(exp);
  });

  // 10. Subscripts: x_{0} or x_0 or G_{\mu\nu}
  s = s.replace(/_\{([^}]+)\}/g, function(_, sub) {
    var rawSub = sub.replace(/\s+/g, '');
    var subStr = toSubscript(rawSub);
    var canFullyConvert = rawSub.split('').every(ch => SUBSCRIPT_MAP[ch] !== undefined);
    return canFullyConvert ? subStr : ('_' + sub.trim());
  });
  s = s.replace(/_([0-9a-zA-Z+\-])/g, function(_, sub) {
    return toSubscript(sub);
  });

  // 11. Left/Right & Sizing Delimiters
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\s*\(/g, '(');
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\s*\[/g, '[');
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\s*\\?\{/g, '{');
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\s*\|/g, '|');
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\s*\)/g, ')');
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\s*\]/g, ']');
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\s*\\?\}/g, '}');
  s = s.replace(/\\?(left|right|big[lr]?|Big[lr]?|bigg[lr]?|Bigg[lr]?)\./g, '');
  s = s.replace(/\b(bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr)\b/g, '');

  // 12. Spacing commands
  s = s.replace(/\\qquad/g, '    ');
  s = s.replace(/\\quad/g, '   ');
  s = s.replace(/\\[,;:!]/g, ' ');

  // 13. Primes: f'(x) -> f′(x)
  s = s.replace(/'/g, '′');

  // 14. Common cleanups
  s = s.replace(/\\,/g, ' ');
  s = s.replace(/\\ /g, ' ');
  s = s.replace(/\\backslash/g, '\\');
  s = s.replace(/\\\\/g, '\n');

  // Remove any remaining unrecognized backslashes before plain words
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');

  // Normalize spacing around operators (excluding superscripts and subscripts)
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/(?<=[^\s⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸᵃᵇᶜᵈᵉᵐᵖʳˢᵗᶻ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ])\s*([=+\-−×÷·→⇒≤≥≠≈])\s*(?=[^\s⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸᵃᵇᶜᵈᵉᵐᵖʳˢᵗᶻ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ])/g, ' $1 ');
  s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  s = s.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');

  return s;
}

// ─── Table Parser & Formatter ────────────────────────────────────────────────

function formatMarkdownTables(text) {
  var lines = text.split('\n');
  var outLines = [];
  var inTable = false;
  var tableBuffer = [];

  function flushTable() {
    if (tableBuffer.length === 0) return;
    var formatted = renderTable(tableBuffer);
    outLines.push(formatted);
    tableBuffer = [];
    inTable = false;
  }

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var isTableRow = /^\s*\|.*\|\s*$/.test(line);

    if (isTableRow) {
      inTable = true;
      tableBuffer.push(line);
    } else {
      if (inTable) flushTable();
      outLines.push(line);
    }
  }
  if (inTable) flushTable();

  return outLines.join('\n');
}

function renderTable(tableLines) {
  // Parse rows and strip outer pipes
  var rows = [];
  for (var line of tableLines) {
    var trimmed = line.trim();
    if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
    if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
    var cells = trimmed.split('|').map(c => c.trim());
    rows.push(cells);
  }

  if (rows.length < 2) {
    return tableLines.join('\n');
  }

  // Row 0 is headers
  var headers = rows[0];
  var dataRows = [];

  // Check if row 1 is separator (e.g. |---|:---:|)
  for (var r = 1; r < rows.length; r++) {
    var isSep = rows[r].every(c => /^[:\s\-]+$/.test(c));
    if (!isSep) {
      dataRows.push(rows[r]);
    }
  }

  if (dataRows.length === 0) {
    return tableLines.join('\n');
  }

  var numCols = headers.length;
  // Pad data rows to match header length
  dataRows = dataRows.map(r => {
    while (r.length < numCols) r.push('');
    return r.slice(0, numCols);
  });

  // Calculate column widths
  var colWidths = [];
  for (var c = 0; c < numCols; c++) {
    var maxLen = headers[c].length;
    for (var d of dataRows) {
      if (d[c] && d[c].length > maxLen) maxLen = d[c].length;
    }
    colWidths.push(Math.max(maxLen, 3));
  }

  var totalMonospaceWidth = colWidths.reduce((a, b) => a + b, 0) + (numCols - 1) * 3 + 4;

  // Decide: If compact (<= 3 cols and total width <= 36 characters), format as Monospace Box Table
  if (numCols <= 3 && totalMonospaceWidth <= 38) {
    var pad = (str, len) => str + ' '.repeat(Math.max(0, len - str.length));

    var topBorder = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
    var midBorder = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
    var botBorder = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';

    var headerRow = '│ ' + headers.map((h, idx) => pad(h, colWidths[idx])).join(' │ ') + ' │';
    var rowStrings = dataRows.map(r => {
      return '│ ' + r.map((cell, idx) => pad(cell, colWidths[idx])).join(' │ ') + ' │';
    });

    var boxLines = [
      '```',
      topBorder,
      headerRow,
      midBorder,
      ...rowStrings,
      botBorder,
      '```',
    ];
    return boxLines.join('\n');
  }

  // Otherwise: Render as clean, elegant Mobile Card blocks (no line wrap glitches on phones!)
  var cardBlocks = [];
  for (var row of dataRows) {
    var cardLines = [];
    var titleCell = row[0] || 'Item';
    var firstHeader = headers[0] || 'Name';

    // If first column looks like a name/title, make it the card header
    cardLines.push('📌 *' + titleCell + '*');

    for (var colIdx = 1; colIdx < numCols; colIdx++) {
      var colName = headers[colIdx];
      var colVal = row[colIdx];
      if (colVal) {
        cardLines.push('   ▸ *' + colName + ':* ' + colVal);
      }
    }
    cardBlocks.push(cardLines.join('\n'));
  }

  return cardBlocks.join('\n\n');
}

// ─── Main Formatter Pipeline ─────────────────────────────────────────────────

/**
 * Format any AI or user-facing text for WhatsApp.
 * Converts LaTeX math formulas to Unicode, tables to cards/boxes, and cleans up formatting.
 * @param {string} text Raw text string
 * @returns {string} Clean WhatsApp-ready formatted text
 */
function formatForWhatsApp(text) {
  if (!text || typeof text !== 'string') return text || '';

  // Step 1: Protect existing code blocks (```...``` and `...`)
  var codeBlocks = [];
  var placeholder = '__NERD_CODE_BLOCK_';
  var protectedText = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, function(match) {
    var id = placeholder + codeBlocks.length + '__';
    codeBlocks.push(match);
    return id;
  });

  // Step 2: Extract and convert LaTeX Math Blocks & Inlines
  // 2a. Block math: \[ ... \] and $$ ... $$
  protectedText = protectedText.replace(/\\\[([\s\S]*?)\\\]/g, function(_, mathContent) {
    var cleaned = cleanLatexMath(mathContent);
    return '\n' + cleaned + '\n';
  });

  protectedText = protectedText.replace(/\$\$([\s\S]*?)\$\$/g, function(_, mathContent) {
    var cleaned = cleanLatexMath(mathContent);
    return '\n' + cleaned + '\n';
  });

  // 2b. Inline math: \( ... \) and $ ... $ (avoiding currency amounts like $50 or $3.99)
  protectedText = protectedText.replace(/\\\(([\s\S]*?)\\\)/g, function(_, mathContent) {
    return cleanLatexMath(mathContent);
  });

  // Match $...$ where content has math signs or backslashes, not just digits/currency
  protectedText = protectedText.replace(/\$([^\$\n]+?)\$/g, function(full, inner) {
    // If it's pure currency like $10, $5.99, skip
    if (/^\s*\d+(\.\d+)?\s*$/.test(inner)) return full;
    // If it contains math indicators (\, =, +, -, ^, _, \to, etc.)
    if (/[\\[\]{}^_+=<>×·÷∫∑lim]/i.test(inner) || inner.length > 1) {
      return cleanLatexMath(inner);
    }
    return full;
  });

  // Step 3: Catch any residual standalone LaTeX lines (e.g. f'(x) = \lim... without enclosing delimiters)
  protectedText = protectedText.replace(/(?:^|\n)([^\n]*?(?:\\frac|\\lim|\\int|\\sum|\\cdot|\\to|\\sqrt)[^\n]*)(?:\n|$)/g, function(full, line) {
    return '\n' + cleanLatexMath(line) + '\n';
  });

  // Step 4: Markdown Tables -> Clean Monospace Box or Mobile Cards
  protectedText = formatMarkdownTables(protectedText);

  // Step 5: WhatsApp Typography Polish
  // Convert markdown # headings into WhatsApp *bold* headings
  protectedText = protectedText.replace(/^#{1,6}\s+(.+)$/gm, function(_, title) {
    return '*' + title.trim() + '*';
  });

  // Polish dash bullets to clean arrows or bullet dots
  protectedText = protectedText.replace(/^(\s*)-\s+/gm, '$1• ');

  // Step 6: Restore code blocks
  for (var i = 0; i < codeBlocks.length; i++) {
    var blockId = placeholder + i + '__';
    protectedText = protectedText.replace(blockId, codeBlocks[i]);
  }

  // Clean excessive blank lines (max 2 consecutive newlines)
  protectedText = protectedText.replace(/\n{3,}/g, '\n\n');

  return protectedText.trim();
}

module.exports = {
  formatForWhatsApp,
  cleanLatexMath,
  formatMarkdownTables,
  toSuperscript,
  toSubscript,
};
