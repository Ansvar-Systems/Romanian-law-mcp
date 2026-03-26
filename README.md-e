# Romanian Law MCP Server

**The Monitorul Oficial alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fromanian-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/romanian-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Romanian-law-mcp?style=social)](https://github.com/Ansvar-Systems/Romanian-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Romanian-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Romanian-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Romanian-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Romanian-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-112%2C257-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **12,001 Romanian statutes** -- from the Legea privind protecția datelor and Codul Penal to the Codul Civil, Codul Muncii, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Romanian legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Romanian legal research means navigating legislatie.just.ro, monitoruloficial.ro, and EUR-Lex for EU implementation status -- across one of the largest national legislation corpora in Central and Eastern Europe. Whether you're:

- A **lawyer** validating citations before the Înalta Curte de Casație și Justiție (ICCJ) or Curtea Constituțională
- A **compliance officer** checking GDPR implementation under Legea 190/2018 or NIS2 requirements
- A **legal tech developer** building tools on Romanian law
- A **researcher** tracing EU directive transposition across 12,001 statutes

...you shouldn't need dozens of browser tabs and manual cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Romanian law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://romanian-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add romanian-law --transport http https://romanian-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "romanian-law": {
      "type": "url",
      "url": "https://romanian-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "romanian-law": {
      "type": "http",
      "url": "https://romanian-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/romanian-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "romanian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/romanian-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "romanian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/romanian-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, just ask naturally:

- *"Ce prevede Legea 190/2018 privind protecția datelor cu caracter personal despre consimțământ?"*
- *"Este Codul Penal în vigoare?"*
- *"Caută 'protecția datelor cu caracter personal' în legislația română"*
- *"Ce directive EU stau la baza Codului Muncii?"*
- *"Care legi române implementează Directiva NIS2?"*
- *"Ce prevede art. 325 din Codul Penal despre delapidare?"*
- *"Caută cerințe de notificare a incidentelor de securitate în legislația română"*
- *"Validează citatul 'art. 5, Legea 190/2018'"*
- *"Compară cerințele de protecție a datelor prin implementările NIS2 în dreptul român"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 12,001 statutes | Comprehensive Romanian legislation from legislatie.just.ro |
| **Provisions** | 112,257 articles | Full-text searchable with FTS5 |
| **Database Size** | 258 MB | Optimized SQLite, portable |
| **Daily Updates** | Automated | Freshness checks against official sources |

**Verified data only** -- every citation is validated against official sources (legislatie.just.ro, Monitorul Oficial). Zero LLM-generated content.

Romanian is one of the largest corpora in the fleet: 12,001 statutes reflecting Romania's comprehensive civil law tradition and full EU acquis transposition.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from legislatie.just.ro (Ministry of Justice portal) and Monitorul Oficial
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains statute text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by statute identifier + article number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
legislatie.just.ro / monitoruloficial.ro --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                                              ^                        ^
                                       Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search legislatie.just.ro by statute name | Search by plain Romanian: *"protecția datelor consimțământ"* |
| Navigate multi-article codes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Este această lege în vigoare?" -- check manually | `check_currency` tool -- answer in seconds |
| Find EU basis -- dig through EUR-Lex | `get_eu_basis` -- linked EU directives instantly |
| No API, no integration | MCP protocol -- AI-native |

**Traditional:** Caută pe legislatie.just.ro --> Navighează coduri multi-articol --> Ctrl+F --> Compară cu directive UE --> Repetă

**This MCP:** *"Ce act UE stă la baza art. 5 din Legea 190/2018 privind consimțământul?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 112,257 provisions with BM25 ranking. Supports Romanian, quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by statute identifier + article (e.g., "Legea 190/2018" + "5") |
| `check_currency` | Check if a statute is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check |
| `build_legal_stance` | Aggregate citations from multiple statutes for a legal topic |
| `format_citation` | Format citations per Romanian conventions (full/short/pinpoint) |
| `list_sources` | List all available statutes with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations for a Romanian statute |
| `get_romanian_implementations` | Find Romanian laws implementing a specific EU act |
| `search_eu_implementations` | Search EU documents with Romanian implementation counts |
| `get_provision_eu_basis` | Get EU law references for a specific provision |
| `validate_eu_compliance` | Check implementation status (future, requires EU MCP) |

---

## EU Law Integration

Romania joined the EU on 1 January 2007. All EU regulations apply directly; directives require transposition into Romanian law.

| Metric | Value |
|--------|-------|
| **EU Membership** | Since 1 January 2007 |
| **Acquis communautaire** | Full EU legal order applies |
| **GDPR** | Implemented via Legea 190/2018 |
| **NIS2** | Transposed via Legea 362/2023 privind securitatea rețelelor și sistemelor informatice |
| **AML5** | Implemented via Legea 129/2019 privind prevenirea și combaterea spălării banilor |
| **EUR-Lex Integration** | Cross-references link Romanian statutes to source EU acts |

### Key EU-Derived Romanian Legislation

1. **Legea 190/2018** -- GDPR implementation (Regulation 2016/679)
2. **Legea 362/2023** -- NIS2 transposition (Directive 2022/2555)
3. **Legea 297/2004** (updated via MiFID II legislation) -- Capital markets
4. **Legea 129/2019** -- AML directive transposition
5. **Legea 506/2004** -- ePrivacy Directive transposition

See [EU_INTEGRATION_GUIDE.md](docs/EU_INTEGRATION_GUIDE.md) for detailed documentation and [EU_USAGE_EXAMPLES.md](docs/EU_USAGE_EXAMPLES.md) for practical examples.

---

## Data Sources & Freshness

All content is sourced from authoritative Romanian legal databases:

- **[legislatie.just.ro](https://legislatie.just.ro/)** -- Ministry of Justice consolidated legislation portal
- **[Monitorul Oficial](https://www.monitoruloficial.ro/)** -- Official Gazette of Romania
- **[EUR-Lex](https://eur-lex.europa.eu/)** -- Official EU law database (cross-reference metadata)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Ministry of Justice of Romania |
| **Languages** | Romanian (sole official legislative language) |
| **Coverage** | All national Romanian legislation; EU regulations apply directly |
| **Source** | legislatie.just.ro |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors official sources for changes:

| Check | Method |
|-------|--------|
| **Statute amendments** | Drift detection against known provision anchors |
| **New statutes** | Comparison against legislatie.just.ro index |
| **Repealed statutes** | Status change detection |
| **EU reference staleness** | Flagged if >90 days old |

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from legislatie.just.ro (Ministry of Justice portal). However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research; consult the ICCJ database and Curtea Constituțională directly
> - **Verify critical citations** against primary sources for court filings
> - **EU cross-references** are derived from statute text, not EUR-Lex full text analysis
> - **Consolidated versions** on legislatie.just.ro may differ from Monitorul Oficial originals -- verify against the official gazette for legal proceedings

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. Consult Uniunea Națională a Barourilor din România (UNBR) guidelines on the use of AI tools in legal practice.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Romanian-law-mcp
cd Romanian-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                    # Ingest statutes from legislatie.just.ro
npm run ingest:full-laws          # Full law ingestion pipeline
npm run ingest:indexed-laws       # Ingest from index
npm run pipeline:full-corpus      # Run full corpus pipeline
npm run build:db                  # Rebuild SQLite database
npm run drift:detect              # Run drift detection against anchors
npm run check-updates             # Check for amendments
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** 258 MB (optimized, portable)
- **Reliability:** 100% ingestion success rate across 12,001 statutes

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Austria, Belgium, Bulgaria, Croatia, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Netherlands, Poland, Portugal, Slovakia, Slovenia, Spain, Sweden, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion (ICCJ, Curtea Constituțională decisions)
- EU cross-reference expansion (full directive-to-statute mapping)
- Historical statute versions and amendment tracking
- Lower court decisions (Curte de Apel, Tribunal archives)

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] Full corpus ingestion (12,001 statutes, 112,257 provisions)
- [x] EU law integration tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Court case law expansion (ICCJ, Curtea Constituțională)
- [ ] Full EU text integration (via @ansvar/eu-regulations-mcp)
- [ ] Lower court coverage (Curte de Apel archives)
- [ ] Historical statute versions (amendment tracking)
- [ ] Web API for programmatic access

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{romanian_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Romanian Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Romanian-law-mcp},
  note = {12,001 Romanian statutes with 112,257 provisions and EU law cross-references}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Ministry of Justice of Romania (public domain government works)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server started as our internal reference tool for Romanian law -- turns out everyone building for the CEE and EU markets has the same research frustrations.

So we're open-sourcing it. Navigating 12,001 statutes and their EU source directives shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
