export class AIService {
  async getResponse(message: string): Promise<string> {
    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.response || 'Sorry, I could not get a response.';
    } catch (error) {
      return 'Error contacting the server.';
    }
  }
} 