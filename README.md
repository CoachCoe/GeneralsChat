# School Discipline Chatbot

A web-based chatbot designed to assist school personnel with discipline incident procedures. The chatbot helps with reporting incidents, following proper procedures, and ensuring compliance with school policies.

## Features

- Interactive chat interface
- Real-time responses using Ollama's LLM
- Step-by-step guidance for discipline procedures
- Documentation assistance
- Timeline management
- Notification requirements

## Tech Stack

### Current Version
- Backend: FastAPI (Python)
- Frontend: Vanilla JavaScript/HTML/CSS
- LLM: Ollama with llama3 model

### Planned Upgrades
- Frontend: React with TypeScript
- State Management: React Context or Redux
- UI Framework: Material-UI or Tailwind CSS
- Testing: Jest and React Testing Library

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/CoachCoe/GeneralsChat.git
cd GeneralsChat
```

2. Install Python dependencies:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. Install and run Ollama:
- Download from [Ollama's website](https://ollama.ai)
- Run Ollama
- Pull the required model:
```bash
ollama pull llama3:latest
```

4. Run the backend:
```bash
python app.py
```

5. Access the application:
- Development: http://localhost:8000
- Production: https://coachcoe.github.io/GeneralsChat

## Development

### Backend Development
The FastAPI backend provides:
- `/chat` endpoint for chat interactions
- `/health` endpoint for system status
- `/models` endpoint for available LLM models

### Frontend Development
The current frontend is built with vanilla JavaScript. Future development will use React for:
- Better state management
- Component reusability
- Improved performance
- Better developer experience

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details 