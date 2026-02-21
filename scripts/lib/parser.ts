export interface LawTarget {
  id: string;
  seedFile: string;
  documentId: number;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  description: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedLaw {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url: string;
  description: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

export const TARGET_LAWS: LawTarget[] = [
  {
    id: 'law-11-1991',
    seedFile: 'law-11-1991-unfair-competition.json',
    documentId: 1440,
    title_en: 'Law No. 11/1991 on Combating Unfair Competition',
    short_name: 'Legea concurentei neloiale',
    status: 'in_force',
    description:
      'Core unfair-competition law, including anti-confusion, trade secret protections, and sanctions for unfair commercial practices.',
  },
  {
    id: 'law-190-2018',
    seedFile: 'law-190-2018-gdpr.json',
    documentId: 203151,
    title_en: 'Law No. 190/2018 Implementing GDPR',
    short_name: 'Legea GDPR',
    status: 'in_force',
    description:
      'Romanian GDPR implementation law setting national rules on processing contexts, supervisory powers, and sanctions.',
  },
  {
    id: 'law-242-2022',
    seedFile: 'law-242-2022-digital-interoperability.json',
    documentId: 257856,
    title_en: 'Law No. 242/2022 on Data Exchange and National Interoperability Platform',
    short_name: 'Legea interoperabilitatii',
    status: 'in_force',
    description:
      'Framework for administrative interoperability and data exchange between public-sector information systems.',
  },
  {
    id: 'law-286-2009-cyber',
    seedFile: 'law-286-2009-criminal-code-cyber.json',
    documentId: 109855,
    title_en: 'Criminal Code (Law No. 286/2009)',
    short_name: 'Codul penal',
    status: 'in_force',
    description:
      'Romanian Criminal Code, including cybercrime-relevant offences (e.g., unauthorized access and system-related crimes).',
  },
  {
    id: 'law-362-2018',
    seedFile: 'law-362-2018-cybersecurity.json',
    documentId: 209670,
    title_en: 'Law No. 362/2018 on a High Common Level of Network and Information Systems Security',
    short_name: 'Legea NIS',
    status: 'in_force',
    description:
      'Romania NIS implementation law on cybersecurity obligations, incident reporting, and competent authorities.',
  },
  {
    id: 'law-365-2002',
    seedFile: 'law-365-2002-ecommerce.json',
    documentId: 77218,
    title_en: 'Law No. 365/2002 on Electronic Commerce (Republished)',
    short_name: 'Legea comertului electronic',
    status: 'in_force',
    description:
      'Romania e-commerce framework covering online services, information duties, and intermediary liability provisions.',
  },
  {
    id: 'law-455-2001',
    seedFile: 'law-455-2001-esignatures.json',
    documentId: 157828,
    title_en: 'Law No. 455/2001 on Electronic Signature (Republished)',
    short_name: 'Legea semnaturii electronice',
    status: 'in_force',
    description:
      'Legal framework for electronic signatures and related trust-service effects in Romanian law.',
  },
  {
    id: 'law-506-2004',
    seedFile: 'law-506-2004-ecomms-privacy.json',
    documentId: 56973,
    title_en: 'Law No. 506/2004 on Privacy in the Electronic Communications Sector',
    short_name: 'Legea ePrivacy',
    status: 'in_force',
    description:
      'Sectoral communications privacy law on confidentiality, traffic data, and electronic communications processing.',
  },
  {
    id: 'law-544-2001',
    seedFile: 'law-544-2001-foia.json',
    documentId: 31413,
    title_en: 'Law No. 544/2001 on Free Access to Public Interest Information',
    short_name: 'Legea accesului la informatii',
    status: 'in_force',
    description:
      'Romanian freedom-of-information law establishing access rights, obligations of authorities, and remedies.',
  },
  {
    id: 'oug-98-2010',
    seedFile: 'oug-98-2010-critical-infrastructure.json',
    documentId: 123547,
    title_en:
      'Emergency Ordinance No. 98/2010 on Identification, Designation and Protection of Critical Infrastructures',
    short_name: 'OUG infrastructuri critice',
    status: 'in_force',
    description:
      'Critical infrastructure protection framework, including designation criteria and institutional responsibilities.',
  },
];

interface HeadingState {
  part?: string;
  title?: string;
  chapter?: string;
  section?: string;
}

interface HeadingEvent {
  pos: number;
  level: 'part' | 'title' | 'chapter' | 'section';
  text: string;
}

const MONTHS_RO: Record<string, string> = {
  ianuarie: '01',
  februarie: '02',
  martie: '03',
  aprilie: '04',
  mai: '05',
  iunie: '06',
  iulie: '07',
  august: '08',
  septembrie: '09',
  octombrie: '10',
  noiembrie: '11',
  decembrie: '12',
};

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    }

    if (entity.startsWith('#')) {
      const codePoint = parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    }

    return ENTITY_MAP[entity] ?? _;
  });
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHtmlText(html: string): string {
  return normalizeWhitespace(decodeHtmlEntities(stripTags(html)));
}

