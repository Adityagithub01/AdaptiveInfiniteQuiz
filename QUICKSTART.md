# Quick Start Guide

## Prerequisites
- Node.js 20+ installed
- Docker Desktop installed and running

## Option 1: Docker (Recommended)

1. **Start all services**
   ```bash
   docker-compose up -d --build
   ```

2. **Access the application**
   - Frontend: http://localhost:3000
   - Backend Health: http://localhost:3001/health

3. **View logs**
   ```bash
   docker-compose logs -f
   ```

4. **Stop services**
   ```bash
   docker-compose down
   ```

## Option 2: Local Development

1. **Install dependencies**
   ```bash
   npm run install:all
   ```

2. **Set up environment variables**
   ```bash
   cp frontend/.env.example frontend/.env
   cp backend/.env.example backend/.env
   ```

3. **Start PostgreSQL and Redis with Docker**
   ```bash
   docker-compose up -d postgres redis
   ```

4. **Start development servers**
   ```bash
   # Option A: Run both together
   npm run dev
   
   # Option B: Run separately
   # Terminal 1
   npm run dev:backend
   
   # Terminal 2
   npm run dev:frontend
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

## Troubleshooting

### Port Already in Use
If ports 3000, 3001, 5432, or 6379 are already in use:
- Change ports in `.env` files
- Update `docker-compose.yml` port mappings

### Database Connection Issues
- Ensure PostgreSQL container is running: `docker-compose ps`
- Check database credentials in `backend/.env`
- Verify database exists: `docker-compose exec postgres psql -U postgres -l`

### Redis Connection Issues
- Ensure Redis container is running: `docker-compose ps`
- Test Redis: `docker-compose exec redis redis-cli ping`
