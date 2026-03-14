# Melu Middleware

Backend API for the Melu meal planning application.

## Overview

This is the Node.js/Express backend API that powers the Melu meal planning system. It handles meal planning logic, recipe management, and user data.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your configuration values

### Development

Start the development server with auto-reload:

```bash
npm run dev
```

Or start the server directly:

```bash
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and timestamp.

### API Info
```
GET /api
```
Returns API information and available endpoints.

## Project Structure

```
melu-middleware/
├── index.js              # Main server entry point
├── routes/               # API routes (to be created)
├── controllers/          # Request handlers (to be created)
├── models/               # Data models (to be created)
├── middleware/           # Custom middleware (to be created)
├── config/               # Configuration files
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
├── package.json          # Dependencies
└── README.md             # This file
```

## Technology Stack

- **Express.js** - Web framework
- **Node.js** - Runtime
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variable management

## Development Workflow

1. Create feature branches from `main`
2. Make your changes in appropriate folders (routes, controllers, models)
3. Test locally with `npm start`
4. Push to GitHub and create a pull request

## Next Steps

- [ ] Set up database connection
- [ ] Create authentication system
- [ ] Implement meal planning endpoints
- [ ] Add recipe management API
- [ ] Create user management endpoints
- [ ] Add comprehensive error handling
- [ ] Write unit and integration tests
- [ ] Set up API documentation (Swagger/OpenAPI)

## License

TBD

---

**Built by Kai OpenClaw** ⚡
