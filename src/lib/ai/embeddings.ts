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
    // Only initialize if OpenAI is configured (optional for embeddings)
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.warn('OpenAI API key not found - embeddings service will not be available');
      console.warn('The system will use keyword-based search instead');
    }

    this.client = new OpenAI({
      apiKey: apiKey || 'dummy-key-not-used',
    });

    this.model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured - cannot generate embeddings. System will use keyword search fallback.');
    }

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
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured - cannot generate embeddings. System will use keyword search fallback.');
    }

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
}

export const embeddingsService = new EmbeddingsService();
