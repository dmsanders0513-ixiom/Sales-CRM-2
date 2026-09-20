import { AILead, AILeadSchema, AICandidateList, AICandidateListSchema, AgentRunParams, AgentRunResult, AIProvider } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set on the server.");
  return key;
}

function model() {
  return process.env.GEMINI_MODEL || "gemini-2.0-flash";
}

/**
 * Low-level call to Gemini generateContent, optionally with Google Search
 * grounding enabled (real web search, not the model's internal training
 * knowledge) and optionally forcing structured JSON output via
 * responseSchema.
 */
async function callGemini(opts: {
  systemInstruction: string;
  prompt: string;
  useSearchGrounding: boolean;
  jsonSchema?: object;
}): Promise<{ text: string; groundingSources: { url: string; title: string }[] }> {
  const body: any = {
    system_instruction: { parts: [{ text: opts.systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      temperature: 0.2,
    },
  };

  if (opts.useSearchGrounding) {
    // Google Search grounding tool — gives the model live web results
    // instead of relying on frozen training data.
    body.tools = [{ google_search: {} }];
  }

  if (opts.jsonSchema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseSchema = opts.jsonSchema;
  }

  const res = await fetch(`${GEMINI_BASE}/${model()}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p: any) => p.text || "").join("") || "";

  // Extract grounding source URLs Gemini actually used, so we never
  // fabricate a source that wasn't really retrieved.
  const groundingSources: { url: string; title: string }[] = [];
  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  for (const c of chunks) {
    if (c.web?.uri) groundingSources.push({ url: c.web.uri, title: c.web.title || c.web.uri });
  }

  return { text, groundingSources };
}

function stripJsonFences(text: string): string {
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
}

// ------------------------------------------------------------
// STAGE 1: DISCOVERY — multiple distinct search strategies
// ------------------------------------------------------------
async function discoverCandidates(params: AgentRunParams): Promise<{ candidates: AICandidateList["candidates"]; searches: number }> {
  const strategies = buildSearchStrategies(params);
  const allCandidates: AICandidateList["candidates"] = [];
  let searches = 0;

  for (const strategy of strategies) {
    if (searches >= params.maxSearches) break;
    await params.onLog(`Searching: ${strategy}`);
    searches++;

    const { text } = await callGemini({
      useSearchGrounding: true,
      systemInstruction:
        "You are a B2B sales research assistant performing web discovery only. " +
        "You must use live Google Search results, not prior knowledge, to find real, currently operating companies. " +
        "Return ONLY a JSON object matching the requested schema. Do not invent companies. " +
        "If you cannot find genuine candidates for a query, return an empty candidates array.",
      prompt:
        `Search query focus: "${strategy}"\n\n` +
        `Find real companies matching:\n` +
        `- Category: ${params.category}\n` +
        `- Region: ${params.region}\n` +
        `- Industry: ${params.industry}\n` +
        `- Approx size band: ${params.companySizeBand} employees\n\n` +
        `Skip these already-known companies: ${params.knownCompanyNames.slice(0, 50).join(", ") || "(none)"}\n\n` +
        `Return JSON: {"candidates":[{"companyName":string,"website":string|null,"reasonForCandidacy":string}]}`,
      jsonSchema: {
        type: "object",
        properties: {
          candidates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                companyName: { type: "string" },
                website: { type: "string", nullable: true },
                reasonForCandidacy: { type: "string" },
              },
              required: ["companyName", "reasonForCandidacy"],
            },
          },
        },
        required: ["candidates"],
      },
    });

    try {
      const parsed = AICandidateListSchema.parse(JSON.parse(stripJsonFences(text)));
      await params.onLog(`Found ${parsed.candidates.length} candidate(s) for "${strategy}"`);
      allCandidates.push(...parsed.candidates);
    } catch (e) {
      await params.onLog(`Discovery query "${strategy}" returned unusable data — skipped.`);
    }
  }

  return { candidates: allCandidates, searches };
}

function buildSearchStrategies(params: AgentRunParams): string[] {
  const industry = params.industry === "Any" ? "" : params.industry;
  const base = `${industry} companies in ${params.region}`.trim();
  return [
    `${base} ${params.category === "Education" ? "schools colleges" : "businesses"}`,
    `${base} new branch OR expansion OR relocation`,
    `${base} hiring finance OR operations OR procurement manager`,
    `${base} directory listing`,
    `${base} tender OR contract awarded`,
    `${base} company profile site:.co.za`,
  ].slice(0, 6);
}

// ------------------------------------------------------------
// STAGE 2-5 combined: deep verification + intel + decision maker
// + lead-reason generation, per surviving candidate, in one
// grounded call per company (keeps cost down vs. 4 separate calls).
// ------------------------------------------------------------
async function deepResearchCompany(
  companyName: string,
  website: string | null,
  params: AgentRunParams
): Promise<AILead | null> {
  const schema = {
    type: "object",
    properties: {
      companyName: { type: "string" },
      website: { type: "string", nullable: true },
      category: { type: "string", enum: ["SME", "Corporate", "Education", "Close Network", "Business Partners"] },
      industry: { type: "string", nullable: true },
      region: { type: "string" },
      location: { type: "string", nullable: true },
      companySize: { type: "string", nullable: true },
      decisionMaker: {
        type: "object",
        properties: {
          name: { type: "string", nullable: true },
          title: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          verificationStatus: { type: "string", enum: ["VERIFIED", "INFERRED", "UNKNOWN"] },
        },
        required: ["verificationStatus"],
      },
      salesSignals: { type: "array", items: { type: "string" } },
      verifiedFacts: { type: "array", items: { type: "string" } },
      inferences: { type: "array", items: { type: "string" } },
      triggerSignal: { type: "string" },
      leadReason: { type: "string" },
      researchConfidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      salesRelevance: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      verified: {
        type: "object",
        properties: {
          companyVerified: { type: "boolean" },
          locationVerified: { type: "boolean" },
          industryVerified: { type: "boolean" },
          decisionMakerVerified: { type: "boolean" },
          triggerVerified: { type: "boolean" },
          contactVerified: { type: "boolean" },
        },
      },
    },
    required: [
      "companyName", "category", "region", "decisionMaker", "triggerSignal",
      "leadReason", "researchConfidence", "salesRelevance", "verified",
    ],
  };

  const { text, groundingSources } = await callGemini({
    useSearchGrounding: true,
    systemInstruction:
      "You are a meticulous B2B sales research analyst. You investigate ONE real company using live web search " +
      "and produce a structured, evidence-based sales brief. STRICT RULES:\n" +
      "1. NEVER invent a name, email, phone number, or job title. If a decision-maker's contact cannot be " +
      "verified from a real, retrieved web source, leave that field null and set verificationStatus to UNKNOWN.\n" +
      "2. Distinguish VERIFIED FACT (directly stated on a retrieved page) from REASONABLE INFERENCE (your " +
      "reasoning from evidence) from UNKNOWN. Put facts in verifiedFacts, inferences in inferences.\n" +
      "3. triggerSignal: describe a concrete business signal (new branch, hiring, expansion, tender, relocation, " +
      "compliance/admin load, etc.) ONLY if evidence supports it. If none exists, the field must be exactly: " +
      "\"No verified trigger identified.\"\n" +
      "4. leadReason must be a specific, evidence-grounded paragraph explaining why a salesperson should call — " +
      "never generic filler like 'large company that may need printers'.\n" +
      "5. Do not fabricate that the company uses any particular product/supplier unless a retrieved source says so.\n" +
      "6. Return ONLY the JSON object matching the schema.",
    prompt:
      `Research this company thoroughly using web search:\n` +
      `Company name: ${companyName}\n` +
      `Known website: ${website || "unknown — find it"}\n` +
      `Target category: ${params.category}\n` +
      `Target region: ${params.region}\n` +
      `Target industry: ${params.industry}\n\n` +
      `Investigate: company legitimacy, official site, physical location, industry, approximate size, ` +
      `document/workflow-heavy operational signals (multi-branch, admin/finance/HR/logistics/compliance load, ` +
      `manufacturing or engineering documentation, large school administration), recent growth/hiring/expansion/` +
      `tender signals, and any publicly listed decision-maker (Financial Director, Finance Manager, IT Manager, ` +
      `Operations Manager, Procurement Manager, Office Manager, GM/MD, Principal, Bursar, Facilities Manager).`,
    jsonSchema: schema,
  });

  let parsed: any;
  try {
    parsed = JSON.parse(stripJsonFences(text));
  } catch {
    return null;
  }

  // Attach the sources Gemini's grounding metadata actually returned —
  // this is what stops the model from citing URLs it never retrieved.
  parsed.sources = groundingSources.map((s) => ({
    url: s.url,
    title: s.title,
    extractedEvidence: "See source page for full context.",
  }));

  const result = AILeadSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}

export class GeminiProvider implements AIProvider {
  name = "gemini";

  async runProspectingPipeline(params: AgentRunParams): Promise<AgentRunResult> {
    await params.onLog("Initializing prospecting mission...");

    // STAGE 1: discovery
    const { candidates, searches } = await discoverCandidates(params);

    // Cheap filter: dedupe candidate names against each other and against
    // known companies, before spending a deep-research call on any of them.
    const seen = new Set(params.knownCompanyNames.map((n) => normalize(n)));
    const uniqueCandidates: typeof candidates = [];
    for (const c of candidates) {
      const key = normalize(c.companyName);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCandidates.push(c);
    }

    await params.onLog(
      `${candidates.length} raw candidates → ${uniqueCandidates.length} unique after dedupe/memory filter.`
    );

    const capped = uniqueCandidates.slice(0, Math.min(params.maxDeepResearch, uniqueCandidates.length));

    // STAGE 2-5: deep research only on survivors
    const leads: AILead[] = [];
    for (const candidate of capped) {
      if (leads.length >= params.leadCount) break;
      await params.onLog(`Verifying official website for ${candidate.companyName}...`);
      await params.onLog(`Researching company profile: ${candidate.companyName}...`);
      const lead = await deepResearchCompany(candidate.companyName, candidate.website, params);
      if (!lead) {
        await params.onLog(`${candidate.companyName} — research returned unusable data, skipped.`);
        continue;
      }
      await params.onLog(`Checking recent business signals for ${candidate.companyName}...`);
      await params.onLog(`Searching for relevant decision makers at ${candidate.companyName}...`);
      if (lead.salesRelevance === "LOW" && lead.triggerSignal === "No verified trigger identified.") {
        await params.onLog(`${candidate.companyName} — low relevance, no trigger. Not qualified.`);
        continue;
      }
      await params.onLog(`${candidate.companyName} qualified for review. Saved to pipeline.`);
      leads.push(lead);
    }

    await params.onLog(`Mission complete. ${leads.length} lead(s) ready for Inbox.`);

    return {
      leads,
      searchesPerformed: searches,
      candidatesFound: uniqueCandidates.length,
      candidatesDeepResearched: capped.length,
    };
  }
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
