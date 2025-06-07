# List available commands
default:
    @just --list

# Run the backend server
backend:
    python app.py

# Run the frontend development server
frontend:
    cd frontend && npm run dev

# Run both backend and frontend concurrently
dev:
    just backend & just frontend

# Kill all running servers
kill:
    pkill -f "python app.py" || true
    pkill -f "vite" || true

# Install frontend dependencies
install-frontend:
    cd frontend && npm install

# Install backend dependencies
install-backend:
    pip install -r requirements.txt

# Install all dependencies
install: install-backend install-frontend 