function parseRomanianDate(text: string): string | undefined {
  const match = text.match(/(\d{1,2})\s+([a-zăâîșţț]+)\s+(\d{4})/iu);
  if (!match) return undefined;

  const day = match[1].padStart(2, '0');
  const monthName = match[2].toLowerCase();
  const year = match[3];
  const month = MONTHS_RO[monthName];
  if (!month) return undefined;

  return `${year}-${month}-${day}`;
}

function extractConsolidatedForm(html: string): string {
  const start = html.indexOf('<div id="div_Formaconsolidata"');
  if (start < 0) {
    throw new Error('Could not locate consolidated form container (div_Formaconsolidata).');
  }

  const end = html.indexOf('<div id="div_Formerepublicate"', start);
  if (end < 0) {
    return html.slice(start);
  }

  return html.slice(start, end);
}

function extractBalancedSpan(html: string, start: number): { value: string; end: number } | null {
  if (start < 0 || start >= html.length || !html.startsWith('<span', start)) {
    return null;
  }

  const tokenRegex = /<\/?span\b[^>]*>/gi;
  tokenRegex.lastIndex = start;

  let depth = 0;
  let end = -1;

  let token = tokenRegex.exec(html);
  while (token) {
    const raw = token[0];
    const isClosing = raw.startsWith('</');
    const isSelfClosing = /\/>\s*$/.test(raw);

    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        end = tokenRegex.lastIndex;
        break;
      }
    } else if (!isSelfClosing) {
      depth += 1;
    }

    token = tokenRegex.exec(html);
  }

  if (end < 0) return null;

  return { value: html.slice(start, end), end };
}

function extractClassSpanInnerHtml(html: string, className: string): string | undefined {
  const classRegex = new RegExp(`<span class=\"[^\"]*\\b${className}\\b[^\"]*\"[^>]*>`, 'i');
  const startMatch = classRegex.exec(html);
  if (!startMatch || startMatch.index === undefined) {
    return undefined;
  }

  const absoluteStart = startMatch.index;
  const balanced = extractBalancedSpan(html, absoluteStart);
  if (!balanced) return undefined;

  return balanced.value
    .replace(/^<span\b[^>]*>/i, '')
    .replace(/<\/span>\s*$/i, '');
}

