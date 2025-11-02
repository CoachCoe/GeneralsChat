import { prisma } from '@/lib/db';
import { PolicyChunk } from '@/types';
import { chromaService } from './chroma';
import { embeddingsService } from './embeddings';

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
      // Split content into chunks with overlap
      const chunks = this.splitIntoChunks(content, 1000, 200);

      // Check if embeddings are available
      const hasEmbeddings = process.env.OPENAI_API_KEY &&
                           process.env.OPENAI_API_KEY !== 'your-openai-api-key-here';

      // Prepare chunks for database and vector store
      const chunkRecords = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i];

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
    filter?: { policyType?: string; isActive?: boolean }
  ): Promise<PolicyChunk[]> {
    await this.initialize();

    try {
      // Try vector search first
      const vectorResults = await chromaService.searchSimilarChunks(
        query,
        limit,
        filter
      );

      // Enrich with database data if needed
      const enrichedResults = await Promise.all(
        vectorResults.map(async result => {
          // Get full chunk data from database
          const dbChunk = await prisma.policyChunk.findUnique({
            where: { id: result.id },
          });

          if (!dbChunk) {
            return {
              id: result.id,
              policyId: result.policyId,
              content: result.content,
              chunkIndex: result.chunkIndex,
              embedding: undefined,
              createdAt: new Date(),
            };
          }

          return {
            ...dbChunk,
            embedding: dbChunk.embedding ? JSON.parse(dbChunk.embedding) : undefined,
          };
        })
      );

      return enrichedResults;
    } catch (error) {
      console.error('Vector search failed, using fallback:', error);
      return this.fallbackSearch(query, limit);
    }
  }

  /**
   * Fallback keyword search when vector search is unavailable
   * Extracts keywords from query and searches for them
   */
  private async fallbackSearch(query: string, limit: number): Promise<PolicyChunk[]> {
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

    // Search for any keyword (OR logic)
    // Note: SQLite is case-insensitive for LIKE by default
    const chunks = await prisma.policyChunk.findMany({
      where: {
        OR: keywords.map(keyword => ({
          content: {
            contains: keyword,
          },
        })),
      },
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
  private splitIntoChunks(
    content: string,
    chunkSize: number = 1000,
    overlap: number = 200
  ): string[] {
    const words = content.split(/\s+/);
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim()) {
        chunks.push(chunk.trim());
      }
    }

    return chunks;
  }

  /**
   * Generate response with citations from relevant policy chunks
   */
  async generateResponseWithCitations(
    query: string,
    context: any
  ): Promise<{ response: string; citations: string[]; chunks: PolicyChunk[] }> {
    // Search for relevant policies
    const relevantChunks = await this.searchRelevantPolicies(query, 5);

    // Build context from relevant chunks
    const policyContext = relevantChunks
      .map((chunk, idx) => `[${idx + 1}] ${chunk.content}`)
      .join('\n\n');

    // Get unique policy IDs for citations
    const citations = [...new Set(relevantChunks.map(chunk => chunk.policyId))];

    return {
      response: policyContext, // Will be processed by LLM in the next phase
      citations,
      chunks: relevantChunks,
    };
  }

  /**
   * Delete all chunks for a policy (when policy is updated/deleted)
   */
  async deletePolicyChunks(policyId: string): Promise<void> {
    try {
      // Try to delete from Chroma (may fail if not available)
      if (this.isInitialized) {
        try {
          await chromaService.deletePolicyChunks(policyId);
        } catch (error) {
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
