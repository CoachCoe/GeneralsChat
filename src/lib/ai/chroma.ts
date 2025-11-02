import { ChromaClient, Collection } from 'chromadb';
import { embeddingsService } from './embeddings';

/**
 * Chroma Vector Database Service
 *
 * Manages vector storage and similarity search for policy documents
 * Uses file-based storage for development (no server required)
 */
class ChromaService {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;
  private isInitialized: boolean = false;

  constructor() {
    this.collectionName = process.env.CHROMA_COLLECTION || 'policy_embeddings';

    // Initialize ChromaDB client
    // For production, use a Chroma server. For development, we'll use in-memory.
    // Note: ChromaDB 3.x requires a server. For local dev, you can run:
    // docker run -p 8000:8000 chromadb/chroma
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';

    this.client = new ChromaClient({
      path: chromaUrl,
    });
  }

  /**
   * Initialize the Chroma collection
   * Creates the collection if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Try to get existing collection
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: {
          description: 'Policy document embeddings for RAG system',
          'hnsw:space': 'cosine', // Use cosine similarity
        },
      });

      this.isInitialized = true;
      console.log(`Chroma collection '${this.collectionName}' initialized`);
    } catch (error) {
      console.error('Error initializing Chroma collection:', error);
      console.error('Make sure Chroma server is running: docker run -p 8000:8000 chromadb/chroma');
      throw new Error(`Failed to initialize Chroma: ${error}`);
    }
  }

  /**
   * Add policy chunks with their embeddings to the vector database
   */
  async addPolicyChunks(
    chunks: Array<{
      id: string;
      content: string;
      policyId: string;
      chunkIndex: number;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    await this.initialize();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      // Generate embeddings for all chunks
      const contents = chunks.map(chunk => chunk.content);
      const embeddings = await embeddingsService.generateBatchEmbeddings(contents);

      // Prepare data for Chroma
      const ids = chunks.map(chunk => chunk.id);
      const metadatas = chunks.map(chunk => ({
        policyId: chunk.policyId,
        chunkIndex: chunk.chunkIndex,
        ...chunk.metadata,
      }));

      // Add to Chroma
      await this.collection.add({
        ids,
        embeddings,
        documents: contents,
        metadatas,
      });

      console.log(`Added ${chunks.length} policy chunks to Chroma`);
    } catch (error) {
      console.error('Error adding policy chunks to Chroma:', error);
      throw new Error(`Failed to add policy chunks: ${error}`);
    }
  }

  /**
   * Search for similar policy chunks using semantic search
   */
  async searchSimilarChunks(
    query: string,
    limit: number = 5,
    filter?: Record<string, any>
  ): Promise<
    Array<{
      id: string;
      content: string;
      policyId: string;
      chunkIndex: number;
      similarity: number;
      metadata?: Record<string, any>;
    }>
  > {
    await this.initialize();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await embeddingsService.generateEmbedding(query);

      // Search in Chroma
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        where: filter,
      });

      // Format results
      const chunks = [];
      const documents = results.documents[0] || [];
      const metadatas = results.metadatas[0] || [];
      const distances = results.distances?.[0] || [];
      const ids = results.ids[0] || [];

      for (let i = 0; i < documents.length; i++) {
        chunks.push({
          id: ids[i],
          content: documents[i] || '',
          policyId: (metadatas[i] as any)?.policyId || '',
          chunkIndex: (metadatas[i] as any)?.chunkIndex || 0,
          similarity: 1 - (distances[i] || 0), // Convert distance to similarity
          metadata: metadatas[i] as Record<string, any>,
        });
      }

      return chunks;
    } catch (error) {
      console.error('Error searching similar chunks:', error);
      throw new Error(`Failed to search similar chunks: ${error}`);
    }
  }

  /**
   * Delete all chunks for a specific policy
   */
  async deletePolicyChunks(policyId: string): Promise<void> {
    await this.initialize();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      await this.collection.delete({
        where: { policyId },
      });

      console.log(`Deleted chunks for policy ${policyId}`);
    } catch (error) {
      console.error('Error deleting policy chunks:', error);
      throw new Error(`Failed to delete policy chunks: ${error}`);
    }
  }

  /**
   * Get total count of chunks in the collection
   */
  async getChunkCount(): Promise<number> {
    try {
      await this.initialize();

      if (!this.collection) {
        return 0;
      }

      const count = await this.collection.count();
      return count;
    } catch {
      // Chroma not available, return 0
      return 0;
    }
  }

  /**
   * Delete the entire collection (useful for testing/reset)
   */
  async deleteCollection(): Promise<void> {
    try {
      await this.client.deleteCollection({
        name: this.collectionName,
      });

      this.collection = null;
      this.isInitialized = false;

      console.log(`Deleted collection '${this.collectionName}'`);
    } catch (error) {
      console.error('Error deleting collection:', error);
    }
  }

  /**
   * Update a specific chunk's embedding
   */
  async updateChunk(
    chunkId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.initialize();

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    try {
      // Generate new embedding
      const embedding = await embeddingsService.generateEmbedding(content);

      // Update in Chroma
      await this.collection.update({
        ids: [chunkId],
        embeddings: [embedding],
        documents: [content],
        metadatas: metadata ? [metadata] : undefined,
      });

      console.log(`Updated chunk ${chunkId}`);
    } catch (error) {
      console.error('Error updating chunk:', error);
      throw new Error(`Failed to update chunk: ${error}`);
    }
  }
}

export const chromaService = new ChromaService();
