import OpenAI from 'openai';

/**
 * OpenAI Embeddings Service
 *
 * Uses text-embedding-3-small for generating vector embeddings
 * for policy documents and user queries.
 */
class EmbeddingsService {
  private client: OpenAI;
  private model: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in a batch
   * More efficient than calling generateEmbedding multiple times
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // OpenAI allows up to 2048 texts per batch
      const batchSize = 2048;
      const embeddings: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: 'float',
        });

        embeddings.push(...response.data.map(item => item.embedding));
      }

      return embeddings;
    } catch (error) {
      console.error('Error generating batch embeddings:', error);
      throw new Error(`Failed to generate batch embeddings: ${error}`);
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   * Used for finding similar policy chunks
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Get embedding dimension for the current model
   * text-embedding-3-small: 1536 dimensions
   */
  getEmbeddingDimension(): number {
    return this.model === 'text-embedding-3-small' ? 1536 : 1536;
  }

  /**
   * Validate that an embedding has the correct dimensions
   */
  validateEmbedding(embedding: number[]): boolean {
    return embedding.length === this.getEmbeddingDimension();
  }
}

export const embeddingsService = new EmbeddingsService();
