import { z } from "zod";

/** Strict schema every AI-produced lead must pass before it touches the DB. */
export const LeadSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  extractedEvidence: z.string().min(1),
});

export const DecisionMakerSchema = z.object({
  name: z.string().nullable(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  verificationStatus: z.enum(["VERIFIED", "INFERRED", "UNKNOWN"]),
});

export const AILeadSchema = z.object({
  companyName: z.string().min(1),
  website: z.string().nullable(),
  category: z.enum(["SME", "Corporate", "Education", "Close Network", "Business Partners"]),
  industry: z.string().nullable(),
  region: z.string(),
  location: z.string().nullable(),
  companySize: z.string().nullable(),
  decisionMaker: DecisionMakerSchema,
  salesSignals: z.array(z.string()).default([]),
  verifiedFacts: z.array(z.string()).default([]),
  inferences: z.array(z.string()).default([]),
  triggerSignal: z.string(), // must literally be "No verified trigger identified." if none found
  leadReason: z.string().min(1),
  researchConfidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  salesRelevance: z.enum(["LOW", "MEDIUM", "HIGH"]),
  verified: z.object({
    companyVerified: z.boolean(),
    locationVerified: z.boolean(),
    industryVerified: z.boolean(),
    decisionMakerVerified: z.boolean(),
    triggerVerified: z.boolean(),
    contactVerified: z.boolean(),
  }),
  sources: z.array(LeadSourceSchema).default([]),
});
export type AILead = z.infer<typeof AILeadSchema>;

export const AICandidateListSchema = z.object({
  candidates: z.array(
    z.object({
      companyName: z.string(),
      website: z.string().nullable(),
      reasonForCandidacy: z.string(),
    })
  ),
});
export type AICandidateList = z.infer<typeof AICandidateListSchema>;

export interface AgentRunParams {
  category: "SME" | "Corporate" | "Education" | "Close Network" | "Business Partners";
  region: string;
  industry: string; // "Any" allowed
  companySizeBand: string; // "10-50" | "50-200" | "200-500" | "500+"
  leadCount: number; // 5 | 10 | 20 | 50
  maxSearches: number;
  maxDeepResearch: number;
  knownCompanyNames: string[]; // from company_research_memory, to skip
  onLog: (message: string) => void | Promise<void>;
}

export interface AgentRunResult {
  leads: AILead[];
  searchesPerformed: number;
  candidatesFound: number;
  candidatesDeepResearched: number;
  estimatedTokensUsed?: number;
}

/**
 * Common interface every AI backend must implement. The rest of the app
 * (agent pipeline, API routes) only ever talks to this interface, never
 * to a specific vendor SDK — swapping providers is a one-line env change.
 */
export interface AIProvider {
  name: string;
  runProspectingPipeline(params: AgentRunParams): Promise<AgentRunResult>;
}
