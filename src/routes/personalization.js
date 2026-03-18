const express = require('express');
const { buildPersonalizationMessages } = require('../prompts/personalizationPrompt');
const { createPersonalizationResponse } = require('../services/azureOpenAI');

const router = express.Router();

router.post('/respond', async (req, res, next) => {
  try {
    const { messages = [], profile = {}, context = {} } = req.body || {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request',
        details: '`messages` must be an array of chat messages.',
      });
    }

    const promptMessages = buildPersonalizationMessages({
      messages,
      profile,
      context,
    });

    const raw = await createPersonalizationResponse(promptMessages);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      parsed = {
        message: raw,
        extractedProfile: {},
        nextStep: 'continue',
        done: false,
      };
    }

    res.json({
      ok: true,
      provider: 'azure-openai',
      agent: 'personalization',
      data: parsed,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