function normalizeArticleContent(bodyHtml: string): string {
  let text = bodyHtml;

  text = text.replace(/<!--[^]*?-->/g, ' ');
  text = text.replace(/<span[^>]*class=\"[^\"]*TAG_COLLAPSED[^\"]*\"[^>]*>[^]*?<\/span>/gi, ' ');
  text = text.replace(/<span[^>]*class=\"[^\"]*_SHORT[^\"]*\"[^>]*>[^]*?<\/span>/gi, ' ');
  text = text.replace(/<br\s*\/?\s*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');

  const cleaned = decodeHtmlEntities(stripTags(text));
  const lines = cleaned
    .split('\n')
    .map(line => normalizeWhitespace(line))
    .filter(line => line.length > 0);

  return normalizeWhitespace(lines.join(' '));
}

function parseSectionFromTitle(title: string, fallbackIndex: number): string {
  const patterns = [
    /Articolul\s+([0-9]+(?:\^[0-9]+)?[A-Za-z]?)/i,
    /Art\.\s*([0-9]+(?:\^[0-9]+)?[A-Za-z]?)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, '');
    }
  }

  return String(fallbackIndex);
}

function parseHeadingEvents(html: string): HeadingEvent[] {
  const events: HeadingEvent[] = [];

  const mappings: Array<{ regex: RegExp; level: HeadingEvent['level']; denClass: string }> = [
    { regex: /<span class=\"[^\"]*S_PRT_TTL[^\"]*\"[^>]*>/gi, level: 'part', denClass: 'S_PRT_DEN' },
    { regex: /<span class=\"[^\"]*S_TTL_TTL[^\"]*\"[^>]*>/gi, level: 'title', denClass: 'S_TTL_DEN' },
    { regex: /<span class=\"[^\"]*S_CAP_TTL[^\"]*\"[^>]*>/gi, level: 'chapter', denClass: 'S_CAP_DEN' },
    { regex: /<span class=\"[^\"]*S_SEC_TTL[^\"]*\"[^>]*>/gi, level: 'section', denClass: 'S_SEC_DEN' },
  ];

  for (const { regex, level, denClass } of mappings) {
    let match = regex.exec(html);
    while (match) {
      const openStart = match.index;
      const ttlBlock = extractBalancedSpan(html, openStart);
      if (ttlBlock) {
        const ttlText = cleanHtmlText(ttlBlock.value);

        const windowEnd = Math.min(html.length, ttlBlock.end + 1200);
        const trailing = html.slice(ttlBlock.end, windowEnd);
        const denRegex = new RegExp(`<span class=\"[^\"]*${denClass}[^\"]*\"[^>]*>([\\s\\S]*?)<\\/span>`, 'i');
        const denMatch = denRegex.exec(trailing);
        const denText = denMatch ? cleanHtmlText(denMatch[1]) : '';

        const text = [ttlText, denText].filter(Boolean).join(' - ');
        if (text) {
          events.push({ pos: openStart, level, text });
        }
      }

      match = regex.exec(html);
    }
  }

  return events.sort((a, b) => a.pos - b.pos);
}

function buildHeadingAtPosition(events: HeadingEvent[], pos: number): HeadingState {
  const state: HeadingState = {};

  for (const event of events) {
    if (event.pos >= pos) break;
    if (event.level === 'part') state.part = event.text;
    if (event.level === 'title') state.title = event.text;
    if (event.level === 'chapter') state.chapter = event.text;
    if (event.level === 'section') state.section = event.text;
  }

  return state;
}

function headingToString(heading: HeadingState): string | undefined {
  const parts = [heading.part, heading.title, heading.chapter, heading.section].filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.join(' | ');
}

function extractDefinitions(provisions: ParsedProvision[]): ParsedDefinition[] {
  const definitions: ParsedDefinition[] = [];
  const seen = new Set<string>();

  for (const provision of provisions) {
    const contentLower = provision.content.toLowerCase();
    if (!/(în sensul|se înțelege|reprezintă|în înțelesul)/i.test(contentLower)) {
      continue;
    }

    const letterPattern = /([a-z])\)\s*([^;:.]{2,120}?)\s*(?:-|–|:)\s*([^;]{8,500})(?=;\s*[a-z]\)|\.|$)/gi;
    let letterMatch = letterPattern.exec(provision.content);
    while (letterMatch) {
      const term = normalizeWhitespace(letterMatch[2]);
      const definition = normalizeWhitespace(letterMatch[3]);
      const key = term.toLowerCase();

      if (term.length > 1 && definition.length > 8 && !seen.has(key)) {
        definitions.push({ term, definition, source_provision: provision.provision_ref });
        seen.add(key);
      }

      letterMatch = letterPattern.exec(provision.content);
    }

    const quotedPattern = /[„\"]([^\"”]+)[\"”]\s*(?:-|–|:)\s*([^;.]{8,500})(?=[.;]|$)/g;
    let quotedMatch = quotedPattern.exec(provision.content);
    while (quotedMatch) {
      const term = normalizeWhitespace(quotedMatch[1]);
      const definition = normalizeWhitespace(quotedMatch[2]);
      const key = term.toLowerCase();

      if (term.length > 1 && definition.length > 8 && !seen.has(key)) {
        definitions.push({ term, definition, source_provision: provision.provision_ref });
        seen.add(key);
      }

      quotedMatch = quotedPattern.exec(provision.content);
    }
  }

  return definitions;
}

function parseProvisions(html: string): ParsedProvision[] {
  const provisions: ParsedProvision[] = [];
  const headingEvents = parseHeadingEvents(html);

  const articleStartRegex = /<span class=\"[^\"]*\bS_ART\b[^\"]*\"[^>]*id=\"id_art[^\"]*\"[^>]*>/gi;
  const starts: number[] = [];
  let startMatch = articleStartRegex.exec(html);
  while (startMatch) {
    starts.push(startMatch.index);
    startMatch = articleStartRegex.exec(html);
  }

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : html.length;
    const articleChunk = html.slice(start, end);

    const titleHtml = extractClassSpanInnerHtml(articleChunk, 'S_ART_TTL');
    if (!titleHtml) continue;

    const denHtml = extractClassSpanInnerHtml(articleChunk, 'S_ART_DEN');
    const articleTitle = cleanHtmlText(titleHtml);
    const articleDen = denHtml ? cleanHtmlText(denHtml) : '';
    const fullTitle = [articleTitle, articleDen].filter(Boolean).join(' - ');

    const bodyStartMatch = /<span class=\"[^\"]*S_ART_BDY[^\"]*\"[^>]*>/i.exec(articleChunk);
    if (!bodyStartMatch || bodyStartMatch.index === undefined) continue;

    const bodySpan = extractBalancedSpan(articleChunk, bodyStartMatch.index);
    if (!bodySpan) continue;

    const bodyInnerHtml = bodySpan.value
      .replace(/^<span\b[^>]*>/i, '')
      .replace(/<\/span>\s*$/i, '');

    const content = normalizeArticleContent(bodyInnerHtml);
    if (!content) continue;

    const section = parseSectionFromTitle(articleTitle, i + 1);
    const heading = buildHeadingAtPosition(headingEvents, start);

    provisions.push({
      provision_ref: `Art.${section}`,
      chapter: headingToString(heading),
      section,
      title: fullTitle || `Articolul ${section}`,
      content,
    });
  }

  return provisions;
}

export function parseRomanianLawHtml(rawHtml: string, target: LawTarget): ParsedLaw {
  const html = extractConsolidatedForm(rawHtml);
  const denHtml = extractClassSpanInnerHtml(html, 'S_DEN');
  if (!denHtml) {
    throw new Error(`Could not extract law title (S_DEN) for ${target.id}`);
  }

  const title = cleanHtmlText(denHtml);
  const issuedDate = parseRomanianDate(title);
  const provisions = parseProvisions(html);
  const definitions = extractDefinitions(provisions);

  if (provisions.length === 0) {
    throw new Error(`No provisions extracted for ${target.id}`);
  }

  return {
    id: target.id,
    type: 'statute',
    title,
    title_en: target.title_en,
    short_name: target.short_name,
    status: target.status,
    issued_date: issuedDate,
    in_force_date: issuedDate,
    url: `https://legislatie.just.ro/Public/DetaliiDocument/${target.documentId}`,
    description: target.description,
    provisions,
    definitions,
  };
}
