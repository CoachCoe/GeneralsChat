# Ask the General

A modern chat interface for interacting with an AI assistant trained on school discipline procedures.

## Features

- 🤖 AI-powered responses using Ollama
- 💬 Real-time chat interface
- 🎨 Modern UI with Material-UI
- 📱 Responsive design
- 🔄 Real-time updates

## Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Ollama installed and running
- Just command runner (`brew install just` on macOS)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/shawncoe/GeneralsChat.git
   cd GeneralsChat
   ```

2. Install dependencies:
   ```bash
   just install
   ```

3. Make sure Ollama is running and the model is downloaded:
   ```bash
   ollama pull llama3:latest
   ```

### Running the Application

The project uses Just for task management. Here are the available commands:

- `just` - List all available commands
- `just backend` - Run the backend server
- `just frontend` - Run the frontend development server
- `just dev` - Run both servers concurrently
- `just kill` - Kill all running servers
- `just install` - Install all dependencies

To start development:
```bash
just dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Deployment

### Frontend (GitHub Pages)

The frontend is automatically deployed to GitHub Pages when changes are pushed to the main branch. The deployment workflow:
1. Builds the React application
2. Deploys to GitHub Pages
3. Available at: https://shawncoe.github.io/GeneralsChat/

### Backend (Render)

The backend is deployed to Render using GitHub Actions. To set up:
1. Create a Render account
2. Create a new Web Service
3. Add your Render API key to GitHub repository secrets as `RENDER_API_KEY`
4. Update the service ID in `.github/workflows/backend.yml`

## Project Structure

```
GeneralsChat/
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/ # React components
│   │   └── ...
│   └── ...
├── .github/           # GitHub Actions workflows
├── app.py            # FastAPI backend
├── requirements.txt  # Python dependencies
└── justfile         # Development commands
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 