# melu-middleware

Minimal Express middleware for Melu.

## Current foundation

- Health endpoint: `GET /health`
- API info endpoint: `GET /api`
- Personalization agent endpoint: `POST /api/personalization/respond`
- Azure OpenAI wrapper with server-side prompt storage

## Request example

```json
{
  "messages": [
    { "role": "user", "content": "We are a family of 5 and one of our kids is gluten free." }
  ],
  "profile": {
    "householdSize": 5
  },
  "context": {
    "mode": "onboarding"
  }
}
```

## Response shape

```json
{
  "ok": true,
  "provider": "azure-openai",
  "agent": "personalization",
  "data": {
    "message": "...",
    "extractedProfile": {},
    "nextStep": "...",
    "done": false
  }
}
```

## Env vars

See `.env.example`.
