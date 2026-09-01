import { prisma } from '@/lib/db';
import {
  categoriesForIncidentType,
  guaranteedCategoriesFor,
  JURISDICTION_LABELS,
  POLICY_JURISDICTIONS,
  PolicyChunk,
  PolicyCitation,
  PolicyReference,
  PolicyCoverage,
  LOCAL_JURISDICTIONS,
} from '@/types';
import { chromaService } from './chroma';
import { embeddingsService } from './embeddings';
import { splitPolicyIntoSectionedChunks } from '@/lib/utils/documentProcessor';
import { formatSectionCitation, parsePolicySections } from '@/lib/policy-sections';

/**
 * Enhanced RAG System with Vector Search
 *
 * Uses OpenAI embeddings + Chroma vector database for semantic search
 * Falls back to keyword search if vector search fails
 */
export class RAGSystem {
  private isInitialized: boolean = false;

  constructor() {
    // Will initialize on first use
  }

  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      await chromaService.initialize();
      this.isInitialized = true;
      console.log('RAG system initialized with vector search');
    } catch (error) {
      console.error('Error initializing RAG system:', error);
      console.log('RAG system will use fallback search');
    }
  }

  /**
   * Add policy document with embeddings to both database and vector store
   */
  async addPolicyDocument(
    policyId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.initialize();

    try {
      // Chunk along the document's own sections, so every chunk can be cited
      // by the provision it came from rather than by policy alone.
      const sections = parsePolicySections(content);
      const chunks = splitPolicyIntoSectionedChunks(content, sections, 1000, 200);

      // Check if embeddings are available
      const hasEmbeddings = process.env.OPENAI_API_KEY &&
                           process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

      // Prepare chunks for database and vector store
      const chunkRecords = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkContent = chunk.content;

        let embeddingJson: string | null = null;

        // Only generate embedding if API key is configured
        if (hasEmbeddings) {
          try {
            const embedding = await embeddingsService.generateEmbedding(chunkContent);
            embeddingJson = JSON.stringify(embedding);
          } catch (error) {
            console.warn(`Failed to generate embedding for chunk ${i}, skipping:`, error);
          }
        }

        // Save to database
        const dbChunk = await prisma.policyChunk.create({
          data: {
            policyId,
            content: chunkContent,
            chunkIndex: i,
            embedding: embeddingJson,
            sectionLabel: chunk.sectionLabel ?? null,
            sectionTitle: chunk.sectionTitle ?? null,
            sectionStatute: chunk.sectionStatute ?? null,
            metadata: metadata ? JSON.stringify(metadata) : null,
          },
        });

        if (hasEmbeddings && this.isInitialized) {
          chunkRecords.push({
            id: dbChunk.id,
            content: chunkContent,
            policyId,
            chunkIndex: i,
            metadata,
          });
        }
      }

      // Add to Chroma vector database only if embeddings were generated
      if (chunkRecords.length > 0) {
        try {
          await chromaService.addPolicyChunks(chunkRecords);
        } catch (error) {
          console.warn('Failed to add chunks to Chroma, vector search will not be available:', error);
        }
      }

      console.log(`Added policy ${policyId} with ${chunks.length} chunks (embeddings: ${hasEmbeddings})`);
    } catch (error) {
      console.error('Error adding policy document:', error);
      throw new Error(`Failed to add policy document: ${error}`);
    }
  }

  /**
   * Search for relevant policy chunks using semantic search
   * Falls back to keyword search if vector search fails
   */
  async searchRelevantPolicies(
    query: string,
    limit: number = 5,
    filter?: { categories?: string[]; isActive?: boolean }
  ): Promise<PolicyChunk[]> {
    await this.initialize();

    try {
      // Only category is mirrored into Chroma chunk metadata, so only that
      // can be filtered vector-side. Passing isActive here would filter on a
      // metadata key no chunk has, which matches nothing and would silently
      // kill vector search entirely. isActive is enforced against the database
      // during enrichment below, where it also covers chunks indexed before
      // that field existed.
      // Chroma metadata carries `category`, so that much can be filtered
      // vector-side. isActive is enforced against the database below, where
      // it also covers chunks indexed before that field existed.
      const categoryFilter =
        filter?.categories && filter.categories.length > 0
          ? { category: { $in: filter.categories } }
          : undefined;

      const vectorResults = await chromaService.searchSimilarChunks(
        query,
        limit,
        categoryFilter
      );

      // Enrich with database data if needed
      const enrichedResults = await Promise.all(
        vectorResults.map(async result => {
          // Get full chunk data from database
          const dbChunk = await prisma.policyChunk.findUnique({
            where: { id: result.id },
            include: { policy: { select: { title: true, jurisdiction: true, category: true, isActive: true } } },
          });

          // A vector hit with no surviving DB row is an orphan: the policy was
          // deleted but its Chroma entry was not purged. Returning the Chroma
          // copy meant a deleted policy kept being served to the model as
          // authoritative context indefinitely. Drop it instead. (SPEC-15)
          if (!dbChunk) {
            return null;
          }

          // Deactivated policies must not be cited as authority. (SPEC-5)
          if (filter?.isActive !== false && !dbChunk.policy.isActive) {
            return null;
          }

          const { policy, ...chunk } = dbChunk;
          return {
            ...chunk,
            embedding: chunk.embedding ? JSON.parse(chunk.embedding) : undefined,
            policy: {
              title: policy.title,
              jurisdiction: policy.jurisdiction,
              category: policy.category,
            },
          };
        })
      );

      const liveResults = enrichedResults.flatMap(chunk => (chunk ? [chunk] : []));

      // An empty vector result is a miss, not a success. Chroma returns []
      // without throwing when the collection is empty or the filter matches
      // nothing, so this path previously returned [] and skipped the fallback
      // entirely -- which is exactly what happens to policies written while
      // Chroma was unreachable, making them silently unretrievable the moment
      // Chroma came back up. (FLOW-5, SPEC-3)
      if (liveResults.length === 0) {
        return this.fallbackSearch(query, limit, filter);
      }

      return liveResults;
    } catch (error) {
      console.error('Vector search failed, using fallback:', error);
      return this.fallbackSearch(query, limit, filter);
    }
  }

  /**
   * Fallback keyword search when vector search is unavailable
   * Extracts keywords from query and searches for them
   */
  private async fallbackSearch(
    query: string,
    limit: number,
    filter?: { categories?: string[]; isActive?: boolean }
  ): Promise<PolicyChunk[]> {
    // Extract keywords from query (simple approach: words 4+ chars, lowercase)
    const keywords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length >= 4)
      .slice(0, 5); // Use top 5 keywords

    if (keywords.length === 0) {
      return [];
    }

    // `mode: 'insensitive'` is required: the datasource is PostgreSQL
    // (prisma/schema.prisma:10), where LIKE is case-sensitive. The comment
    // this replaces asserted SQLite semantics, a leftover from before the
    // Postgres migration -- so lowercased keywords could never match policy
    // codes or capitalised terms ("JICK", "Title IX", "DCYF"), silently
    // dropping recall to zero on exactly the queries this tool exists for.
    // (FLOW-4, SPEC-6)
    //
    // The isActive predicate joins through to Policy so that a deactivated or
    // superseded policy stops being cited as authority. The filter argument
    // was previously accepted and ignored here. (SPEC-5)
    const chunks = await prisma.policyChunk.findMany({
      where: {
        OR: keywords.map(keyword => ({
          content: {
            contains: keyword,
            mode: 'insensitive' as const,
          },
        })),
        policy: {
          isActive: filter?.isActive ?? true,
          ...(filter?.categories && filter.categories.length > 0
            ? { category: { in: filter.categories } }
            : {}),
        },
      },
      include: { policy: { select: { title: true, jurisdiction: true, category: true } } },
      take: limit * 2, // Get more results for scoring
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Score chunks by number of keyword matches
    const scoredChunks = chunks.map(chunk => {
      const lowerContent = chunk.content.toLowerCase();
      const matchCount = keywords.filter(kw => lowerContent.includes(kw)).length;
      return {
        ...chunk,
        score: matchCount / keywords.length, // Percentage of keywords matched
        embedding: chunk.embedding ? JSON.parse(chunk.embedding) : undefined,
      };
    });

    // Sort by score and return top results
    return scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Split content into chunks with overlap for better context
   */
  /**
   * Generate response with citations from relevant policy chunks
   */
  async generateResponseWithCitations(
    query: string,
    context?: {
      incidentType?: string | null;
      previousMessages?: { sender: string; message: string }[];
      // Callers also pass incidentId / severity / maxResults; accepted but
      // not currently used for retrieval.
      [key: string]: unknown;
    }
  ): Promise<{
    response: string;
    citations: PolicyCitation[];
    chunks: PolicyChunk[];
    coverage: PolicyCoverage;
    references: PolicyReference[];
  }> {
    // Retrieval query includes the incident type and the last couple of user
    // turns. Previously the context argument was named `_context` and never
    // read, so a short follow-up ("no, just the one witness") retrieved on
    // those words alone -- and since keywords under 4 chars are dropped, often
    // retrieved nothing at all. (FLOW-6)
    const recentUserTurns = (context?.previousMessages ?? [])
      .filter(m => m.sender === 'user')
      .slice(-2)
      .map(m => m.message);

    const retrievalQuery = [context?.incidentType, ...recentUserTurns, query]
      .filter(Boolean)
      .join(' ');

    // An incident implicates specific policy categories, and mandatory
    // reporting always. Retrieve more than the display limit so several
    // jurisdictions have a chance to appear rather than one verbose policy
    // crowding out the others.
    // The filter may be empty (unclassified, or `other`); the guaranteed set
    // never is. Search stays unconstrained in that case, but representation and
    // coverage still run -- see guaranteedCategoriesFor. (B3)
    const categories = categoriesForIncidentType(context?.incidentType);
    const guaranteed = guaranteedCategoriesFor(context?.incidentType);
    const matched = await this.searchRelevantPolicies(retrievalQuery, 12, {
      categories,
      isActive: true,
    });

    const relevantChunks = await this.ensureCategoryRepresentation(matched, guaranteed);

    const references: PolicyReference[] = [];
    const policyContext = this.buildJurisdictionContext(relevantChunks, references);
    const citations = this.buildCitations(relevantChunks);
    const coverage = await this.assessCoverage(guaranteed);

    return {
      response: policyContext,
      citations,
      chunks: relevantChunks,
      coverage,
      references,
    };
  }

  /**
   * Guarantees that every category the incident implicates is represented.
   *
   * Relevance ranking alone is not enough here. Mandatory-reporting policy is
   * the clearest case: an administrator describing "a student disclosed
   * something about their home life" shares almost no vocabulary with "report
   * to DCYF immediately", so keyword search never surfaces it -- yet "must I
   * report this, to whom, by when" is the question the tool exists to answer.
   * Categories are selected from the incident classification, so a category
   * being implicated is itself the relevance signal; the text match only
   * decides which chunk within it.
   *
   * Bounded to one supplemental chunk per missing category so this cannot
   * crowd out the directly relevant text.
   */
  private async ensureCategoryRepresentation(
    chunks: PolicyChunk[],
    categories: string[]
  ): Promise<PolicyChunk[]> {
    if (categories.length === 0) return chunks;

    const represented = new Set(
      chunks.map(c => c.policy?.category).filter(Boolean) as string[]
    );
    const missing = categories.filter(c => !represented.has(c));
    if (missing.length === 0) return chunks;

    const supplements = await prisma.policyChunk.findMany({
      where: {
        policy: { isActive: true, category: { in: missing } },
      },
      include: { policy: { select: { title: true, jurisdiction: true, category: true } } },
      orderBy: [{ policy: { jurisdiction: 'asc' } }, { chunkIndex: 'asc' }],
    });

    // One per missing category, preferring the most local authority available.
    const takenPerCategory = new Map<string, PolicyChunk>();
    for (const chunk of supplements) {
      const category = chunk.policy.category;
      const existing = takenPerCategory.get(category);
      const rank = (j: string) => POLICY_JURISDICTIONS.indexOf(j as never);
      if (!existing || rank(chunk.policy.jurisdiction) > rank(existing.policy!.jurisdiction)) {
        takenPerCategory.set(category, {
          ...chunk,
          embedding: undefined,
          policy: {
            title: chunk.policy.title,
            jurisdiction: chunk.policy.jurisdiction,
            category: chunk.policy.category,
          },
        });
      }
    }

    return [...chunks, ...takenPerCategory.values()];
  }

  /**
   * Groups retrieved text by jurisdiction, strongest authority first.
   *
   * The model previously received a flat `[1] ...` list with no indication of
   * where any of it came from, so it could not distinguish a federal statute
   * from a school handbook -- and the citations it was asked to produce were
   * raw cuids nobody could look up.
   */
  private buildJurisdictionContext(
    chunks: PolicyChunk[],
    // Populated as the excerpts are numbered, so an attribution the model
    // makes can be checked against the excerpts it was actually given rather
    // than taken on trust. (OQ-5)
    references?: PolicyReference[]
  ): string {
    if (chunks.length === 0) return '';

    const sections: string[] = [];
    let n = 0;

    for (const jurisdiction of POLICY_JURISDICTIONS) {
      const inScope = chunks.filter(c => c.policy?.jurisdiction === jurisdiction);
      if (inScope.length === 0) continue;

      const lines = inScope.map(chunk => {
        n += 1;
        const title = chunk.policy?.title ?? 'Untitled policy';
        // The reference the model should reproduce if it relies on this text.
        const source = chunk.sectionLabel
          ? formatSectionCitation(title, {
              label: chunk.sectionLabel,
              title: chunk.sectionTitle ?? '',
              statute: chunk.sectionStatute ?? undefined,
            })
          : title;
        references?.push({ n, policyId: chunk.policyId, citation: source });
        return `[${n}] ${source}\n${chunk.content}`;
      });

      sections.push(`${JURISDICTION_LABELS[jurisdiction].toUpperCase()} POLICY:\n${lines.join('\n\n')}`);
    }

    // Chunks whose policy row could not be read fall through ungrouped rather
    // than being dropped silently.
    const ungrouped = chunks.filter(c => !c.policy);
    if (ungrouped.length > 0) {
      const lines = ungrouped.map(chunk => {
        n += 1;
        return `[${n}] ${chunk.content}`;
      });
      sections.push(`UNATTRIBUTED POLICY TEXT:\n${lines.join('\n\n')}`);
    }

    return sections.join('\n\n');
  }

  private buildCitations(chunks: PolicyChunk[]): PolicyCitation[] {
    const seen = new Map<string, PolicyCitation>();
    for (const chunk of chunks) {
      if (!chunk.policy) continue;

      let citation = seen.get(chunk.policyId);
      if (!citation) {
        citation = {
          policyId: chunk.policyId,
          title: chunk.policy.title,
          jurisdiction: chunk.policy.jurisdiction,
          category: chunk.policy.category,
          sections: [],
        };
        seen.set(chunk.policyId, citation);
      }

      // One entry per provision the guidance rests on, in document order.
      if (chunk.sectionLabel) {
        const formatted = formatSectionCitation(chunk.policy.title, {
          label: chunk.sectionLabel,
          title: chunk.sectionTitle ?? '',
          statute: chunk.sectionStatute ?? undefined,
        });
        if (!citation.sections!.includes(formatted)) citation.sections!.push(formatted);
      }
    }
    return [...seen.values()];
  }

  /**
   * Which jurisdictions hold a policy for each category this incident
   * implicates.
   *
   * Queried against the policy library rather than inferred from what
   * retrieval returned. A category with no policy at all returns nothing from
   * search, so deriving coverage from the results would report the most
   * serious gap -- no policy whatsoever -- as no gap.
   *
   * The district is expected to have a local policy for everything, so any
   * implicated category without a district or school policy is a gap, whether
   * or not federal or state authority exists above it.
   */
  private async assessCoverage(categories: string[]): Promise<PolicyCoverage> {
    if (categories.length === 0) {
      return { categories, byCategory: {}, categoriesWithoutLocalPolicy: [] };
    }

    const policies = await prisma.policy.findMany({
      // Coverage means retrievable. A row with no chunks is invisible to
      // search, so counting it suppresses the gap warning that says the
      // library is empty -- the rule policy-coverage.ts already states. (B2)
      where: { isActive: true, category: { in: categories }, chunks: { some: {} } },
      select: { category: true, jurisdiction: true },
      distinct: ['category', 'jurisdiction'],
    });

    const byCategory: Record<string, string[]> = {};
    for (const category of categories) byCategory[category] = [];
    for (const { category, jurisdiction } of policies) {
      if (!byCategory[category].includes(jurisdiction)) {
        byCategory[category].push(jurisdiction);
      }
    }

    const categoriesWithoutLocalPolicy = categories.filter(
      category => !byCategory[category].some(j => LOCAL_JURISDICTIONS.includes(j))
    );

    return { categories, byCategory, categoriesWithoutLocalPolicy };
  }

  async deletePolicyChunks(policyId: string): Promise<void> {
    try {
      // Try to delete from Chroma (may fail if not available)
      if (this.isInitialized) {
        try {
          await chromaService.deletePolicyChunks(policyId);
        } catch {
          console.warn('Could not delete from Chroma (not available)');
        }
      }

      // Delete from database
      await prisma.policyChunk.deleteMany({
        where: { policyId },
      });

      console.log(`Deleted chunks for policy ${policyId}`);
    } catch (error) {
      console.error('Error deleting policy chunks:', error);
      throw new Error(`Failed to delete policy chunks: ${error}`);
    }
  }

  /**
   * Get statistics about the RAG system
   */
  async getStats(): Promise<{
    totalChunks: number;
    totalPolicies: number;
    chromaChunks: number;
  }> {
    await this.initialize();

    const [totalChunks, totalPolicies, chromaChunks] = await Promise.all([
      prisma.policyChunk.count(),
      prisma.policy.count(),
      chromaService.getChunkCount(),
    ]);

    return {
      totalChunks,
      totalPolicies,
      chromaChunks,
    };
  }
}

export const ragSystem = new RAGSystem();
