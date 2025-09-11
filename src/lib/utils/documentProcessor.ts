import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

export interface ProcessedDocument {
  content: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    fileType: string;
    extractedAt: Date;
  };
}

export async function processDocument(filePath: string): Promise<ProcessedDocument> {
  const fileExtension = getFileExtension(filePath);
  const fileBuffer = await readFile(filePath);
  
  let content: string;
  let metadata: any = {
    fileType: fileExtension,
    extractedAt: new Date(),
  };

  try {
    switch (fileExtension) {
      case '.pdf':
        const pdfData = await pdf(fileBuffer);
        content = pdfData.text;
        metadata.pageCount = pdfData.numpages;
        break;
        
      case '.docx':
        const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
        content = docxResult.value;
        break;
        
      case '.doc':
        // For .doc files, we'd need a different library like 'mammoth' with doc support
        // For now, we'll treat it as text
        content = fileBuffer.toString('utf-8');
        break;
        
      case '.txt':
        content = fileBuffer.toString('utf-8');
        break;
        
      default:
        throw new Error(`Unsupported file type: ${fileExtension}`);
    }
    
    // Clean up the content
    content = cleanText(content);
    metadata.wordCount = content.split(/\s+/).length;
    
    return {
      content,
      metadata,
    };
  } catch (error) {
    console.error('Error processing document:', error);
    throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function getFileExtension(filePath: string): string {
  return filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
}

function cleanText(text: string): string {
  // Remove excessive whitespace
  text = text.replace(/\s+/g, ' ');
  
  // Remove page breaks and form feeds
  text = text.replace(/[\f\v]/g, '');
  
  // Remove excessive newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // Trim whitespace
  text = text.trim();
  
  return text;
}

export async function extractTextFromFile(filePath: string): Promise<string> {
  const processed = await processDocument(filePath);
  return processed.content;
}

export function splitIntoChunks(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
}

export function extractKeywords(text: string): string[] {
  // Simple keyword extraction - in production, use more sophisticated NLP
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  // Count word frequency
  const wordCount: Record<string, number> = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // Return top keywords
  return Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20)
    .map(([word]) => word);
}
